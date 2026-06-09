import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLearnerContext } from "@/lib/learner";
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

/** Issues a presigned S3 PUT URL for a course material upload. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
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

  const { courseId } = await params;
  const course = await db.course.findUnique({ where: { id: courseId } });

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
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

  const s3Key = buildUploadKey(context.learnerId, courseId, filename);
  const uploadUrl = await presignUpload(s3Key, contentType);

  return NextResponse.json({ uploadUrl, s3Key });
}
