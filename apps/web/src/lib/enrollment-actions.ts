"use server";

import { revalidatePath } from "next/cache";
import { enroll, unenroll } from "@/lib/enrollments";
import { requireLearnerContext } from "@/lib/learner";

export async function enrollInCourse(courseId: string) {
  const context = await requireLearnerContext();
  await enroll(context, courseId);
  revalidatePath("/", "layout");
}

export async function unenrollFromCourse(courseId: string) {
  const context = await requireLearnerContext();
  await unenroll(context, courseId);
  revalidatePath("/", "layout");
}
