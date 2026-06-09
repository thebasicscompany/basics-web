"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

/** Keeps the Learner row in sync with profile edits made via Clerk hooks. */
export async function updateLearnerDisplayName(displayName: string) {
  const context = await requireLearnerContext();
  const trimmed = displayName.trim();

  if (!trimmed || trimmed.length > 120) {
    throw new Error("Display name must be between 1 and 120 characters.");
  }

  await db.learner.update({
    where: { id: context.learnerId },
    data: { displayName: trimmed },
  });

  revalidatePath("/", "layout");
}
