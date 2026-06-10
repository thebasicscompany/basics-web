import Link from "next/link";
import { notFound } from "next/navigation";

import {
  PageBreadcrumb,
  PageBreadcrumbSeparator,
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header";
import { MaterialsPanel } from "@/components/workspace/materials-panel";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

export const metadata = { title: "Materials | Basics" };

export default async function CourseMaterialsPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = await params;
  const context = await requireLearnerContext();

  const [course, materialRows] = await Promise.all([
    db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    }),
    db.contextSource.findMany({
      where: {
        learnerId: context.learnerId,
        sourceType: "upload",
        courseId,
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const materials = materialRows.map((row) => {
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

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 pt-24 pb-12">
      <PageHeader className="mb-6">
        <PageHeaderContent>
          <PageBreadcrumb>
            <Link href="/courses">Courses</Link>
            <PageBreadcrumbSeparator />
            <Link href={`/courses/${course.id}`} className="truncate">
              {course.title}
            </Link>
          </PageBreadcrumb>
          <PageHeaderTitle>Materials</PageHeaderTitle>
        </PageHeaderContent>
      </PageHeader>

      <MaterialsPanel courseId={course.id} initialMaterials={materials} />
    </main>
  );
}
