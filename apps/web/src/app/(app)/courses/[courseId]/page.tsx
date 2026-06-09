import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceComposer } from "@/components/chat/workspace-composer";
import {
  WorkspaceTabs,
  type WorkspaceMaterial,
  type WorkspaceSection,
} from "@/components/workspace/workspace-tabs";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getRecentChats } from "@/lib/enrollments";
import { requireLearnerContext } from "@/lib/learner";

export default async function CourseWorkspacePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const context = await requireLearnerContext();

  const [course, chats, latestLessonSession, materialRows] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          orderBy: { orderIndex: "asc" },
          include: { lessons: { orderBy: { orderIndex: "asc" } } },
        },
        lessons: {
          where: { moduleId: null },
          orderBy: { orderIndex: "asc" },
        },
      },
    }),
    getRecentChats(context, { courseId, limit: 30 }),
    db.session.findFirst({
      where: {
        learnerId: context.learnerId,
        courseId,
        lessonId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      include: { lesson: { select: { id: true, title: true } } },
    }),
    db.contextSource.findMany({
      where: { learnerId: context.learnerId, sourceType: "upload" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const sections: WorkspaceSection[] = [
    ...course.modules.map((module) => ({
      key: module.id,
      title: module.title,
      summary: module.summary,
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        summary: lesson.summary,
        estimatedMinutes: lesson.estimatedMinutes,
      })),
    })),
    ...(course.lessons.length > 0
      ? [
          {
            key: "unassigned",
            title: "Lessons",
            summary: null,
            lessons: course.lessons.map((lesson) => ({
              id: lesson.id,
              title: lesson.title,
              summary: lesson.summary,
              estimatedMinutes: lesson.estimatedMinutes,
            })),
          },
        ]
      : []),
  ];

  const firstLesson = sections.find((section) => section.lessons.length > 0)
    ?.lessons[0];
  const nextLesson = latestLessonSession?.lesson ?? firstLesson ?? null;
  const goLiveHref = nextLesson
    ? `/courses/${course.id}/lessons/${nextLesson.id}/learn`
    : `/courses/${course.id}`;

  const materials: WorkspaceMaterial[] = materialRows
    .filter((row) => {
      const content = row.content as { courseId?: string } | null;
      return content?.courseId === courseId;
    })
    .map((row) => {
      const content = row.content as {
        mimeType?: string;
        size?: number;
      };
      return {
        id: row.id,
        label: row.label,
        mimeType: content.mimeType ?? null,
        size: content.size ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });

  const continueTarget = latestLessonSession?.lesson
    ? {
        lessonId: latestLessonSession.lesson.id,
        lessonTitle: latestLessonSession.lesson.title,
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <h1 className="min-w-0 truncate font-heading text-2xl font-semibold tracking-tight">
          {course.title}
        </h1>
        {nextLesson ? (
          <Button render={<Link href={goLiveHref} />}>Go live</Button>
        ) : null}
      </header>

      <div className="mb-8">
        <WorkspaceComposer courseId={course.id} goLiveHref={goLiveHref} />
      </div>

      <WorkspaceTabs
        courseId={course.id}
        sections={sections}
        chats={chats.map((chat) => ({
          id: chat.id,
          topic: chat.topic,
          updatedAt: chat.updatedAt.toISOString(),
        }))}
        materials={materials}
        continueTarget={continueTarget}
      />
    </main>
  );
}
