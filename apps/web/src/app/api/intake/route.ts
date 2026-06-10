import { NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerContext } from "@/lib/learner";
import { createIntakeSession } from "@/lib/session-store";

const BodySchema = z.object({
  topic: z.string().trim().min(1).max(200).optional(),
});

/** Starts a course-creation interview session. */
export async function POST(request: Request) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body ?? {});

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const session = await createIntakeSession(context, parsed.data.topic);

  return NextResponse.json({ session }, { status: 201 });
}
