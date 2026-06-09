import { DeterministicTutorRuntime } from "./deterministic";
import { AiTutorRuntime } from "./runtime";
import type { TutorRuntime } from "./types";

export * from "./types";
export { DeterministicTutorRuntime } from "./deterministic";
export { AiTutorRuntime, type AiTutorRuntimeOptions } from "./runtime";
export { sessionEventsToMessages } from "./messages";
export { buildTutorPrompt } from "./prompt";
export {
  KIND_CONFIGS,
  getKindConfig,
  type KindConfig,
  type Modality,
  type SessionKind,
} from "./kinds";
export {
  loadSessionContext,
  sessionKindOf,
  toCourse,
  toLesson,
  toSession,
  type SessionContext,
  type SessionMaterial,
} from "./context";
export { persistTurnEvents, type EventStoreContext } from "./persist";
export {
  SKETCH_DATA_TOPIC,
  TEACHING_STATE_DATA_TOPIC,
  TURN_INTENTS,
  TUTOR_TOOLS,
  VISUAL_DATA_TOPIC,
  WHITEBOARD_SURFACE_ID,
  topicForEventType,
  type ToolDefinition,
  type ToolSessionContext,
} from "./tools";

export function createTutorRuntime(): TutorRuntime {
  const kind = process.env.BASICS_TUTOR_RUNTIME ?? "ai";

  if (kind === "mock" || !process.env.OPENAI_API_KEY) {
    return new DeterministicTutorRuntime();
  }

  return new AiTutorRuntime();
}
