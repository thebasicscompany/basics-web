"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CircleNotchIcon,
  FileIcon,
  FilePdfIcon,
  FileTextIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  deleteMaterial,
  uploadMaterial,
  type UploadedMaterial,
} from "@/lib/upload-client";
import { cn } from "@/lib/utils";

function MaterialIcon({ mimeType }: { mimeType: string | null }) {
  if (mimeType === "application/pdf") {
    return <FilePdfIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (mimeType?.startsWith("image/")) {
    return <ImageIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  if (mimeType?.startsWith("text/")) {
    return <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />;
  }
  return <FileIcon className="size-4 shrink-0 text-muted-foreground" />;
}

function formatSize(size: number | null): string {
  if (!size) {
    return "";
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function MaterialsPanel({
  courseId,
  initialMaterials,
}: {
  courseId: string;
  initialMaterials: UploadedMaterial[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [materials, setMaterials] = useState(initialMaterials);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [chattingId, setChattingId] = useState<string | null>(null);

  async function handleFiles(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0 || uploading) {
      return;
    }

    setUploading(true);
    setError(null);
    try {
      for (const file of list) {
        const material = await uploadMaterial(courseId, file);
        setMaterials((current) => [material, ...current]);
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(materialId: string) {
    setDeletingId(materialId);
    setError(null);
    try {
      await deleteMaterial(materialId);
      setMaterials((current) =>
        current.filter((material) => material.id !== materialId),
      );
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleChatAbout(materialId: string) {
    setChattingId(materialId);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${courseId}/chats`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contextSourceIds: [materialId] }),
      });
      if (!response.ok) {
        throw new Error("Failed to start a chat.");
      }
      const { session } = (await response.json()) as {
        session: { id: string };
      };
      router.push(`/courses/${courseId}/chats/${session.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Failed to start a chat.",
      );
      setChattingId(null);
    }
  }

  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? materials.filter((material) =>
        material.label.toLowerCase().includes(normalizedQuery),
      )
    : materials;

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-8 text-center text-sm text-muted-foreground transition-colors",
          dragging && "border-primary bg-accent/40",
        )}
      >
        <UploadSimpleIcon className="size-5" />
        <p>Drag and drop notes, PDFs, or images here</p>
        <Button
          size="sm"
          variant="outline"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading..." : "Choose files"}
        </Button>
        <p className="text-xs">PDF, text, markdown, or images · 20 MB max</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md,image/png,image/jpeg,image/webp,image/gif,application/pdf,text/plain,text/markdown"
          className="hidden"
          onChange={(event) => {
            if (event.target.files) {
              void handleFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </div>

      {materials.length > 0 ? (
        <div className="relative">
          <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter materials..."
            className="h-8 pl-8"
          />
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          <p>
            {normalizedQuery
              ? "No materials match your filter."
              : "No materials yet."}
          </p>
          {!normalizedQuery ? (
            <p>Your tutor uses what you upload to tailor lessons to you.</p>
          ) : null}
        </div>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {visible.map((material) => (
            <div key={material.id} className="flex items-center gap-3 px-4 py-3">
              <MaterialIcon mimeType={material.mimeType} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{material.label}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    formatSize(material.size),
                    new Date(material.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    }),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0"
                disabled={chattingId === material.id}
                onClick={() => void handleChatAbout(material.id)}
              >
                {chattingId === material.id ? "Starting..." : "Chat about this"}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${material.label}`}
                disabled={deletingId === material.id}
                onClick={() => void handleDelete(material.id)}
              >
                {deletingId === material.id ? (
                  <CircleNotchIcon className="animate-spin" />
                ) : (
                  <TrashIcon />
                )}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
