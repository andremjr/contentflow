import { Plus, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HumanTaskCenter } from "@/components/human-task-center";

type Crumb = { label: string; to?: string };

export function TopBar({
  breadcrumbs = [],
  title,
  subtitle,
  actions,
  showNewProject = true,
}: {
  breadcrumbs?: Crumb[];
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  showNewProject?: boolean;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="hidden items-center gap-3 px-6 pt-3 text-xs text-muted-foreground sm:flex">
        {breadcrumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="size-3 opacity-60" />}
            <span className={cn(i === breadcrumbs.length - 1 && "text-foreground")}>{c.label}</span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-2">
          <HumanTaskCenter />
          {actions}

          {showNewProject && (
            <Button
              size="sm"
              className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]"
            >
              <Plus className="size-4" />
              Novo projeto
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
