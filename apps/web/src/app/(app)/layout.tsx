import { AppSidebar } from "@/components/app-sidebar";
import { CommandPalette } from "@/components/command-palette";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getEnrolledCourses, getRecentChats } from "@/lib/enrollments";
import { requireLearnerContext } from "@/lib/learner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await requireLearnerContext();

  const [enrolledCourses, recentChats] = await Promise.all([
    getEnrolledCourses(context),
    getRecentChats(context, { limit: 40 }),
  ]);

  const courses = enrolledCourses.map((course) => ({
    id: course.id,
    title: course.title,
    lessons: course.lessons,
    chats: recentChats
      .filter((chat) => chat.courseId === course.id)
      .map((chat) => ({ id: chat.id, topic: chat.topic })),
  }));

  return (
    <SidebarProvider>
      <AppSidebar
        courses={courses.map(({ id, title, chats }) => ({ id, title, chats }))}
      />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
      <CommandPalette courses={courses} />
    </SidebarProvider>
  );
}
