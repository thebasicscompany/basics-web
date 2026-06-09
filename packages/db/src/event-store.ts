import {
  SessionEventSchema,
  type SessionEvent,
  type SessionEventDraft,
} from "@basics/contracts";
import type { BasicsPrismaClient } from "./client";
import type { SessionEvent as SessionEventRow } from "./generated/prisma/client";

export function serializeSessionEvent(row: SessionEventRow): SessionEvent {
  return SessionEventSchema.parse({
    ...(row.payload as Record<string, unknown>),
    id: row.id,
    sessionId: row.sessionId,
    sequence: row.sequence,
    type: row.type,
    occurredAt: row.occurredAt.toISOString(),
    recordedAt: row.recordedAt.toISOString(),
  });
}

export type EventStoreContext = {
  learnerId: string;
  workspaceId: string;
};

function createEventId(): string {
  return `event_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * Appends event drafts to a session's append-only log inside one
 * transaction, maintaining per-session sequence numbers and the
 * read-side projection tables.
 */
export async function appendSessionEvents(
  db: BasicsPrismaClient,
  context: EventStoreContext,
  sessionId: string,
  drafts: SessionEventDraft[],
): Promise<SessionEventRow[]> {
  if (drafts.length === 0) {
    return [];
  }

  return db.$transaction(async (tx) => {
    const last = await tx.sessionEvent.findFirst({
      where: { sessionId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    });

    let sequence = (last?.sequence ?? -1) + 1;
    const now = new Date();
    const created: SessionEventRow[] = [];

    for (const draft of drafts) {
      const eventId = createEventId();
      const { type, ...payload } = draft;

      const row = await tx.sessionEvent.create({
        data: {
          id: eventId,
          sessionId,
          sequence,
          type,
          payload,
          occurredAt: now,
          recordedAt: now,
        },
      });

      switch (draft.type) {
        case "transcript.utterance":
          await tx.transcriptProjection.create({
            data: {
              eventId,
              sessionId,
              sequence,
              segmentId: draft.segmentId,
              speaker: draft.speaker,
              modality: draft.modality,
              text: draft.text,
              isFinal: draft.isFinal,
              occurredAt: now,
              createdAt: now,
            },
          });
          break;
        case "visual.draw_path":
        case "visual.add_shape":
        case "visual.add_text":
        case "visual.add_diagram":
        case "visual.set_draw_mode":
        case "visual.clear_surface":
        case "visual.focus":
          await tx.visualStateProjection.create({
            data: {
              eventId,
              sessionId,
              sequence,
              surfaceId: draft.surfaceId,
              actionType: draft.type,
              payload,
              occurredAt: now,
              createdAt: now,
            },
          });
          break;
        case "context.source_added":
          await tx.contextSource.create({
            data: {
              id: draft.contextSource.id,
              eventId,
              sessionId,
              learnerId: context.learnerId,
              workspaceId: context.workspaceId,
              sourceType: draft.contextSource.sourceType,
              label: draft.contextSource.label,
              capturedAt: draft.contextSource.capturedAt
                ? new Date(draft.contextSource.capturedAt)
                : null,
              createdAt: now,
              retention: draft.contextSource.retention,
              content: draft.contextSource.content,
              consent: draft.contextSource.consent,
            },
          });
          break;
        case "mastery.observed":
          await tx.masteryObservation.create({
            data: {
              id: draft.observation.id,
              eventId,
              learnerId: context.learnerId,
              workspaceId: context.workspaceId,
              sessionId,
              courseId: draft.observation.courseId,
              lessonId: draft.observation.lessonId,
              conceptKey: draft.observation.conceptKey,
              observedAt: new Date(draft.observation.observedAt),
              signal: draft.observation.signal,
              level: draft.observation.level,
              confidence: draft.observation.confidence,
              note: draft.observation.note,
            },
          });
          break;
        case "lesson.checkpoint_reached":
          await tx.lessonCheckpointRecord.create({
            data: {
              eventId,
              sessionId,
              learnerId: context.learnerId,
              workspaceId: context.workspaceId,
              lessonId: draft.lessonId,
              title: draft.title,
              summary: draft.summary,
              occurredAt: now,
              createdAt: now,
            },
          });
          break;
        default:
          break;
      }

      created.push(row);
      sequence += 1;
    }

    const session = await tx.session.findUniqueOrThrow({
      where: { id: sessionId },
      select: { state: true },
    });
    const state = session.state as Record<string, unknown>;

    await tx.session.update({
      where: { id: sessionId },
      data: {
        state: { ...state, lastEventSequence: sequence - 1 },
      },
    });

    return created;
  });
}
