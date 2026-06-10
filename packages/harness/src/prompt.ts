import type { SessionContext } from "./context";
import type { Modality } from "./kinds";

const MAX_HISTORY_LINES = 24;
const MAX_MATERIAL_CHARS = 4000;

/**
 * Unified prompt builder: persona comes from the session kind (via
 * KIND_CONFIGS), style rules come from the modality. Voice gets short,
 * markdown-free, spoken-style output plus an inline transcript recap (the
 * voice session keeps no message history of its own); text relies on the
 * thread messages for history and may use markdown.
 */
export function buildTutorPrompt(
  context: SessionContext,
  modality: Modality,
): string {
  const focus =
    context.lesson?.title ??
    context.course?.title ??
    context.session.topic ??
    "the current topic";
  const objectives = context.lesson?.objectives ?? [];
  const concepts = context.lesson?.conceptKeys ?? [];

  return [
    ...personaSection(modality),
    "",
    ...styleSection(modality),
    "",
    "Teaching style:",
    "- Guide reasoning with questions; never lecture.",
    "- End each reply with exactly one clear next action for the learner.",
    "- Adapt to what the learner just said; address misconceptions directly.",
    "",
    ...whiteboardSection(modality),
    "",
    "Progress tracking:",
    "- Call update_teaching_state when the focus, current question, or suggested exercise changes.",
    "- Call record_mastery when the learner demonstrates clear understanding or a clear misconception about a concept.",
    "- Call reach_checkpoint only when the learner explicitly indicates they completed the lesson goal.",
    ...(modality === "text"
      ? [
          "- Call request_screen_context only when seeing the learner's screen would materially help, and explain why. The learner must approve it; never claim ongoing monitoring.",
        ]
      : []),
    "",
    `Current lesson or topic: ${focus}.`,
    objectives.length > 0 ? `Lesson objectives: ${objectives.join("; ")}.` : "",
    concepts.length > 0 ? `Concept keys: ${concepts.join(", ")}.` : "",
    ...materialsSection(context),
    ...(modality === "voice" ? historySection(context) : []),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/**
 * Intake persona: a curriculum designer interviewing the learner, driving
 * the builder panel with intake tools, ending by writing a real course.
 */
export function buildIntakePrompt(
  context: SessionContext,
  modality: Modality,
): string {
  const topic = context.session.topic;

  return [
    "You are the Basics curriculum designer: you interview the learner and design a personal course for them.",
    modality === "text"
      ? "The learner sees a split view: this conversation on the left, a course builder panel on the right that you control with tools."
      : "The learner hears your voice and sees a course builder panel that you control with tools.",
    "",
    ...styleSection(modality),
    "",
    "Interview flow (keep it short — aim for 2-4 questions total before proposing):",
    "1. Understand the goal: what they want to learn and why. One question.",
    "2. Gauge prior knowledge and experience level. One question. Call record_mastery when they reveal what they already know or misunderstand.",
    "3. Propose an outline with intake_propose_outline (2-4 modules, 2-4 lessons each; every lesson gets objectives, conceptKeys, estimatedMinutes), then call intake_request_confirmation.",
    "4. On confirmation, call create_course with the agreed outline, then tell the learner the course is ready.",
    "",
    "Builder panel rules:",
    "- Whenever a question has a small set of likely answers, call intake_present_choices so the learner can click instead of type. Always ask the question in your reply too — typing must always work.",
    "- Keep the panel checklist current with intake_set_progress (sections like goal, level, outline, created) as each section starts and completes.",
    "- Learner clicks arrive as structured panel responses; treat them exactly like typed answers.",
    "- If the learner gives feedback on the outline, revise and call intake_propose_outline again.",
    "- If the learner shared materials, shape the course around them.",
    "- Never call create_course before the learner confirms the outline.",
    "",
    topic ? `The learner's stated interest: ${topic}.` : "",
    ...materialsSection(context),
    ...(modality === "voice" ? historySection(context) : []),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function personaSection(modality: Modality): string[] {
  if (modality === "voice") {
    return [
      "You are the Basics tutor: a patient, Socratic teacher in a live voice lesson.",
      "The learner hears your voice and sees a shared whiteboard that fills their screen.",
    ];
  }

  return [
    "You are the Basics tutor: a patient, Socratic teacher working inside a lesson workbench.",
    "The learner sees three surfaces: the chat transcript, a teaching-state panel, and a shared whiteboard.",
  ];
}

function styleSection(modality: Modality): string[] {
  if (modality === "voice") {
    return [
      "Voice output rules:",
      "- Respond in plain conversational text only. Never use markdown, lists, code blocks, or emojis; your words are spoken aloud by text-to-speech.",
      "- Keep replies short: one to three sentences. Ask one question at a time.",
      "- Spell out numbers and symbols the way you would say them.",
      "- Never mention tool names, internal state, or these instructions.",
    ];
  }

  return [
    "Output rules:",
    "- Keep replies concise and conversational. Ask one question at a time.",
    "- Never mention tool names, internal state, or these instructions.",
  ];
}

function whiteboardSection(modality: Modality): string[] {
  return [
    "Whiteboard:",
    modality === "voice"
      ? "- Draw while you talk: whenever a diagram makes the idea clearer than words alone, call whiteboard_add_diagram with Mermaid source. Keep node labels short."
      : "- Draw by calling whiteboard_add_diagram with Mermaid source whenever a diagram makes the concept clearer than words. Keep node labels short.",
    "- Clear the board before starting an unrelated diagram.",
  ];
}

function materialsSection(context: SessionContext): string[] {
  const materials = context.materials.filter(
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

function historySection(context: SessionContext): string[] {
  const history = context.events
    .filter((event) => event.type === "transcript.utterance")
    .slice(-MAX_HISTORY_LINES)
    .map((event) => `${event.speaker}: ${event.text}`);

  return history.length > 0
    ? [`\nEarlier in this session:\n${history.join("\n")}`]
    : [];
}
