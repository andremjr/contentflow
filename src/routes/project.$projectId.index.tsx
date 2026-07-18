import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Play,
  MoreHorizontal,
  Check,
  MessageSquare,
  AlertTriangle,
  Clock,
  FileWarning,
  Sparkles,
  Download,
  Copy,
  Archive,
  GitCompareArrows,
  RefreshCw,
  ChevronRight,
  ChevronLeft,
  Layers,
  Settings2,
  History,
  Info,
  CheckCircle2,
  XCircle,
  User,
  Calendar,
  Flame,
  Paperclip,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  projects,
  channels,
  PROCESS_ORDER,
  PROCESS_META,
  STATE_META,
  type ProcessId,
  type ProcessState,
} from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/project/$projectId/")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `${p.title} · ContentFlow OS`
            : "Projeto · ContentFlow OS",
        },
        {
          name: "description",
          content: "Área interna do projeto com processos, artefatos e histórico.",
        },
      ],
    };
  },
  loader: ({ params }) => {
    const project = projects.find((x) => x.id === params.projectId);
    if (!project) throw notFound();
    const channel = channels.find((c) => c.id === project.channelId);
    if (!channel) throw notFound();
    return { project, channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Projeto não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ProjectWorkspace,
});

// ---------- process mock detail ----------

type ProcessDetail = {
  status: ProcessState;
  progress: number;
  artifacts: number;
  comments: number;
  hasError: boolean;
  pendingApproval: boolean;
};

function buildProcessDetails(
  stages: Record<ProcessId, ProcessState>,
): Record<ProcessId, ProcessDetail> {
  const seeds: Record<ProcessId, Partial<ProcessDetail>> = {
    research: { artifacts: 12, comments: 3 },
    ideas: { artifacts: 8, comments: 5 },
    titles: { artifacts: 15, comments: 2 },
    thumbnail: { artifacts: 6, comments: 4 },
    script: { artifacts: 2, comments: 7 },
    narration: { artifacts: 3, comments: 1 },
    assets: { artifacts: 42, comments: 2 },
    editing: { artifacts: 4, comments: 6 },
    publishing: { artifacts: 1, comments: 0 },
  };
  const out = {} as Record<ProcessId, ProcessDetail>;
  PROCESS_ORDER.forEach((p) => {
    const s = stages[p];
    const progress =
      s === "done" || s === "approved"
        ? 100
        : s === "processing"
          ? 65
          : s === "awaiting_review"
            ? 88
            : s === "configuring"
              ? 30
              : s === "error"
                ? 45
                : 0;
    out[p] = {
      status: s,
      progress,
      artifacts: seeds[p].artifacts ?? 0,
      comments: seeds[p].comments ?? 0,
      hasError: s === "error",
      pendingApproval: s === "awaiting_review",
    };
  });
  return out;
}

// ---------- component ----------

