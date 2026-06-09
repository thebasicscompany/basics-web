import { openai } from "@ai-sdk/openai";
import {
  stepCountIs,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai";
import { z } from "zod";
import type { MasteryObservation } from "@basics/contracts";
import { sessionEventsToMessages } from "./messages";
import { buildSystemPrompt } from "./prompt";
import {
  WHITEBOARD_SURFACE_ID,
  createNamespacedId,
  type TutorEventDraft,
  type TutorResumeInput,
  type TutorRuntime,
  type TutorStreamItem,
  type TutorTurnContext,
  type TutorTurnResult,
} from "./types";

const MAX_STEPS = 8;

const TurnIntentSchema = z.enum([
  "explain",
  "question",
  "hint",
  "recap",
  "practice",
  "next_step",
]);

const VisualStyleInputSchema = z.object({
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional()
    .describe("Hex color like #1d4ed8"),
  strokeWidth: z.number().positive().optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const PointSchema = z.object({ x: z.number(), y: z.number() });

const SCREEN_CONTEXT_TOOL = "request_screen_context";

type ResumeState = {
  messages: ModelMessage[];
  toolCallId: string;
};

const ResumeStateSchema = z.object({
  messages: z.array(z.unknown()),
  toolCallId: z.string(),
});

export type AiTutorRuntimeOptions = {
  modelId?: string;
};

export class AiTutorRuntime implements TutorRuntime {
  private readonly model: LanguageModel;

  constructor(options: AiTutorRuntimeOptions = {}) {
    this.model = openai(
      options.modelId ?? process.env.BASICS_TUTOR_MODEL ?? "gpt-4o-mini",
    );
  }

  async *runTurn(
    context: TutorTurnContext,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult> {
    const messages = [
      ...sessionEventsToMessages(context.events),
      { role: "user" as const, content: context.learnerText },
    ];

    return yield* this.execute(context, messages, "learner_input");
  }

  async *resumeTurn(
    context: TutorTurnContext,
    resumeState: unknown,
    input: TutorResumeInput,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult> {
    const parsed = ResumeStateSchema.parse(resumeState) as ResumeState;

    const messages: ModelMessage[] = [
      ...parsed.messages,
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: parsed.toolCallId,
            toolName: SCREEN_CONTEXT_TOOL,
            output: {
              type: "json",
              value: input.approved
                ? { approved: true, note: "Learner approved the request." }
                : { approved: false, note: "Learner declined. Continue without it." },
            },
          },
        ],
      },
    ];

    if (input.approved) {
      const latestScreenContext = [...context.events]
        .reverse()
        .find(
          (event) =>
            event.type === "context.source_added" &&
            event.contextSource.sourceType === "screen",
        );

      if (
        latestScreenContext?.type === "context.source_added" &&
        latestScreenContext.contextSource.content.kind === "screen_snapshot" &&
        latestScreenContext.contextSource.content.contentRef.startsWith(
          "data:image/",
        )
      ) {
        messages.push({
          role: "user",
          content: [
            {
              type: "text",
              text: "[Approved screen snapshot from the learner]",
            },
            {
              type: "image",
              image: latestScreenContext.contextSource.content.contentRef,
            },
          ],
        });
      }
    }

    return yield* this.execute(context, messages, "context_update");
  }

  private async *execute(
    context: TutorTurnContext,
    messages: ModelMessage[],
    trigger: "learner_input" | "context_update",
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult> {
    const drafts: TutorEventDraft[] = [
      { type: "tutor.turn_started", trigger },
    ];
    let intent: z.infer<typeof TurnIntentSchema> = "explain";
    let replyText = "";
    let pendingScreenRequest:
      | { toolCallId: string; title: string; message: string; scope: string }
      | undefined;

    const pushDraft = function* (
      draft: TutorEventDraft,
    ): Generator<TutorStreamItem> {
      drafts.push(draft);
      yield { kind: "event-draft", draft };
    };

    const tools = {
      update_teaching_state: tool({
        description:
          "Update the teaching-state side panel the learner sees. Call this every turn.",
        inputSchema: z.object({
          conceptFocus: z.string().optional(),
          currentQuestion: z.string().optional(),
          explanation: z.string().optional(),
          tryThis: z.string().optional(),
          intent: TurnIntentSchema.optional().describe(
            "The pedagogical intent of this turn",
          ),
        }),
        execute: async () => ({ ok: true }),
      }),
      whiteboard_add_shape: tool({
        description:
          "Add a shape to the shared whiteboard. Use arrows to connect ideas.",
        inputSchema: z.object({
          shape: z.enum(["line", "arrow", "rectangle", "ellipse"]),
          origin: PointSchema,
          width: z.number().positive().optional(),
          height: z.number().positive().optional(),
          end: PointSchema.optional().describe(
            "End point for lines and arrows",
          ),
          style: VisualStyleInputSchema.optional(),
        }),
        execute: async () => ({ ok: true }),
      }),
      whiteboard_add_text: tool({
        description: "Add a short text label to the shared whiteboard.",
        inputSchema: z.object({
          at: PointSchema,
          text: z.string().min(1),
          style: VisualStyleInputSchema.optional(),
        }),
        execute: async () => ({ ok: true }),
      }),
      whiteboard_draw_path: tool({
        description:
          "Draw a freehand path (polyline) on the shared whiteboard.",
        inputSchema: z.object({
          points: z.array(PointSchema).min(2),
          style: VisualStyleInputSchema.optional(),
        }),
        execute: async () => ({ ok: true }),
      }),
      whiteboard_clear: tool({
        description: "Clear the shared whiteboard before a new diagram.",
        inputSchema: z.object({
          reason: z.string().optional(),
        }),
        execute: async () => ({ ok: true }),
      }),
      record_mastery: tool({
        description:
          "Record a mastery observation when the learner shows clear understanding or a misconception.",
        inputSchema: z.object({
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
        execute: async () => ({ ok: true }),
      }),
      reach_checkpoint: tool({
        description:
          "Mark a lesson checkpoint when the learner has clearly completed the lesson goal.",
        inputSchema: z.object({
          title: z.string().min(1),
          summary: z.string().min(1),
        }),
        execute: async () => ({ ok: true }),
      }),
      [SCREEN_CONTEXT_TOOL]: tool({
        description:
          "Ask the learner to share a one-time screenshot of their screen. Pauses until they respond.",
        inputSchema: z.object({
          title: z.string().min(1).describe("Short request title"),
          message: z
            .string()
            .min(1)
            .describe("Why seeing the screen would help right now"),
          scope: z
            .string()
            .min(1)
            .describe("What you need to see, e.g. 'the failing code editor'"),
        }),
        // No execute: the run pauses and waits for learner consent.
      }),
    } satisfies ToolSet;

    const result = streamText({
      model: this.model,
      system: buildSystemPrompt(context),
      messages,
      tools,
      stopWhen: stepCountIs(MAX_STEPS),
    });

    for await (const part of result.fullStream) {
      switch (part.type) {
        case "text-delta": {
          replyText += part.text;
          yield { kind: "text-delta", text: part.text };
          break;
        }
        case "tool-call": {
          const input = part.input as Record<string, unknown>;

          switch (part.toolName) {
            case "update_teaching_state": {
              const { intent: toolIntent, ...state } = input as {
                intent?: z.infer<typeof TurnIntentSchema>;
                conceptFocus?: string;
                currentQuestion?: string;
                explanation?: string;
                tryThis?: string;
              };

              if (toolIntent) {
                intent = toolIntent;
              }

              yield* pushDraft({ type: "tutor.teaching_state", ...state });
              break;
            }
            case "whiteboard_add_shape": {
              yield* pushDraft({
                type: "visual.add_shape",
                surfaceId: WHITEBOARD_SURFACE_ID,
                ...(input as {
                  shape: "line" | "arrow" | "rectangle" | "ellipse";
                  origin: { x: number; y: number };
                  width?: number;
                  height?: number;
                  end?: { x: number; y: number };
                  style?: {
                    color?: string;
                    strokeWidth?: number;
                    opacity?: number;
                  };
                }),
              });
              break;
            }
            case "whiteboard_add_text": {
              yield* pushDraft({
                type: "visual.add_text",
                surfaceId: WHITEBOARD_SURFACE_ID,
                ...(input as {
                  at: { x: number; y: number };
                  text: string;
                  style?: {
                    color?: string;
                    strokeWidth?: number;
                    opacity?: number;
                  };
                }),
              });
              break;
            }
            case "whiteboard_draw_path": {
              yield* pushDraft({
                type: "visual.draw_path",
                surfaceId: WHITEBOARD_SURFACE_ID,
                ...(input as {
                  points: { x: number; y: number }[];
                  style?: {
                    color?: string;
                    strokeWidth?: number;
                    opacity?: number;
                  };
                }),
              });
              break;
            }
            case "whiteboard_clear": {
              yield* pushDraft({
                type: "visual.clear_surface",
                surfaceId: WHITEBOARD_SURFACE_ID,
                ...(input as { reason?: string }),
              });
              break;
            }
            case "record_mastery": {
              const mastery = input as {
                conceptKey: string;
                signal: MasteryObservation["signal"];
                level?: MasteryObservation["level"];
                confidence: number;
                note?: string;
              };

              yield* pushDraft({
                type: "mastery.observed",
                observation: {
                  id: createNamespacedId("mastery"),
                  learnerId: context.session.learnerId,
                  ...(context.session.workspaceId
                    ? { workspaceId: context.session.workspaceId }
                    : {}),
                  sessionId: context.session.id,
                  ...(context.session.courseId
                    ? { courseId: context.session.courseId }
                    : {}),
                  ...(context.session.lessonId
                    ? { lessonId: context.session.lessonId }
                    : {}),
                  conceptKey: mastery.conceptKey,
                  observedAt: new Date().toISOString(),
                  signal: mastery.signal,
                  ...(mastery.level ? { level: mastery.level } : {}),
                  confidence: mastery.confidence,
                  ...(mastery.note ? { note: mastery.note } : {}),
                },
              });
              break;
            }
            case "reach_checkpoint": {
              yield* pushDraft({
                type: "lesson.checkpoint_reached",
                ...(context.session.lessonId
                  ? { lessonId: context.session.lessonId }
                  : {}),
                ...(input as { title: string; summary: string }),
              });
              break;
            }
            case SCREEN_CONTEXT_TOOL: {
              const request = input as {
                title: string;
                message: string;
                scope: string;
              };

              pendingScreenRequest = {
                toolCallId: part.toolCallId,
                ...request,
              };

              yield* pushDraft({
                type: "tutor.agent_request",
                kind: "screen_context",
                title: request.title,
                message: request.message,
                scope: request.scope,
                retention: "transient",
                primaryActionLabel: "Share screenshot",
              });
              break;
            }
          }
          break;
        }
        case "error": {
          throw part.error instanceof Error
            ? part.error
            : new Error(String(part.error));
        }
        default:
          break;
      }
    }

    if (replyText.trim().length > 0) {
      drafts.splice(1, 0, {
        type: "transcript.utterance",
        speaker: "tutor",
        modality: "text",
        segmentId: createNamespacedId("segment"),
        text: replyText.trim(),
        isFinal: true,
      });
    }

    if (pendingScreenRequest) {
      const response = await result.response;
      const resumeState: ResumeState = {
        messages: [...messages, ...response.messages],
        toolCallId: pendingScreenRequest.toolCallId,
      };

      return {
        drafts,
        pause: {
          kind: "screen_context",
          title: pendingScreenRequest.title,
          message: pendingScreenRequest.message,
          scope: pendingScreenRequest.scope,
          resumeState,
        },
      };
    }

    drafts.push({
      type: "tutor.turn_completed",
      intent,
      ...(replyText.trim().length > 0
        ? { summary: replyText.trim().slice(0, 280) }
        : {}),
    });

    return { drafts };
  }
}
