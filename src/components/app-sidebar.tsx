import { Link, useRouterState } from "@tanstack/react-router";
import {
  Blocks,
  BookOpen,
  ChevronLeft,
  ExternalLink,
  FolderKanban,
  HeartHandshake,
  LayoutDashboard,
  Plug,
  Workflow,
} from "lucide-react";
import { ChannelAvatar } from "@/components/channel-avatar";
import { useHiddenChannelIds } from "@/lib/channel-privacy";
import { PROCESS_META, PROCESS_ORDER } from "@/lib/domain";
import { useChannels, useProject } from "@/lib/store";
import { cn } from "@/lib/utils";

const processSlug = (process: string) =>
  process === "editing" ? "edit" : process === "publishing" ? "publish" : process;

export function AppSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const channels = useChannels();
  const hiddenChannelIds = useHiddenChannelIds();
  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const project = useProject(projectMatch?.[1] ?? "");
  const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
  const channelId = channelMatch?.[1] ?? project?.channelId;
  const channel = channels.find((item) => item.id === channelId);

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/80 backdrop-blur sm:w-64">
      <Link
        to="/dashboard"
        className="flex items-center justify-center gap-2 px-2 py-3 hover:bg-sidebar-accent/40 sm:justify-start sm:px-3"
      >
        <div className="grid size-9 place-items-center rounded-lg gradient-brand">
          <span className="font-mono text-sm font-bold text-white">CF</span>
        </div>
        <span className="hidden truncate text-sm font-semibold sm:block">ContentFlow OS</span>
      </Link>
      <nav className="flex-1 space-y-1 overflow-y-auto px-1 py-2 sm:px-2">
        {!channel && !project && (
          <>
            <SectionLabel>Navegação</SectionLabel>
            <NavItem
              icon={LayoutDashboard}
              label="Visão geral"
              to="/dashboard"
              active={pathname === "/dashboard" || pathname === "/"}
            />
            <NavItem
              icon={Workflow}
              label="Métodos"
              to="/methods"
              active={pathname === "/methods" || pathname === "/metodos"}
            />
            <NavItem icon={Plug} label="Plugins" to="/plugins" active={pathname === "/plugins"} />
            <SectionLabel>Seus canais</SectionLabel>
            {channels.map((item) => (
              <NavItem
                key={item.id}
                label={item.name}
                to={`/channel/${item.id}`}
                active={pathname.startsWith(`/channel/${item.id}`)}
                leading={<ChannelAvatar channel={item} size="sm" className="!size-5 !text-[9px]" />}
                contentHidden={hiddenChannelIds.has(item.id)}
              />
            ))}
          </>
        )}
        {!project && channel && (
          <>
            <Back to="/dashboard" label="Visão geral" />
            <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-border/60 bg-background/30 px-1 py-2 sm:justify-start sm:px-2.5">
              <ChannelAvatar channel={channel} size="sm" />
              <div className="hidden min-w-0 sm:block">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Canal</p>
                <p className="truncate text-sm font-semibold">{channel.name}</p>
              </div>
            </div>
            <SectionLabel>Canal</SectionLabel>
            <NavItem
              icon={Blocks}
              label="Métodos de Criação"
              to={`/channel/${channel.id}/methods`}
              active={pathname === `/channel/${channel.id}/methods`}
            />
            <NavItem
              icon={BookOpen}
              label="Biblioteca estratégica"
              to={`/channel/${channel.id}/library`}
              active={pathname === `/channel/${channel.id}/library`}
            />
            <NavItem
              icon={FolderKanban}
              label="Projetos"
              to={`/channel/${channel.id}`}
              active={pathname === `/channel/${channel.id}`}
            />
          </>
        )}
        {project && channel && (
          <>
            <Back to={`/channel/${channel.id}`} label={channel.name} />
            <div className="mt-2 hidden rounded-md border border-border/60 bg-background/30 p-2.5 sm:block">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Projeto</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{project.title}</p>
            </div>
            <SectionLabel>Processos</SectionLabel>
            {PROCESS_ORDER.map((process, index) => (
              <NavItem
                key={process}
                icon={PROCESS_META[process].icon}
                label={`${String(index + 1).padStart(2, "0")} · ${PROCESS_META[process].label}`}
                to={`/project/${project.id}/${processSlug(process)}`}
                active={pathname === `/project/${project.id}/${processSlug(process)}`}
              />
            ))}
            <SectionLabel>Canal</SectionLabel>
            <NavItem
              icon={Blocks}
              label="Métodos de Criação"
              to={`/channel/${channel.id}/methods`}
              active={pathname === `/channel/${channel.id}/methods`}
            />
            <NavItem
              icon={BookOpen}
              label="Biblioteca estratégica"
              to={`/channel/${channel.id}/library`}
              active={pathname === `/channel/${channel.id}/library`}
            />
          </>
        )}
      </nav>
      <div className="border-t border-sidebar-border p-2 sm:p-3">
        <a
          href="https://contentflow-vip.netlify.app/"
          target="_blank"
          rel="noreferrer"
          title="Quer participar do desenvolvimento do ContentFlow OS?"
          aria-label="Quer participar do desenvolvimento do ContentFlow OS? Abrir página em uma nova aba"
          className="group flex items-center justify-center gap-2 rounded-lg border border-brand/25 bg-brand/10 px-2 py-2.5 text-brand-soft transition hover:border-brand/40 hover:bg-brand/15 sm:justify-start sm:px-3"
        >
          <HeartHandshake className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 text-xs font-medium leading-snug sm:block">
            Quer participar do desenvolvimento do ContentFlow OS?
          </span>
          <ExternalLink className="hidden size-3.5 shrink-0 opacity-60 transition group-hover:opacity-100 sm:block" />
        </a>
      </div>
      <div className="hidden border-t border-sidebar-border p-3 text-xs text-muted-foreground sm:block">
        Dados locais deste dispositivo
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-4 hidden px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70 sm:block">
      {children}
    </p>
  );
}
function NavItem({
  icon: Icon,
  label,
  to,
  active,
  leading,
  contentHidden = false,
}: {
  icon?: typeof LayoutDashboard;
  label: string;
  to: string;
  active: boolean;
  leading?: React.ReactNode;
  contentHidden?: boolean;
}) {
  return (
    <Link
      to={to}
      title={contentHidden ? "Canal protegido" : label}
      aria-label={contentHidden ? "Canal protegido" : label}
      className={cn(
        "group flex items-center justify-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition sm:justify-start sm:px-2.5 sm:py-1.5",
        active
          ? "bg-brand/15 text-foreground shadow-[inset_2px_0_0_0_var(--brand)]"
          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid shrink-0 place-items-center transition",
          contentHidden && "select-none blur-sm",
        )}
        aria-hidden={contentHidden}
      >
        {leading ??
          (Icon && (
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-brand-soft" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
          ))}
      </span>
      <span
        className={cn(
          "hidden min-w-0 flex-1 truncate transition sm:block",
          contentHidden && "select-none blur-sm",
        )}
        aria-hidden={contentHidden}
      >
        {label}
      </span>
    </Link>
  );
}
function Back({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      title={`Voltar para ${label}`}
      className="flex items-center justify-center gap-2 rounded-md px-2 py-2 text-xs text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground sm:justify-start sm:px-2.5 sm:py-1.5"
    >
      <ChevronLeft className="size-3.5" />
      <span className="hidden sm:inline">Voltar para {label}</span>
    </Link>
  );
}
