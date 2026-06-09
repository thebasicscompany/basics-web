import Link from "next/link";
import { ClockIcon } from "@phosphor-icons/react/dist/ssr";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type SyllabusLesson = {
  id: string;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
};

export type SyllabusSection = {
  key: string;
  title: string;
  summary: string | null;
  lessons: SyllabusLesson[];
};

export type ContinueTarget = {
  lessonId: string;
  lessonTitle: string;
};

export function Syllabus({
  courseId,
  sections,
  continueTarget,
}: {
  courseId: string;
  sections: SyllabusSection[];
  continueTarget: ContinueTarget | null;
}) {
  return (
    <div className="space-y-6">
      {continueTarget ? (
        <Card className="border-primary/25 bg-accent/40">
          <CardContent className="flex items-center justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-medium tracking-wide text-primary uppercase">
                Continue
              </p>
              <p className="truncate text-sm font-medium">
                {continueTarget.lessonTitle}
              </p>
            </div>
            <Button
              size="sm"
              render={
                <Link
                  href={`/courses/${courseId}/lessons/${continueTarget.lessonId}/learn`}
                />
              }
            >
              Resume
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {sections.map((section) => (
        <section key={section.key}>
          <div className="mb-2">
            <h3 className="font-heading text-base font-medium tracking-tight">
              {section.title}
            </h3>
            {section.summary ? (
              <p className="text-sm text-muted-foreground">{section.summary}</p>
            ) : null}
          </div>
          <div className="divide-y rounded-xl border bg-card">
            {section.lessons.map((lesson, index) => (
              <div
                key={lesson.id}
                className="flex items-center justify-between gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    <span className="mr-2 text-muted-foreground">
                      {index + 1}.
                    </span>
                    {lesson.title}
                  </p>
                  <p className="flex items-center gap-3 text-xs text-muted-foreground">
                    {lesson.summary ? (
                      <span className="truncate">{lesson.summary}</span>
                    ) : null}
                    {lesson.estimatedMinutes ? (
                      <span className="flex shrink-0 items-center gap-1">
                        <ClockIcon className="size-3" />
                        {lesson.estimatedMinutes} min
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  render={
                    <Link
                      href={`/courses/${courseId}/lessons/${lesson.id}/learn`}
                    />
                  }
                >
                  Start lesson
                </Button>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