function ProjectWorkspace() {
  const { project, channel } = Route.useLoaderData();
  const details = useMemo(
    () => buildProcessDetails(project.stages),
    [project.stages],
  );
  const [selectedProcess, setSelectedProcess] = useState<ProcessId>(
    project.currentStage,
  );
  const [panelOpen, setPanelOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<PanelTab>("details");

  const nextProcess = useMemo(() => {
    const idx = PROCESS_ORDER.indexOf(project.currentStage);
    return PROCESS_ORDER[idx + 1] ?? project.currentStage;
  }, [project.currentStage]);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title={project.title}
          subtitle={`${channel.name} · ${project.duration}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Projetos" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: project.title },
          ]}
        />

        <div className="flex-1 overflow-hidden">
          <div className="flex h-full flex-col">
            {/* Header */}
            <ProjectHeader
              project={project}
              channel={channel}
              nextProcessLabel={PROCESS_META[nextProcess].label}
            />

            {/* Process nav */}
            <ProcessNav
              details={details}
              selected={selectedProcess}
              onSelect={setSelectedProcess}
              current={project.currentStage}
            />

            {/* Body */}
            <div className="flex flex-1 overflow-hidden">
              <ProcessContent
                processId={selectedProcess}
                detail={details[selectedProcess]}
              />
              <SidePanel
                open={panelOpen}
                onToggle={() => setPanelOpen((v) => !v)}
                tab={panelTab}
                onTabChange={setPanelTab}
                processId={selectedProcess}
                detail={details[selectedProcess]}
                project={project}
              />
            </div>
          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------- Header ----------

const PRIORITY = {
  label: "Alta",
  tone: "text-warning bg-warning/15",
  icon: Flame,
};

function ProjectHeader({
  project,
  channel,
  nextProcessLabel,
}: {
  project: (typeof projects)[number];
  channel: (typeof channels)[number];
  nextProcessLabel: string;
}) {
  const state = STATE_META[project.state];
  return (
    <div className="border-b border-border bg-card/40 px-6 py-4">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link
              to="/channel/$channelId"
              params={{ channelId: channel.id }}
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <ChannelAvatar channel={channel} size="sm" />
              <span>{channel.name}</span>
            </Link>
            <span>·</span>
            <span>{channel.handle}</span>
          </div>
          <h1 className="mt-2 truncate text-xl font-semibold tracking-tight">
            {project.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill tone={state.tone} label={state.label} />
            <PriorityPill />
            <MetaChip icon={<Calendar className="h-3 w-3" />}>
              Prev. {project.deadline}
            </MetaChip>
            <MetaChip icon={<User className="h-3 w-3" />}>
              <AssigneeDot
                initials={project.assignee.initials}
                name={project.assignee.name}
              />
            </MetaChip>
            <MetaChip icon={<Clock className="h-3 w-3" />}>
              Atualizado {project.updatedAt}
            </MetaChip>
          </div>
        </div>

        <div className="flex min-w-[240px] flex-col items-end gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Progresso total</span>
            <span className="font-mono text-sm font-semibold text-foreground">
              {project.progress}%
            </span>
          </div>
          <Progress value={project.progress} className="h-2 w-[240px]" />
          <div className="mt-1 flex items-center gap-2">
            <Button size="sm">
              <Play className="mr-1.5 h-3.5 w-3.5" fill="currentColor" />
              Executar {nextProcessLabel}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Mais ações</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Reprocessar etapa atual
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Duplicar projeto
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Exportar tudo
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  <Archive className="mr-2 h-3.5 w-3.5" />
                  Arquivar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: string; label: string }) {
  const toneMap: Record<string, string> = {
    muted: "bg-secondary text-muted-foreground",
    info: "bg-primary/15 text-primary",
    brand: "bg-primary/20 text-primary",
    warning: "bg-warning/15 text-warning",
    success: "bg-emerald-500/15 text-emerald-400",
    done: "bg-emerald-500/15 text-emerald-400",
    error: "bg-destructive/15 text-destructive",
    blocked: "bg-slate-500/15 text-slate-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        toneMap[tone] ?? toneMap.muted,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

function PriorityPill() {
  const Icon = PRIORITY.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        PRIORITY.tone,
      )}
    >
      <Icon className="h-3 w-3" />
      Prioridade {PRIORITY.label}
    </span>
  );
}

function MetaChip({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-[11px] text-muted-foreground">
      {icon}
      {children}
    </span>
  );
}

function AssigneeDot({ initials, name }: { initials: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-semibold text-primary-foreground">
        {initials}
      </span>
      <span>{name}</span>
    </span>
  );
}

// ---------- Process nav ----------

function ProcessNav({
  details,
  selected,
  onSelect,
  current,
}: {
  details: Record<ProcessId, ProcessDetail>;
  selected: ProcessId;
  onSelect: (p: ProcessId) => void;
  current: ProcessId;
}) {
  return (
    <div className="border-b border-border bg-background/60">
      <div className="flex gap-1.5 overflow-x-auto px-6 py-3">
        {PROCESS_ORDER.map((p, i) => {
          const meta = PROCESS_META[p];
          const d = details[p];
          const stateMeta = STATE_META[d.status];
          const isSelected = selected === p;
          const isCurrent = current === p;
          const Icon = meta.icon;

          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(p)}
              className={cn(
                "group relative flex min-w-[168px] shrink-0 flex-col rounded-lg border p-3 text-left transition-all",
                isSelected
                  ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                  : "border-border bg-secondary/30 hover:border-border/80 hover:bg-secondary/50",
              )}
            >
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-md",
                    isSelected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Icon className="h-3 w-3" />
                </div>
                <span
                  className={cn(
                    "truncate text-xs font-semibold",
                    isSelected ? "text-foreground" : "text-foreground/90",
                  )}
                >
                  {meta.label}
                </span>
                {isCurrent && (
                  <span className="ml-auto rounded-full bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary">
                    Atual
                  </span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <span
                  className={cn(
                    "flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium",
                    stateMeta.tone === "success" || stateMeta.tone === "done"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : stateMeta.tone === "error"
                        ? "bg-destructive/15 text-destructive"
                        : stateMeta.tone === "warning"
                          ? "bg-warning/15 text-warning"
                          : stateMeta.tone === "brand" ||
                              stateMeta.tone === "info"
                            ? "bg-primary/15 text-primary"
                            : "bg-secondary text-muted-foreground",
                  )}
                >
                  {stateMeta.label}
                </span>
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-secondary/70">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    d.hasError
                      ? "bg-destructive"
                      : d.status === "done" || d.status === "approved"
                        ? "bg-emerald-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${d.progress}%` }}
                />
              </div>

              <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
                <IndicatorDot
                  icon={<Layers className="h-2.5 w-2.5" />}
                  label={`${d.artifacts}`}
                  tooltip={`${d.artifacts} artefatos`}
                />
                {d.comments > 0 && (
                  <IndicatorDot
                    icon={<MessageSquare className="h-2.5 w-2.5" />}
                    label={`${d.comments}`}
                    tooltip={`${d.comments} comentários`}
                  />
                )}
                {d.hasError && (
                  <IndicatorDot
                    icon={<AlertTriangle className="h-2.5 w-2.5" />}
                    tone="destructive"
                    tooltip="Erro detectado"
                  />
                )}
                {d.pendingApproval && (
                  <IndicatorDot
                    icon={<FileWarning className="h-2.5 w-2.5" />}
                    tone="warning"
                    tooltip="Aprovação pendente"
                  />
                )}
              </div>

              {i < PROCESS_ORDER.length - 1 && (
                <ChevronRight className="pointer-events-none absolute -right-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-border" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function IndicatorDot({
  icon,
  label,
  tone = "muted",
  tooltip,
}: {
  icon: React.ReactNode;
  label?: string;
  tone?: "muted" | "warning" | "destructive";
  tooltip?: string;
}) {
  const toneClass =
    tone === "destructive"
      ? "bg-destructive/15 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "bg-secondary text-muted-foreground";
  const el = (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold",
        toneClass,
      )}
    >
      {icon}
      {label}
    </span>
  );
  if (!tooltip) return el;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{el}</TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

// ---------- Process content ----------

function ProcessContent({
  processId,
  detail,
}: {
  processId: ProcessId;
  detail: ProcessDetail;
}) {
  const meta = PROCESS_META[processId];
  const stateMeta = STATE_META[detail.status];
  const Icon = meta.icon;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-4xl space-y-6 p-8">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Icon className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              Etapa {PROCESS_ORDER.indexOf(processId) + 1} de{" "}
              {PROCESS_ORDER.length}
            </div>
            <h2 className="mt-1 text-2xl font-semibold">{meta.label}</h2>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <StatusPill tone={stateMeta.tone} label={stateMeta.label} />
              <span>· {detail.progress}% concluído</span>
            </div>
          </div>
        </div>

        {detail.hasError && (
          <Alert
            tone="destructive"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Erro na execução"
            description="O modelo retornou uma resposta inconsistente. Verifique a configuração ou gere uma nova versão."
          />
        )}
        {detail.pendingApproval && (
          <Alert
            tone="warning"
            icon={<FileWarning className="h-4 w-4" />}
            title="Aprovação pendente"
            description="Esta etapa está aguardando revisão manual antes de seguir para a próxima."
          />
        )}

        {/* Shared actions */}
        <SharedActions />

        {/* Artefatos placeholder */}
        <section className="rounded-xl border border-border bg-card/50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Artefatos gerados</h3>
              <p className="text-xs text-muted-foreground">
                {detail.artifacts} arquivos disponíveis nesta etapa.
              </p>
            </div>
            <Button variant="ghost" size="sm">
              Ver todos
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: Math.min(6, detail.artifacts || 3) }).map(
              (_, i) => (
                <ArtifactCard key={i} index={i + 1} processId={processId} />
              ),
            )}
          </div>
        </section>

        {/* Prévia */}
        <section className="rounded-xl border border-border bg-card/50 p-6">
          <h3 className="mb-3 text-sm font-semibold">Prévia do resultado</h3>
          <div className="rounded-lg border border-dashed border-border bg-secondary/30 p-8 text-center">
            <Icon className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium">
              Prévia contextual de {meta.label.toLowerCase()}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              O conteúdo específico desta etapa aparece aqui quando gerado.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

