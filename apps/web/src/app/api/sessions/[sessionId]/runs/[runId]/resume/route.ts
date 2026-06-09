import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getLearnerContext } from "@/lib/learner";
import { toSession } from "@/lib/serializers";
import { getOwnedSession } from "@/lib/session-store";
import {
  buildTurnContext,
  getRuntime,
  turnStreamResponse,
} from "@/lib/tutor-service";

const BodySchema = z.object({
  approved: z.boolean(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string; runId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sessionId, runId } = await params;
  const sessionRow = await getOwnedSession(context, sessionId);

  if (!sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = BodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const run = await db.tutorRun.findUnique({ where: { id: runId } });

  if (!run || run.sessionId !== sessionId || run.status !== "paused") {
    return NextResponse.json(
      { error: "No paused run to resume" },
      { status: 409 },
    );
  }

  await db.tutorRun.update({
    where: { id: runId },
    data: { status: "running" },
  });

  const session = toSession(sessionRow);
  const turnContext = await buildTurnContext(session, "");

  return turnStreamResponse({
    context,
    session,
    runId,
    turn: getRuntime().resumeTurn(turnContext, run.state, {
      approved: parsed.data.approved,
    }),
  });
}
