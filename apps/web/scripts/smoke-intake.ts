/**
 * End-to-end smoke test for course generation via intake sessions:
 * mints a Clerk session token, starts an intake session via
 * POST /api/intake, runs a scripted interview (answering panel prompts
 * with ui.response turns, exactly like builder-panel clicks), and asserts
 * a real queryable course came out the other end.
 *
 * Usage: pnpm --filter @basics/web smoke:intake (dev server must be running)
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.resolve(import.meta.dirname, "../.env.local") });
process.env.DATABASE_URL ??=
  "postgresql://basics:basics@127.0.0.1:54330/basics_web?schema=public";

const CLERK_API = process.env.CLERK_API_URL ?? "https://api.clerk.com";
const APP_URL = process.env.BASICS_SMOKE_APP_URL ?? "http://localhost:3000";
const SMOKE_EMAIL = "basics-smoke+clerk_test@example.com";
const MAX_TURNS = 10;

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
    body: JSON.stringify({ expires_in_seconds: 600 }),
  });

  return token.jwt;
}

type TurnBody =
  | { text: string }
  | { response: { refEventId: string; value: unknown } };

async function runTurn(
  authHeaders: Record<string, string>,
  sessionId: string,
  body: TurnBody,
): Promise<void> {
  const response = await fetch(`${APP_URL}/api/sessions/${sessionId}/turns`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `Turn failed (${response.status}): ${await response.text()}`,
    );
  }

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
        const message = JSON.parse(line) as { type: string; message?: string };
        if (message.type === "error") {
          throw new Error(`Stream error: ${message.message}`);
        }
      }
      idx = buffer.indexOf("\n");
    }
  }
}

type StoredEvent = {
  id: string;
  type: string;
  payload: unknown;
};

async function main() {
  console.log("1. Minting Clerk session token...");
  const jwt = await getSessionToken();
  const authHeaders = { authorization: `Bearer ${jwt}` };

  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();
  const startedAt = new Date();

  console.log("2. Starting an intake session...");
  const createResponse = await fetch(`${APP_URL}/api/intake`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  if (!createResponse.ok) {
    throw new Error(
      `Intake creation failed (${createResponse.status}): ${await createResponse.text()}`,
    );
  }

  const { session } = (await createResponse.json()) as {
    session: { id: string; kind?: string };
  };

  if (session.kind !== "intake") {
    throw new Error(`Expected kind "intake", got "${session.kind}"`);
  }

  console.log(`3. Running the scripted interview on ${session.id}...`);
  await runTurn(authHeaders, session.id, {
    text: "I want to learn how espresso machines work. I'm a curious beginner doing this for fun, and a quick primer is plenty.",
  });

  let uiResponsesSent = 0;
  let courseCreatedEvent: StoredEvent | undefined;

  for (let turn = 0; turn < MAX_TURNS && !courseCreatedEvent; turn += 1) {
    const events = (await db.sessionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
      select: { id: true, type: true, payload: true },
    })) as StoredEvent[];

    courseCreatedEvent = events.find(
      (event) => event.type === "intake.course_created",
    );
    if (courseCreatedEvent) {
      break;
    }

    // Mirror the builder panel: answer the latest unanswered panel prompt
    // with a structured ui.response; otherwise nudge by typing.
    const answered = new Set(
      events
        .filter((event) => event.type === "ui.response")
        .map((event) => (event.payload as { refEventId: string }).refEventId),
    );
    const actionable = [...events]
      .reverse()
      .find(
        (event) =>
          (event.type === "intake.present_choices" ||
            event.type === "intake.assess_knowledge" ||
            event.type === "intake.request_confirmation") &&
          !answered.has(event.id),
      );

    if (actionable?.type === "intake.assess_knowledge") {
      const { topics } = actionable.payload as {
        topics: { id: string; label: string }[];
      };
      console.log(`   - rating ${topics.length} knowledge topics...`);
      await runTurn(authHeaders, session.id, {
        response: {
          refEventId: actionable.id,
          value: {
            kind: "knowledge",
            ratings: Object.fromEntries(
              topics.map((topic) => [topic.id, "new"]),
            ),
            labels: topics.map((topic) => `${topic.label} — New to me`),
          },
        },
      });
      uiResponsesSent += 1;
    } else if (actionable?.type === "intake.present_choices") {
      const { choices } = actionable.payload as {
        choices: { id: string; label: string }[];
      };
      console.log(`   - clicking choice "${choices[0].label}"...`);
      await runTurn(authHeaders, session.id, {
        response: {
          refEventId: actionable.id,
          value: {
            kind: "choices",
            selected: [choices[0].id],
            labels: [choices[0].label],
          },
        },
      });
      uiResponsesSent += 1;
    } else if (actionable?.type === "intake.request_confirmation") {
      console.log("   - clicking confirm...");
      await runTurn(authHeaders, session.id, {
        response: {
          refEventId: actionable.id,
          value: { kind: "confirmation", approved: true, label: "Looks good" },
        },
      });
      uiResponsesSent += 1;
    } else {
      console.log("   - nudging by typed message...");
      await runTurn(authHeaders, session.id, {
        text: "That all sounds right. Please create the course now with your best judgment.",
      });
    }
  }

  if (!courseCreatedEvent) {
    const finalEvents = await db.sessionEvent.findMany({
      where: { sessionId: session.id },
      orderBy: { sequence: "asc" },
      select: { type: true },
    });
    throw new Error(
      `No intake.course_created event after ${MAX_TURNS} turns. Event types: ${finalEvents
        .map((event) => event.type)
        .join(", ")}`,
    );
  }

  const { courseId } = courseCreatedEvent.payload as { courseId: string };

  console.log(`4. Verifying the generated course ${courseId}...`);
  const course = await db.course.findUniqueOrThrow({
    where: { id: courseId },
    include: { modules: true, lessons: true, enrollments: true },
  });
  const storedSession = await db.session.findUniqueOrThrow({
    where: { id: session.id },
  });
  const uiResponseRows = await db.sessionEvent.count({
    where: { sessionId: session.id, type: "ui.response" },
  });

  console.log("\nResults:");
  console.log(`  course title:        ${course.title}`);
  console.log(`  course status:       ${course.status}`);
  console.log(`  created by learner:  ${course.createdByLearnerId != null}`);
  console.log(`  modules / lessons:   ${course.modules.length} / ${course.lessons.length}`);
  console.log(`  creator enrolled:    ${course.enrollments.length > 0}`);
  console.log(`  session -> course:   ${storedSession.courseId === courseId}`);
  console.log(`  ui.response events:  ${uiResponseRows} (sent ${uiResponsesSent})`);

  if (
    course.status !== "active" ||
    !course.createdByLearnerId ||
    course.createdAt < startedAt ||
    course.modules.length === 0 ||
    course.lessons.length === 0 ||
    course.enrollments.length === 0 ||
    storedSession.courseId !== courseId ||
    uiResponseRows === 0
  ) {
    throw new Error("Intake smoke test failed: incomplete course generation");
  }

  console.log("\nIntake smoke test passed.");
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
