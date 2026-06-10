import { notFound } from "next/navigation";
import { LessonRoom } from "@/components/session/lesson-room";
import { getLearnerPreferences, requireLearnerContext } from "@/lib/learner";
import { toSession } from "@/lib/serializers";
import { getOwnedSession, getSessionEvents } from "@/lib/session-store";

/**
 * Escalates a chat thread to a live voice session: the same Session connects
 * to the lesson room, so the tutor keeps the full conversation context.
 */
export default async function ChatLivePage({
  params,
}: {
  params: Promise<{ courseId: string; sessionId: string }>;
}) {
  const { courseId, sessionId } = await params;
  const context = await requireLearnerContext();

  const sessionRow = await getOwnedSession(context, sessionId);

  if (!sessionRow || sessionRow.courseId !== courseId || sessionRow.lessonId) {
    notFound();
  }

  const [events, preferences] = await Promise.all([
    getSessionEvents(sessionId),
    getLearnerPreferences(context.learnerId),
  ]);

  return (
    <LessonRoom
      session={toSession(sessionRow)}
      lesson={null}
      initialEvents={events}
      preferences={preferences}
    />
  );
}
