/**
 * End-to-end smoke test for the materials pipeline:
 * presigns an upload, PUTs a text file to S3, finalizes it into a
 * ContextSource row, and asserts the extracted text is stored (which is
 * what buildTurnContext feeds to the tutor).
 *
 * Usage: pnpm --filter @basics/web smoke:uploads (dev server running,
 * UPLOADS_BUCKET_NAME set)
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../.env.local") });
process.env.DATABASE_URL ??=
  "postgresql://basics:basics@127.0.0.1:54330/basics_web?schema=public";

const CLERK_API = process.env.CLERK_API_URL ?? "https://api.clerk.com";
const APP_URL = process.env.BASICS_SMOKE_APP_URL ?? "http://localhost:3000";
const SMOKE_EMAIL = "basics-smoke+clerk_test@example.com";
const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY missing");
}

async function clerk<T>(pathname: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${CLERK_API}/v1${pathname}`, {
    ...init,
    headers: {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Clerk ${pathname} failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

async function main() {
  console.log("1. Minting Clerk session token...");
  const users = await clerk<{ id: string }[]>(
    `/users?email_address=${encodeURIComponent(SMOKE_EMAIL)}`,
  );
  const session = await clerk<{ id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: users[0].id }),
  });
  const { jwt } = await clerk<{ jwt: string }>(
    `/sessions/${session.id}/tokens`,
    { method: "POST", body: JSON.stringify({ expires_in_seconds: 300 }) },
  );
  const authHeaders = {
    authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
  };

  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();
  const course = await db.course.findFirstOrThrow({
    where: { status: "active" },
  });

  const fileBody = "Closures capture variables from their defining scope.";

  console.log("2. Presigning upload...");
  const presign = await fetch(`${APP_URL}/api/courses/${course.id}/uploads`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      filename: "smoke-notes.txt",
      contentType: "text/plain",
      size: fileBody.length,
    }),
  });
  if (!presign.ok) {
    throw new Error(`Presign failed (${presign.status}): ${await presign.text()}`);
  }
  const { uploadUrl, s3Key } = (await presign.json()) as {
    uploadUrl: string;
    s3Key: string;
  };

  console.log("3. PUTting file to S3...");
  const put = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: fileBody,
  });
  if (!put.ok) {
    throw new Error(`S3 PUT failed (${put.status})`);
  }

  console.log("4. Finalizing material...");
  const finalize = await fetch(`${APP_URL}/api/courses/${course.id}/materials`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({
      s3Key,
      filename: "smoke-notes.txt",
      mimeType: "text/plain",
      size: fileBody.length,
    }),
  });
  if (!finalize.ok) {
    throw new Error(
      `Finalize failed (${finalize.status}): ${await finalize.text()}`,
    );
  }
  const { material } = (await finalize.json()) as { material: { id: string } };

  const row = await db.contextSource.findUniqueOrThrow({
    where: { id: material.id },
  });
  const content = row.content as { extractedText?: string };

  console.log("\nResults:");
  console.log(`  sourceType:     ${row.sourceType}`);
  console.log(`  courseId match: ${row.courseId === course.id}`);
  console.log(`  extractedText:  ${content.extractedText}`);

  console.log("5. Deleting material...");
  const del = await fetch(`${APP_URL}/api/materials/${material.id}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  if (!del.ok) {
    throw new Error(`Delete failed (${del.status})`);
  }

  const gone = await db.contextSource.findUnique({
    where: { id: material.id },
  });

  if (
    row.sourceType !== "upload" ||
    row.courseId !== course.id ||
    content.extractedText !== fileBody ||
    gone !== null
  ) {
    throw new Error("Uploads smoke test failed");
  }

  console.log("\nUploads smoke test passed.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
