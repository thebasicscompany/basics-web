import { llm } from "@livekit/agents";
import type { Room } from "@livekit/rtc-node";
import { z } from "zod";
import type { SessionEventDraft } from "@basics/contracts";
import {
  appendSessionEvents,
  serializeSessionEvent,
  type BasicsPrismaClient,
} from "@basics/db";

export const WHITEBOARD_SURFACE_ID = "lesson-stage";
export const VISUAL_DATA_TOPIC = "basics.visual";
export const TEACHING_STATE_DATA_TOPIC = "basics.teaching_state";
export const SKETCH_DATA_TOPIC = "basics.sketch";

const pointSchema = z.object({
  x: z.number().min(0).max(100).describe("Percent of canvas width, 0-100"),
  y: z.number().min(0).max(100).describe("Percent of canvas height, 0-100"),
});

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .optional()
  .describe("Hex color like #2563eb");

export type ToolDeps = {
  db: BasicsPrismaClient;
  room: Room;
  sessionId: string;
  learnerId: string;
  workspaceId: string;
  lessonId?: string;
  courseId?: string;
};

function createMasteryId(): string {
  return `mastery_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createTutorTools(deps: ToolDeps): llm.ToolContext {
  const encoder = new TextEncoder();

  /** Persists drafts, then broadcasts the stored events to the room. */
  async function record(
    drafts: SessionEventDraft[],
    topic: string,
  ): Promise<void> {
    const rows = await appendSessionEvents(
      deps.db,
      { learnerId: deps.learnerId, workspaceId: deps.workspaceId },
      deps.sessionId,
      drafts,
    );

    const payload = encoder.encode(
      JSON.stringify({ events: rows.map(serializeSessionEvent) }),
    );
    await deps.room.localParticipant?.publishData(payload, {
      reliable: true,
      topic,
    });
  }

  return {
    update_teaching_state: llm.tool({
      description:
        "Update the learner-facing teaching state: concept in focus, current question, short explanation, and a try-this exercise.",
      parameters: z.object({
        conceptFocus: z.string().optional(),
        currentQuestion: z.string().optional(),
        explanation: z.string().optional(),
        tryThis: z.string().optional(),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "tutor.teaching_state",
              conceptFocus: args.conceptFocus || undefined,
              currentQuestion: args.currentQuestion || undefined,
              explanation: args.explanation || undefined,
              tryThis: args.tryThis || undefined,
            },
          ],
          TEACHING_STATE_DATA_TOPIC,
        );
        return "Teaching state updated.";
      },
    }),

    whiteboard_add_shape: llm.tool({
      description:
        "Add a shape to the shared whiteboard. Lines and arrows use origin and end; rectangles and ellipses use origin (top-left) with width and height.",
      parameters: z.object({
        shape: z.enum(["line", "arrow", "rectangle", "ellipse"]),
        origin: pointSchema,
        end: pointSchema.optional(),
        // .positive() emits `exclusiveMinimum: true`, which OpenAI's schema
        // validator rejects; use inclusive bounds instead.
        width: z.number().min(1).max(100).optional(),
        height: z.number().min(1).max(100).optional(),
        color: colorSchema,
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.add_shape",
              surfaceId: WHITEBOARD_SURFACE_ID,
              shape: args.shape,
              origin: args.origin,
              end: args.end,
              width: args.width,
              height: args.height,
              style: args.color ? { color: args.color } : undefined,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return "Shape drawn.";
      },
    }),

    whiteboard_add_text: llm.tool({
      description:
        "Write a short text label on the shared whiteboard. Keep labels under six words.",
      parameters: z.object({
        at: pointSchema,
        text: z.string().min(1).max(80),
        color: colorSchema,
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.add_text",
              surfaceId: WHITEBOARD_SURFACE_ID,
              at: args.at,
              text: args.text,
              style: args.color ? { color: args.color } : undefined,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return "Text added.";
      },
    }),

    whiteboard_draw_path: llm.tool({
      description:
        "Draw a freeform path (polyline) on the shared whiteboard, e.g. a curve, graph line, or annotation stroke.",
      parameters: z.object({
        points: z.array(pointSchema).min(2).max(64),
        color: colorSchema,
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.draw_path",
              surfaceId: WHITEBOARD_SURFACE_ID,
              points: args.points,
              style: args.color ? { color: args.color } : undefined,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return "Path drawn.";
      },
    }),

    whiteboard_add_diagram: llm.tool({
      description: [
        "Render a rich diagram on the shared whiteboard from Mermaid source.",
        "Use this for structured visuals that are tedious to build from primitives:",
        "flowcharts, sequence diagrams, state machines, tree/graph structures, pie charts, timelines.",
        "Prefer simple primitives (shapes, arrows, labels) for quick sketches; use diagrams for structure.",
      ].join(" "),
      parameters: z.object({
        mermaid: z
          .string()
          .min(1)
          .describe(
            "Valid Mermaid source, e.g. 'flowchart TD\\n  A[Start] --> B{Decision}'. Keep node labels short.",
          ),
        title: z.string().max(60).optional(),
        at: pointSchema
          .optional()
          .describe("Top-left position of the diagram, percent of canvas"),
        width: z
          .number()
          .min(10)
          .max(100)
          .optional()
          .describe("Diagram width as percent of canvas width"),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.add_diagram",
              surfaceId: WHITEBOARD_SURFACE_ID,
              format: "mermaid",
              source: args.mermaid,
              title: args.title || undefined,
              at: args.at,
              width: args.width,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return "Diagram rendered on the whiteboard.";
      },
    }),

    set_learner_drawing: llm.tool({
      description: [
        "Enable or disable the learner's whiteboard drawing controls.",
        "Enable when the learner asks to show, draw, or point at something, or when you want them to sketch an answer.",
        "Disable when the drawing exercise is finished and you are moving on.",
      ].join(" "),
      parameters: z.object({
        enabled: z.boolean(),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.set_draw_mode",
              surfaceId: WHITEBOARD_SURFACE_ID,
              enabled: args.enabled,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return args.enabled
          ? "Drawing controls are now visible to the learner."
          : "Drawing controls are now hidden.";
      },
    }),

    whiteboard_clear: llm.tool({
      description:
        "Clear the shared whiteboard. Use before starting an unrelated diagram.",
      parameters: z.object({
        reason: z.string().optional(),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "visual.clear_surface",
              surfaceId: WHITEBOARD_SURFACE_ID,
              reason: args.reason || undefined,
            },
          ],
          VISUAL_DATA_TOPIC,
        );
        return "Whiteboard cleared.";
      },
    }),

    record_mastery: llm.tool({
      description:
        "Record a mastery observation when the learner demonstrates clear understanding or a clear misconception about a concept.",
      parameters: z.object({
        conceptKey: z.string().min(1),
        signal: z.enum([
          "correct_recall",
          "partial_understanding",
          "misconception",
          "asked_for_help",
          "completed_practice",
          "self_report",
        ]),
        level: z
          .enum(["introduced", "practicing", "comfortable", "mastered"])
          .optional(),
        confidence: z.number().min(0).max(1),
        note: z.string().optional(),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "mastery.observed",
              observation: {
                id: createMasteryId(),
                learnerId: deps.learnerId,
                workspaceId: deps.workspaceId,
                sessionId: deps.sessionId,
                courseId: deps.courseId,
                lessonId: deps.lessonId,
                conceptKey: args.conceptKey,
                observedAt: new Date().toISOString(),
                signal: args.signal,
                level: args.level,
                confidence: args.confidence,
                note: args.note || undefined,
              },
            },
          ],
          TEACHING_STATE_DATA_TOPIC,
        );
        return "Mastery observation recorded.";
      },
    }),

    reach_checkpoint: llm.tool({
      description:
        "Mark a lesson checkpoint when the learner explicitly indicates they completed the lesson goal.",
      parameters: z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
      }),
      execute: async (args) => {
        await record(
          [
            {
              type: "lesson.checkpoint_reached",
              lessonId: deps.lessonId,
              title: args.title,
              summary: args.summary,
            },
          ],
          TEACHING_STATE_DATA_TOPIC,
        );
        return "Checkpoint recorded.";
      },
    }),
  };
}
