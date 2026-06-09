import { AppSidebar } from "@/components/app-sidebar";
import { Separator } from "@/components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
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
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <span className="text-sm font-medium text-muted-foreground">
            Learning workbench
          </span>
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
