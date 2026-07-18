import { useState, useMemo, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Radio,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  ChevronLeft,
  Command,
  HelpCircle,
  Settings,
  FolderKanban,
  Layers,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  channels,
  projects as allProjects,
  PROCESS_META,
  PROCESS_ORDER,
} from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

const processSlug = (pid: string) =>
  pid === "editing" ? "edit" : pid === "publishing" ? "publish" : pid;

type Level =
  | { kind: "overview" }
  | { kind: "channel"; channelId: string }
  | { kind: "project"; projectId: string; channelId?: string; process?: string };

function useLevel(): Level {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return useMemo<Level>(() => {
    const projectMatch = pathname.match(/^\/project\/([^/]+)(?:\/([^/]+))?/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const process = projectMatch[2];
      const p = allProjects.find((pr) => pr.id === projectId);
      const channelId = p?.channelId ?? projectId.split("-x-")[0];
      return { kind: "project", projectId, channelId, process };
    }
    const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
    if (channelMatch) {
      return { kind: "channel", channelId: channelMatch[1] };
    }
    return { kind: "overview" };
  }, [pathname]);
}

export function AppSidebar({
  onOpenPalette,
}: {
  onOpenPalette: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const level = useLevel();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur transition-[width] duration-200",
        collapsed ? "w-16" : "w-64",
      )}
    >
      {/* Brand / home link */}
      <Link
        to="/dashboard"
        className={cn(
          "flex items-center gap-2 px-3 py-3 hover:bg-sidebar-accent/40",
          collapsed && "justify-center px-0",
        )}
      >
        <div className="grid size-9 shrink-0 place-items-center rounded-lg gradient-brand shadow-[0_8px_24px_-8px_oklch(0.58_0.22_264/0.7)] ring-1 ring-white/10">
          <span className="font-mono text-sm font-bold text-white">CF</span>
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold">ContentFlow OS</span>
        )}
      </Link>

      {/* Command palette */}
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

      {/* Dynamic nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {level.kind === "overview" && (
          <OverviewNav collapsed={collapsed} pathname={pathname} />
        )}
        {level.kind === "channel" && (
          <ChannelNav
            collapsed={collapsed}
            channelId={level.channelId}
            pathname={pathname}
          />
        )}
        {level.kind === "project" && (
          <ProjectNav
            collapsed={collapsed}
            projectId={level.projectId}
            channelId={level.channelId}
            pathname={pathname}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-2", collapsed && "flex-col")}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground"
              >
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
                <p className="truncate text-[10px] text-muted-foreground">
                  Owner
                </p>
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

/* ---------- level: overview ---------- */

function OverviewNav({
  collapsed,
  pathname,
}: {
  collapsed: boolean;
  pathname: string;
}) {
  const isActive = (to: string) => pathname === to || pathname.startsWith(to);
  return (
    <>
      <SectionLabel collapsed={collapsed}>Workspace</SectionLabel>
      <NavItem
        icon={LayoutDashboard}
        label="Visão geral"
        to="/dashboard"
        active={pathname === "/dashboard" || pathname === "/"}
        collapsed={collapsed}
      />

      <SectionLabel collapsed={collapsed} className="mt-4">
        Seus canais
      </SectionLabel>
      {channels.map((c) => (
        <NavItem
          key={c.id}
          label={c.name}
          to={`/channel/${c.id}`}
          active={isActive(`/channel/${c.id}`)}
          collapsed={collapsed}
          leading={
            <ChannelAvatar
              channel={c}
              size="sm"
              className="!size-5 !text-[9px]"
            />
          }
        />
      ))}

    </>
  );
}

/* ---------- level: channel ---------- */

function ChannelNav({
  collapsed,
  channelId,
  pathname,
}: {
  collapsed: boolean;
  channelId: string;
  pathname: string;
}) {
  const channel = channels.find((c) => c.id === channelId);

  const processMatchesActive = PROCESS_ORDER.some((pid) => {
    const to = `/channel/${channelId}/${processSlug(pid)}`;
    return pathname === to;
  });
  const settingsActive =
    pathname === `/channel/${channelId}/settings/processes` ||
    processMatchesActive;

  const [processesOpen, setProcessesOpen] = useState(settingsActive);
  useEffect(() => {
    if (settingsActive) setProcessesOpen(true);
  }, [settingsActive]);

  return (
    <>
      <BackLink to="/dashboard" label="Visão geral" collapsed={collapsed} />

      {channel && (
        <div
          className={cn(
            "mt-2 flex items-center gap-2 rounded-md border border-border/60 bg-background/30 px-2.5 py-2",
            collapsed && "justify-center border-transparent bg-transparent px-0",
          )}
        >
          <ChannelAvatar channel={channel} size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Canal
              </p>
              <p className="truncate text-sm font-semibold">{channel.name}</p>
            </div>
          )}
        </div>
      )}

      <SectionLabel collapsed={collapsed} className="mt-4">
        Canal
      </SectionLabel>
      <NavItem
        icon={FolderKanban}
        label="Projetos"
        to={`/channel/${channelId}`}
        active={pathname === `/channel/${channelId}`}
        collapsed={collapsed}
      />

      {collapsed ? (
        <NavItem
          icon={Wrench}
          label="Configurar processos"
          to={`/channel/${channelId}/settings/processes`}
          active={settingsActive}
          collapsed={collapsed}
        />
      ) : (
        <>
          <button
            type="button"
            onClick={() => setProcessesOpen((v) => !v)}
            className={cn(
              "group flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition",
              settingsActive
                ? "bg-sidebar-accent text-foreground"
                : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
            )}
          >
            <Wrench className="size-4 shrink-0" />
            <span className="flex-1 truncate text-left">Configurar processos</span>
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 transition-transform",
                processesOpen && "rotate-90",
              )}
            />
          </button>
          {processesOpen && (
            <div className="ml-3 mt-0.5 space-y-0.5 border-l border-sidebar-border/60 pl-2">
              {PROCESS_ORDER.map((pid, i) => {
                const meta = PROCESS_META[pid];
                const to = `/channel/${channelId}/${processSlug(pid)}`;
                const active = pathname === to;
                return (
                  <NavItem
                    key={pid}
                    icon={meta.icon}
                    label={meta.label}
                    to={to}
                    active={active}
                    collapsed={collapsed}
                    trailing={
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}


/* ---------- level: project ---------- */

function ProjectNav({
  collapsed,
  projectId,
  channelId,
  pathname,
}: {
  collapsed: boolean;
  projectId: string;
  channelId?: string;
  pathname: string;
}) {
  const project = allProjects.find((p) => p.id === projectId);
  const channel = channels.find(
    (c) => c.id === (channelId ?? project?.channelId),
  );

  const backTo = channel ? `/channel/${channel.id}` : "/dashboard";
  const backLabel = channel ? channel.name : "Visão geral";

  return (
    <>
      <BackLink to={backTo} label={backLabel} collapsed={collapsed} />

      <div
        className={cn(
          "mt-2 rounded-md border border-border/60 bg-background/30 p-2.5",
          collapsed && "flex justify-center border-transparent bg-transparent p-0",
        )}
      >
        {collapsed ? (
          <span className="grid size-8 place-items-center rounded bg-brand/15 font-mono text-[10px] text-brand-soft">
            {project?.assignee.initials ?? "PR"}
          </span>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Projeto
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">
              {project?.title ?? "Projeto"}
            </p>
          </>
        )}
      </div>

      <SectionLabel collapsed={collapsed} className="mt-4">
        Projeto
      </SectionLabel>
      <NavItem
        icon={Layers}
        label="Visão geral"
        to={`/project/${projectId}`}
        active={pathname === `/project/${projectId}`}
        collapsed={collapsed}
      />

      <SectionLabel collapsed={collapsed} className="mt-4">
        Processos
      </SectionLabel>
      {PROCESS_ORDER.map((pid, i) => {
        const meta = PROCESS_META[pid];
        const to = `/project/${projectId}/${pid === "editing" ? "edit" : pid === "publishing" ? "publish" : pid}`;
        const active = pathname === to;
        return (
          <NavItem
            key={pid}
            icon={meta.icon}
            label={meta.label}
            to={to}
            active={active}
            collapsed={collapsed}
            trailing={
              !collapsed && (
                <span className="font-mono text-[9px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
              )
            }
          />
        );
      })}

      <SectionLabel collapsed={collapsed} className="mt-4">
        Configuração
      </SectionLabel>
      {channel && (
        <NavItem
          icon={Wrench}
          label="Configurar processos"
          to={`/channel/${channel.id}/settings/processes`}
          active={pathname.startsWith(`/channel/${channel.id}/settings`)}
          collapsed={collapsed}
        />
      )}
    </>
  );
}

/* ---------- primitives ---------- */

function SectionLabel({
  children,
  collapsed,
  className,
}: {
  children: React.ReactNode;
  collapsed: boolean;
  className?: string;
}) {
  if (collapsed) return <div className={cn("h-2", className)} />;
  return (
    <p
      className={cn(
        "px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70",
        className,
      )}
    >
      {children}
    </p>
  );
}

function NavItem({
  icon: Icon,
  label,
  to,
  active,
  collapsed,
  leading,
  trailing,
}: {
  icon?: typeof LayoutDashboard;
  label: string;
  to: string;
  active: boolean;
  collapsed: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const content = (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition",
        active
          ? "bg-brand/15 text-foreground shadow-[inset_2px_0_0_0_var(--brand)]"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      {leading
        ? leading
        : Icon && (
            <Icon
              className={cn(
                "size-4 shrink-0",
                active
                  ? "text-brand-soft"
                  : "text-muted-foreground group-hover:text-foreground",
              )}
            />
          )}
      {!collapsed && <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!collapsed && trailing}
    </Link>
  );
  return collapsed ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  ) : (
    content
  );
}

function BackLink({
  to,
  label,
  collapsed,
}: {
  to: string;
  label: string;
  collapsed: boolean;
}) {
  const content = (
    <Link
      to={to}
      className={cn(
        "flex items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground",
        collapsed && "justify-center px-0",
      )}
    >
      <ChevronLeft className="size-3.5 shrink-0" />
      {!collapsed && <span className="truncate">Voltar para {label}</span>}
    </Link>
  );
  return collapsed ? (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent side="right">Voltar para {label}</TooltipContent>
    </Tooltip>
  ) : (
    content
  );
}
