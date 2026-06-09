import {
  SessionStateSchema,
  type Course,
  type Lesson,
  type Session,
  type SessionEvent,
} from "@basics/contracts";
import {
  serializeSessionEvent,
  type BasicsPrismaClient,
  type Course as CourseRow,
  type Lesson as LessonRow,
  type Session as SessionRow,
} from "@basics/db";
import type { SessionKind } from "./kinds";

/** Learner-provided material (e.g. an uploaded document) usable in a turn. */
export type SessionMaterial = {
  label: string;
  text: string;
};

/** Everything a turn needs, assembled once for every transport and kind. */
export type SessionContext = {
  session: Session;
  kind: SessionKind;
  course?: Course;
  lesson?: Lesson;
  events: SessionEvent[];
  materials: SessionMaterial[];
};

/**
 * Derives the session kind. Until the schema grows a `kind` column,
 * lesson-vs-chat is inferred from `lessonId`.
 */
export function sessionKindOf(session: Session): SessionKind {
  return session.lessonId ? "lesson" : "chat";
}

const iso = (value: Date) => value.toISOString();

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

/**
 * The one true context assembler: loads the session, its course and lesson,
 * the full prior event log, and the learner materials available to a turn.
 * Used by every transport (web chat turns, voice worker) and every kind.
 */
export async function loadSessionContext(
  db: BasicsPrismaClient,
  sessionId: string,
): Promise<SessionContext> {
  const row = await db.session.findUniqueOrThrow({
    where: { id: sessionId },
    include: { course: true, lesson: true },
  });

  const session = toSession(row);

  const [eventRows, materials] = await Promise.all([
    db.sessionEvent.findMany({
      where: { sessionId },
      orderBy: { sequence: "asc" },
    }),
    loadSessionMaterials(db, session),
  ]);

  return {
    session,
    kind: sessionKindOf(session),
    course: row.course ? toCourse(row.course) : undefined,
    lesson: row.lesson ? toLesson(row.lesson) : undefined,
    events: eventRows.map(serializeSessionEvent),
    materials,
  };
}

/**
 * Materials available to this turn: sources attached to the session plus the
 * learner's course-level uploads (Materials tab) for the session's course.
 */
async function loadSessionMaterials(
  db: BasicsPrismaClient,
  session: Session,
): Promise<SessionMaterial[]> {
  if (session.contextSourceIds.length === 0 && !session.courseId) {
    return [];
  }

  const rows = await db.contextSource.findMany({
    where: {
      learnerId: session.learnerId,
      sourceType: "upload",
      OR: [
        ...(session.contextSourceIds.length > 0
          ? [{ id: { in: session.contextSourceIds } }]
          : []),
        ...(session.courseId
          ? [
              {
                content: {
                  path: ["courseId"],
                  equals: session.courseId,
                },
              },
            ]
          : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return rows.flatMap((row) => {
    const content = row.content as { extractedText?: string } | null;
    const text = content?.extractedText?.trim();
    return text ? [{ label: row.label, text }] : [];
  });
}
