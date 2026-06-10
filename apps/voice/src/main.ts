import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ServerOptions,
  cli,
  defineAgent,
  inference,
  llm as llmTypes,
  voice,
  type JobContext,
  type JobProcess,
} from "@livekit/agents";
import * as livekit from "@livekit/agents-plugin-livekit";
import * as silero from "@livekit/agents-plugin-silero";
import type { Room } from "@livekit/rtc-node";
import { config as loadEnv } from "dotenv";
import {
  createPrismaClient,
  serializeSessionEvent,
  type BasicsPrismaClient,
} from "@basics/db";
import {
  getKindConfig,
  loadSessionContext,
  persistTurnEvents,
  topicForEventType,
  type EventStoreContext,
  type ToolDefinition,
  type ToolSessionContext,
} from "@basics/harness";

// Secrets come from Doppler (`doppler run`); the .env files are a fallback
// for environments without the Doppler CLI and never override process env.
const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, "../../../.env") });
loadEnv({ path: path.resolve(here, "../.env.local") });

export const AGENT_NAME = "basics-tutor";

function createSegmentId(): string {
  return `segment_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * Binds the harness's pure tool definitions to LiveKit: each call persists
 * the produced event drafts to the session log, then broadcasts the durable
 * events to the room on the matching data topic.
 */
function bindLiveKitTools(
  definitions: ToolDefinition[],
  deps: {
    db: BasicsPrismaClient;
    room: Room;
    storeContext: EventStoreContext;
    toolContext: ToolSessionContext;
  },
): llmTypes.ToolContext {
  const encoder = new TextEncoder();
  const tools: llmTypes.ToolContext = {};

  for (const definition of definitions) {
    tools[definition.name] = llmTypes.tool({
      description: definition.description,
      parameters: definition.parameters,
      execute: async (args) => {
        // Structural precondition: gated tools are checked against the
        // session's persisted events at call time. A blocked call produces
        // no drafts; the message is returned so the model can correct course.
        if (definition.gate) {
          const rows = await deps.db.sessionEvent.findMany({
            where: { sessionId: deps.toolContext.sessionId },
            orderBy: { sequence: "asc" },
          });
          const blocked = definition.gate(
            deps.toolContext,
            rows.map(serializeSessionEvent),
          );
          if (blocked) {
            return blocked;
          }
        }

        const drafts = definition.toDrafts(args, deps.toolContext);
        const events = await persistTurnEvents(
          deps.db,
          deps.storeContext,
          deps.toolContext.sessionId,
          drafts,
        );

        const byTopic = new Map<string, typeof events>();
        for (const event of events) {
          const topic = topicForEventType(event.type);
          const group = byTopic.get(topic);
          if (group) {
            group.push(event);
          } else {
            byTopic.set(topic, [event]);
          }
        }

        for (const [topic, group] of byTopic) {
          const payload = encoder.encode(JSON.stringify({ events: group }));
          await deps.room.localParticipant?.publishData(payload, {
            reliable: true,
            topic,
          });
        }

        return definition.resultText(args);
      },
    });
  }

  return tools;
}

export default defineAgent<{ vad: silero.VAD }>({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
  },
  entry: async (ctx: JobContext) => {
    await ctx.connect();

    const metadata = (() => {
      try {
        return JSON.parse(ctx.job.metadata || "{}") as {
          sessionId?: string;
          voiceMode?: string;
        };
      } catch {
        return {};
      }
    })();
    const sessionId = metadata.sessionId ?? ctx.room.name;
    const pushToTalk = metadata.voiceMode === "push_to_talk";

    if (!sessionId) {
      throw new Error("No session id in job metadata or room name");
    }

    const db = createPrismaClient();
    const sessionContext = await loadSessionContext(db, sessionId);
    const { session } = sessionContext;
    const config = getKindConfig(sessionContext.kind);

    const storeContext: EventStoreContext = {
      learnerId: session.learnerId,
      workspaceId: session.workspaceId ?? "",
    };

    // Sitting metrics: each worker job is one sitting. Mark the lesson
    // in-progress on join; add the sitting's duration on shutdown. The
    // completed status is owned by the lesson.completed event projection.
    const sittingStartedAt = Date.now();
    if (session.lessonId && session.courseId) {
      const lessonId = session.lessonId;
      const courseId = session.courseId;
      await db.lessonProgress
        .upsert({
          where: {
            learnerId_lessonId: { learnerId: session.learnerId, lessonId },
          },
          create: {
            id: `progress_${crypto.randomUUID().replaceAll("-", "")}`,
            learnerId: session.learnerId,
            lessonId,
            courseId,
            status: "in_progress",
            sessionCount: 1,
            createdAt: new Date(),
          },
          update: { sessionCount: { increment: 1 } },
        })
        .catch((error: unknown) => {
          console.error("Failed to record lesson sitting", error);
        });

      ctx.addShutdownCallback(async () => {
        const seconds = Math.max(
          0,
          Math.round((Date.now() - sittingStartedAt) / 1000),
        );
        await db.lessonProgress
          .update({
            where: {
              learnerId_lessonId: { learnerId: session.learnerId, lessonId },
            },
            data: { totalSeconds: { increment: seconds } },
          })
          .catch((error: unknown) => {
            console.error("Failed to record lesson sitting duration", error);
          });
      });
    }

    const tools = bindLiveKitTools(config.tools, {
      db,
      room: ctx.room,
      storeContext,
      toolContext: {
        sessionId,
        learnerId: session.learnerId,
        workspaceId: session.workspaceId,
        courseId: session.courseId,
        lessonId: session.lessonId,
      },
    });

    const agent = new voice.Agent({
      instructions: config.buildPrompt(sessionContext, "voice"),
      tools,
    });

    const voiceSession = new voice.AgentSession({
      stt: new inference.STT({ model: "deepgram/nova-3", language: "multi" }),
      llm: new inference.LLM({ model: "openai/gpt-4.1" }),
      tts: new inference.TTS({
        model: "cartesia/sonic-3",
        voice: "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",
        // Match the room audio output rate (24kHz) so no resampling is
        // needed; mismatched rates intermittently break playback with
        // "sample_rate and num_channels don't match" in agents 1.4.x.
        sampleRate: 24000,
      }),
      // Push-to-talk: the learner explicitly opens/closes their turn over
      // RPC, so no automatic end-of-turn detection runs.
      turnDetection: pushToTalk
        ? "manual"
        : new livekit.turnDetector.MultilingualModel(),
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // Persist every finalized conversation item to the session event log so
    // the lesson transcript and whiteboard rehydrate after reload.
    const pendingTranscriptWrites = new Set<Promise<unknown>>();
    voiceSession.on(
      voice.AgentSessionEventTypes.ConversationItemAdded,
      (event) => {
        const item = event.item;
        if (item.type !== "message") {
          return;
        }
        const text = item.textContent;
        if (!text || (item.role !== "assistant" && item.role !== "user")) {
          return;
        }

        const write = persistTurnEvents(db, storeContext, sessionId, [
          {
            type: "transcript.utterance",
            speaker: item.role === "assistant" ? "tutor" : "learner",
            modality: "speech",
            segmentId: createSegmentId(),
            text,
            isFinal: true,
          },
        ]).catch((error: unknown) => {
          console.error("Failed to persist transcript event", error);
        });
        pendingTranscriptWrites.add(write);
        void write.finally(() => pendingTranscriptWrites.delete(write));
      },
    );

    // Don't lose the tail of the transcript when the session ends: wait for
    // in-flight writes before the worker process exits.
    ctx.addShutdownCallback(async () => {
      await Promise.allSettled([...pendingTranscriptWrites]);
    });

    await voiceSession.start({
      agent,
      room: ctx.room,
    });

    if (pushToTalk) {
      // Ignore the mic until the learner holds their talk key. The browser
      // drives the turn lifecycle over RPC (see lesson-room.tsx).
      voiceSession.input.setAudioEnabled(false);
      const local = ctx.room.localParticipant;

      local?.registerRpcMethod("ptt.start_turn", async () => {
        voiceSession.interrupt();
        voiceSession.clearUserTurn();
        voiceSession.input.setAudioEnabled(true);
        return "ok";
      });

      local?.registerRpcMethod("ptt.end_turn", async () => {
        voiceSession.input.setAudioEnabled(false);
        voiceSession.commitUserTurn();
        return "ok";
      });

      local?.registerRpcMethod("ptt.cancel_turn", async () => {
        voiceSession.input.setAudioEnabled(false);
        voiceSession.clearUserTurn();
        return "ok";
      });
    }

    const hasHistory = sessionContext.events.some(
      (event) => event.type === "transcript.utterance",
    );
    voiceSession.generateReply({
      instructions: hasHistory
        ? "Welcome the learner back to the lesson in one short sentence, briefly recall where you left off, and ask if they are ready to continue."
        : "Greet the learner warmly in one short sentence, introduce the lesson topic, and ask an opening question to gauge what they already know.",
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: AGENT_NAME,
  }),
);
