import type { SessionKind } from "@basics/contracts";
import type { SessionContext } from "./context";
import { INTAKE_TOOLS } from "./intake";
import { buildIntakePrompt, buildTutorPrompt } from "./prompt";
import { LESSON_TOOLS, TUTOR_TOOLS, type ToolDefinition } from "./tools";

/**
 * What a session is for. The kind decides the prompt persona, the tool
 * surface, and (eventually) completion behavior; the modality only changes
 * style rules, never behavior.
 */
export type { SessionKind };

export type Modality = "voice" | "text";

export type KindConfig = {
  buildPrompt: (context: SessionContext, modality: Modality) => string;
  tools: ToolDefinition[];
  /** Optional hook fired when the kind's goal is reached (e.g. intake's course creation). */
  onComplete?: (context: SessionContext) => Promise<void>;
};

/**
 * The kind registry: one configuration per session kind. Transports stay
 * dumb — they look up the kind, build the prompt for their modality, bind
 * the tools, and run.
 */
export const KIND_CONFIGS = {
  lesson: {
    buildPrompt: buildTutorPrompt,
    tools: LESSON_TOOLS,
  },
  chat: {
    buildPrompt: buildTutorPrompt,
    tools: TUTOR_TOOLS,
  },
  intake: {
    buildPrompt: buildIntakePrompt,
    tools: INTAKE_TOOLS,
  },
} satisfies Partial<Record<SessionKind, KindConfig>>;

export function getKindConfig(kind: SessionKind): KindConfig {
  if (kind in KIND_CONFIGS) {
    return KIND_CONFIGS[kind as keyof typeof KIND_CONFIGS];
  }

  return KIND_CONFIGS.chat;
}