function Alert({
  tone,
  icon,
  title,
  description,
}: {
  tone: "warning" | "destructive";
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  const toneClass =
    tone === "destructive"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-warning/40 bg-warning/10 text-warning";
  return (
    <div className={cn("flex gap-3 rounded-lg border p-3", toneClass)}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="mt-0.5 text-xs opacity-90">{description}</div>
      </div>
    </div>
  );
}

function SharedActions() {
  const actions = [
    { icon: Check, label: "Aprovar", primary: true },
    { icon: RefreshCw, label: "Solicitar alteração" },
    { icon: Sparkles, label: "Gerar nova versão" },
    { icon: GitCompareArrows, label: "Comparar versões" },
    { icon: Download, label: "Baixar" },
    { icon: Copy, label: "Copiar" },
    { icon: Archive, label: "Arquivar" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-card/40 p-2">
      {actions.map((a, i) => (
        <Button
          key={a.label}
          variant={a.primary ? "default" : "ghost"}
          size="sm"
          className={cn("h-8", i === 0 && "mr-1")}
        >
          <a.icon className="mr-1.5 h-3.5 w-3.5" />
          {a.label}
        </Button>
      ))}
    </div>
  );
}

function ArtifactCard({
  index,
  processId,
}: {
  index: number;
  processId: ProcessId;
}) {
  const hues = [220, 260, 200, 150, 10, 280];
  const hue = hues[index % hues.length];
  const meta = PROCESS_META[processId];
  const Icon = meta.icon;
  return (
    <div className="group cursor-pointer overflow-hidden rounded-lg border border-border bg-secondary/40 transition-colors hover:border-primary/40">
      <div
        className="relative flex aspect-video items-center justify-center"
        style={{
          background: `linear-gradient(135deg, hsl(${hue} 60% 30%), hsl(${hue + 30} 55% 18%))`,
        }}
      >
        <Icon className="h-6 w-6 text-white/80" />
        <span className="absolute right-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white">
          v{index}
        </span>
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-medium">
          {meta.label} — versão {index}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">
          há {index * 12} min
        </div>
      </div>
    </div>
  );
}

// ---------- Side panel ----------

type PanelTab =
  | "details"
  | "activity"
  | "comments"
  | "history"
  | "config";

const PANEL_TABS: { id: PanelTab; label: string; icon: typeof Info }[] = [
  { id: "details", label: "Detalhes", icon: Info },
  { id: "activity", label: "Atividades", icon: History },
  { id: "comments", label: "Comentários", icon: MessageSquare },
  { id: "history", label: "Versões", icon: Layers },
  { id: "config", label: "Configuração", icon: Settings2 },
];

function SidePanel({
  open,
  onToggle,
  tab,
  onTabChange,
  processId,
  detail,
  project,
}: {
  open: boolean;
  onToggle: () => void;
  tab: PanelTab;
  onTabChange: (t: PanelTab) => void;
  processId: ProcessId;
  detail: ProcessDetail;
  project: (typeof projects)[number];
}) {
  return (
    <div
      className={cn(
        "flex flex-col border-l border-border bg-card/60 transition-[width] duration-200",
        open ? "w-[360px]" : "w-11",
      )}
    >
      <div className="flex items-center justify-between border-b border-border px-2 py-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onToggle}
          aria-label={open ? "Recolher painel" : "Expandir painel"}
        >
          {open ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
        {open && (
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Painel do projeto
          </span>
        )}
        <span className="w-7" />
      </div>

      {open ? (
        <>
          <div className="flex gap-0.5 overflow-x-auto border-b border-border bg-secondary/30 p-1">
            {PANEL_TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onTabChange(t.id)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <t.icon className="h-3 w-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {tab === "details" && (
              <DetailsTab
                project={project}
                processId={processId}
                detail={detail}
              />
            )}
            {tab === "activity" && <ActivityTab />}
            {tab === "comments" && <CommentsTab />}
            {tab === "history" && <HistoryTab processId={processId} />}
            {tab === "config" && <ConfigTab processId={processId} />}
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-2 py-3">
          {PANEL_TABS.map((t) => (
            <Tooltip key={t.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => {
                    onTabChange(t.id);
                    onToggle();
                  }}
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground",
                    tab === t.id && "bg-primary/15 text-primary",
                  )}
                >
                  <t.icon className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left">{t.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsTab({
  project,
  processId,
  detail,
}: {
  project: (typeof projects)[number];
  processId: ProcessId;
  detail: ProcessDetail;
}) {
  const meta = PROCESS_META[processId];
  return (
    <div className="space-y-4 text-sm">
      <Field label="Etapa">{meta.label}</Field>
      <Field label="Status">
        <StatusPill
          tone={STATE_META[detail.status].tone}
          label={STATE_META[detail.status].label}
        />
      </Field>
      <Field label="Progresso da etapa">
        <div className="space-y-1">
          <Progress value={detail.progress} className="h-1.5" />
          <span className="text-xs text-muted-foreground">
            {detail.progress}%
          </span>
        </div>
      </Field>
      <Separator />
      <Field label="Responsável">
        <AssigneeDot
          initials={project.assignee.initials}
          name={project.assignee.name}
        />
      </Field>
      <Field label="Data prevista">{project.deadline}</Field>
      <Field label="Duração estimada">{project.duration}</Field>
      <Field label="Última atualização">{project.updatedAt}</Field>
      <Separator />
      <Field label="Artefatos">{detail.artifacts} arquivos</Field>
      <Field label="Comentários">{detail.comments}</Field>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

const ACTIVITIES = [
  { icon: Sparkles, text: "Nova versão gerada", meta: "IA · há 8 min" },
  {
    icon: CheckCircle2,
    text: "Aprovado por Marina Costa",
    meta: "há 42 min",
    tone: "success" as const,
  },
  { icon: RefreshCw, text: "Etapa reprocessada", meta: "há 1 h" },
  { icon: MessageSquare, text: "3 novos comentários", meta: "há 2 h" },
  {
    icon: XCircle,
    text: "Erro no modelo de narração",
    meta: "há 3 h",
    tone: "destructive" as const,
  },
];

function ActivityTab() {
  return (
    <div className="space-y-3">
      {ACTIVITIES.map((a, i) => (
        <div key={i} className="flex gap-3">
          <div
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              a.tone === "success"
                ? "bg-emerald-500/15 text-emerald-400"
                : a.tone === "destructive"
                  ? "bg-destructive/15 text-destructive"
                  : "bg-primary/15 text-primary",
            )}
          >
            <a.icon className="h-3 w-3" />
          </div>
          <div className="min-w-0 flex-1 border-b border-border/50 pb-3 text-sm">
            <div>{a.text}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {a.meta}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const COMMENTS = [
  {
    author: "Marina Costa",
    initials: "MC",
    text: "Prefiro que a intro fique mais direta, sem preâmbulo.",
    time: "há 12 min",
  },
  {
    author: "Rafael Lima",
    initials: "RL",
    text: "O ritmo em 03:12 caiu, dá para acelerar essa parte.",
    time: "há 1 h",
  },
];

function CommentsTab() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4">
        {COMMENTS.map((c, i) => (
          <div key={i} className="flex gap-2">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
              {c.initials}
            </span>
            <div className="min-w-0 flex-1 rounded-lg bg-secondary/40 p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{c.author}</span>
                <span className="text-[10px] text-muted-foreground">
                  {c.time}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{c.text}</p>
            </div>
          </div>
        ))}
      </div>
      <Separator className="my-3" />
      <div className="space-y-2">
        <Textarea
          placeholder="Escreva um comentário..."
          className="min-h-[70px] text-sm"
        />
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <Paperclip className="h-3.5 w-3.5" />
          </Button>
          <Button size="sm" className="h-7">
            <Send className="mr-1.5 h-3 w-3" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ processId }: { processId: ProcessId }) {
  const versions = [
    { v: 3, label: "Versão atual", time: "há 8 min", author: "IA", active: true },
    { v: 2, label: "Ajuste manual", time: "há 2 h", author: "Marina" },
    { v: 1, label: "Primeira geração", time: "ontem", author: "IA" },
  ];
  return (
    <div className="space-y-2">
      {versions.map((v) => (
        <div
          key={v.v}
          className={cn(
            "rounded-lg border p-3",
            v.active
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-secondary/30",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">
              v{v.v} · {v.label}
            </span>
            {v.active && (
              <Badge
                variant="secondary"
                className="bg-primary/15 text-[9px] text-primary"
              >
                Atual
              </Badge>
            )}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {v.author} · {v.time}
          </div>
          <div className="mt-2 flex gap-1.5">
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
              <GitCompareArrows className="mr-1 h-3 w-3" />
              Comparar
            </Button>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-[11px]">
              <Download className="mr-1 h-3 w-3" />
              Baixar
            </Button>
          </div>
        </div>
      ))}
      <p className="pt-2 text-[10px] text-muted-foreground">
        Histórico da etapa {PROCESS_META[processId].label}.
      </p>
    </div>
  );
}

function ConfigTab({ processId }: { processId: ProcessId }) {
  const rows = [
    { k: "Modelo", v: "gemini-2.5-pro" },
    { k: "Temperatura", v: "0.6" },
    { k: "Idioma", v: "pt-BR" },
    { k: "Requer aprovação", v: "Sim" },
    { k: "Reprocessos permitidos", v: "3" },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-secondary/30 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Configuração utilizada
        </div>
        <div className="mt-1 text-sm font-semibold">
          {PROCESS_META[processId].label}
        </div>
      </div>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((r) => (
          <div
            key={r.k}
            className="flex items-center justify-between px-3 py-2 text-xs"
          >
            <dt className="text-muted-foreground">{r.k}</dt>
            <dd className="font-mono font-medium">{r.v}</dd>
          </div>
        ))}
      </dl>
      <Input value="prompt-narracao-v4" readOnly className="h-8 text-xs" />
      <Button variant="outline" size="sm" className="w-full">
        <Settings2 className="mr-1.5 h-3.5 w-3.5" />
        Abrir configuração da etapa
      </Button>
    </div>
  );
}
