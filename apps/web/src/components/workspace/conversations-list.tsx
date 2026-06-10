"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChatCircleIcon,
  CircleNotchIcon,
  DotsThreeIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PushPinIcon,
  PushPinSlashIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  deleteConversation,
  renameConversation,
  setConversationPinned,
} from "@/lib/conversation-actions";

export type ConversationRow = {
  id: string;
  topic: string | null;
  updatedAt: string;
  pinned: boolean;
};

function formatDate(iso: string): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function ConversationsList({
  courseId,
  conversations,
}: {
  courseId: string;
  conversations: ConversationRow[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<ConversationRow | null>(null);
  const [deleting, setDeleting] = useState<ConversationRow | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return conversations;
    }
    return conversations.filter((conversation) =>
      (conversation.topic ?? "New chat").toLowerCase().includes(needle),
    );
  }, [conversations, query]);

  async function togglePin(conversation: ConversationRow) {
    try {
      await setConversationPinned(conversation.id, !conversation.pinned);
      router.refresh();
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Couldn't update the pin.",
      );
    }
  }

  async function newChat() {
    setCreating(true);
    try {
      const response = await fetch(`/api/courses/${courseId}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        throw new Error("Couldn't start a chat. Try again.");
      }
      const { session } = (await response.json()) as {
        session: { id: string };
      };
      router.push(`/courses/${courseId}/chats/${session.id}`);
    } catch (cause) {
      toast.error(
        cause instanceof Error ? cause.message : "Couldn't start a chat.",
      );
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search conversations..."
            className="pl-9"
          />
        </div>
        <Button onClick={() => void newChat()} disabled={creating}>
          {creating ? <CircleNotchIcon className="animate-spin" /> : null}
          New chat
        </Button>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <ChatCircleIcon className="mx-auto mb-2 size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No conversations yet. Ask a question to get started.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No conversations match &ldquo;{query.trim()}&rdquo;.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              courseId={courseId}
              conversation={conversation}
              onRename={() => setRenaming(conversation)}
              onDelete={() => setDeleting(conversation)}
              onTogglePin={() => void togglePin(conversation)}
            />
          ))}
        </ul>
      )}

      <RenameDialog
        key={renaming?.id ?? "rename-closed"}
        conversation={renaming}
        onClose={() => setRenaming(null)}
      />
      <DeleteDialog
        conversation={deleting}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function ConversationItem({
  courseId,
  conversation,
  onRename,
  onDelete,
  onTogglePin,
}: {
  courseId: string;
  conversation: ConversationRow;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  return (
    <li className="group/row relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
      <Link
        href={`/courses/${courseId}/chats/${conversation.id}`}
        className="min-w-0 flex-1 outline-none after:absolute after:inset-0"
      >
        <span className="block truncate text-sm">
          {conversation.topic ?? "New chat"}
        </span>
      </Link>
      <span className="shrink-0 text-xs text-muted-foreground group-hover/row:opacity-0">
        {formatDate(conversation.updatedAt)}
      </span>
      <div className="absolute right-3 opacity-0 transition-opacity group-hover/row:opacity-100 has-[[aria-expanded=true]]:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Conversation actions"
              />
            }
          >
            <DotsThreeIcon weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onRename}>
              <PencilSimpleIcon />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {conversation.pinned ? <PushPinSlashIcon /> : <PushPinIcon />}
              {conversation.pinned ? "Unpin" : "Pin to sidebar"}
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <TrashIcon />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

function RenameDialog({
  conversation,
  onClose,
}: {
  conversation: ConversationRow | null;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(conversation?.topic ?? "");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!conversation || !title.trim()) {
      return;
    }
    startTransition(async () => {
      try {
        await renameConversation(conversation.id, title.trim());
        onClose();
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Couldn't rename the chat.",
        );
      }
    });
  }

  return (
    <Dialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {conversation ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename conversation</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Conversation title"
            maxLength={120}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || !title.trim()}>
              {pending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function DeleteDialog({
  conversation,
  onClose,
}: {
  conversation: ConversationRow | null;
  onClose: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    if (!conversation) {
      return;
    }
    startTransition(async () => {
      try {
        await deleteConversation(conversation.id);
        onClose();
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : "Couldn't delete the chat.",
        );
      }
    });
  }

  return (
    <Dialog
      open={conversation !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      {conversation ? (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete conversation?</DialogTitle>
            <DialogDescription>
              &ldquo;{conversation.topic ?? "New chat"}&rdquo; and its full
              transcript will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
