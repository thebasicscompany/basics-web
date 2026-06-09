import { cn } from "@/lib/utils";

function PageHeader({
  className,
  ...props
}: React.ComponentProps<"header">) {
  return (
    <header
      data-slot="page-header"
      className={cn(
        "flex flex-wrap items-end justify-between gap-x-6 gap-y-4",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-content"
      className={cn("min-w-0 space-y-2", className)}
      {...props}
    />
  );
}

function PageHeaderEyebrow({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-eyebrow"
      className={cn(
        "text-xs font-semibold tracking-[0.14em] text-primary uppercase",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Docs-style breadcrumb rendered above the page title, e.g.
 * "Courses / Visual JavaScript Fundamentals". Compose with links and
 * <PageBreadcrumbSeparator /> between items.
 */
function PageBreadcrumb({
  className,
  ...props
}: React.ComponentProps<"nav">) {
  return (
    <nav
      data-slot="page-breadcrumb"
      aria-label="Breadcrumb"
      className={cn(
        "flex min-w-0 items-center gap-2 text-sm text-muted-foreground [&_a]:transition-colors [&_a:hover]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PageBreadcrumbSeparator() {
  return (
    <span aria-hidden className="select-none text-border">
      /
    </span>
  );
}

function PageHeaderTitle({
  className,
  ...props
}: React.ComponentProps<"h1">) {
  return (
    <h1
      data-slot="page-header-title"
      className={cn(
        "font-heading text-3xl font-semibold tracking-tight text-balance",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="page-header-description"
      className={cn(
        "max-w-2xl text-sm leading-relaxed text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderMeta({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-meta"
      className={cn(
        "flex flex-wrap items-center gap-2 pt-1 text-sm text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="page-header-actions"
      className={cn("flex shrink-0 items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderContent,
  PageHeaderEyebrow,
  PageBreadcrumb,
  PageBreadcrumbSeparator,
  PageHeaderTitle,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderActions,
};
