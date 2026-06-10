import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import {
  parseLearnerPreferences,
  type LearnerPreferences,
} from "@basics/contracts";
import { db } from "@/lib/db";
import { createId } from "@/lib/ids";

export type LearnerContext = {
  learnerId: string;
  workspaceId: string;
  displayName?: string;
};

/**
 * Resolves the signed-in Clerk user to a Learner row plus their personal
 * workspace, provisioning both on first sign-in.
 */
export async function getLearnerContext(): Promise<LearnerContext | null> {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const existing = await db.learner.findUnique({
    where: { clerkUserId: userId },
    include: { personalWorkspace: true },
  });

  if (existing?.personalWorkspace) {
    return {
      learnerId: existing.id,
      workspaceId: existing.personalWorkspace.id,
      displayName: existing.displayName ?? undefined,
    };
  }

  const user = await currentUser();
  const displayName =
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    user?.username ??
    undefined;
  const now = new Date();

  const learnerId = existing?.id ?? createId("learner");

  const workspace = await db.$transaction(async (tx) => {
    if (!existing) {
      await tx.learner.create({
        data: {
          id: learnerId,
          clerkUserId: userId,
          displayName,
          createdAt: now,
        },
      });
    }

    return tx.workspace.create({
      data: {
        id: createId("workspace"),
        kind: "personal",
        ownerLearnerId: learnerId,
        name: displayName ? `${displayName}'s space` : "Personal space",
        createdAt: now,
      },
    });
  });

  return {
    learnerId,
    workspaceId: workspace.id,
    displayName,
  };
}

/** Loads the learner's stored preferences, tolerating missing/invalid data. */
export async function getLearnerPreferences(
  learnerId: string,
): Promise<LearnerPreferences> {
  const learner = await db.learner.findUnique({
    where: { id: learnerId },
    select: { preferences: true },
  });
  return parseLearnerPreferences(learner?.preferences);
}

export async function requireLearnerContext(): Promise<LearnerContext> {
  const context = await getLearnerContext();

  if (!context) {
    redirect("/sign-in");
  }

  return context;
}
