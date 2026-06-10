import Link from "next/link";
import { notFound } from "next/navigation";

import { WorkspaceComposer } from "@/components/chat/workspace-composer";
import {
  PageBreadcrumb,
  PageBreadcrumbSeparator,
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderMeta,
  PageHeaderTitle,
} from "@/components/page-header";
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

  const [course, latestLessonSession, progressRows] = await Promise.all([
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
    db.lessonProgress.findMany({
      where: { learnerId: context.learnerId, courseId },
      select: { lessonId: true, status: true },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const progressByLesson = new Map(
    progressRows.map((row) => [
      row.lessonId,
      row.status as "in_progress" | "completed",
    ]),
  );

  const toSyllabusLesson = (lesson: {
    id: string;
    title: string;
    summary: string | null;
    estimatedMinutes: number | null;
  }) => ({
    id: lesson.id,
    title: lesson.title,
    summary: lesson.summary,
    estimatedMinutes: lesson.estimatedMinutes,
    progress: progressByLesson.get(lesson.id) ?? null,
  });

  const sections: SyllabusSection[] = [
    ...course.modules.map((module) => ({
      key: module.id,
      title: module.title,
      summary: module.summary,
      lessons: module.lessons.map(toSyllabusLesson),
    })),
    ...(course.lessons.length > 0
      ? [
          {
            key: "unassigned",
            title: "Lessons",
            summary: null,
            lessons: course.lessons.map(toSyllabusLesson),
          },
        ]
      : []),
  ];

  const totalLessons = sections.reduce(
    (count, section) => count + section.lessons.length,
    0,
  );
  const completedLessons = sections.reduce(
    (count, section) =>
      count +
      section.lessons.filter((lesson) => lesson.progress === "completed")
        .length,
    0,
  );

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
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-24 pb-12">
      <PageHeader className="mb-6">
        <PageHeaderContent>
          <PageBreadcrumb>
            <Link href="/courses">Courses</Link>
            <PageBreadcrumbSeparator />
            <span className="truncate text-foreground">{course.title}</span>
          </PageBreadcrumb>
          <PageHeaderTitle>Overview</PageHeaderTitle>
          {totalLessons > 0 ? (
            <PageHeaderMeta>
              {completedLessons} of {totalLessons} lessons completed
            </PageHeaderMeta>
          ) : null}
        </PageHeaderContent>
        {nextLesson ? (
          <PageHeaderActions>
            <Button render={<Link href={goLiveHref} />}>Go live</Button>
          </PageHeaderActions>
        ) : null}
      </PageHeader>

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
