import Link from "next/link";
import {
  ArrowRightIcon,
  BroadcastIcon,
  ChatCircleIcon,
} from "@phosphor-icons/react/dist/ssr";

import { EnrollButton } from "@/components/enroll-button";
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { getEnrolledCourses } from "@/lib/enrollments";
import { requireLearnerContext } from "@/lib/learner";

export const metadata = { title: "Home | Basics" };

export default async function HomePage() {
  const context = await requireLearnerContext();

  const [enrolledCourses, recentSessions, allCourses] = await Promise.all([
    getEnrolledCourses(context),
    db.session.findMany({
      where: { learnerId: context.learnerId, courseId: { not: null } },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        course: { select: { id: true, title: true } },
        lesson: { select: { id: true, title: true } },
      },
    }),
    db.course.findMany({
      where: { status: "active" },
      orderBy: { title: "asc" },
      select: { id: true, title: true, description: true, level: true },
    }),
  ]);

  // Voice-first: live lesson sessions surface before chats.
  const jumpBackIn = [
    ...recentSessions.filter((session) => session.lessonId),
    ...recentSessions.filter((session) => !session.lessonId),
  ].slice(0, 5);

  // Progress proxy until real progress tracking exists: lessons touched.
  const lessonProgress = await db.session.groupBy({
    by: ["courseId", "lessonId"],
    where: {
      learnerId: context.learnerId,
      lessonId: { not: null },
      courseId: { in: enrolledCourses.map((course) => course.id) },
    },
  });
  const touchedByCourse = new Map<string, number>();
  for (const row of lessonProgress) {
    if (row.courseId) {
      touchedByCourse.set(
        row.courseId,
        (touchedByCourse.get(row.courseId) ?? 0) + 1,
      );
    }
  }

  const enrolledIds = new Set(enrolledCourses.map((course) => course.id));
  const unenrolled = allCourses.filter((course) => !enrolledIds.has(course.id));

  const displayName = context.displayName?.split(/\s+/)[0];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-24 pb-12">
      <PageHeader className="mb-6">
        <PageHeaderContent>
          <PageHeaderTitle>
            {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
          </PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>

      <div className="space-y-8">
        {jumpBackIn.length > 0 ? (
          <section>
            <h2 className="mb-3 font-heading text-lg font-medium tracking-tight">
              Jump back in
            </h2>
            <div className="divide-y rounded-xl border bg-card">
              {jumpBackIn.map((session) => {
                const isLesson = Boolean(session.lessonId);
                const href = isLesson
                  ? `/courses/${session.courseId}/lessons/${session.lessonId}/learn`
                  : `/courses/${session.courseId}/chats/${session.id}`;
                const title = isLesson
                  ? (session.lesson?.title ?? "Lesson")
                  : (session.topic ?? "New chat");

                return (
                  <div
                    key={session.id}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    {isLesson ? (
                      <BroadcastIcon className="size-4 shrink-0 text-primary" />
                    ) : (
                      <ChatCircleIcon className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {session.course?.title}
                        {isLesson ? " · Live lesson" : " · Chat"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={isLesson ? "default" : "outline"}
                      className="shrink-0"
                      render={<Link href={href} />}
                    >
                      {isLesson ? "Resume lesson" : "Open chat"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {enrolledCourses.length > 0 ? (
          <section>
            <h2 className="mb-3 font-heading text-lg font-medium tracking-tight">
              Your courses
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {enrolledCourses.map((course) => {
                const total = course.lessons.length;
                const touched = Math.min(
                  touchedByCourse.get(course.id) ?? 0,
                  total,
                );
                const percent =
                  total > 0 ? Math.round((touched / total) * 100) : 0;

                return (
                  <Link
                    key={course.id}
                    href={`/courses/${course.id}`}
                    className="group"
                  >
                    <Card className="h-full shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-all group-hover:-translate-y-0.5 group-hover:border-primary/35">
                      <CardContent className="space-y-3 py-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-heading text-sm leading-snug font-medium tracking-tight">
                            {course.title}
                          </p>
                          <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                        <div className="space-y-1.5">
                          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {touched} of {total} lessons started
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {unenrolled.length > 0 ? (
          <section>
            <h2 className="mb-3 font-heading text-lg font-medium tracking-tight">
              Start something new
            </h2>
            <div className="divide-y rounded-xl border bg-card">
              {unenrolled.map((course) => (
                <div
                  key={course.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <Link
                        href={`/courses/${course.id}`}
                        className="hover:underline"
                      >
                        {course.title}
                      </Link>
                      {course.level ? (
                        <Badge variant="secondary" className="capitalize">
                          {course.level}
                        </Badge>
                      ) : null}
                    </p>
                    {course.description ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {course.description}
                      </p>
                    ) : null}
                  </div>
                  <EnrollButton courseId={course.id} enrolled={false} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {jumpBackIn.length === 0 && enrolledCourses.length === 0 ? (
          <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="font-heading text-lg font-medium tracking-tight">
              Welcome to Basics
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Enroll in a course below, then start a live lesson — your tutor
              teaches by talking it through with you.
            </p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
