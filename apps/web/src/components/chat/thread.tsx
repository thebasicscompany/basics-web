"use client";

import { GraduationCapIcon } from "@phosphor-icons/react";
import {
  MessagePartPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";

import { ChatComposer } from "@/components/chat/composer";

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end py-2">
      <div className="max-w-[80%] rounded-3xl rounded-tr-md border bg-secondary px-4 py-2.5 text-sm text-secondary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex gap-3 py-2">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <GraduationCapIcon weight="fill" className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-2 pt-1 text-sm leading-relaxed whitespace-pre-wrap">
        <MessagePrimitive.Parts
          components={{
            Text: () => <MessagePartPrimitive.Text />,
          }}
        />
      </div>
    </MessagePrimitive.Root>
  );
}

/**
 * Chat thread: scrollable message list with a sticky follow-up composer
 * footer and a fade gradient, per the Perplexity example structure.
 */
export function ChatThread({
  goLiveHref,
  courseId,
  sessionId,
  placeholder = "Ask a follow-up...",
}: {
  goLiveHref: string;
  courseId: string;
  sessionId: string;
  placeholder?: string;
}) {
  return (
    <ThreadPrimitive.Root
      className="flex min-h-0 flex-1 flex-col"
      style={{ ["--thread-max-width" as string]: "44rem" }}
    >
      <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-6">
          <ThreadPrimitive.Empty>
            <div className="flex flex-1 items-center justify-center">
              <p className="text-sm text-muted-foreground">
                Ask a question to start this chat.
              </p>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages
            components={{
              UserMessage,
              AssistantMessage,
            }}
          />
        </div>
        <ThreadPrimitive.ViewportFooter className="sticky bottom-0 mx-auto w-full max-w-(--thread-max-width) px-4 pb-4">
          <div className="pointer-events-none h-8 bg-linear-to-t from-background to-transparent" />
          <div className="bg-background">
            <ChatComposer
              placeholder={placeholder}
              goLiveHref={goLiveHref}
              courseId={courseId}
              sessionId={sessionId}
            />
          </div>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}
