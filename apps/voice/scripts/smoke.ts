/**
 * Headless E2E smoke test for the voice tutor: creates a lesson session,
 * joins its LiveKit room as a fake learner (subscribing to audio), waits for
 * the tutor agent to join, speak, and broadcast/persist events.
 *
 * Usage: pnpm --filter @basics/voice smoke (worker must be running)
 */
import { AccessToken } from "livekit-server-sdk";
import { RoomAgentDispatch, RoomConfiguration } from "@livekit/protocol";
import { Room, RoomEvent } from "@livekit/rtc-node";
import { createPrismaClient } from "@basics/db";

const livekitUrl = process.env.LIVEKIT_URL;
const apiKey = process.env.LIVEKIT_API_KEY;
const apiSecret = process.env.LIVEKIT_API_SECRET;

if (!livekitUrl || !apiKey || !apiSecret) {
  throw new Error("LIVEKIT_URL/API_KEY/API_SECRET missing (run via doppler)");
}

const db = createPrismaClient();

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

async function ensureSession() {
  let learner = await db.learner.findFirst({
    where: { clerkUserId: "smoke_voice_user" },
    include: { personalWorkspace: true },
  });

  if (!learner) {
    const learnerId = id("learner");
    await db.learner.create({
      data: {
        id: learnerId,
        clerkUserId: "smoke_voice_user",
        displayName: "Voice Smoke",
        createdAt: new Date(),
      },
    });
    await db.workspace.create({
      data: {
        id: id("workspace"),
        kind: "personal",
        ownerLearnerId: learnerId,
        name: "Voice Smoke space",
        createdAt: new Date(),
      },
    });
    learner = await db.learner.findUniqueOrThrow({
      where: { id: learnerId },
      include: { personalWorkspace: true },
    });
  }

  const lesson = await db.lesson.findFirstOrThrow();

  return db.session.create({
    data: {
      id: id("session"),
      kind: "lesson",
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
}

async function main() {
  console.log("1. Creating lesson session...");
  const session = await ensureSession();

  console.log("2. Minting participant token with agent dispatch...");
  const token = new AccessToken(apiKey, apiSecret, {
    identity: session.learnerId,
    name: "Voice Smoke",
    ttl: "10m",
  });
  token.addGrant({
    room: session.id,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: "basics-tutor",
        metadata: JSON.stringify({ sessionId: session.id }),
      }),
    ],
  });

  console.log("3. Joining the room as the learner...");
  const room = new Room();
  let agentJoined = false;
  let audioFrames = 0;
  let dataMessages = 0;

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log(`   participant joined: ${participant.identity}`);
    if (participant.identity.startsWith("agent-")) {
      agentJoined = true;
    }
  });
  room.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
    console.log(
      `   subscribed to ${track.kind} track from ${participant.identity}`,
    );
    audioFrames += 1;
  });
  room.on(RoomEvent.DataReceived, (_payload, _participant, _kind, topic) => {
    dataMessages += 1;
    console.log(`   data message on topic: ${topic}`);
  });

  await room.connect(livekitUrl!, await token.toJwt(), {
    autoSubscribe: true,
    dynacast: false,
  });

  console.log("4. Waiting up to 60s for greeting to persist...");
  const deadline = Date.now() + 60_000;
  let transcriptCount = 0;

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    transcriptCount = await db.sessionEvent.count({
      where: { sessionId: session.id, type: "transcript.utterance" },
    });
    if (transcriptCount > 0) break;
  }

  const latest = await db.transcriptProjection.findFirst({
    where: { sessionId: session.id },
    orderBy: { sequence: "desc" },
  });

  console.log("\nResults:");
  console.log(`  agent joined:        ${agentJoined}`);
  console.log(`  tracks subscribed:   ${audioFrames}`);
  console.log(`  data messages:       ${dataMessages}`);
  console.log(`  transcript events:   ${transcriptCount}`);
  console.log(`  tutor said:          "${latest?.text?.slice(0, 140) ?? ""}"`);

  await room.disconnect();
  await db.$disconnect();

  if (!agentJoined || transcriptCount === 0) {
    console.error("\nVoice smoke test FAILED");
    process.exit(1);
  }

  console.log("\nVoice smoke test passed.");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
