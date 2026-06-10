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
import type { BasicsPrismaClient } from "@basics/db";
import { sessionKindOf, type SessionContext } from "./context";
import { getKindConfig } from "./kinds";
import { sessionEventsToMessages } from "./messages";
import {
  updateTeachingState,
  TURN_INTENTS,
  type ToolSessionContext,
} from "./tools";
import {
  createNamespacedId,
  type TutorEventDraft,
  type TutorResumeInput,
  type TutorRuntime,
  type TutorStreamItem,
  type TutorTurnContext,
  type TutorTurnResult,
} from "./types";

const MAX_STEPS = 8;

type TurnIntent = (typeof TURN_INTENTS)[number];

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
  /** Enables tools with a `perform` side effect (e.g. intake's create_course). */
  db?: BasicsPrismaClient;
};

export class AiTutorRuntime implements TutorRuntime {
  private readonly model: LanguageModel;
  private readonly db?: BasicsPrismaClient;

  constructor(options: AiTutorRuntimeOptions = {}) {
    this.model = openai(
      options.modelId ?? process.env.BASICS_TUTOR_MODEL ?? "gpt-4o-mini",
    );
    this.db = options.db;
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
    const kind = context.kind ?? sessionKindOf(context.session);
    const config = getKindConfig(kind);

    const sessionContext: SessionContext = {
      session: context.session,
      kind,
      course: context.course,
      lesson: context.lesson,
      events: context.events,
      materials: context.materials ?? [],
    };

    const toolSessionContext: ToolSessionContext = {
      sessionId: context.session.id,
      learnerId: context.session.learnerId,
      workspaceId: context.session.workspaceId,
      courseId: context.session.courseId,
      lessonId: context.session.lessonId,
    };

    const drafts: TutorEventDraft[] = [
      { type: "tutor.turn_started", trigger },
    ];
    let intent: TurnIntent = "explain";
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

    // Bind the kind's pure tool definitions to the AI SDK. Execution is a
    // no-op acknowledgment: the event drafts are produced from the stream's
    // tool-call parts below, persisted by the caller at end of turn.
    const tools: ToolSet = Object.fromEntries(
      config.tools.map((definition) => [
        definition.name,
        tool({
          description: definition.description,
          inputSchema: definition.parameters,
          execute: async () => ({ ok: true }),
        }),
      ]),
    );

    tools[SCREEN_CONTEXT_TOOL] = tool({
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
    });

    const result = streamText({
      model: this.model,
      system: config.buildPrompt(sessionContext, "text"),
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
          if (part.toolName === SCREEN_CONTEXT_TOOL) {
            const request = part.input as {
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

          const definition = config.tools.find(
            (candidate) => candidate.name === part.toolName,
          );

          if (!definition) {
            break;
          }

          if (definition.name === updateTeachingState.name) {
            const { intent: toolIntent } = part.input as {
              intent?: TurnIntent;
            };

            if (toolIntent) {
              intent = toolIntent;
            }
          }

          for (const draft of definition.toDrafts(
            part.input,
            toolSessionContext,
          )) {
            yield* pushDraft(draft);
          }

          if (definition.perform && this.db) {
            const performed = await definition.perform(
              part.input,
              toolSessionContext,
              this.db,
            );

            for (const draft of performed) {
              yield* pushDraft(draft);
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
