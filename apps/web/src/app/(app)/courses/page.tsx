import Link from "next/link";
import { ArrowRightIcon, ClockIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";

export const metadata = { title: "Courses | Basics" };

const levelLabel: Record<string, string> = {
  introductory: "Introductory",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default async function CoursesPage() {
  const courses = await db.course.findMany({
    where: { status: "active" },
    orderBy: { title: "asc" },
    include: {
      lessons: { select: { estimatedMinutes: true } },
    },
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
      <div className="mb-8 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Courses</h1>
        <p className="text-sm text-muted-foreground">
          Pick a course and start a tutoring session on any lesson.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => {
          const minutes = course.lessons.reduce(
            (total, lesson) => total + (lesson.estimatedMinutes ?? 0),
            0,
          );

          return (
            <Link
              key={course.id}
              href={`/courses/${course.id}`}
              className="group"
            >
              <Card className="h-full transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    {course.level ? (
                      <Badge variant="secondary">
                        {levelLabel[course.level] ?? course.level}
                      </Badge>
                    ) : (
                      <span />
                    )}
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <ClockIcon className="size-3.5" />
                      {minutes} min
                    </span>
                  </div>
                  <CardTitle className="text-base leading-snug">
                    {course.title}
                  </CardTitle>
                  <CardDescription>{course.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto">
                  <div className="flex flex-wrap gap-1.5">
                    {course.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
                <CardFooter className="text-sm text-muted-foreground">
                  {course.lessons.length} lessons
                  <ArrowRightIcon className="ml-auto size-4 transition-transform group-hover:translate-x-0.5" />
                </CardFooter>
              </Card>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
