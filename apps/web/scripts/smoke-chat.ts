/**
 * End-to-end smoke test for course chat threads:
 * mints a Clerk session token, creates a chat session via
 * POST /api/courses/[courseId]/chats, runs a streaming tutor turn, and
 * asserts the thread was auto-titled from the first message.
 *
 * Usage: pnpm --filter @basics/web smoke:chat (dev server must be running)
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
  throw new Error("CLERK_SECRET_KEY missing from apps/web/.env.local");
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
    throw new Error(
      `Clerk ${pathname} failed (${response.status}): ${await response.text()}`,
    );
  }

  return (await response.json()) as T;
}

async function getSessionToken(): Promise<string> {
  const existing = await clerk<{ id: string }[]>(
    `/users?email_address=${encodeURIComponent(SMOKE_EMAIL)}`,
  );

  const user =
    existing[0] ??
    (await clerk<{ id: string }>("/users", {
      method: "POST",
      body: JSON.stringify({
        email_address: [SMOKE_EMAIL],
        skip_password_requirement: true,
        first_name: "Smoke",
        last_name: "Tester",
      }),
    }));

  const session = await clerk<{ id: string }>("/sessions", {
    method: "POST",
    body: JSON.stringify({ user_id: user.id }),
  });

  const token = await clerk<{ jwt: string }>(`/sessions/${session.id}/tokens`, {
    method: "POST",
    body: JSON.stringify({ expires_in_seconds: 300 }),
  });

  return token.jwt;
}

async function main() {
  console.log("1. Minting Clerk session token...");
  const jwt = await getSessionToken();
  const authHeaders = { authorization: `Bearer ${jwt}` };

  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();
  const course = await db.course.findFirstOrThrow({
    where: { status: "active" },
  });

  console.log(`2. Creating a chat thread on course: ${course.title}...`);
  const createResponse = await fetch(
    `${APP_URL}/api/courses/${course.id}/chats`,
    {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );

  if (!createResponse.ok) {
    throw new Error(
      `Chat creation failed (${createResponse.status}): ${await createResponse.text()}`,
    );
  }

  const { session } = (await createResponse.json()) as {
    session: { id: string; courseId?: string; lessonId?: string };
  };

  if (session.lessonId) {
    throw new Error("Chat session unexpectedly has a lesson");
  }

  console.log(`3. Running a streaming tutor turn on ${session.id}...`);
  const firstMessage =
    "What should I focus on first in this course? Give me a quick roadmap.";
  const turnResponse = await fetch(
    `${APP_URL}/api/sessions/${session.id}/turns`,
    {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ text: firstMessage }),
    },
  );

  if (!turnResponse.ok || !turnResponse.body) {
    throw new Error(
      `Turn failed (${turnResponse.status}): ${await turnResponse.text()}`,
    );
  }

  let sawText = false;
  let sawDone = false;
  const reader = turnResponse.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx = buffer.indexOf("\n");
    while (idx >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (line) {
        const message = JSON.parse(line) as { type: string; message?: string };
        if (message.type === "text-delta") sawText = true;
        if (message.type === "done") sawDone = true;
        if (message.type === "error")
          throw new Error(`Stream error: ${message.message}`);
      }
      idx = buffer.indexOf("\n");
    }
  }

  const stored = await db.session.findUniqueOrThrow({
    where: { id: session.id },
  });
  const transcript = await db.transcriptProjection.count({
    where: { sessionId: session.id },
  });

  console.log("\nResults:");
  console.log(`  streamed text:      ${sawText}`);
  console.log(`  stream completed:   ${sawDone}`);
  console.log(`  auto-title (topic): ${stored.topic}`);
  console.log(`  transcript rows:    ${transcript}`);

  if (!sawText || !sawDone || !stored.topic || transcript < 2) {
    throw new Error("Chat smoke test failed: incomplete chat loop");
  }

  console.log("\nChat smoke test passed.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
