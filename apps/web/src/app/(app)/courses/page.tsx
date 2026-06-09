import Link from "next/link";
import { ArrowRightIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";

import { EnrollButton } from "@/components/enroll-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

export const metadata = { title: "Courses | Basics" };

const levelLabel: Record<string, string> = {
  introductory: "Introductory",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export default async function CoursesPage() {
  const context = await requireLearnerContext();

  const [courses, enrollments] = await Promise.all([
    db.course.findMany({
      where: { status: "active" },
      orderBy: { title: "asc" },
      include: {
        lessons: { select: { estimatedMinutes: true } },
      },
    }),
    db.enrollment.findMany({
      where: { learnerId: context.learnerId, status: "active" },
      select: { courseId: true },
    }),
  ]);

  const enrolledIds = new Set(enrollments.map((row) => row.courseId));

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-24 pb-12">
      <PageHeader className="mb-6">
        <PageHeaderContent>
          <PageHeaderTitle>Courses</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {courses.map((course) => {
          const minutes = course.lessons.reduce(
            (total, lesson) => total + (lesson.estimatedMinutes ?? 0),
            0,
          );
          const enrolled = enrolledIds.has(course.id);

          return (
            <Card
              key={course.id}
              className="group relative h-full shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.08)]"
            >
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
                <CardTitle className="font-heading text-base leading-snug tracking-tight">
                  <Link
                    href={`/courses/${course.id}`}
                    className="after:absolute after:inset-0 after:content-[''] hover:underline"
                  >
                    {course.title}
                  </Link>
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
              <CardFooter className="relative flex items-center justify-between text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  {course.lessons.length} lessons
                  <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="relative z-10">
                  <EnrollButton courseId={course.id} enrolled={enrolled} />
                </span>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
