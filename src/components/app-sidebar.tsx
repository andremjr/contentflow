import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Radio,
  FolderKanban,
  Library,
  LayoutTemplate,
  Workflow,
  Plug,
  Settings,
  HelpCircle,
  ChevronsLeft,
  ChevronsRight,
  HardDrive,
  ChevronDown,
  Command,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { label: "Visão geral", icon: LayoutDashboard, to: "/" },
  { label: "Canais", icon: Radio, to: "/channels" },
  { label: "Projetos", icon: FolderKanban, to: "/projects" },
  { label: "Biblioteca", icon: Library, to: "/library" },
  { label: "Modelos", icon: LayoutTemplate, to: "/templates" },
  { label: "Processos", icon: Workflow, to: "/processes" },
  { label: "Integrações", icon: Plug, to: "/integrations" },
  { label: "Configurações", icon: Settings, to: "/settings" },
];

export function AppSidebar({
  onOpenPalette,
}: {
  onOpenPalette: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Workspace switcher */}
      <div className="flex items-center gap-2 px-3 py-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg gradient-brand shadow-[0_8px_24px_-8px_oklch(0.58_0.22_264/0.7)] ring-1 ring-white/10">
          <span className="font-mono text-sm font-bold text-white">CF</span>
        </div>
        {!collapsed && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded-md px-1.5 py-1 text-left hover:bg-sidebar-accent">
                <div className="min-w-0">
                  <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                    Workspace
                  </p>
                  <p className="truncate text-sm font-semibold">ContentFlow OS</p>
                </div>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
              <DropdownMenuItem>ContentFlow OS</DropdownMenuItem>
              <DropdownMenuItem>Studio Interno</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Criar workspace…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Command palette shortcut */}
      <div className="px-3 pb-2">
        <button
          onClick={onOpenPalette}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground transition hover:border-brand/40 hover:text-foreground",
            collapsed && "justify-center px-0",
          )}
        >
          <Command className="size-3.5" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">Buscar…</span>
              <kbd className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px]">
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {NAV.map((item) => {
          const active =
            item.to === "/"
              ? pathname === "/"
              : pathname.startsWith(item.to);
          const content = (
            <Link
              to={item.to}
              className={cn(
                "group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition",
                active
                  ? "bg-brand/15 text-foreground shadow-[inset_2px_0_0_0_var(--brand)]"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                collapsed && "justify-center px-0",
              )}
            >
              <item.icon
                className={cn(
                  "size-4 shrink-0",
                  active ? "text-brand-soft" : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip key={item.to} delayDuration={0}>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.to}>{content}</div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        {!collapsed && (
          <div className="mb-3 rounded-lg border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <HardDrive className="size-3" />
                Armazenamento
              </span>
              <span className="font-mono text-foreground">64%</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/40">
              <div className="h-full w-[64%] gradient-brand" />
            </div>
            <p className="mt-1.5 font-mono text-[10px] text-muted-foreground">
              128 GB / 200 GB
            </p>
          </div>
        )}

        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                <HelpCircle className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Central de ajuda</TooltipContent>
          </Tooltip>

          {!collapsed ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 hover:bg-sidebar-accent">
              <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft text-[10px] font-bold text-white">
                LU
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">Lucas Andrade</p>
                <p className="truncate text-[10px] text-muted-foreground">Owner</p>
              </div>
            </div>
          ) : (
            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft text-[10px] font-bold text-white">
              LU
            </div>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
                onClick={() => setCollapsed((c) => !c)}
              >
                {collapsed ? (
                  <ChevronsRight className="size-4" />
                ) : (
                  <ChevronsLeft className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expandir" : "Recolher"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
