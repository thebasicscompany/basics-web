import type { ModelMessage } from "ai";
import type { SessionEvent } from "@basics/contracts";

type ContextSourceAdded = Extract<
  SessionEvent,
  { type: "context.source_added" }
>;

const isImageDataUrl = (value: string) => value.startsWith("data:image/");

function contextSourceToMessage(
  event: ContextSourceAdded,
): ModelMessage | undefined {
  const { content, label } = event.contextSource;

  switch (content.kind) {
    case "text":
      return {
        role: "user",
        content: `[Shared context: ${label}]\n${content.text}`,
      };
    case "screen_snapshot":
    case "image": {
      const ref = content.contentRef;
      const caption =
        content.kind === "screen_snapshot"
          ? (content.description ?? label)
          : (content.altText ?? label);

      if (!isImageDataUrl(ref)) {
        return {
          role: "user",
          content: `[Shared visual context: ${caption}] (image unavailable)`,
        };
      }

      return {
        role: "user",
        content: [
          { type: "text", text: `[Shared visual context: ${caption}]` },
          { type: "image", image: ref },
        ],
      };
    }
    case "external_reference":
      return {
        role: "user",
        content: `[Shared link: ${content.title ?? label}] ${content.url}`,
      };
  }
}

/**
 * Projects the canonical session event log into model messages.
 * Only the runtime depends on this shape; the event log stays canonical.
 */
export function sessionEventsToMessages(
  events: SessionEvent[],
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (const event of events) {
    if (event.type === "transcript.utterance" && event.isFinal) {
      if (event.speaker === "system") {
        continue;
      }

      messages.push({
        role: event.speaker === "learner" ? "user" : "assistant",
        content: event.text,
      });
      continue;
    }

    if (event.type === "context.source_added") {
      const message = contextSourceToMessage(event);

      if (message) {
        messages.push(message);
      }
      continue;
    }

    // Intake panel state and learner clicks: surfaced as data so the model
    // keeps interview continuity across turns.
    if (event.type === "intake.present_choices") {
      const options = event.choices
        .map((choice) => `${choice.id}: ${choice.label}`)
        .join("; ");
      messages.push({
        role: "assistant",
        content: `[Panel choices ${event.id}] ${event.prompt} (${options})`,
      });
      continue;
    }

    if (event.type === "intake.assess_knowledge") {
      const topics = event.topics
        .map((topic) => `${topic.id}: ${topic.label}`)
        .join("; ");
      messages.push({
        role: "assistant",
        content: `[Panel knowledge grid ${event.id}] ${event.prompt} (${topics})`,
      });
      continue;
    }

    if (event.type === "intake.propose_outline") {
      const outline = event.modules
        .map(
          (module) =>
            `${module.title}: ${module.lessons
              .map((lesson) => lesson.title)
              .join(", ")}`,
        )
        .join(" | ");
      messages.push({
        role: "assistant",
        content: `[Panel outline ${event.id}] "${event.title}" — ${outline}`,
      });
      continue;
    }

    if (event.type === "intake.request_confirmation") {
      messages.push({
        role: "assistant",
        content: `[Panel confirmation ${event.id}] ${event.prompt}`,
      });
      continue;
    }

    if (event.type === "intake.course_created") {
      messages.push({
        role: "assistant",
        content: `[Course created] "${event.title}" (${event.courseId})`,
      });
      continue;
    }

    if (event.type === "ui.response") {
      messages.push({
        role: "user",
        content: `[Panel response to ${event.refEventId}] ${JSON.stringify(event.value)}`,
      });
    }
  }

  return messages;
}
