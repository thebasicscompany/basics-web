import Link from "next/link";
import { notFound } from "next/navigation";
import { ClockIcon, PlayIcon, TargetIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {course.title}
          </h1>
          {course.level ? (
            <Badge variant="secondary" className="capitalize">
              {course.level}
            </Badge>
          ) : null}
        </div>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {course.description}
        </p>
      </div>

      <div className="space-y-8">
        {sections.map((section) => (
          <section key={section.key}>
            <div className="mb-3">
              <h2 className="text-lg font-medium">{section.title}</h2>
              {section.summary ? (
                <p className="text-sm text-muted-foreground">
                  {section.summary}
                </p>
              ) : null}
            </div>
            <div className="space-y-3">
              {section.lessons.map((lesson, index) => (
                <Card key={lesson.id}>
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
                      render={
                        <Link
                          href={`/courses/${course.id}/lessons/${lesson.id}/learn`}
                        />
                      }
                    >
                      <PlayIcon className="size-4" />
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
