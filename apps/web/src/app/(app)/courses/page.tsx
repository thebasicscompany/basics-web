import Link from "next/link";
import { ArrowRightIcon, ClockIcon } from "@phosphor-icons/react/dist/ssr";

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
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderMeta,
  PageHeaderTitle,
} from "@/components/page-header";
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
      <PageHeader className="mb-10">
        <PageHeaderContent>
          <PageHeaderEyebrow>Library</PageHeaderEyebrow>
          <PageHeaderTitle>Courses</PageHeaderTitle>
          <PageHeaderDescription>
            Pick a course and start a tutoring session on any lesson.
          </PageHeaderDescription>
          <PageHeaderMeta>
            <span>
              {courses.length} {courses.length === 1 ? "course" : "courses"}
            </span>
          </PageHeaderMeta>
        </PageHeaderContent>
      </PageHeader>
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
              <Card className="h-full shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all group-hover:-translate-y-0.5 group-hover:border-primary/35 group-hover:shadow-[0_4px_12px_-2px_rgb(0_0_0/0.08)]">
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
