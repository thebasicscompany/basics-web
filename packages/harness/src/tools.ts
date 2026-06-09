import { z } from "zod";
import type { SessionEventDraft } from "@basics/contracts";
import { createNamespacedId } from "./types";

export const WHITEBOARD_SURFACE_ID = "lesson-stage";

/** LiveKit data-channel topics events are broadcast on (voice transport). */
export const VISUAL_DATA_TOPIC = "basics.visual";
export const TEACHING_STATE_DATA_TOPIC = "basics.teaching_state";
export const SKETCH_DATA_TOPIC = "basics.sketch";

/** Which data-channel topic a persisted event should be broadcast on. */
export function topicForEventType(type: string): string {
  return type.startsWith("visual.")
    ? VISUAL_DATA_TOPIC
    : TEACHING_STATE_DATA_TOPIC;
}

/** Session identity a tool needs to produce fully-attributed event drafts. */
export type ToolSessionContext = {
  sessionId: string;
  learnerId: string;
  workspaceId?: string;
  courseId?: string;
  lessonId?: string;
};

/**
 * A transport-agnostic tool definition: zod input schema plus a pure
 * mapping from validated input to session event drafts. Transports bind
 * these (LiveKit `llm.tool` for voice, AI SDK `tool` for chat); persistence
 * and broadcasting stay with the transport.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- erased generic; inputs are validated by the transport against `parameters`
export type ToolDefinition<Input = any> = {
  name: string;
  description: string;
  parameters: z.ZodType<Input>;
  /** Pure: maps validated tool input to session event drafts. */
  toDrafts: (input: Input, ctx: ToolSessionContext) => SessionEventDraft[];
  /** Short confirmation returned to the model after the call lands. */
  resultText: (input: Input) => string;
};

function defineTool<Schema extends z.ZodTypeAny>(def: {
  name: string;
  description: string;
  parameters: Schema;
  toDrafts: (
    input: z.output<Schema>,
    ctx: ToolSessionContext,
  ) => SessionEventDraft[];
  resultText: (input: z.output<Schema>) => string;
}): ToolDefinition<z.output<Schema>> {
  return def as ToolDefinition<z.output<Schema>>;
}

const pointSchema = z.object({
  x: z.number().min(0).max(100).describe("Percent of canvas width, 0-100"),
  y: z.number().min(0).max(100).describe("Percent of canvas height, 0-100"),
});

const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .optional()
  .describe("Hex color like #2563eb");

export const TURN_INTENTS = [
  "explain",
  "question",
  "hint",
  "recap",
  "practice",
  "next_step",
] as const;

export const updateTeachingState = defineTool({
  name: "update_teaching_state",
  description:
    "Update the learner-facing teaching state: concept in focus, current question, short explanation, and a try-this exercise.",
  parameters: z.object({
    conceptFocus: z.string().optional(),
    currentQuestion: z.string().optional(),
    explanation: z.string().optional(),
    tryThis: z.string().optional(),
    intent: z
      .enum(TURN_INTENTS)
      .optional()
      .describe("The pedagogical intent of this turn"),
  }),
  toDrafts: (input) => [
    {
      type: "tutor.teaching_state",
      conceptFocus: input.conceptFocus || undefined,
      currentQuestion: input.currentQuestion || undefined,
      explanation: input.explanation || undefined,
      tryThis: input.tryThis || undefined,
    },
  ],
  resultText: () => "Teaching state updated.",
});

export const whiteboardAddShape = defineTool({
  name: "whiteboard_add_shape",
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
  toDrafts: (input) => [
    {
      type: "visual.add_shape",
      surfaceId: WHITEBOARD_SURFACE_ID,
      shape: input.shape,
      origin: input.origin,
      end: input.end,
      width: input.width,
      height: input.height,
      style: input.color ? { color: input.color } : undefined,
    },
  ],
  resultText: () => "Shape drawn.",
});

export const whiteboardAddText = defineTool({
  name: "whiteboard_add_text",
  description:
    "Write a short text label on the shared whiteboard. Keep labels under six words.",
  parameters: z.object({
    at: pointSchema,
    text: z.string().min(1).max(80),
    color: colorSchema,
  }),
  toDrafts: (input) => [
    {
      type: "visual.add_text",
      surfaceId: WHITEBOARD_SURFACE_ID,
      at: input.at,
      text: input.text,
      style: input.color ? { color: input.color } : undefined,
    },
  ],
  resultText: () => "Text added.",
});

