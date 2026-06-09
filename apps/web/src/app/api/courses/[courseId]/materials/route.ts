import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createId } from "@/lib/ids";
import { getLearnerContext } from "@/lib/learner";
import {
  ALLOWED_UPLOAD_TYPES,
  extractUploadText,
  getObjectBytes,
} from "@/lib/uploads";

const BodySchema = z.object({
  s3Key: z.string().trim().min(1),
  filename: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1),
  size: z.number().int().positive(),
  /** Optional chat session to attach this material to. */
  sessionId: z.string().trim().min(1).optional(),
});

/**
 * Finalizes an upload: extracts text best-effort and records a
 * ContextSource row so the tutor can use the material in turn context.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const parsed = BodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { s3Key, filename, mimeType, size, sessionId } = parsed.data;

  if (!(mimeType in ALLOWED_UPLOAD_TYPES)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  // Only allow finalizing keys this learner was issued for this course.
  if (!s3Key.startsWith(`uploads/${context.learnerId}/${courseId}/`)) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 403 });
  }

  let extractedText: string | undefined;
  try {
    const bytes = await getObjectBytes(s3Key);
    extractedText = await extractUploadText(mimeType, bytes);
  } catch (error) {
    console.error("Failed to read uploaded object", error);
  }

  const now = new Date();
  const material = await db.contextSource.create({
    data: {
      id: createId("context"),
      learnerId: context.learnerId,
      workspaceId: context.workspaceId,
      sourceType: "upload",
      label: filename,
      capturedAt: now,
      createdAt: now,
      retention: "persistent",
      consent: "granted",
      content: {
        courseId,
        s3Key,
        mimeType,
        size,
        ...(extractedText ? { extractedText } : {}),
      },
    },
  });

  if (sessionId) {
    const session = await db.session.findUnique({ where: { id: sessionId } });
    if (session && session.learnerId === context.learnerId) {
      await db.session.update({
        where: { id: sessionId },
        data: {
          contextSourceIds: [...session.contextSourceIds, material.id],
        },
      });
    }
  }

  return NextResponse.json(
    {
      material: {
        id: material.id,
        label: material.label,
        mimeType,
        size,
        createdAt: material.createdAt.toISOString(),
      },
    },
    { status: 201 },
  );
}
