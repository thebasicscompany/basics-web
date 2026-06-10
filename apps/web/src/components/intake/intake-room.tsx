"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpIcon,
  CircleNotchIcon,
  GraduationCapIcon,
  PaperclipIcon,
  PlusIcon,
} from "@phosphor-icons/react";
import type { Session, SessionEvent } from "@basics/contracts";

import { takePendingMessage } from "@/components/chat/session-chat";
import {
  BuilderPanel,
  type PanelResponse,
} from "@/components/intake/builder-panel";
import {
  uploadSessionMaterial,
  type UploadedMaterial,
} from "@/lib/upload-client";

type TurnStreamMessage =
  | { type: "text-delta"; text: string }
  | { type: "draft"; draft: unknown }
  | { type: "events"; events: SessionEvent[] }
  | { type: "error"; message: string }
  | { type: "done" };

type TurnBody =
  | { text: string }
  | { response: { refEventId: string; value: unknown } };

function friendlyResponseText(event: SessionEvent): string {
  if (event.type !== "ui.response") {
    return "";
  }

  const value = event.value as Record<string, unknown> | null;
  if (value && Array.isArray(value.labels)) {
    return value.labels.join(", ");
  }
  if (value && typeof value.label === "string") {
    return value.label;
  }
  return JSON.stringify(event.value);
}

/**
 * Split-view course creation: chat thread left, builder panel right. Both
 * sides project from the same session event log — the panel re-derives on
 * every persisted event batch, so reloads and clicks stay consistent.
 */
