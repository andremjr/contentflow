import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HumanTaskCenter } from "@/components/human-task-center";

type Crumb = { label: string; to?: string };

export function TopBar({
  breadcrumbs = [],
  title,
  subtitle,
  utilityActions,
  actions,
  showNewProject = true,
}: {
  breadcrumbs?: Crumb[];
  title: string;
  subtitle?: string;
  utilityActions?: React.ReactNode;
  actions?: React.ReactNode;
  showNewProject?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background">
      <div className="hidden items-center gap-3 px-6 pt-4 text-[11px] text-muted-foreground sm:flex lg:px-8">
        {breadcrumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="size-3 opacity-60" />}
            <span className={cn(i === breadcrumbs.length - 1 && "text-foreground")}>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="flex min-h-20 items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold leading-tight sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          {utilityActions}
          <HumanTaskCenter />
          {actions}

          {showNewProject && (
            <Button size="sm" className="h-9 gap-1.5 text-white">
              <Plus className="size-4" />
              Novo projeto
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
