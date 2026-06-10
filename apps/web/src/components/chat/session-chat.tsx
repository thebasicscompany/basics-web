"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  WebSpeechDictationAdapter,
  useLocalRuntime,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";

const PENDING_MESSAGE_PREFIX = "basics:pending-message:";

/** Stash a first message to auto-send once the thread page mounts. */
export function setPendingMessage(sessionId: string, text: string) {
  try {
    sessionStorage.setItem(`${PENDING_MESSAGE_PREFIX}${sessionId}`, text);
  } catch {
    // Best-effort; the user can re-type if storage is unavailable.
  }
}

export function takePendingMessage(sessionId: string): string | null {
  try {
    const key = `${PENDING_MESSAGE_PREFIX}${sessionId}`;
    const value = sessionStorage.getItem(key);
    if (value) {
      sessionStorage.removeItem(key);
    }
    return value;
  } catch {
    return null;
  }
}

type TurnStreamMessage =
  | { type: "text-delta"; text: string }
  | { type: "draft"; draft: unknown }
  | { type: "events"; events: unknown[] }
  | { type: "paused"; pause: { title: string; message: string } }
  | { type: "error"; message: string }
  | { type: "done" };

/**
 * Bridges assistant-ui to the existing tutor turns endpoint
 * (POST /api/sessions/[id]/turns, NDJSON stream of TurnStreamMessage).
 */
function createTurnAdapter(sessionId: string): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((message) => message.role === "user");
      const text = lastUserMessage?.content
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();

      if (!text) {
        return;
      }

      const response = await fetch(`/api/sessions/${sessionId}/turns`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: abortSignal,
      });

      if (!response.ok || !response.body) {
        throw new Error("The tutor is unavailable right now. Try again.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      const handleLine = (line: string): TurnStreamMessage | null => {
        const trimmed = line.trim();
        if (!trimmed) {
          return null;
        }
        try {
          return JSON.parse(trimmed) as TurnStreamMessage;
        } catch {
          return null;
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const message = handleLine(line);
          if (!message) {
            continue;
          }
          if (message.type === "text-delta") {
            accumulated += message.text;
            yield { content: [{ type: "text", text: accumulated }] };
          } else if (message.type === "paused") {
            accumulated += `\n\n${message.pause.message}`;
            yield { content: [{ type: "text", text: accumulated }] };
          } else if (message.type === "error") {
            throw new Error(message.message);
          }
        }
      }
    },
  };
}

export type ChatInitialMessage = {
  role: "user" | "assistant";
  text: string;
};

export function SessionChatProvider({
  sessionId,
  initialMessages,
  children,
}: {
  sessionId: string;
  initialMessages: ChatInitialMessage[];
  children: React.ReactNode;
}) {
  const adapter = useMemo(() => createTurnAdapter(sessionId), [sessionId]);
  const threadMessages = useMemo<ThreadMessageLike[]>(
    () =>
      initialMessages.map((message) => ({
        role: message.role,
        content: [{ type: "text" as const, text: message.text }],
      })),
    [initialMessages],
  );

  const runtime = useLocalRuntime(adapter, {
    initialMessages: threadMessages,
    adapters: { dictation: new WebSpeechDictationAdapter() },
  });

  // Auto-send the message typed into the workspace composer, if any.
  const sentPendingRef = useRef(false);
  useEffect(() => {
    if (sentPendingRef.current) {
      return;
    }
    sentPendingRef.current = true;

    const pending = takePendingMessage(sessionId);
    if (pending) {
      runtime.thread.append(pending);
    }
  }, [sessionId, runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      {children}
    </AssistantRuntimeProvider>
  );
}
