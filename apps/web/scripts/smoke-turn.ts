/**
 * End-to-end smoke test for the tutoring loop:
 * mints a Clerk session token for a smoke user, ensures a lesson session
 * exists, runs a streaming tutor turn through the live dev server, and
 * asserts that durable events were appended.
 *
 * Usage: pnpm --filter @basics/web smoke (dev server must be running)
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

async function clerk<T>(
  pathname: string,
  init?: RequestInit,
): Promise<T> {
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

  const token = await clerk<{ jwt: string }>(
    `/sessions/${session.id}/tokens`,
    {
      method: "POST",
      body: JSON.stringify({ expires_in_seconds: 300 }),
    },
  );

  return token.jwt;
}

async function main() {
  console.log("1. Minting Clerk session token...");
  const jwt = await getSessionToken();
  const authHeaders = { authorization: `Bearer ${jwt}` };

  console.log("2. Provisioning learner via API (expected 404)...");
  await fetch(`${APP_URL}/api/sessions/session_smokeprobe/context`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({ kind: "screen_snapshot", dataUrl: "data:image/x" }),
  });

  console.log("3. Creating a lesson session in the database...");
  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();

  const learner = await db.learner.findFirstOrThrow({
    where: { displayName: "Smoke Tester" },
    include: { personalWorkspace: true },
  });
  const lesson = await db.lesson.findFirstOrThrow({
    include: { course: true },
  });

  const sessionId = `session_smoke${Date.now().toString(36)}`;
  await db.session.create({
    data: {
      id: sessionId,
      learnerId: learner.id,
      workspaceId: learner.personalWorkspace?.id,
      courseId: lesson.courseId,
      lessonId: lesson.id,
      topic: lesson.title,
      status: "active",
      state: {
        status: "active",
        enteredAt: new Date().toISOString(),
        lastEventSequence: 0,
      },
      startedAt: new Date(),
      createdAt: new Date(),
    },
  });

  console.log(`4. Running a streaming tutor turn (lesson: ${lesson.title})...`);
  const response = await fetch(`${APP_URL}/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      text: "Can you explain the key idea of this lesson and draw a small diagram?",
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Turn failed (${response.status}): ${await response.text()}`);
  }

  let sawText = false;
  let finalEventCount = 0;
  let sawDone = false;
  const reader = response.body.getReader();
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
        const message = JSON.parse(line) as {
          type: string;
          text?: string;
          events?: unknown[];
          message?: string;
        };
        if (message.type === "text-delta") sawText = true;
        if (message.type === "events") finalEventCount = message.events?.length ?? 0;
        if (message.type === "done") sawDone = true;
        if (message.type === "error") throw new Error(`Stream error: ${message.message}`);
      }
      idx = buffer.indexOf("\n");
    }
  }

  const storedEvents = await db.sessionEvent.count({ where: { sessionId } });
  const transcript = await db.transcriptProjection.count({
    where: { sessionId },
  });

  console.log("\nResults:");
  console.log(`  streamed text:        ${sawText}`);
  console.log(`  stream completed:     ${sawDone}`);
  console.log(`  events in stream:     ${finalEventCount}`);
  console.log(`  events persisted:     ${storedEvents}`);
  console.log(`  transcript rows:      ${transcript}`);

  if (!sawText || !sawDone || storedEvents < 3 || transcript < 2) {
    throw new Error("Smoke test failed: incomplete tutoring loop");
  }

  console.log("\nSmoke test passed.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
