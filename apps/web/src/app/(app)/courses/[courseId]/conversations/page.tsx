import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PageBreadcrumb,
  PageBreadcrumbSeparator,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header";
import {
  ConversationsList,
  type ConversationRow,
} from "@/components/workspace/conversations-list";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

export const metadata = { title: "Conversations | Basics" };

export default async function CourseConversationsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const context = await requireLearnerContext();

  const [course, sessions] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    }),
    db.session.findMany({
      where: {
        learnerId: context.learnerId,
        courseId,
        kind: "chat",
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true, topic: true, updatedAt: true, pinnedAt: true },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const conversations: ConversationRow[] = sessions.map((session) => ({
    id: session.id,
    topic: session.topic,
    updatedAt: session.updatedAt.toISOString(),
    pinned: session.pinnedAt != null,
  }));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-24 pb-12">
      <PageHeader className="mb-6">
        <PageHeaderContent>
          <PageBreadcrumb>
            <Link href="/courses">Courses</Link>
            <PageBreadcrumbSeparator />
            <Link href={`/courses/${course.id}`} className="truncate">
              {course.title}
            </Link>
          </PageBreadcrumb>
          <PageHeaderTitle>Conversations</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>

      <ConversationsList courseId={course.id} conversations={conversations} />
    </main>
  );
}