export function IntakeRoom({
  session,
  initialEvents,
}: {
  session: Session;
  initialEvents: SessionEvent[];
}) {
  const router = useRouter();
  const [events, setEvents] = useState<SessionEvent[]>(initialEvents);
  const [busy, setBusy] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [optimisticText, setOptimisticText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");
  const [attachments, setAttachments] = useState<UploadedMaterial[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Stick-to-bottom: auto-scroll only while the user is pinned to the
  // bottom, so scrolling up to reread isn't fought by streaming deltas.
  const pinnedRef = useRef(true);

  const sendTurn = useCallback(
    async (body: TurnBody, displayText: string) => {
      setBusy(true);
      setError(null);
      setOptimisticText(displayText);
      setStreamingText("");
      // Sending a message always snaps back to the bottom.
      pinnedRef.current = true;

      try {
        const response = await fetch(`/api/sessions/${session.id}/turns`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok || !response.body) {
          throw new Error("The course builder is unavailable. Try again.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) {
              continue;
            }

            let message: TurnStreamMessage;
            try {
              message = JSON.parse(trimmed) as TurnStreamMessage;
            } catch {
              continue;
            }

            if (message.type === "text-delta") {
              setStreamingText((current) => current + message.text);
            } else if (message.type === "events") {
              setEvents((current) => {
                const known = new Set(current.map((event) => event.id));
                const fresh = message.events.filter(
                  (event) => !known.has(event.id),
                );
                return [...current, ...fresh];
              });
            } else if (message.type === "error") {
              throw new Error(message.message);
            }
          }
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The course builder is unavailable. Try again.",
        );
      } finally {
        setBusy(false);
        setStreamingText("");
        setOptimisticText(null);
      }
    },
    [session.id],
  );

  // Auto-send the message typed into the home composer, if any.
  const sentPendingRef = useRef(false);
  useEffect(() => {
    if (sentPendingRef.current) {
      return;
    }
    sentPendingRef.current = true;

    const pending = takePendingMessage(session.id);
    if (pending) {
      // Deferred so the auto-send's state updates don't run inside the effect.
      const timeout = setTimeout(() => void sendTurn({ text: pending }, pending), 0);
      return () => clearTimeout(timeout);
    }
  }, [session.id, sendTurn]);

  // Finale: course created → show the card briefly, then take them there.
  const redirectedRef = useRef(false);
  useEffect(() => {
    const created = events.find(
      (event) => event.type === "intake.course_created",
    );

    if (created?.type === "intake.course_created" && !redirectedRef.current) {
      redirectedRef.current = true;
      const timeout = setTimeout(() => {
        router.push(`/courses/${created.courseId}`);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [events, router]);

  const messages = useMemo(() => {
    const list: { id: string; role: "user" | "assistant"; text: string }[] =
      [];

    for (const event of events) {
      if (
        event.type === "transcript.utterance" &&
        event.isFinal &&
        event.speaker !== "system"
      ) {
        list.push({
          id: event.id,
          role: event.speaker === "learner" ? "user" : "assistant",
          text: event.text,
        });
      } else if (event.type === "ui.response") {
        list.push({
          id: event.id,
          role: "user",
          text: friendlyResponseText(event),
        });
      }
    }

    return list;
  }, [events]);

  useEffect(() => {
    if (pinnedRef.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [messages.length, streamingText, optimisticText]);

  function handleScroll() {
    const node = scrollRef.current;
    if (node) {
      pinnedRef.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    }
  }

  async function attachFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0 || attaching) {
      return;
    }

    setAttaching(true);
    setError(null);
    try {
      for (const file of list) {
        const material = await uploadSessionMaterial(session.id, file);
        setAttachments((current) => [...current, material]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setAttaching(false);
    }
  }

  function submitText() {
    const trimmed = composerText.trim();
    if (!trimmed || busy) {
      return;
    }
    setComposerText("");
    void sendTurn({ text: trimmed }, trimmed);
  }

  function respond(response: PanelResponse) {
    void sendTurn(
      {
        response: {
          refEventId: response.refEventId,
          value: response.value,
        },
      },
      response.displayText,
    );
  }

  return (
    <div className="flex h-svh min-h-0">
      <div className="flex min-h-0 w-full max-w-130 flex-col border-r">
        <header className="border-b px-5 py-3">
          <p className="text-xs text-muted-foreground">New course</p>
          <h1 className="truncate font-heading text-base font-semibold tracking-tight">
            {session.topic ?? "What do you want to learn?"}
          </h1>
        </header>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="min-h-0 flex-1 overflow-y-auto px-5"
        >
          <div className="flex flex-col py-4">
            {messages.length === 0 && !optimisticText && !busy ? (
              <div className="flex flex-1 items-center justify-center py-16">
                <p className="text-sm text-muted-foreground">
                  Tell me what you want to learn.
                </p>
              </div>
            ) : null}

            {messages.map((message) =>
              message.role === "user" ? (
                <UserBubble key={message.id} text={message.text} />
              ) : (
                <AssistantBubble key={message.id} text={message.text} />
              ),
            )}

            {optimisticText ? <UserBubble text={optimisticText} /> : null}
            {streamingText ? (
              <AssistantBubble text={streamingText} />
            ) : busy ? (
              <AssistantBubble text="..." />
            ) : null}
          </div>
        </div>

        <div className="px-5 pb-4">
          {error ? (
            <p className="mb-2 text-sm text-destructive">{error}</p>
          ) : null}
          <div className="flex w-full flex-col gap-2 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {attachments.map((attachment) => (
                  <span
                    key={attachment.id}
                    className="flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
                  >
                    <PaperclipIcon className="size-3" />
                    <span className="max-w-40 truncate">
                      {attachment.label}
                    </span>
                  </span>
                ))}
              </div>
            ) : null}
            <textarea
              rows={1}
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  submitText();
                }
              }}
              placeholder="Type your answer..."
              className="min-h-10 w-full resize-none bg-transparent px-1 pt-1 text-sm outline-none placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Add material"
                disabled={attaching}
                onClick={() => fileInputRef.current?.click()}
                className="flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
              >
                {attaching ? (
                  <CircleNotchIcon className="animate-spin" />
                ) : (
                  <PlusIcon />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown"
                className="hidden"
                onChange={(event) => {
                  if (event.target.files) {
                    void attachFiles(event.target.files);
                    event.target.value = "";
                  }
                }}
              />
              <button
                type="button"
                aria-label="Send"
                disabled={busy || !composerText.trim()}
                onClick={submitText}
                className="flex size-8 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary),black_22%)] bg-primary bg-linear-to-b from-white/15 to-transparent text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.20),0_1px_2px_0_rgb(0_0_0/0.18)] transition-all hover:bg-[color-mix(in_oklch,var(--primary),white_7%)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
              >
                {busy ? (
                  <CircleNotchIcon className="animate-spin" />
                ) : (
                  <ArrowUpIcon weight="bold" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <BuilderPanel events={events} busy={busy} onRespond={respond} />
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-end py-2">
      <div className="max-w-[85%] rounded-3xl rounded-tr-md border bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
        {text}
      </div>
    </div>
  );
}

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <GraduationCapIcon weight="fill" className="size-4" />
      </div>
      <div className="min-w-0 flex-1 pt-1 text-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}
