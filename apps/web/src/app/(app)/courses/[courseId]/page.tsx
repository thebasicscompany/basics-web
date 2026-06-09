import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon, TargetIcon } from "@phosphor-icons/react/dist/ssr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderMeta,
  PageHeaderTitle,
} from "@/components/page-header";
import { db } from "@/lib/db";

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;

  const course = await db.course.findUnique({
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
  });

  if (!course) {
    notFound();
  }

  const sections = [
    ...course.modules.map((module) => ({
      key: module.id,
      title: module.title,
      summary: module.summary,
      lessons: module.lessons,
    })),
    ...(course.lessons.length > 0
      ? [
          {
            key: "unassigned",
            title: "Lessons",
            summary: null,
            lessons: course.lessons,
          },
        ]
      : []),
  ];

  const totalLessons = sections.reduce(
    (total, section) => total + section.lessons.length,
    0,
  );
  const firstLesson = sections.find((section) => section.lessons.length > 0)
    ?.lessons[0];

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-12">
      <PageHeader className="mb-10">
        <PageHeaderContent>
          <PageHeaderEyebrow>Course</PageHeaderEyebrow>
          <PageHeaderTitle>{course.title}</PageHeaderTitle>
          <PageHeaderDescription>{course.description}</PageHeaderDescription>
          <PageHeaderMeta>
            {course.level ? (
              <Badge variant="secondary" className="capitalize">
                {course.level}
              </Badge>
            ) : null}
            <span>
              {course.modules.length > 0
                ? `${course.modules.length} ${course.modules.length === 1 ? "module" : "modules"} · `
                : null}
              {totalLessons} {totalLessons === 1 ? "lesson" : "lessons"}
            </span>
          </PageHeaderMeta>
        </PageHeaderContent>
        {firstLesson ? (
          <PageHeaderActions>
            <Button
              render={
                <Link
                  href={`/courses/${course.id}/lessons/${firstLesson.id}/learn`}
                />
              }
            >
              Start first lesson
            </Button>
          </PageHeaderActions>
        ) : null}
      </PageHeader>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.key}>
            <div className="mb-3">
              <h2 className="font-heading text-lg font-medium tracking-tight">
                {section.title}
              </h2>
              {section.summary ? (
                <p className="text-sm text-muted-foreground">
                  {section.summary}
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              {section.lessons.map((lesson, index) => (
                <Card
                  key={lesson.id}
                  className="shadow-[0_1px_2px_0_rgb(0_0_0/0.04)]"
                >
                  <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                    <div className="space-y-1">
                      <CardTitle className="text-base">
                        <span className="mr-2 text-muted-foreground">
                          {index + 1}.
                        </span>
                        {lesson.title}
                      </CardTitle>
                      <CardDescription>{lesson.summary}</CardDescription>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      render={
                        <Link
                          href={`/courses/${course.id}/lessons/${lesson.id}/learn`}
                        />
                      }
                    >
                      Start lesson
                    </Button>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                    {lesson.estimatedMinutes ? (
                      <span className="flex items-center gap-1">
                        <ClockIcon className="size-3.5" />
                        {lesson.estimatedMinutes} min
                      </span>
                    ) : null}
                    {lesson.objectives.length > 0 ? (
                      <span className="flex items-center gap-1">
                        <TargetIcon className="size-3.5" />
                        {lesson.objectives.length} objectives
                      </span>
                    ) : null}
                    <span className="flex flex-wrap gap-1.5">
                      {lesson.conceptKeys.map((key) => (
                        <Badge key={key} variant="outline" className="text-xs">
                          {key}
                        </Badge>
                      ))}
                    </span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
