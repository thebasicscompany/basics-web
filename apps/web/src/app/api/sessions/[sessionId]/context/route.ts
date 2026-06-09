import { NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerContext } from "@/lib/learner";
import { appendEvents, getOwnedSession } from "@/lib/session-store";
import { createId } from "@/lib/ids";

const BodySchema = z.object({
  kind: z.literal("screen_snapshot"),
  dataUrl: z
    .string()
    .startsWith("data:image/")
    .max(8_000_000, "Snapshot too large"),
  description: z.string().trim().min(1).max(500).optional(),
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
  const session = await getOwnedSession(context, sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const parsed = BodySchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const events = await appendEvents(context, sessionId, [
    {
      type: "context.source_added",
      contextSource: {
        id: createId("context"),
        sessionId,
        learnerId: context.learnerId,
        workspaceId: context.workspaceId,
        sourceType: "screen",
        label: "Screen snapshot",
        capturedAt: now,
        createdAt: now,
        retention: "transient",
        content: {
          kind: "screen_snapshot",
          contentRef: parsed.data.dataUrl,
          ...(parsed.data.description
            ? { description: parsed.data.description }
            : {}),
        },
        consent: "learner_approved",
      },
    },
  ]);

  return NextResponse.json({ events });
}
