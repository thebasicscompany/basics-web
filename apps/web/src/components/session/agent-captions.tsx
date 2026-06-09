"use client";

import { useEffect, useMemo, useState } from "react";
import type { AgentState, ReceivedMessage } from "@livekit/components-react";
import { cn } from "@/lib/utils";

/** How long the caption lingers after the agent stops talking. */
const LINGER_MS = 4000;

type AgentCaptionsProps = {
  messages: ReceivedMessage[];
  agentState?: AgentState;
  className?: string;
};

/**
 * Movie-style live caption for the tutor's speech. Shows the current agent
 * utterance (streaming in as it's spoken), clamped to the last ~2 lines, and
 * fades out shortly after the agent finishes.
 */
export function AgentCaptions({
  messages,
  agentState,
  className,
}: AgentCaptionsProps) {
  const latest = useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      // Spoken agent output arrives as `agentTranscript` (lk.transcription);
      // `userTranscript`/`chatMessage` are the learner's speech and typed chat.
      if (
        message.type === "agentTranscript" &&
        message.message.trim().length > 0
      ) {
        return message;
      }
    }
    return null;
  }, [messages]);

  // Any text growth produces a new key, which restarts the linger timer.
  const captionKey = latest ? `${latest.id}:${latest.message.length}` : null;
  const [fadedKey, setFadedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!captionKey || agentState === "speaking") {
      return;
    }
    const timeout = setTimeout(() => setFadedKey(captionKey), LINGER_MS);
    return () => clearTimeout(timeout);
  }, [captionKey, agentState]);

  if (!latest) {
    return null;
  }

  const visible = agentState === "speaking" || fadedKey !== captionKey;

  return (
    <div
      aria-live="polite"
      className={cn(
        "pointer-events-none flex justify-center transition-opacity duration-500",
        visible ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {/* Bottom-anchored so overflow trims the oldest lines, keeping the tail visible. */}
      <div className="bg-card/90 flex max-h-14 flex-col justify-end overflow-hidden rounded-xl border border-border/80 px-4 py-2 shadow-sm backdrop-blur">
        <p className="text-center text-sm leading-5">{latest.message}</p>
      </div>
    </div>
  );
}
