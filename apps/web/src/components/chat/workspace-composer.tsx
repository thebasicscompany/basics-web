"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpIcon,
  CircleNotchIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PlusIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";

import { ModePicker } from "@/components/chat/composer";
import { setPendingMessage } from "@/components/chat/session-chat";
import { uploadMaterial, type UploadedMaterial } from "@/lib/upload-client";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognition(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") {
    return null;
  }
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

const actionClass =
  "flex size-8 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary),black_22%)] bg-primary bg-linear-to-b from-white/15 to-transparent text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.20),0_1px_2px_0_rgb(0_0_0/0.18)] transition-all hover:bg-[color-mix(in_oklch,var(--primary),white_7%)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

/**
 * Workspace home composer: looks like the chat composer but creates a fresh
 * chat thread on submit and routes to it with the first message pending.
 */
export function WorkspaceComposer({
  courseId,
  goLiveHref,
}: {
  courseId: string;
  goLiveHref: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dictating, setDictating] = useState(false);
  const [attachments, setAttachments] = useState<UploadedMaterial[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const canDictate = getSpeechRecognition() != null;

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  const stopDictation = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setDictating(false);
  }, []);

  const startDictation = useCallback(() => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const results = (event as { results: ArrayLike<ArrayLike<{ transcript: string }>> })
        .results;
      const transcript = Array.from(results, (result) => result[0].transcript)
        .join(" ")
        .trim();
      if (transcript) {
        setText((current) =>
          current ? `${current.trimEnd()} ${transcript}` : transcript,
        );
      }
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setDictating(false);
    };
    recognitionRef.current = recognition;
    setDictating(true);
    recognition.start();
  }, []);

  async function attachFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0 || attaching) {
      return;
    }

    setAttaching(true);
    setError(null);
    try {
      for (const file of list) {
        const material = await uploadMaterial(courseId, file);
        setAttachments((current) => [...current, material]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setAttaching(false);
    }
  }

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed || creating) {
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contextSourceIds: attachments.map((attachment) => attachment.id),
        }),
      });
      if (!response.ok) {
        throw new Error("Couldn't start a chat. Try again.");
      }
      const { session } = (await response.json()) as {
        session: { id: string };
      };
      setPendingMessage(session.id, trimmed);
      router.push(`/courses/${courseId}/chats/${session.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn't start a chat.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex w-full flex-col gap-2 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.12)]">
        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
              >
                <PaperclipIcon className="size-3" />
                <span className="max-w-40 truncate">{attachment.label}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.label}`}
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((item) => item.id !== attachment.id),
                    )
                  }
                >
                  <XIcon className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Ask about this course or drop in material..."
          className="min-h-20 w-full resize-none bg-transparent px-1 pt-1 text-sm outline-none placeholder:text-muted-foreground"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
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
            <ModePicker goLiveHref={goLiveHref} />
          </div>
          <div className="flex items-center gap-1">
            {creating ? (
              <button type="button" disabled className={actionClass}>
                <CircleNotchIcon className="animate-spin" />
              </button>
            ) : dictating ? (
              <button
                type="button"
                onClick={stopDictation}
                className={`${actionClass} animate-pulse`}
                aria-label="Stop dictation"
              >
                <StopIcon weight="fill" />
              </button>
            ) : text.trim() ? (
              <button
                type="button"
                onClick={() => void submit()}
                className={actionClass}
                aria-label="Send"
              >
                <ArrowUpIcon weight="bold" />
              </button>
            ) : canDictate ? (
              <button
                type="button"
                onClick={startDictation}
                className={actionClass}
                aria-label="Dictate"
              >
                <MicrophoneIcon />
              </button>
            ) : (
              <button type="button" disabled className={actionClass}>
                <ArrowUpIcon weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
