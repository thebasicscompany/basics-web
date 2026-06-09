import { notFound } from "next/navigation";
import { LessonRoom } from "@/components/session/lesson-room";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";
import { toLesson } from "@/lib/serializers";
import {
  getOrCreateLessonSession,
  getSessionEvents,
} from "@/lib/session-store";

export default async function LearnPage({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const context = await requireLearnerContext();

  const lessonRow = await db.lesson.findUnique({ where: { id: lessonId } });

  if (!lessonRow || lessonRow.courseId !== courseId) {
    notFound();
  }

  const session = await getOrCreateLessonSession(context, courseId, lessonId);
  const events = await getSessionEvents(session.id);

  return (
    <LessonRoom
      session={session}
      lesson={toLesson(lessonRow)}
      initialEvents={events}
    />
  );
}
