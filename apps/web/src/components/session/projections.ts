import type { SessionEvent, VisualAction } from "@basics/contracts";

export type TranscriptUtterance = Extract<
  SessionEvent,
  { type: "transcript.utterance" }
>;
export type CheckpointEvent = Extract<
  SessionEvent,
  { type: "lesson.checkpoint_reached" }
>;
export type TeachingStateEvent = Extract<
  SessionEvent,
  { type: "tutor.teaching_state" }
>;

export type TranscriptRow =
  | { type: "message"; event: TranscriptUtterance }
  | { type: "checkpoint"; event: CheckpointEvent };

export type TeachingState = {
  conceptFocus?: string;
  currentQuestion?: string;
  explanation?: string;
  tryThis?: string;
};

export function isVisualAction(event: SessionEvent): event is VisualAction {
  switch (event.type) {
    case "visual.draw_path":
    case "visual.add_shape":
    case "visual.add_text":
    case "visual.add_diagram":
    case "visual.set_draw_mode":
    case "visual.clear_surface":
    case "visual.focus":
      return true;
    default:
      return false;
  }
}

export function buildTranscriptRows(events: SessionEvent[]): TranscriptRow[] {
  const rows: TranscriptRow[] = [];

  for (const event of events) {
    if (event.type === "transcript.utterance" && event.isFinal) {
      rows.push({ type: "message", event });
    } else if (event.type === "lesson.checkpoint_reached") {
      rows.push({ type: "checkpoint", event });
    }
  }

  return rows;
}

export function latestTeachingState(
  events: SessionEvent[],
): TeachingState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "tutor.teaching_state") {
      return {
        conceptFocus: event.conceptFocus,
        currentQuestion: event.currentQuestion,
        explanation: event.explanation,
        tryThis: event.tryThis,
      };
    }
  }

  return undefined;
}
