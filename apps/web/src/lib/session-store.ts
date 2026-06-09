import "server-only";
import type { Session, SessionEvent } from "@basics/contracts";
import type { TutorEventDraft } from "@basics/tutor";
import { appendSessionEvents } from "@basics/db";
import { db } from "@/lib/db";
import { createId } from "@/lib/ids";
import { toSession, toSessionEvent } from "@/lib/serializers";
import type { LearnerContext } from "@/lib/learner";

/**
 * Appends event drafts to a session's append-only log, maintaining
 * per-session sequence numbers and the read-side projection tables.
 */
export async function appendEvents(
  context: LearnerContext,
  sessionId: string,
  drafts: TutorEventDraft[],
): Promise<SessionEvent[]> {
  const rows = await appendSessionEvents(db, context, sessionId, drafts);
  return rows.map(toSessionEvent);
}

export async function getOwnedSession(
  context: LearnerContext,
  sessionId: string,
) {
  const row = await db.session.findUnique({
    where: { id: sessionId },
    include: { course: true, lesson: true },
  });

  if (!row || row.learnerId !== context.learnerId) {
    return null;
  }

  return row;
}

export async function getSessionEvents(
  sessionId: string,
): Promise<SessionEvent[]> {
  const rows = await db.sessionEvent.findMany({
    where: { sessionId },
    orderBy: { sequence: "asc" },
  });

  return rows.map(toSessionEvent);
}

/**
 * Returns the learner's active session for a lesson, creating one if none
 * exists. One active session per learner per lesson.
 */
export async function getOrCreateLessonSession(
  context: LearnerContext,
  courseId: string,
  lessonId: string,
): Promise<Session> {
  const existing = await db.session.findFirst({
    where: {
      learnerId: context.learnerId,
      lessonId,
      status: "active",
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    return toSession(existing);
  }

  const lesson = await db.lesson.findUniqueOrThrow({
    where: { id: lessonId },
  });
  const now = new Date();

  const created = await db.session.create({
    data: {
      id: createId("session"),
      learnerId: context.learnerId,
      workspaceId: context.workspaceId,
      courseId,
      moduleId: lesson.moduleId,
      lessonId,
      topic: lesson.title,
      status: "active",
      state: {
        status: "active",
        enteredAt: now.toISOString(),
        lastEventSequence: 0,
      },
      startedAt: now,
      createdAt: now,
    },
  });

  return toSession(created);
}
