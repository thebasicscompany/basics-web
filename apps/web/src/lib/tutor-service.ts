import "server-only";
import type { Course, Lesson, Session } from "@basics/contracts";
import {
  createTutorRuntime,
  type TutorMaterial,
  type TutorStreamItem,
  type TutorTurnContext,
  type TutorTurnResult,
} from "@basics/harness";
import { db } from "@/lib/db";
import { createId } from "@/lib/ids";
import type { LearnerContext } from "@/lib/learner";
import { toCourse, toLesson } from "@/lib/serializers";
import { appendEvents, getSessionEvents } from "@/lib/session-store";

let runtime: ReturnType<typeof createTutorRuntime> | undefined;

function getRuntime() {
  runtime ??= createTutorRuntime();
  return runtime;
}

export type TurnStreamMessage =
  | { type: "text-delta"; text: string }
  | { type: "draft"; draft: unknown }
  | { type: "events"; events: unknown[] }
  | {
      type: "paused";
      pause: { runId: string; kind: string; title: string; message: string; scope: string };
    }
  | { type: "error"; message: string }
  | { type: "done" };

export async function buildTurnContext(
  session: Session,
  learnerText: string,
): Promise<TutorTurnContext> {
  const [events, courseRow, lessonRow, materials] = await Promise.all([
    getSessionEvents(session.id),
    session.courseId
      ? db.course.findUnique({ where: { id: session.courseId } })
      : null,
    session.lessonId
      ? db.lesson.findUnique({ where: { id: session.lessonId } })
      : null,
    loadSessionMaterials(session),
  ]);

  const course: Course | undefined = courseRow ? toCourse(courseRow) : undefined;
  const lesson: Lesson | undefined = lessonRow ? toLesson(lessonRow) : undefined;

  return { session, events, learnerText, course, lesson, materials };
}

/**
 * Materials available to this turn: sources attached to the session plus the
 * learner's course-level uploads (Materials tab) for the session's course.
 */
async function loadSessionMaterials(
  session: Session,
): Promise<TutorMaterial[]> {
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

type RunArgs = {
  context: LearnerContext;
  session: Session;
  runId: string;
  turn: AsyncGenerator<TutorStreamItem, TutorTurnResult>;
  /** Events appended before the run started (e.g. the learner utterance). */
  preludeEvents?: unknown[];
};

/**
 * Drives a tutor run and exposes it as an NDJSON streaming response.
 * Event drafts stream to the client as they happen; the durable, sequenced
 * events are appended in one transaction at the end of the run.
 */
export function turnStreamResponse({
  context,
  session,
  runId,
  turn,
  preludeEvents = [],
}: RunArgs): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: TurnStreamMessage) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(message)}\n`));
      };

      try {
        let result: TutorTurnResult;
        const iterator = turn[Symbol.asyncIterator]();

        for (;;) {
          const next = await iterator.next();

          if (next.done) {
            result = next.value;
            break;
          }

          const item = next.value;

          if (item.kind === "text-delta") {
            send({ type: "text-delta", text: item.text });
          } else {
            send({ type: "draft", draft: item.draft });
          }
        }

        const events = await appendEvents(context, session.id, result.drafts);

        send({ type: "events", events: [...preludeEvents, ...events] });

        if (result.pause) {
          await db.tutorRun.update({
            where: { id: runId },
            data: {
              status: "paused",
              pause: {
                kind: result.pause.kind,
                title: result.pause.title,
                message: result.pause.message,
                scope: result.pause.scope,
              },
              state: result.pause.resumeState as object,
            },
          });

          send({
            type: "paused",
            pause: {
              runId,
              kind: result.pause.kind,
              title: result.pause.title,
              message: result.pause.message,
              scope: result.pause.scope,
            },
          });
        } else {
          await db.tutorRun.update({
            where: { id: runId },
            data: { status: "completed", pause: undefined },
          });
        }

        send({ type: "done" });
      } catch (error) {
        console.error("tutor turn failed", error);

        await db.tutorRun
          .update({ where: { id: runId }, data: { status: "failed" } })
          .catch(() => undefined);

        send({
          type: "error",
          message:
            error instanceof Error ? error.message : "The tutor turn failed.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function createTutorRun(sessionId: string): Promise<string> {
  const run = await db.tutorRun.create({
    data: {
      id: createId("run"),
      sessionId,
      status: "running",
      createdAt: new Date(),
    },
  });

  return run.id;
}

export { getRuntime };