export const whiteboardDrawPath = defineTool({
  name: "whiteboard_draw_path",
  description:
    "Draw a freeform path (polyline) on the shared whiteboard, e.g. a curve, graph line, or annotation stroke.",
  parameters: z.object({
    points: z.array(pointSchema).min(2).max(64),
    color: colorSchema,
  }),
  toDrafts: (input) => [
    {
      type: "visual.draw_path",
      surfaceId: WHITEBOARD_SURFACE_ID,
      points: input.points,
      style: input.color ? { color: input.color } : undefined,
    },
  ],
  resultText: () => "Path drawn.",
});

export const whiteboardAddDiagram = defineTool({
  name: "whiteboard_add_diagram",
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
  toDrafts: (input) => [
    {
      type: "visual.add_diagram",
      surfaceId: WHITEBOARD_SURFACE_ID,
      format: "mermaid",
      source: input.mermaid,
      title: input.title || undefined,
      at: input.at,
      width: input.width,
    },
  ],
  resultText: () => "Diagram rendered on the whiteboard.",
});

export const setLearnerDrawing = defineTool({
  name: "set_learner_drawing",
  description: [
    "Enable or disable the learner's whiteboard drawing controls.",
    "Enable when the learner asks to show, draw, or point at something, or when you want them to sketch an answer.",
    "Disable when the drawing exercise is finished and you are moving on.",
  ].join(" "),
  parameters: z.object({
    enabled: z.boolean(),
  }),
  toDrafts: (input) => [
    {
      type: "visual.set_draw_mode",
      surfaceId: WHITEBOARD_SURFACE_ID,
      enabled: input.enabled,
    },
  ],
  resultText: (input) =>
    input.enabled
      ? "Drawing controls are now visible to the learner."
      : "Drawing controls are now hidden.",
});

export const whiteboardClear = defineTool({
  name: "whiteboard_clear",
  description:
    "Clear the shared whiteboard. Use before starting an unrelated diagram.",
  parameters: z.object({
    reason: z.string().optional(),
  }),
  toDrafts: (input) => [
    {
      type: "visual.clear_surface",
      surfaceId: WHITEBOARD_SURFACE_ID,
      reason: input.reason || undefined,
    },
  ],
  resultText: () => "Whiteboard cleared.",
});

export const recordMastery = defineTool({
  name: "record_mastery",
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
  toDrafts: (input, ctx) => [
    {
      type: "mastery.observed",
      observation: {
        id: createNamespacedId("mastery"),
        learnerId: ctx.learnerId,
        ...(ctx.workspaceId ? { workspaceId: ctx.workspaceId } : {}),
        sessionId: ctx.sessionId,
        ...(ctx.courseId ? { courseId: ctx.courseId } : {}),
        ...(ctx.lessonId ? { lessonId: ctx.lessonId } : {}),
        conceptKey: input.conceptKey,
        observedAt: new Date().toISOString(),
        signal: input.signal,
        ...(input.level ? { level: input.level } : {}),
        confidence: input.confidence,
        ...(input.note ? { note: input.note } : {}),
      },
    },
  ],
  resultText: () => "Mastery observation recorded.",
});

export const reachCheckpoint = defineTool({
  name: "reach_checkpoint",
  description:
    "Mark a lesson checkpoint when the learner explicitly indicates they completed the lesson goal.",
  parameters: z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
  }),
  toDrafts: (input, ctx) => [
    {
      type: "lesson.checkpoint_reached",
      ...(ctx.lessonId ? { lessonId: ctx.lessonId } : {}),
      title: input.title,
      summary: input.summary,
    },
  ],
  resultText: () => "Checkpoint recorded.",
});

/** Tools shared by the tutoring kinds (lesson and chat). */
export const TUTOR_TOOLS: ToolDefinition[] = [
  updateTeachingState,
  whiteboardAddShape,
  whiteboardAddText,
  whiteboardDrawPath,
  whiteboardAddDiagram,
  setLearnerDrawing,
  whiteboardClear,
  recordMastery,
  reachCheckpoint,
];
