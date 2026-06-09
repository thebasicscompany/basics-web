"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRightIcon,
  ChatCircleIcon,
  ClockIcon,
  MagnifyingGlassIcon,
} from "@phosphor-icons/react";

import { MaterialsPanel } from "@/components/workspace/materials-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type WorkspaceLesson = {
  id: string;
  title: string;
  summary: string | null;
  estimatedMinutes: number | null;
};

export type WorkspaceSection = {
  key: string;
  title: string;
  summary: string | null;
  lessons: WorkspaceLesson[];
};

export type WorkspaceChat = {
  id: string;
  topic: string | null;
  updatedAt: string;
};

export type WorkspaceMaterial = {
  id: string;
  label: string;
  mimeType: string | null;
  size: number | null;
  createdAt: string;
};

export type ContinueTarget = {
  lessonId: string;
  lessonTitle: string;
};

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

const TAB_VALUES = ["lessons", "chats", "materials"];

export function WorkspaceTabs({
  courseId,
  sections,
  chats,
  materials,
  continueTarget,
}: {
  courseId: string;
  sections: WorkspaceSection[];
  chats: WorkspaceChat[];
  materials: WorkspaceMaterial[];
  continueTarget: ContinueTarget | null;
}) {
  // URL-driven so sidebar deep links (?tab=materials) work from anywhere.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab") ?? "lessons";
  const tab = TAB_VALUES.includes(requested) ? requested : "lessons";
  const setTab = (value: string) => {
    router.replace(
      value === "lessons" ? pathname : `${pathname}?tab=${value}`,
      { scroll: false },
    );
  };
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filteredSections = useMemo(() => {
    if (!normalizedQuery) {
      return sections;
    }
    return sections
      .map((section) => ({
        ...section,
        lessons: section.lessons.filter((lesson) =>
          lesson.title.toLowerCase().includes(normalizedQuery),
        ),
      }))
      .filter((section) => section.lessons.length > 0);
  }, [sections, normalizedQuery]);

  const filteredChats = useMemo(() => {
    if (!normalizedQuery) {
      return chats;
    }
    return chats.filter((chat) =>
      (chat.topic ?? "New chat").toLowerCase().includes(normalizedQuery),
    );
  }, [chats, normalizedQuery]);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as string)}>
      <TabsList variant="line">
        <TabsTrigger value="lessons">Lessons</TabsTrigger>
        <TabsTrigger value="chats">Chats</TabsTrigger>
        <TabsTrigger value="materials">Materials</TabsTrigger>
      </TabsList>

      <div className="relative mt-3 mb-4">
        <MagnifyingGlassIcon className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            tab === "lessons"
              ? "Filter lessons..."
              : tab === "chats"
                ? "Filter chats..."
                : "Filter materials..."
          }
          className="h-8 pl-8"
        />
      </div>

      <TabsContent value="lessons" className="space-y-6">
        {continueTarget && !normalizedQuery ? (
          <Card className="border-primary/25 bg-accent/40">
            <CardContent className="flex items-center justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-medium tracking-wide text-primary uppercase">
                  Continue
                </p>
                <p className="truncate text-sm font-medium">
                  {continueTarget.lessonTitle}
                </p>
              </div>
              <Button
                size="sm"
                render={
                  <Link
                    href={`/courses/${courseId}/lessons/${continueTarget.lessonId}/learn`}
                  />
                }
              >
                Resume
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {filteredSections.length === 0 ? (
          <EmptyState>
            <p>No lessons match your filter.</p>
          </EmptyState>
        ) : (
          filteredSections.map((section) => (
            <section key={section.key}>
              <div className="mb-2">
                <h3 className="font-heading text-base font-medium tracking-tight">
                  {section.title}
                </h3>
                {section.summary ? (
                  <p className="text-sm text-muted-foreground">
                    {section.summary}
                  </p>
                ) : null}
              </div>
              <div className="divide-y rounded-xl border bg-card">
                {section.lessons.map((lesson, index) => (
                  <div
                    key={lesson.id}
                    className="flex items-center justify-between gap-4 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        <span className="mr-2 text-muted-foreground">
                          {index + 1}.
                        </span>
                        {lesson.title}
                      </p>
                      <p className="flex items-center gap-3 text-xs text-muted-foreground">
                        {lesson.summary ? (
                          <span className="truncate">{lesson.summary}</span>
                        ) : null}
                        {lesson.estimatedMinutes ? (
                          <span className="flex shrink-0 items-center gap-1">
                            <ClockIcon className="size-3" />
                            {lesson.estimatedMinutes} min
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      render={
                        <Link
                          href={`/courses/${courseId}/lessons/${lesson.id}/learn`}
                        />
                      }
                    >
                      Start lesson
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </TabsContent>

      <TabsContent value="chats">
        {filteredChats.length === 0 ? (
          <EmptyState>
            <p>No chats yet.</p>
            <p>
              Use the composer above to ask a question or drop in material.
            </p>
          </EmptyState>
        ) : (
          <div className="divide-y rounded-xl border bg-card">
            {filteredChats.map((chat) => (
              <Link
                key={chat.id}
                href={`/courses/${courseId}/chats/${chat.id}`}
                className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <ChatCircleIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {chat.topic ?? "New chat"}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(chat.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="materials">
        <MaterialsPanel
          courseId={courseId}
          initialMaterials={materials}
          filter={normalizedQuery}
        />
      </TabsContent>
    </Tabs>
  );
}
