import type {
  TutorResumeInput,
  TutorRuntime,
  TutorStreamItem,
  TutorTurnContext,
  TutorTurnResult,
} from "./types";
import { createNamespacedId, type TutorEventDraft } from "./types";

const summarize = (text: string) => {
  const normalized = text.trim().replace(/\s+/g, " ");

  return normalized.length <= 110 ? normalized : `${normalized.slice(0, 107)}...`;
};

const resolveFocus = (context: TutorTurnContext) =>
  context.lesson?.title ??
  context.course?.title ??
  context.session.topic ??
  context.session.goal ??
  "this topic";

/**
 * Template-based runtime used when no model provider is configured.
 * Keeps the full loop testable without network access or API keys.
 */
export class DeterministicTutorRuntime implements TutorRuntime {
  async *runTurn(
    context: TutorTurnContext,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult> {
    const focus = resolveFocus(context);
    const learnerTurns = context.events.filter(
      (event) =>
        event.type === "transcript.utterance" && event.speaker === "learner",
    ).length;
    const learnerSummary = summarize(context.learnerText);

    const reply =
      learnerTurns <= 1
        ? `Let's start with ${focus}. I heard: "${learnerSummary}". In one sentence, tell me what you think the key idea is, and I will tune the explanation from there.`
        : `For ${focus}, I heard: "${learnerSummary}". Try naming the rule, the example, or the confusing step. I will use that to decide whether to explain, ask a check question, or give a hint.`;

    for (const word of reply.split(/(?<= )/)) {
      yield { kind: "text-delta", text: word };
    }

    const drafts: TutorEventDraft[] = [
      { type: "tutor.turn_started", trigger: "learner_input" },
      {
        type: "transcript.utterance",
        speaker: "tutor",
        modality: "text",
        segmentId: createNamespacedId("segment"),
        text: reply,
        isFinal: true,
      },
      {
        type: "tutor.teaching_state",
        conceptFocus: focus,
        currentQuestion: `What is the key idea behind ${focus}?`,
        explanation: `We are grounding the next turn in your answer: "${learnerSummary}".`,
        tryThis: "Answer in one sentence, then give a tiny example.",
      },
      { type: "tutor.turn_completed", intent: "question", summary: reply },
    ];

    const teachingState = drafts[2];
    yield { kind: "event-draft", draft: teachingState };

    return { drafts };
  }

  async *resumeTurn(
    context: TutorTurnContext,
    _resumeState: unknown,
    input: TutorResumeInput,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult> {
    const reply = input.approved
      ? "Thanks — I can see your screen context now. Point me to the exact part you want to work through."
      : "No problem, we can keep going without screen context. Describe what you are seeing instead.";

    yield { kind: "text-delta", text: reply };

    return {
      drafts: [
        {
          type: "transcript.utterance",
          speaker: "tutor",
          modality: "text",
          segmentId: createNamespacedId("segment"),
          text: reply,
          isFinal: true,
        },
        { type: "tutor.turn_completed", intent: "next_step", summary: reply },
      ],
    };
  }
}
