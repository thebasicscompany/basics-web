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
    }
  }

  return messages;
}
