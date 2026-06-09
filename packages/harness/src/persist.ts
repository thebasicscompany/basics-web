import type { SessionEvent, SessionEventDraft } from "@basics/contracts";
import {
  appendSessionEvents,
  serializeSessionEvent,
  type BasicsPrismaClient,
  type EventStoreContext,
} from "@basics/db";

export type { EventStoreContext };

/**
 * Appends event drafts to a session's append-only log (sequenced, in one
 * transaction, maintaining projections) and returns the durable events.
 */
export async function persistTurnEvents(
  db: BasicsPrismaClient,
  context: EventStoreContext,
  sessionId: string,
  drafts: SessionEventDraft[],
): Promise<SessionEvent[]> {
  const rows = await appendSessionEvents(db, context, sessionId, drafts);
  return rows.map(serializeSessionEvent);
}
