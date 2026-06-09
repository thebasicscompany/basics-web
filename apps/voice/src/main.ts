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
import { RoomEvent } from "@livekit/rtc-node";
import { config as loadEnv } from "dotenv";
import {
  appendSessionEvents,
  createPrismaClient,
  serializeSessionEvent,
} from "@basics/db";
import { buildInstructions } from "./instructions";
import { SKETCH_DATA_TOPIC, createTutorTools } from "./tools";

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
 * Voice agent that augments each completed user turn with the learner's most
 * recent whiteboard sketch (published by the client on the sketch data topic),
 * so the tutor can react to what the learner drew.
 */
class TutorAgent extends voice.Agent {
  latestSketch: string | null = null;
  private deliveredSketch: string | null = null;

  override async onUserTurnCompleted(
    _chatCtx: llmTypes.ChatContext,
    newMessage: llmTypes.ChatMessage,
  ): Promise<void> {
    if (this.latestSketch && this.latestSketch !== this.deliveredSketch) {
      newMessage.content.push(
        `[The learner's current whiteboard sketch: ${this.latestSketch}]`,
      );
      this.deliveredSketch = this.latestSketch;
    }
  }
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
        };
      } catch {
        return {};
      }
    })();
    const sessionId = metadata.sessionId ?? ctx.room.name;

    if (!sessionId) {
      throw new Error("No session id in job metadata or room name");
    }

    const db = createPrismaClient();
    const sessionRow = await db.session.findUniqueOrThrow({
      where: { id: sessionId },
      include: { lesson: true, course: true },
    });
    const priorEventRows = await db.sessionEvent.findMany({
      where: { sessionId },
      orderBy: { sequence: "asc" },
    });
    const priorEvents = priorEventRows.map(serializeSessionEvent);

    const tools = createTutorTools({
      db,
      room: ctx.room,
      sessionId,
      learnerId: sessionRow.learnerId,
      workspaceId: sessionRow.workspaceId ?? "",
      lessonId: sessionRow.lessonId ?? undefined,
      courseId: sessionRow.courseId ?? undefined,
    });

    const agent = new TutorAgent({
      instructions: buildInstructions({
        lesson: sessionRow.lesson
          ? {
              id: sessionRow.lesson.id,
              courseId: sessionRow.lesson.courseId,
              slug: sessionRow.lesson.slug,
              title: sessionRow.lesson.title,
              summary: sessionRow.lesson.summary ?? undefined,
              orderIndex: sessionRow.lesson.orderIndex,
              objectives: sessionRow.lesson.objectives,
              conceptKeys: sessionRow.lesson.conceptKeys,
              estimatedMinutes: sessionRow.lesson.estimatedMinutes ?? undefined,
              status: sessionRow.lesson.status as "draft" | "ready" | "archived",
              createdAt: sessionRow.lesson.createdAt.toISOString(),
              updatedAt: sessionRow.lesson.updatedAt.toISOString(),
            }
          : null,
        course: sessionRow.course
          ? {
              id: sessionRow.course.id,
              slug: sessionRow.course.slug,
              title: sessionRow.course.title,
              description: sessionRow.course.description ?? undefined,
              level: sessionRow.course.level as
                | "introductory"
                | "beginner"
                | "intermediate"
                | "advanced"
                | undefined,
              tags: sessionRow.course.tags,
              moduleIds: [],
              lessonIds: [],
              status: sessionRow.course.status as
                | "draft"
                | "active"
                | "archived",
              createdAt: sessionRow.course.createdAt.toISOString(),
              updatedAt: sessionRow.course.updatedAt.toISOString(),
            }
          : null,
        priorEvents,
      }),
      tools,
    });

    const decoder = new TextDecoder();
    ctx.room.on(
      RoomEvent.DataReceived,
      (payload, _participant, _kind, topic) => {
        if (topic !== SKETCH_DATA_TOPIC) {
          return;
        }
        try {
          const message = JSON.parse(decoder.decode(payload)) as {
            description?: string;
          };
          if (message.description) {
            agent.latestSketch = message.description;
          }
        } catch {
          // Ignore malformed sketch payloads.
        }
      },
    );

    const session = new voice.AgentSession({
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
      turnDetection: new livekit.turnDetector.MultilingualModel(),
      vad: ctx.proc.userData.vad as silero.VAD,
    });

    // Persist every finalized conversation item to the session event log so
    // the lesson transcript and whiteboard rehydrate after reload.
    const pendingTranscriptWrites = new Set<Promise<unknown>>();
    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (event) => {
      const item = event.item;
      if (item.type !== "message") {
        return;
      }
      const text = item.textContent;
      if (!text || (item.role !== "assistant" && item.role !== "user")) {
        return;
      }

      const write = appendSessionEvents(
        db,
        {
          learnerId: sessionRow.learnerId,
          workspaceId: sessionRow.workspaceId ?? "",
        },
        sessionId,
        [
          {
            type: "transcript.utterance",
            speaker: item.role === "assistant" ? "tutor" : "learner",
            modality: "speech",
            segmentId: createSegmentId(),
            text,
            isFinal: true,
          },
        ],
      ).catch((error: unknown) => {
        console.error("Failed to persist transcript event", error);
      });
      pendingTranscriptWrites.add(write);
      void write.finally(() => pendingTranscriptWrites.delete(write));
    });

    // Don't lose the tail of the transcript when the session ends: wait for
    // in-flight writes before the worker process exits.
    ctx.addShutdownCallback(async () => {
      await Promise.allSettled([...pendingTranscriptWrites]);
    });

    await session.start({
      agent,
      room: ctx.room,
    });

    const hasHistory = priorEvents.some(
      (event) => event.type === "transcript.utterance",
    );
    session.generateReply({
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
