import { notFound } from "next/navigation";

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
      where: { learnerId: context.learnerId, sourceType: "upload" },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!course) {
    notFound();
  }

  const materials = materialRows
    .filter((row) => {
      const content = row.content as { courseId?: string } | null;
      return content?.courseId === courseId;
    })
    .map((row) => {
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
    <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-medium tracking-wide text-primary uppercase">
          {course.title}
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Materials
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Notes, PDFs, and images your tutor draws on for this course. Start a
          chat about any of them.
        </p>
      </header>

      <MaterialsPanel courseId={course.id} initialMaterials={materials} />
    </main>
  );
}
