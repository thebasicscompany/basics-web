"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  BooksIcon,
  CaretRightIcon,
  ChatCircleIcon,
  FolderSimpleIcon,
  GraduationCapIcon,
  HouseIcon,
  MagnifyingGlassIcon,
  SquaresFourIcon,
} from "@phosphor-icons/react";

import { openCommandPalette } from "@/components/command-palette";
import { NavUser } from "@/components/nav-user";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";

const VISIBLE_CHATS = 4;

export type SidebarCourse = {
  id: string;
  title: string;
  chats: { id: string; topic: string | null }[];
};

export function AppSidebar({ courses }: { courses: SidebarCourse[] }) {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" render={<Link href="/" />}>
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GraduationCapIcon weight="fill" className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-heading font-semibold tracking-tight">
                    Basics
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Learn by talking it through
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger className="shrink-0 text-sidebar-foreground/60 hover:text-sidebar-foreground" />
        </div>
        <button
          type="button"
          onClick={openCommandPalette}
          className="flex h-8 w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background px-2 text-sm text-muted-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.04)] transition-colors hover:text-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <MagnifyingGlassIcon className="size-4 shrink-0" />
          <span className="flex-1 text-left group-data-[collapsible=icon]:hidden">
            Search
          </span>
          <kbd className="pointer-events-none flex items-center gap-0.5 rounded border bg-muted px-1 font-sans text-[10px] font-medium text-muted-foreground group-data-[collapsible=icon]:hidden">
            ⌘K
          </kbd>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/"}
                  render={<Link href="/" />}
                >
                  <HouseIcon weight={pathname === "/" ? "fill" : "regular"} />
                  <span>Home</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === "/courses"}
                  render={<Link href="/courses" />}
                >
                  <BooksIcon
                    weight={pathname === "/courses" ? "fill" : "regular"}
                  />
                  <span>All courses</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>Courses</SidebarGroupLabel>
          <SidebarGroupContent>
            {courses.length === 0 ? (
              <div className="space-y-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                <p>You haven&apos;t enrolled in any courses yet.</p>
                <Button
                  size="xs"
                  variant="outline"
                  className="w-full"
                  render={<Link href="/courses" />}
                >
                  Browse courses
                </Button>
              </div>
            ) : (
              <SidebarMenu>
                {courses.map((course) => (
                  <CourseSection
                    key={course.id}
                    course={course}
                    pathname={pathname}
                  />
                ))}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function CourseSection({
  course,
  pathname,
}: {
  course: SidebarCourse;
  pathname: string;
}) {
  const inCourse = pathname.startsWith(`/courses/${course.id}`);
  const [showAllChats, setShowAllChats] = useState(false);

  const chats = showAllChats
    ? course.chats
    : course.chats.slice(0, VISIBLE_CHATS);

  return (
    <Collapsible defaultOpen={inCourse} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger render={<SidebarMenuButton />}>
          <CaretRightIcon className="transition-transform group-data-[open]/collapsible:rotate-90" />
          <span className="truncate">{course.title}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub>
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                isActive={pathname === `/courses/${course.id}`}
                render={<Link href={`/courses/${course.id}`} />}
              >
                <SquaresFourIcon
                  weight={
                    pathname === `/courses/${course.id}` ? "fill" : "regular"
                  }
                />
                <span>Overview</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
            {chats.map((chat) => {
              const href = `/courses/${course.id}/chats/${chat.id}`;
              const isActive = pathname === href;
              return (
                <SidebarMenuSubItem key={chat.id}>
                  <SidebarMenuSubButton
                    isActive={isActive}
                    render={<Link href={href} />}
                  >
                    <ChatCircleIcon weight={isActive ? "fill" : "regular"} />
                    <span className="truncate">
                      {chat.topic ?? "New chat"}
                    </span>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
            {course.chats.length > VISIBLE_CHATS && !showAllChats ? (
              <SidebarMenuSubItem>
                <SidebarMenuSubButton
                  className="text-muted-foreground"
                  onClick={() => setShowAllChats(true)}
                >
                  <span>Show more</span>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ) : null}
            <SidebarMenuSubItem>
              <SidebarMenuSubButton
                isActive={pathname === `/courses/${course.id}/materials`}
                render={<Link href={`/courses/${course.id}/materials`} />}
              >
                <FolderSimpleIcon
                  weight={
                    pathname === `/courses/${course.id}/materials`
                      ? "fill"
                      : "regular"
                  }
                />
                <span>Materials</span>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}
