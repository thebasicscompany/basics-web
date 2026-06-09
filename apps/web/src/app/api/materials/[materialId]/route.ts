import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getLearnerContext } from "@/lib/learner";
import { deleteObject } from "@/lib/uploads";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ materialId: string }> },
) {
  const context = await getLearnerContext();

  if (!context) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { materialId } = await params;
  const material = await db.contextSource.findUnique({
    where: { id: materialId },
  });

  if (
    !material ||
    material.learnerId !== context.learnerId ||
    material.sourceType !== "upload"
  ) {
    return NextResponse.json({ error: "Material not found" }, { status: 404 });
  }

  const content = material.content as { s3Key?: string } | null;
  if (content?.s3Key) {
    await deleteObject(content.s3Key).catch((error: unknown) => {
      console.error("Failed to delete S3 object", error);
    });
  }

  await db.contextSource.delete({ where: { id: materialId } });

  return NextResponse.json({ ok: true });
}
