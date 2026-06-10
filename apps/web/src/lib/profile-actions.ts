"use server";

import { revalidatePath } from "next/cache";
import {
  LearnerPreferencesSchema,
  parseLearnerPreferences,
  type LearnerPreferences,
} from "@basics/contracts";
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

/**
 * Merges a partial update into the learner's stored preferences. The merged
 * result is re-validated so client-supplied values can't store junk.
 */
export async function updateLearnerPreferences(
  update: Partial<LearnerPreferences>,
): Promise<LearnerPreferences> {
  const context = await requireLearnerContext();

  const learner = await db.learner.findUnique({
    where: { id: context.learnerId },
    select: { preferences: true },
  });
  const current = parseLearnerPreferences(learner?.preferences);
  const next = LearnerPreferencesSchema.parse({ ...current, ...update });

  await db.learner.update({
    where: { id: context.learnerId },
    data: { preferences: next },
  });

  revalidatePath("/", "layout");
  return next;
}
