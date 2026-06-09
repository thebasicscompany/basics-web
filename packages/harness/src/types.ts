import type {
  Course,
  Lesson,
  Session,
  SessionEvent,
  SessionEventDraft,
} from "@basics/contracts";
import type { SessionKind } from "./kinds";
import type { SessionMaterial } from "./context";

/** A session event draft awaiting envelope assignment by the event store. */
export type TutorEventDraft = SessionEventDraft;

/** Learner-provided material (e.g. an uploaded document) usable in a turn. */
export type TutorMaterial = SessionMaterial;

export type TutorTurnContext = {
  session: Session;
  events: SessionEvent[];
  learnerText: string;
  /** Derived from the session when omitted (see `sessionKindOf`). */
  kind?: SessionKind;
  course?: Course;
  lesson?: Lesson;
  materials?: TutorMaterial[];
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

export function createNamespacedId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}
