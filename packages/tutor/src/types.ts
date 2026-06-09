import type {
  Course,
  Lesson,
  Session,
  SessionEvent,
  SessionEventDraft,
} from "@basics/contracts";

/** A session event draft awaiting envelope assignment by the event store. */
export type TutorEventDraft = SessionEventDraft;

export type TutorTurnContext = {
  session: Session;
  events: SessionEvent[];
  learnerText: string;
  course?: Course;
  lesson?: Lesson;
};

export type TutorStreamItem =
  | { kind: "text-delta"; text: string }
  | { kind: "event-draft"; draft: TutorEventDraft };

export type TutorTurnPauseRequest = {
  kind: "screen_context" | "guided_action" | "open_resource";
  title: string;
  message: string;
  scope: string;
  /** Opaque JSON-serializable state needed to resume the run. */
  resumeState: unknown;
};

export type TutorTurnResult = {
  drafts: TutorEventDraft[];
  pause?: TutorTurnPauseRequest;
};

export type TutorResumeInput = {
  approved: boolean;
};

/**
 * The product-owned tutoring runtime boundary. Implementations may use any
 * model/orchestration stack; nothing outside this package may depend on it.
 */
export interface TutorRuntime {
  runTurn(
    context: TutorTurnContext,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult>;
  resumeTurn(
    context: TutorTurnContext,
    resumeState: unknown,
    input: TutorResumeInput,
  ): AsyncGenerator<TutorStreamItem, TutorTurnResult>;
}

export const WHITEBOARD_SURFACE_ID = "lesson-stage";

export function createNamespacedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
