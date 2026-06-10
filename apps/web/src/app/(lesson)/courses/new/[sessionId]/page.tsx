import { notFound, redirect } from "next/navigation";

import { IntakeRoom } from "@/components/intake/intake-room";
import { toSession } from "@/lib/serializers";
import { requireLearnerContext } from "@/lib/learner";
import { getOwnedSession, getSessionEvents } from "@/lib/session-store";

export const metadata = { title: "New course | Basics" };

export default async function NewCoursePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const context = await requireLearnerContext();

  const sessionRow = await getOwnedSession(context, sessionId);

  if (!sessionRow || sessionRow.kind !== "intake") {
    notFound();
  }

  // A finished interview already has its course; go straight there.
  const events = await getSessionEvents(sessionId);
  const created = events.find(
    (event) => event.type === "intake.course_created",
  );
  if (created?.type === "intake.course_created") {
    redirect(`/courses/${created.courseId}`);
  }

  return <IntakeRoom session={toSession(sessionRow)} initialEvents={events} />;
}
