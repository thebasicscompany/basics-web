"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpIcon,
  BroadcastIcon,
  CaretDownIcon,
  ChatCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  MicrophoneIcon,
  PaperclipIcon,
  PlusIcon,
  StopIcon,
  XIcon,
} from "@phosphor-icons/react";
import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { uploadMaterial, type UploadedMaterial } from "@/lib/upload-client";
import { cn } from "@/lib/utils";

/**
 * Perplexity-style mode dropdown, restyled with forest tokens. Selecting
 * "Live lesson" escalates straight to the live room — voice stays primary.
 */
export function ModePicker({ goLiveHref }: { goLiveHref: string }) {
  const router = useRouter();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent">
        <ChatCircleIcon className="size-4" />
        Chat
        <CaretDownIcon className="size-3 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuItem className="items-start gap-2 py-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0" />
          <span className="flex flex-col">
            <span className="font-medium">Chat</span>
            <span className="text-xs text-muted-foreground">
              Ask questions and add context between sessions
            </span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="items-start gap-2 py-2"
          onClick={() => router.push(goLiveHref)}
        >
          <BroadcastIcon className="mt-0.5 size-4 shrink-0" />
          <span className="flex flex-col">
            <span className="font-medium">Live lesson</span>
            <span className="text-xs text-muted-foreground">
              Talk it through with your tutor, live
            </span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const primaryActionClass =
  "flex size-8 items-center justify-center rounded-full border border-[color-mix(in_oklch,var(--primary),black_22%)] bg-primary bg-linear-to-b from-white/15 to-transparent text-primary-foreground shadow-[inset_0_1px_0_0_rgb(255_255_255/0.20),0_1px_2px_0_rgb(0_0_0/0.18)] transition-all hover:bg-[color-mix(in_oklch,var(--primary),white_7%)] active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

/**
 * Four-state primary action (Cancel / StopDictation / Send / Dictate),
 * mutually exclusive in priority order per the Perplexity example.
 */
export function ComposerPrimaryAction() {
  return (
    <>
      <AuiIf condition={(s) => s.thread.isRunning}>
        <ComposerPrimitive.Cancel
          className={primaryActionClass}
          aria-label="Cancel"
        >
          <XIcon />
        </ComposerPrimitive.Cancel>
      </AuiIf>
      <AuiIf condition={(s) => !s.thread.isRunning && s.composer.dictation != null}>
        <ComposerPrimitive.StopDictation
          className={cn(primaryActionClass, "animate-pulse")}
          aria-label="Stop dictation"
        >
          <StopIcon weight="fill" />
        </ComposerPrimitive.StopDictation>
      </AuiIf>
      <AuiIf
        condition={(s) =>
          !s.thread.isRunning &&
          s.composer.dictation == null &&
          !s.composer.isEmpty
        }
      >
        <ComposerPrimitive.Send className={primaryActionClass} aria-label="Send">
          <ArrowUpIcon weight="bold" />
        </ComposerPrimitive.Send>
      </AuiIf>
      <AuiIf
        condition={(s) =>
          !s.thread.isRunning &&
          s.composer.dictation == null &&
          s.composer.isEmpty
        }
      >
        <ComposerPrimitive.Dictate
          className={primaryActionClass}
          aria-label="Dictate"
        >
          <MicrophoneIcon />
        </ComposerPrimitive.Dictate>
      </AuiIf>
    </>
  );
}

/**
 * Attachment "+" button for an existing chat session: uploads through the
 * materials pipeline and attaches the ContextSource to the session, so the
 * tutor can use the document on the next turn.
 */
function SessionAttachmentButton({
  courseId,
  sessionId,
}: {
  courseId: string;
  sessionId: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<UploadedMaterial[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function attachFiles(files: FileList) {
    const list = Array.from(files);
    if (list.length === 0 || attaching) {
      return;
    }

    setAttaching(true);
    setError(null);
    try {
      for (const file of list) {
        const material = await uploadMaterial(courseId, file, sessionId);
        setAttachments((current) => [...current, material]);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setAttaching(false);
    }
  }

  return (
    <>
      {attachments.length > 0 || error ? (
        <div className="order-first flex w-full flex-wrap items-center gap-1.5">
          {attachments.map((attachment) => (
            <span
              key={attachment.id}
              className="flex items-center gap-1 rounded-full border bg-secondary px-2.5 py-1 text-xs text-secondary-foreground"
            >
              <PaperclipIcon className="size-3" />
              <span className="max-w-40 truncate">{attachment.label}</span>
            </span>
          ))}
          {error ? (
            <span className="text-xs text-destructive">{error}</span>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        aria-label="Add material"
        disabled={attaching}
        onClick={() => fileInputRef.current?.click()}
        className="flex size-8 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4"
      >
        {attaching ? <CircleNotchIcon className="animate-spin" /> : <PlusIcon />}
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
    </>
  );
}

/**
 * Shared chat composer: tall rounded-3xl shell, multi-line input, mode
 * dropdown left, four-state action right.
 */
export function ChatComposer({
  placeholder,
  goLiveHref,
  courseId,
  sessionId,
  className,
}: {
  placeholder: string;
  goLiveHref: string;
  courseId: string;
  sessionId: string;
  className?: string;
}) {
  return (
    <ComposerPrimitive.Root
      className={cn(
        "flex w-full flex-col gap-2 rounded-3xl border bg-card p-3 shadow-[0_1px_2px_0_rgb(0_0_0/0.05),0_8px_24px_-12px_rgb(0_0_0/0.12)]",
        className,
      )}
    >
      <ComposerPrimitive.Input
        rows={2}
        submitOnEnter
        placeholder={placeholder}
        className="min-h-20 w-full resize-none bg-transparent px-1 pt-1 text-sm outline-none placeholder:text-muted-foreground"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SessionAttachmentButton courseId={courseId} sessionId={sessionId} />
          <ModePicker goLiveHref={goLiveHref} />
        </div>
        <div className="flex items-center gap-1">
          <ComposerPrimaryAction />
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
