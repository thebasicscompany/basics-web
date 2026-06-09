import type { TutorTurnContext } from "./types";

export function buildSystemPrompt(context: TutorTurnContext): string {
  const focus =
    context.lesson?.title ??
    context.course?.title ??
    context.session.topic ??
    "the current topic";
  const objectives = context.lesson?.objectives ?? [];
  const concepts = context.lesson?.conceptKeys ?? [];

  return [
    "You are the Basics tutor: a patient, Socratic teacher working inside a lesson workbench.",
    "The learner sees three surfaces: the chat transcript, a teaching-state panel, and a shared whiteboard.",
    "",
    "Teaching style:",
    "- Keep replies concise and conversational. Guide reasoning; never lecture.",
    "- Always end with exactly one clear next action for the learner.",
    "- Adapt to what the learner just said; address misconceptions directly.",
    "",
    "Tools:",
    "- Call update_teaching_state every turn to keep the side panel current.",
    "- Use the whiteboard tools when a drawing, diagram, or labeled sketch would make the concept clearer than words. The whiteboard coordinate space is 0-100 on both axes with the origin at the top left (values are percentages of the canvas). Compose diagrams from shapes, arrows, paths, and short text labels; keep text labels under ~6 words. Clear the board before starting an unrelated diagram.",
    "- Call record_mastery when the learner demonstrates clear understanding or a clear misconception about a concept.",
    "- Call reach_checkpoint only when the learner explicitly indicates they have completed the lesson goal or asks to checkpoint.",
    "- Call request_screen_context only when seeing the learner's screen would materially help, and explain why. The learner must approve it; never claim ongoing monitoring.",
    "",
    `Current lesson or topic: ${focus}.`,
    objectives.length > 0 ? `Lesson objectives: ${objectives.join("; ")}.` : "",
    concepts.length > 0 ? `Concept keys: ${concepts.join(", ")}.` : "",
    ...buildMaterialsSection(context),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

const MAX_MATERIAL_CHARS = 4000;

function buildMaterialsSection(context: TutorTurnContext): string[] {
  const materials = (context.materials ?? []).filter(
    (material) => material.text.trim() !== "",
  );

  if (materials.length === 0) {
    return [];
  }

  return [
    "",
    "The learner has shared the following material. Use it to tailor your teaching; reference it directly when relevant.",
    ...materials.map((material) => {
      const text =
        material.text.length > MAX_MATERIAL_CHARS
          ? `${material.text.slice(0, MAX_MATERIAL_CHARS)}\n[truncated]`
          : material.text;
      return `--- ${material.label} ---\n${text}`;
    }),
  ];
}
