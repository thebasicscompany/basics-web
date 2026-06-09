import "server-only";
import {
  SessionEventSchema,
  SessionStateSchema,
  type Course,
  type CourseModule,
  type Lesson,
  type Session,
  type SessionEvent,
} from "@basics/contracts";
import type {
  Course as CourseRow,
  CourseModule as CourseModuleRow,
  Lesson as LessonRow,
  Session as SessionRow,
  SessionEvent as SessionEventRow,
} from "@basics/db";

const iso = (value: Date) => value.toISOString();

export function toCourse(row: CourseRow): Course {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? undefined,
    level: (row.level as Course["level"]) ?? undefined,
    tags: row.tags,
    moduleIds: [],
    lessonIds: [],
    status: row.status as Course["status"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toCourseModule(row: CourseModuleRow): CourseModule {
  return {
    id: row.id,
    courseId: row.courseId,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    orderIndex: row.orderIndex,
    lessonIds: [],
    status: row.status as CourseModule["status"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toLesson(row: LessonRow): Lesson {
  return {
    id: row.id,
    courseId: row.courseId,
    slug: row.slug,
    title: row.title,
    summary: row.summary ?? undefined,
    orderIndex: row.orderIndex,
    objectives: row.objectives,
    conceptKeys: row.conceptKeys,
    estimatedMinutes: row.estimatedMinutes ?? undefined,
    status: row.status as Lesson["status"],
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    learnerId: row.learnerId,
    workspaceId: row.workspaceId ?? undefined,
    courseId: row.courseId ?? undefined,
    lessonId: row.lessonId ?? undefined,
    topic: row.topic ?? undefined,
    goal: row.goal ?? undefined,
    state: SessionStateSchema.parse(row.state),
    contextSourceIds: row.contextSourceIds,
    startedAt: row.startedAt ? iso(row.startedAt) : undefined,
    endedAt: row.endedAt ? iso(row.endedAt) : undefined,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toSessionEvent(row: SessionEventRow): SessionEvent {
  return SessionEventSchema.parse({
    ...(row.payload as Record<string, unknown>),
    id: row.id,
    sessionId: row.sessionId,
    sequence: row.sequence,
    type: row.type,
    occurredAt: iso(row.occurredAt),
    recordedAt: iso(row.recordedAt),
  });
}
