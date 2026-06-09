/**
 * Renders the main app pages as the smoke user and asserts 200s.
 * Usage: doppler run -- tsx scripts/smoke-pages.ts (dev server running)
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

  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();
  const course = await db.course.findFirstOrThrow({
    where: { status: "active" },
  });
  const learner = await db.learner.findFirstOrThrow({
    where: { displayName: "Smoke Tester" },
  });
  const chat = await db.session.findFirst({
    where: { learnerId: learner.id, courseId: course.id, lessonId: null },
    orderBy: { createdAt: "desc" },
  });
  const lesson = await db.lesson.findFirstOrThrow({
    where: { courseId: course.id },
  });

  const pages = [
    "/",
    "/courses",
    `/courses/${course.id}`,
    `/courses/${course.id}/materials`,
    ...(chat
      ? [
          `/courses/${course.id}/chats/${chat.id}`,
          `/courses/${course.id}/chats/${chat.id}/live`,
        ]
      : []),
    `/courses/${course.id}/lessons/${lesson.id}/learn`,
  ];

  let failed = false;
  for (const page of pages) {
    const response = await fetch(`${APP_URL}${page}`, {
      headers: { authorization: `Bearer ${jwt}`, accept: "text/html" },
    });
    const ok = response.status === 200;
    if (!ok) failed = true;
    console.log(`${ok ? "PASS" : "FAIL"} ${response.status} ${page}`);
  }

  await db.$disconnect();
  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
