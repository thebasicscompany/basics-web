/**
 * Smoke test for the LiveKit lesson flow: mints a Clerk session token for the
 * smoke user, ensures a lesson session exists, and verifies the
 * connection-details endpoint returns LiveKit credentials with the tutor
 * agent dispatch configured.
 *
 * Usage: pnpm --filter @basics/web smoke:livekit (dev server must be running)
 */
process.env.DATABASE_URL ??=
  "postgresql://basics:basics@127.0.0.1:54330/basics_web?schema=public";

const CLERK_API = process.env.CLERK_API_URL ?? "https://api.clerk.com";
const APP_URL = process.env.BASICS_SMOKE_APP_URL ?? "http://localhost:3000";
const SMOKE_EMAIL = "basics-smoke+clerk_test@example.com";

const secretKey = process.env.CLERK_SECRET_KEY;

if (!secretKey) {
  throw new Error("CLERK_SECRET_KEY missing (run via doppler)");
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

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString());
}

async function main() {
  console.log("1. Minting Clerk session token...");
  const jwt = await getSessionToken();
  const authHeaders = { authorization: `Bearer ${jwt}` };

  console.log("2. Provisioning learner via API...");
  const provision = await fetch(
    `${APP_URL}/api/sessions/session_smokeprobe/context`,
    {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify({ kind: "screen_snapshot", dataUrl: "data:image/x" }),
      redirect: "manual",
    },
  );
  console.log(
    `   -> ${provision.status} ${(await provision.text()).slice(0, 200)}`,
  );

  console.log("3. Ensuring a lesson session exists...");
  const { createPrismaClient } = await import("@basics/db");
  const db = createPrismaClient();

  const learner = await db.learner.findFirstOrThrow({
    where: { displayName: "Smoke Tester" },
    include: { personalWorkspace: true },
  });
  const lesson = await db.lesson.findFirstOrThrow();

  let session = await db.session.findFirst({
    where: { learnerId: learner.id, lessonId: lesson.id, status: "active" },
  });
  session ??= await db.session.create({
    data: {
      id: `session_smoke${Date.now().toString(36)}`,
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

  console.log("4. Requesting LiveKit connection details...");
  const response = await fetch(
    `${APP_URL}/api/sessions/${session.id}/connection-details`,
    { method: "POST", headers: authHeaders },
  );

  if (!response.ok) {
    throw new Error(
      `connection-details failed (${response.status}): ${await response.text()}`,
    );
  }

  const details = (await response.json()) as {
    serverUrl?: string;
    participantToken?: string;
  };

  if (!details.serverUrl?.startsWith("wss://") || !details.participantToken) {
    throw new Error(`Malformed response: ${JSON.stringify(details)}`);
  }

  const grant = decodeJwtPayload(details.participantToken);
  const video = grant.video as { room?: string } | undefined;
  const roomConfig = grant.roomConfig as
    | { agents?: { agentName?: string; metadata?: string }[] }
    | undefined;
  const dispatch = roomConfig?.agents?.[0];

  console.log("\nResults:");
  console.log(`  serverUrl:       ${details.serverUrl}`);
  console.log(`  token identity:  ${grant.sub}`);
  console.log(`  room grant:      ${video?.room}`);
  console.log(`  agent dispatch:  ${dispatch?.agentName}`);
  console.log(`  agent metadata:  ${dispatch?.metadata}`);

  if (video?.room !== session.id) {
    throw new Error("Room grant does not match session id");
  }
  if (dispatch?.agentName !== "basics-tutor") {
    throw new Error("Tutor agent dispatch missing from token");
  }

  console.log(
    "\nConnection-details smoke test passed. For the full in-room voice test, run: pnpm --filter @basics/voice smoke",
  );
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
