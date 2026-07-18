import { Bell, Plus, ChevronRight, Search, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

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
      <div className="flex items-center gap-3 px-6 pt-3 text-xs text-muted-foreground">
        {breadcrumbs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            {i > 0 && <ChevronRight className="size-3 opacity-60" />}
            <span
              className={cn(
                i === breadcrumbs.length - 1 && "text-foreground",
              )}
            >
              {c.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && (
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>

        <div className="hidden flex-1 max-w-md lg:block">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar projetos, canais, assets…"
              className="h-9 border-border/60 bg-background/60 pl-8 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden h-9 gap-1.5 border-border/60 bg-background/40 sm:inline-flex"
          >
            <Filter className="size-3.5" />
            Filtros
          </Button>

          {actions}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative size-9 text-muted-foreground"
              >
                <Bell className="size-4" />
                <span className="absolute right-2 top-2 size-1.5 rounded-full bg-brand shadow-[0_0_0_2px_var(--background)]" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuLabel className="flex items-center justify-between">
                <span>Notificações</span>
                <span className="text-[10px] text-muted-foreground">3 novas</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="flex-col items-start gap-0.5">
                <span className="text-sm">Narração aguardando revisão</span>
                <span className="text-[11px] text-muted-foreground">
                  Cortex Finance · há 42 min
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex-col items-start gap-0.5">
                <span className="text-sm">Erro no gerador de roteiro</span>
                <span className="text-[11px] text-muted-foreground">
                  Deep Space Docs · há 1 h
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem className="flex-col items-start gap-0.5">
                <span className="text-sm">Publicação concluída</span>
                <span className="text-[11px] text-muted-foreground">
                  Zen Productivity · ontem
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {showNewProject && (
            <Button size="sm" className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]">
              <Plus className="size-4" />
              Novo projeto
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
