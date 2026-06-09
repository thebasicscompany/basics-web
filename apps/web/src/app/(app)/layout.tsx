import { AppSidebar } from "@/components/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { db } from "@/lib/db";
import { requireLearnerContext } from "@/lib/learner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireLearnerContext();

  const courses = await db.course.findMany({
    where: { status: "active" },
    orderBy: { title: "asc" },
    select: { id: true, title: true },
  });

  return (
    <SidebarProvider>
      <AppSidebar courses={courses} />
      <SidebarInset>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
