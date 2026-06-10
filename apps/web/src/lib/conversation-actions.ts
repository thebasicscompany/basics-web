"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

/** Loads a chat session iff it belongs to the caller (chats only — lesson
 * and intake sessions are managed by their own flows). */
async function getOwnedChat(sessionId: string) {
  const context = await requireLearnerContext();
  const session = await db.session.findUnique({ where: { id: sessionId } });

  if (
    !session ||
    session.learnerId !== context.learnerId ||
    session.kind !== "chat"
  ) {
    throw new Error("Conversation not found.");
  }

  return session;
}

export async function renameConversation(sessionId: string, topic: string) {
  const session = await getOwnedChat(sessionId);
  const trimmed = topic.trim();

  if (!trimmed || trimmed.length > 120) {
    throw new Error("Title must be between 1 and 120 characters.");
  }

  await db.session.update({
    where: { id: session.id },
    data: { topic: trimmed },
  });

  revalidatePath("/", "layout");
}

export async function deleteConversation(sessionId: string) {
  const session = await getOwnedChat(sessionId);

  // Events, projections, and session-scoped context sources cascade.
  await db.session.delete({ where: { id: session.id } });

  revalidatePath("/", "layout");
}

export async function setConversationPinned(
  sessionId: string,
  pinned: boolean,
) {
  const session = await getOwnedChat(sessionId);

  await db.session.update({
    where: { id: session.id },
    data: { pinnedAt: pinned ? new Date() : null },
  });

  revalidatePath("/", "layout");
}
