import { NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerContext } from "@/lib/learner";
import { getOwnedSession } from "@/lib/session-store";
import {
  ALLOWED_UPLOAD_TYPES,
  MAX_UPLOAD_BYTES,
  buildUploadKey,
  getUploadsBucket,
  presignUpload,
} from "@/lib/uploads";

const BodySchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1),
  size: z.number().int().positive(),
});

/**
 * Issues a presigned S3 PUT URL for a session-scoped upload — used by
 * intake sessions, where materials arrive before any course exists.
 * create_course links them to the course afterwards.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!getUploadsBucket()) {
    return NextResponse.json(
      { error: "Uploads are not configured yet." },
      { status: 503 },
    );
  }

  const { sessionId } = await params;
  const session = await getOwnedSession(context, sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = BodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { filename, contentType, size } = parsed.data;

  if (!(contentType in ALLOWED_UPLOAD_TYPES)) {
    return NextResponse.json(
      { error: "Unsupported file type. Use PDF, text, markdown, or images." },
      { status: 400 },
    );
  }

  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: "File is too large (20 MB max)." },
      { status: 400 },
    );
  }

  const s3Key = buildUploadKey(context.learnerId, sessionId, filename);
  const uploadUrl = await presignUpload(s3Key, contentType);

  return NextResponse.json({ uploadUrl, s3Key });
}
