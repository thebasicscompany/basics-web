import Link from "next/link";
import { notFound } from "next/navigation";

import {
  SessionChatProvider,
  type ChatInitialMessage,
} from "@/components/chat/session-chat";
import { ChatThread } from "@/components/chat/thread";
import { Button } from "@/components/ui/button";
import { requireLearnerContext } from "@/lib/learner";
import { getOwnedSession, getSessionEvents } from "@/lib/session-store";

export default async function ChatThreadPage({
  params,
}: {
  params: Promise<{ courseId: string; sessionId: string }>;
}) {
  const { courseId, sessionId } = await params;
  const context = await requireLearnerContext();

  const session = await getOwnedSession(context, sessionId);

  if (!session || session.courseId !== courseId || session.lessonId) {
    notFound();
  }

  const events = await getSessionEvents(sessionId);
  const initialMessages: ChatInitialMessage[] = events
    .filter(
      (event) => event.type === "transcript.utterance" && event.isFinal,
    )
    .map((event) =>
      event.type === "transcript.utterance"
        ? {
            role:
              event.speaker === "learner"
                ? ("user" as const)
                : ("assistant" as const),
            text: event.text,
          }
        : null,
    )
    .filter((message): message is ChatInitialMessage => message !== null);

  const goLiveHref = `/courses/${courseId}/chats/${sessionId}/live`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            <Link
              href={`/courses/${courseId}`}
              className="hover:text-foreground"
            >
              {session.course?.title ?? "Course"}
            </Link>
          </p>
          <h1 className="truncate font-heading text-base font-semibold tracking-tight">
            {session.topic ?? "New chat"}
          </h1>
        </div>
        <Button render={<Link href={goLiveHref} />}>Go live</Button>
      </header>
      <SessionChatProvider
        sessionId={sessionId}
        initialMessages={initialMessages}
      >
        <ChatThread
          goLiveHref={goLiveHref}
          courseId={courseId}
          sessionId={sessionId}
        />
      </SessionChatProvider>
    </div>
  );
}
