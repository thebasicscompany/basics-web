import "server-only";
import { db } from "@/lib/db";
import { createId } from "@/lib/ids";
import type { LearnerContext } from "@/lib/learner";

/** Idempotently enrolls the learner in a course (re-activates if dropped). */
export async function enroll(context: LearnerContext, courseId: string) {
  const now = new Date();

  return db.enrollment.upsert({
    where: {
      learnerId_courseId: { learnerId: context.learnerId, courseId },
    },
    create: {
      id: createId("enrollment"),
      learnerId: context.learnerId,
      courseId,
      status: "active",
      enrolledAt: now,
      createdAt: now,
    },
    update: { status: "active", enrolledAt: now },
  });
}

/** Idempotently unenrolls the learner (keeps the row for history). */
export async function unenroll(context: LearnerContext, courseId: string) {
  await db.enrollment.updateMany({
    where: { learnerId: context.learnerId, courseId, status: "active" },
    data: { status: "dropped" },
  });
}

export async function isEnrolled(
  context: LearnerContext,
  courseId: string,
): Promise<boolean> {
  const row = await db.enrollment.findUnique({
    where: {
      learnerId_courseId: { learnerId: context.learnerId, courseId },
    },
    select: { status: true },
  });

  return row?.status === "active";
}

/** Active courses the learner is enrolled in, most recently enrolled first. */
export async function getEnrolledCourses(context: LearnerContext) {
  const enrollments = await db.enrollment.findMany({
    where: { learnerId: context.learnerId, status: "active" },
    orderBy: { enrolledAt: "desc" },
    include: {
      course: {
        include: {
          lessons: {
            select: { id: true, title: true },
            orderBy: { orderIndex: "asc" },
          },
        },
      },
    },
  });

  return enrollments
    .filter((enrollment) => enrollment.course.status === "active")
    .map((enrollment) => enrollment.course);
}

/**
 * Recent chat threads (sessions with a course but no lesson) for the
 * workspace home and command palette.
 */
export async function getRecentChats(
  context: LearnerContext,
  options: { courseId?: string; limit?: number } = {},
) {
  return db.session.findMany({
    where: {
      learnerId: context.learnerId,
      kind: "chat",
      courseId: options.courseId ?? { not: null },
    },
    orderBy: { updatedAt: "desc" },
    take: options.limit ?? 20,
    select: {
      id: true,
      courseId: true,
      topic: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

/** Pinned chat threads for the course sidebar. */
export async function getPinnedChats(context: LearnerContext) {
  return db.session.findMany({
    where: {
      learnerId: context.learnerId,
      kind: "chat",
      courseId: { not: null },
      pinnedAt: { not: null },
    },
    orderBy: { pinnedAt: "desc" },
    select: {
      id: true,
      courseId: true,
      topic: true,
    },
  });
}
