import { NextResponse } from "next/server";
import { z } from "zod";
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

const BodySchema = z.object({
  text: z.string().trim().min(1).max(4000),
});

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

  const learnerEvents = await appendEvents(context, session.id, [
    {
      type: "transcript.utterance",
      speaker: "learner",
      modality: "text",
      segmentId: createId("segment"),
      text: parsed.data.text,
      isFinal: true,
    },
  ]);

  const turnContext = await buildTurnContext(session, parsed.data.text);
  const runId = await createTutorRun(session.id);

  return turnStreamResponse({
    context,
    session,
    runId,
    turn: getRuntime().runTurn(turnContext),
    preludeEvents: learnerEvents,
  });
}
