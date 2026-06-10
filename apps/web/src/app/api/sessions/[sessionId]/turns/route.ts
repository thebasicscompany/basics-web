import { NextResponse } from "next/server";
import { z } from "zod";
import { JsonValueSchema, SessionEventIdSchema } from "@basics/contracts";
import { db } from "@/lib/db";
import { getLearnerContext } from "@/lib/learner";
import { toSession } from "@/lib/serializers";
import { appendEvents, getOwnedSession } from "@/lib/session-store";
import {
  buildTurnContext,
  createTutorRun,
  getRuntime,
  turnStreamResponse,
} from "@/lib/tutor-service";
import { createId } from "@/lib/ids";

const BodySchema = z.union([
  z.object({ text: z.string().trim().min(1).max(4000) }),
  // A structured panel click (choice chip, confirm button) — same turn
  // path as typed text, but recorded as a ui.response event.
  z.object({
    response: z.object({
      refEventId: SessionEventIdSchema,
      value: JsonValueSchema,
    }),
  }),
]);

function truncateTopic(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 60 ? `${normalized.slice(0, 57)}...` : normalized;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId } = await params;
  const sessionRow = await getOwnedSession(context, sessionId);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = BodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const session = toSession(sessionRow);
  const body = parsed.data;

  // Auto-title chat threads from the first learner message.
  if ("text" in body && !sessionRow.lessonId && !sessionRow.topic) {
    const topic = truncateTopic(body.text);
    await db.session.update({
      where: { id: session.id },
      data: { topic },
    });
    session.topic = topic;
  }

  const learnerEvents = await appendEvents(context, session.id, [
    "text" in body
      ? {
          type: "transcript.utterance",
          speaker: "learner",
          modality: "text",
          segmentId: createId("segment"),
          text: body.text,
          isFinal: true,
        }
      : {
          type: "ui.response",
          refEventId: body.response.refEventId,
          value: body.response.value,
        },
  ]);

  const learnerText =
    "text" in body
      ? body.text
      : `[Panel response to ${body.response.refEventId}] ${JSON.stringify(body.response.value)}`;

  const turnContext = await buildTurnContext(session, learnerText);
  const runId = await createTutorRun(session.id);

  return turnStreamResponse({
    context,
    session,
    runId,
    turn: getRuntime().runTurn(turnContext),
    preludeEvents: learnerEvents,
  });
}
