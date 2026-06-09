import { DeterministicTutorRuntime } from "./deterministic";
import { AiTutorRuntime } from "./runtime";
import type { TutorRuntime } from "./types";

export * from "./types";
export { DeterministicTutorRuntime } from "./deterministic";
export { AiTutorRuntime, type AiTutorRuntimeOptions } from "./runtime";
export { sessionEventsToMessages } from "./messages";
export { buildSystemPrompt } from "./prompt";

export function createTutorRuntime(): TutorRuntime {
  const kind = process.env.BASICS_TUTOR_RUNTIME ?? "ai";

  if (kind === "mock" || !process.env.OPENAI_API_KEY) {
    return new DeterministicTutorRuntime();
  }

  return new AiTutorRuntime();
}
