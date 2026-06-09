import { NextResponse } from "next/server";
import { z } from "zod";
import { getLearnerContext } from "@/lib/learner";
import { createChatSession } from "@/lib/session-store";
import { db } from "@/lib/db";

const BodySchema = z.object({
  contextSourceIds: z.array(z.string().trim().min(1)).max(10).optional(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { courseId } = await params;
  const course = await db.course.findUnique({ where: { id: courseId } });

  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body ?? {});
  const contextSourceIds = parsed.success
    ? (parsed.data.contextSourceIds ?? [])
    : [];

  const session = await createChatSession(context, courseId, contextSourceIds);

  return NextResponse.json({ session }, { status: 201 });
}
