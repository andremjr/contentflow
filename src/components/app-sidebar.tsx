import { Link, useRouterState } from "@tanstack/react-router";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState } from "react";
import {
  Blocks,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FolderKanban,
  GripVertical,
  HeartHandshake,
  Layers3,
  LayoutDashboard,
  Plug,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelAvatar } from "@/components/channel-avatar";
import { AppPreferencesDialog } from "@/components/app-preferences-dialog";
import { useAppPreferences } from "@/lib/app-preferences";
import { useHiddenChannelIds } from "@/lib/channel-privacy";
import { PROCESS_META, type Channel, type UniversalProcess } from "@/lib/domain";
import {
  effectiveProcessOrder,
  projectProcessOrder,
  validateProcessDependencies,
} from "@/lib/process-order";
import { updateProcessOrder, useChannels, useProject } from "@/lib/store";
import { cn } from "@/lib/utils";

const processSlug = (process: string) =>
  process === "editing" ? "edit" : process === "publishing" ? "publish" : process;

export function AppSidebar() {
  const { t } = useAppPreferences();
  const location = useRouterState({ select: (state) => state.location });
  const pathname = location.pathname;
  const channels = useChannels();
  const hiddenChannelIds = useHiddenChannelIds();
  const projectMatch = pathname.match(/^\/project\/([^/]+)/);
  const project = useProject(projectMatch?.[1] ?? "");
  const channelMatch = pathname.match(/^\/channel\/([^/]+)/);
  const channelId = channelMatch?.[1] ?? project?.channelId;
  const channel = channels.find((item) => item.id === channelId);

  return (
    <aside className="sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar sm:w-64">
      <Link
        to="/dashboard"
        aria-label="ContentFlow — Visão geral"
        className="flex h-16 items-center justify-center gap-2.5 border-b border-sidebar-border px-2 hover:bg-sidebar-accent/40 sm:justify-start sm:px-3.5"
      >
        <img
          src="/brand/contentflow-mark.png"
          alt=""
          className="size-10 shrink-0 object-contain"
          width={40}
          height={40}
        />
        <span
          className="hidden truncate text-base font-semibold tracking-tight sm:block"
          data-display-type
        >
          ContentFlow
        </span>
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
              icon={Layers3}
              label="Orquestrador"
              to="/orchestrator"
              active={pathname === "/orchestrator"}
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
            <div className="mt-2 flex items-center justify-center gap-2 border-y border-sidebar-border px-1 py-3 sm:justify-start sm:px-2.5">
              <ChannelAvatar channel={channel} size="sm" />
              <div className="hidden min-w-0 sm:block">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Canal</p>
                <p className="truncate text-sm font-semibold">{channel.name}</p>
              </div>
            </div>
            <SectionLabel>Canal</SectionLabel>
            <MethodsNavGroup
              channel={channel}
              pathname={pathname}
              activeProcess={(location.search as { process?: UniversalProcess }).process}
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
            <div className="mt-2 hidden border-y border-sidebar-border px-2.5 py-3 sm:block">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Projeto</p>
              <p className="mt-0.5 line-clamp-2 text-sm font-semibold">{project.title}</p>
            </div>
            <SectionLabel>Processos</SectionLabel>
            {projectProcessOrder(project, channel).map((process, index) => (
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
        <AppPreferencesDialog />
        <a
          href="https://andremjr.github.io/contentflow/"
          target="_blank"
          rel="noreferrer"
          title={t("Saiba mais sobre o projeto ContentFlow")}
          aria-label={`${t("Saiba mais sobre o projeto ContentFlow")}. ${t("Abrir página em uma nova aba")}`}
          className="group flex items-center justify-center gap-2 rounded-md px-2 py-2.5 text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground sm:justify-start sm:px-3"
        >
          <HeartHandshake className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 text-xs font-medium leading-snug sm:block">
            {t("Saiba mais sobre o projeto ContentFlow")}
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

function MethodsNavGroup({
  channel,
  pathname,
  activeProcess,
}: {
  channel: Channel;
  pathname: string;
  activeProcess?: UniversalProcess;
}) {
  const methodsPath = `/channel/${channel.id}/methods`;
  const active = pathname === methodsPath;
  const [expanded, setExpanded] = useState(active);
  const [order, setOrder] = useState(() => effectiveProcessOrder(channel));
  const [saving, setSaving] = useState(false);
  const { t } = useAppPreferences();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (active) setExpanded(true);
  }, [active]);

  useEffect(() => {
    if (!saving) setOrder(effectiveProcessOrder(channel));
  }, [channel, saving]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (saving || !event.over || event.active.id === event.over.id) return;
    const from = order.indexOf(event.active.id as UniversalProcess);
    const to = order.indexOf(event.over.id as UniversalProcess);
    if (from < 0 || to < 0) return;
    const next = arrayMove(order, from, to);
    if (validateProcessDependencies(next, channel.methods).length) {
      toast.error(t("A nova ordem invalida uma dependência entre Métodos."), {
        description: t(
          "Mova o processo que fornece a entrada para uma posição anterior ao processo que depende dele.",
        ),
      });
      return;
    }
    setOrder(next);
    setSaving(true);
    void updateProcessOrder(channel, next)
      .catch(() => {
        setOrder(effectiveProcessOrder(channel));
        toast.error(
          t("Não foi possível salvar a ordem dos processos. Recarregue e tente novamente."),
        );
      })
      .finally(() => setSaving(false));
  };

  return (
    <div>
      <div
        className={cn(
          "flex items-center rounded-md border-l-2 transition",
          active
            ? "border-l-brand bg-sidebar-accent text-foreground"
            : "border-l-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
        )}
      >
        <Link
          to="/channel/$channelId/methods"
          params={{ channelId: channel.id }}
          search={{ process: undefined }}
          className="flex min-w-0 flex-1 items-center justify-center gap-2.5 px-2 py-2 text-sm font-medium sm:justify-start"
        >
          <Blocks className="size-4 shrink-0" />
          <span className="hidden min-w-0 flex-1 truncate sm:block">Métodos de Criação</span>
        </Link>
        <button
          type="button"
          className="mr-1 hidden size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-background/50 hover:text-foreground sm:grid"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-label={
            expanded ? t("Recolher processos universais") : t("Expandir processos universais")
          }
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="mt-1 border-l border-sidebar-border sm:ml-4 sm:pl-3">
          <p className="hidden px-2 py-1.5 text-[9px] font-medium uppercase text-muted-foreground/70 sm:block">
            {t("Processos universais")}
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <div>
                {order.map((process, index) => (
                  <SortableProcessNavItem
                    key={process}
                    channel={channel}
                    process={process}
                    index={index}
                    active={active && (activeProcess ?? "theme") === process}
                    disabled={saving}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          {saving && (
            <p className="hidden px-2 py-1 text-[10px] text-muted-foreground sm:block">
              {t("Salvando ordem...")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SortableProcessNavItem({
  channel,
  process,
  index,
  active,
  disabled,
}: {
  channel: Channel;
  process: UniversalProcess;
  index: number;
  active: boolean;
  disabled: boolean;
}) {
  const { t } = useAppPreferences();
  const {
    attributes,
    listeners,
    isDragging,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: process, disabled });
  const ProcessIcon = PROCESS_META[process].icon;
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex items-center rounded-md",
        isDragging && "relative z-10 bg-sidebar-accent shadow-md",
      )}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <Link
        to="/channel/$channelId/methods"
        params={{ channelId: channel.id }}
        search={{ process }}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-center gap-2 rounded-md px-1 py-1.5 text-xs transition sm:justify-start sm:px-2",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-foreground",
        )}
      >
        <ProcessIcon className="size-3.5 shrink-0 sm:hidden" />
        <span className="hidden w-4 font-mono text-[9px] opacity-60 sm:block">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="hidden min-w-0 flex-1 truncate sm:block">
          {PROCESS_META[process].label}
        </span>
        <span className="hidden text-[9px] tabular-nums opacity-60 sm:block">
          {channel.methods[process].blocks.length}
        </span>
      </Link>
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        className="mr-1 grid size-6 shrink-0 touch-none cursor-grab place-items-center rounded text-muted-foreground/60 hover:bg-sidebar-accent hover:text-foreground active:cursor-grabbing disabled:cursor-default disabled:opacity-50"
        title={t("Clique, segure e arraste para reordenar")}
        {...attributes}
        {...listeners}
        aria-label={`${t("Reordenar processo")} ${t(PROCESS_META[process].label)}`}
      >
        <GripVertical className="size-3.5" />
      </button>
    </div>
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
        "group flex items-center justify-center gap-2.5 rounded-md px-2 py-2 text-sm font-medium transition sm:justify-start sm:px-2.5 sm:py-2",
        active
          ? "bg-sidebar-accent text-foreground before:h-4 before:w-0.5 before:shrink-0 before:bg-brand sm:before:-ml-2"
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
                active ? "text-foreground" : "text-muted-foreground group-hover:text-foreground",
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
