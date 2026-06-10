"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpIcon,
  CircleNotchIcon,
  PaperclipIcon,
  PlusIcon,
  XIcon,
} from "@phosphor-icons/react";

import { setPendingMessage } from "@/components/chat/session-chat";
import {
  uploadSessionMaterial,
  type UploadedMaterial,
} from "@/lib/upload-client";

const actionClass =
  "flex size-8 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary),black_22%)] bg-primary bg-linear-to-b from-white/15 to-transparent text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.20),0_1px_2px_0_rgb(0_0_0/0.18)] transition-all hover:bg-[color-mix(in_oklch,var(--primary),white_7%)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

/**
 * Home composer for course creation: "What do you want to learn?" plus
 * attachments. Creates a kind:"intake" session (lazily, so attachments
 * have a session to scope to) and routes to the split-view builder with
 * the first message pending.
 */
export function IntakeComposer() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<UploadedMaterial[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  async function ensureSession(): Promise<string> {
    if (sessionIdRef.current) {
      return sessionIdRef.current;
    }

    const response = await fetch("/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error("Couldn't start the course builder. Try again.");
    }

    const { session } = (await response.json()) as {
      session: { id: string };
    };
    sessionIdRef.current = session.id;
    return session.id;
  }

  async function attachFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0 || attaching) {
      return;
    }

    setAttaching(true);
    setError(null);
    try {
      const sessionId = await ensureSession();
      for (const file of list) {
        const material = await uploadSessionMaterial(sessionId, file);
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
      const sessionId = await ensureSession();
      setPendingMessage(sessionId, trimmed);
      router.push(`/courses/new/${sessionId}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't start the course builder.",
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
          placeholder="What do you want to learn?"
          className="min-h-16 w-full resize-none bg-transparent px-1 pt-1 text-sm outline-none placeholder:text-muted-foreground"
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
            aria-label="Create course"
            disabled={creating || !text.trim()}
            onClick={() => void submit()}
            className={actionClass}
          >
            {creating ? (
              <CircleNotchIcon className="animate-spin" />
            ) : (
              <ArrowUpIcon weight="bold" />
            )}
          </button>
        </div>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
