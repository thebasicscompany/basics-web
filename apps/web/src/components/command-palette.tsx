"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BooksIcon,
  ChatCircleIcon,
  GraduationCapIcon,
  HouseIcon,
  PlayIcon,
} from "@phosphor-icons/react";

import {
  CommandDialog,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export const OPEN_COMMAND_PALETTE_EVENT = "basics:open-command-palette";

/** Dispatch from anywhere (e.g. the sidebar search field) to open the palette. */
export function openCommandPalette() {
  window.dispatchEvent(new Event(OPEN_COMMAND_PALETTE_EVENT));
}

export type PaletteCourse = {
  id: string;
  title: string;
  lessons: { id: string; title: string }[];
  chats: { id: string; topic: string | null }[];
};

export function CommandPalette({ courses }: { courses: PaletteCourse[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    const onOpenRequest = () => setOpen(true);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener(OPEN_COMMAND_PALETTE_EVENT, onOpenRequest);
    };
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Search"
      description="Search courses, lessons, and chats"
    >
      <Command>
        <CommandInput placeholder="Search courses, lessons, chats..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup heading="Go to">
            <CommandItem onSelect={() => go("/")}>
              <HouseIcon />
              Home
            </CommandItem>
            <CommandItem onSelect={() => go("/courses")}>
              <BooksIcon />
              All courses
            </CommandItem>
          </CommandGroup>
          {courses.length > 0 ? (
            <CommandGroup heading="Courses">
              {courses.map((course) => (
                <CommandItem
                  key={course.id}
                  value={`course ${course.title}`}
                  onSelect={() => go(`/courses/${course.id}`)}
                >
                  <GraduationCapIcon />
                  {course.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {courses.some((course) => course.lessons.length > 0) ? (
            <CommandGroup heading="Lessons">
              {courses.flatMap((course) =>
                course.lessons.map((lesson) => (
                  <CommandItem
                    key={lesson.id}
                    value={`lesson ${course.title} ${lesson.title}`}
                    onSelect={() =>
                      go(`/courses/${course.id}/lessons/${lesson.id}/learn`)
                    }
                  >
                    <PlayIcon />
                    <span className="truncate">{lesson.title}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {course.title}
                    </span>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          ) : null}
          {courses.some((course) => course.chats.length > 0) ? (
            <CommandGroup heading="Chats">
              {courses.flatMap((course) =>
                course.chats.map((chat) => (
                  <CommandItem
                    key={chat.id}
                    value={`chat ${course.title} ${chat.topic ?? "new chat"}`}
                    onSelect={() => go(`/courses/${course.id}/chats/${chat.id}`)}
                  >
                    <ChatCircleIcon />
                    <span className="truncate">{chat.topic ?? "New chat"}</span>
                    <span className="ml-auto truncate text-xs text-muted-foreground">
                      {course.title}
                    </span>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
