import "server-only";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/markdown": "md",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

let client: S3Client | undefined;

function getClient(): S3Client {
  client ??= new S3Client({});
  return client;
}

export function getUploadsBucket(): string | null {
  return process.env.UPLOADS_BUCKET_NAME ?? null;
}

export async function presignUpload(
  s3Key: string,
  contentType: string,
): Promise<string> {
  const bucket = getUploadsBucket();
  if (!bucket) {
    throw new Error("Uploads are not configured (UPLOADS_BUCKET_NAME unset).");
  }

  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      ContentType: contentType,
    }),
    { expiresIn: 600 },
  );
}

export async function getObjectBytes(s3Key: string): Promise<Uint8Array> {
  const bucket = getUploadsBucket();
  if (!bucket) {
    throw new Error("Uploads are not configured (UPLOADS_BUCKET_NAME unset).");
  }

  const result = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
  );

  return result.Body ? result.Body.transformToByteArray() : new Uint8Array();
}

export async function deleteObject(s3Key: string): Promise<void> {
  const bucket = getUploadsBucket();
  if (!bucket) {
    return;
  }

  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: s3Key }),
  );
}

/** Best-effort text extraction so the tutor can use material content. */
export async function extractUploadText(
  mimeType: string,
  bytes: Uint8Array,
): Promise<string | undefined> {
  try {
    if (mimeType === "application/pdf") {
      const { extractText } = await import("unpdf");
      const { text } = await extractText(new Uint8Array(bytes), {
        mergePages: true,
      });
      return text.trim() || undefined;
    }

    if (mimeType === "text/plain" || mimeType === "text/markdown") {
      return new TextDecoder().decode(bytes).trim() || undefined;
    }
  } catch (error) {
    console.error("Text extraction failed", error);
  }

  return undefined;
}

export function buildUploadKey(
  learnerId: string,
  courseId: string,
  filename: string,
): string {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
  return `uploads/${learnerId}/${courseId}/${crypto.randomUUID().replaceAll("-", "")}-${safeName}`;
}
