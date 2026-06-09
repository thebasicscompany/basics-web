import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceComposer } from "@/components/chat/workspace-composer";
import {
  Syllabus,
  type SyllabusSection,
} from "@/components/workspace/syllabus";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

export default async function CourseWorkspacePage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const context = await requireLearnerContext();

  const [course, latestLessonSession] = await Promise.all([
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
    db.session.findFirst({
      where: {
        learnerId: context.learnerId,
        courseId,
        lessonId: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      include: { lesson: { select: { id: true, title: true } } },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const sections: SyllabusSection[] = [
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

  const continueTarget = latestLessonSession?.lesson
    ? {
        lessonId: latestLessonSession.lesson.id,
        lessonTitle: latestLessonSession.lesson.title,
      }
    : null;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-2xl font-semibold tracking-tight">
            {course.title}
          </h1>
          {course.description ? (
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {course.description}
            </p>
          ) : null}
        </div>
        {nextLesson ? (
          <Button render={<Link href={goLiveHref} />}>Go live</Button>
        ) : null}
      </header>

      <div className="mb-8">
        <WorkspaceComposer courseId={course.id} goLiveHref={goLiveHref} />
      </div>

      <Syllabus
        courseId={course.id}
        sections={sections}
        continueTarget={continueTarget}
      />
    </main>
  );
}
