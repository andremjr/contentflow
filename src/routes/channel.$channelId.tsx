import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Users,
  Languages,
  CalendarClock,
  Activity,
  FolderKanban,
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  LayoutGrid,
  Table as TableIcon,
  Calendar as CalendarIcon,
  Search,
  Filter,
  Settings2,
  ExternalLink,
  ArrowUpRight,
  ChevronRight,
  Sparkles,
  History,
  Palette,
  Library,
  Workflow,
  X,
  FileText,
  Image as ImageIcon,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { PipelineTrack } from "@/components/pipeline-track";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  channels,
  projects as allProjects,
  PROCESS_META,
  PROCESS_ORDER,
  STATE_META,
  type Project,
  type ProcessId,
  type ProcessState,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/channel/$channelId")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch ? `${ch.name} — ContentFlow OS` : "Canal — ContentFlow OS";
    const description = ch
      ? `Workspace do canal ${ch.name}: projetos, pipeline, biblioteca e configurações.`
      : "Workspace do canal.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  loader: ({ params }) => {
    const channel = channels.find((c) => c.id === params.channelId);
    if (!channel) throw notFound();
    return { channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Canal não encontrado</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Verifique o identificador ou volte ao dashboard.
          </p>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ChannelWorkspace,
});

// ---------- helpers ----------

const STATUS_META: Record<
  "healthy" | "attention" | "paused",
  { label: string; dot: string; text: string; bg: string }
> = {
  healthy: {
    label: "Saudável",
    dot: "bg-success",
    text: "text-success",
    bg: "bg-success/10 border-success/30",
  },
  attention: {
    label: "Requer atenção",
    dot: "bg-warning",
    text: "text-warning",
    bg: "bg-warning/10 border-warning/30",
  },
  paused: {
    label: "Pausado",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
    bg: "bg-muted/30 border-border",
  },
};

const PRIORITY_META = {
  high: { label: "Alta", cls: "border-destructive/40 bg-destructive/10 text-destructive" },
  medium: { label: "Média", cls: "border-warning/40 bg-warning/10 text-warning" },
  low: { label: "Baixa", cls: "border-info/40 bg-info/10 text-info" },
} as const;

function stateBadge(state: ProcessState) {
  const meta = STATE_META[state];
  const tone = meta.tone;
  const cls =
    tone === "success" || tone === "done"
      ? "border-success/40 bg-success/10 text-success"
      : tone === "brand"
        ? "border-brand/40 bg-brand/15 text-brand-soft"
        : tone === "warning"
          ? "border-warning/40 bg-warning/10 text-warning"
          : tone === "error" || tone === "blocked"
            ? "border-destructive/40 bg-destructive/10 text-destructive"
            : tone === "info"
              ? "border-info/40 bg-info/10 text-info"
              : "border-border bg-muted/30 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
        cls,
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {meta.label}
    </span>
  );
}

// Extra mock projects to make the workspace feel populated
type ChannelProject = Project & {
  priority: "high" | "medium" | "low";
  createdAt: string;
  publishAt: string;
  provisionalTitle: string;
};

function buildProjectsForChannel(channelId: string): ChannelProject[] {
  const base = allProjects.filter((p) => p.channelId === channelId);
  const extraTitles = [
    "Os limites do universo observável",
    "Como a inflação corrói silenciosamente sua carteira",
    "A linguagem visual do neo-noir contemporâneo",
    "Sistema de foco profundo em 4 blocos",
    "Buracos de minhoca são realmente possíveis?",
    "O colapso do sistema bancário sombra",
  ];
  const extras: ChannelProject[] = extraTitles.map((title, i) => {
    const stage = PROCESS_ORDER[(i + 2) % PROCESS_ORDER.length];
    const states: ProcessState[] = [
      "processing",
      "awaiting_review",
      "configuring",
      "approved",
      "error",
      "done",
    ];
    const state = states[i % states.length];
    const stages = {} as Record<ProcessId, ProcessState>;
    const idx = PROCESS_ORDER.indexOf(stage);
    PROCESS_ORDER.forEach((p, j) => {
      if (j < idx) stages[p] = "done";
      else if (j === idx) stages[p] = state;
      else stages[p] = "not_started";
    });
    return {
      id: `${channelId}-x-${i}`,
      channelId,
      title,
      currentStage: stage,
      state,
      progress: 10 + ((i * 17) % 85),
      deadline: `${10 + i} dez`,
      duration: `${10 + i}:${(i * 7) % 60 < 10 ? "0" : ""}${(i * 7) % 60}`,
      updatedAt: `há ${i + 1} h`,
      stages,
      assignee: {
        name: ["Marina Costa", "Rafael Lima", "Ana Prado", "Bruno Reis", "Carla Nunes", "Lucas Andrade"][i % 6],
        initials: ["MC", "RL", "AP", "BR", "CN", "LU"][i % 6],
      },
      thumbHue: (i * 47) % 360,
      priority: (["high", "medium", "low"] as const)[i % 3],
      createdAt: `0${(i % 9) + 1} nov`,
      publishAt: `${12 + i} dez · 18h`,
      provisionalTitle: title,
    };
  });
  const enrichedBase: ChannelProject[] = base.map((p, i) => ({
    ...p,
    priority: (["high", "medium", "low"] as const)[i % 3],
    createdAt: `${5 + i} nov`,
    publishAt: `${20 + i} nov · 18h`,
    provisionalTitle: p.title,
  }));
  return [...enrichedBase, ...extras];
}

// ---------- component ----------

function ChannelWorkspace() {
  const { channel } = Route.useLoaderData();
  const projects = useMemo(() => buildProjectsForChannel(channel.id), [channel.id]);

  const [tab, setTab] = useState("projects");
  const [view, setView] = useState<"table" | "cards" | "calendar">("table");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [processFilter, setProcessFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<string>("all");
  const [selected, setSelected] = useState<ChannelProject | null>(null);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== "all" && p.state !== statusFilter) return false;
      if (processFilter !== "all" && p.currentStage !== processFilter) return false;
      if (priorityFilter !== "all" && p.priority !== priorityFilter) return false;
      if (assigneeFilter !== "all" && p.assignee.initials !== assigneeFilter) return false;
      return true;
      void periodFilter;
    });
  }, [projects, search, statusFilter, processFilter, priorityFilter, assigneeFilter, periodFilter]);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((p) => map.set(p.assignee.initials, p.assignee.name));
    return Array.from(map.entries());
  }, [projects]);

  // pipeline aggregation
  const pipelineCounts = useMemo(() => {
    const c: Record<ProcessId, { total: number; errors: number; review: number }> = Object.fromEntries(
      PROCESS_ORDER.map((id) => [id, { total: 0, errors: 0, review: 0 }]),
    ) as never;
    projects.forEach((p) => {
      c[p.currentStage].total += 1;
      if (p.state === "error" || p.state === "blocked") c[p.currentStage].errors += 1;
      if (p.state === "awaiting_review") c[p.currentStage].review += 1;
    });
    return c;
  }, [projects]);

  const status = STATUS_META[channel.status as keyof typeof STATUS_META];
  const activeCount = projects.filter((p) => p.state !== "done").length;
  const publishedCount = projects.filter((p) => p.state === "done").length;
  const errorCount = projects.filter((p) => p.state === "error" || p.state === "blocked").length;

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[
          { label: "ContentFlow OS" },
          { label: "Canais", to: "/channels" },
          { label: channel.name },
        ]}
        title={channel.name}
        subtitle={`${channel.handle} · ${channel.niche}`}
      />

      <main className="flex-1 space-y-6 px-6 py-6">
        {/* Channel header */}
        <section className="glass rounded-2xl border border-border/60 p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-start">
            <ChannelAvatar channel={channel} size="lg" className="!size-20 !text-2xl" />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">{channel.name}</h2>
                <span className="font-mono text-xs text-muted-foreground">{channel.handle}</span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    status.bg,
                    status.text,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                <InfoItem icon={Sparkles} label="Nicho" value={channel.niche} />
                <InfoItem icon={Languages} label="Idioma" value={channel.language} />
                <InfoItem icon={Users} label="Inscritos" value={channel.subscribers} />
                <InfoItem icon={CalendarClock} label="Frequência" value={channel.frequency} />
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 gap-1.5 border-border/60 bg-background/40">
                <ExternalLink className="size-3.5" />
                Ver no YouTube
              </Button>
              <Button size="sm" className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]">
                <Plus className="size-4" />
                Novo projeto
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-9 text-muted-foreground">
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Ações do canal</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Editar identidade</DropdownMenuItem>
                  <DropdownMenuItem>Duplicar configurações</DropdownMenuItem>
                  <DropdownMenuItem>Exportar dados</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Pausar canal</DropdownMenuItem>
                  <DropdownMenuItem className="text-destructive">
                    Arquivar canal
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-10 bg-muted/30 p-1">
            <TabsTrigger value="projects" className="gap-1.5 text-xs">
              <FolderKanban className="size-3.5" /> Projetos
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5 text-xs">
              <CalendarIcon className="size-3.5" /> Calendário
            </TabsTrigger>
            <TabsTrigger value="library" className="gap-1.5 text-xs">
              <Library className="size-3.5" /> Biblioteca
            </TabsTrigger>
            <TabsTrigger value="processes" className="gap-1.5 text-xs">
              <Workflow className="size-3.5" /> Processos
            </TabsTrigger>
            <TabsTrigger value="identity" className="gap-1.5 text-xs">
              <Palette className="size-3.5" /> Identidade
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 text-xs">
              <History className="size-3.5" /> Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="projects" className="mt-6 space-y-6">
            {/* Operational summary */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
              <SummaryCard
                icon={FolderKanban}
                label="Projetos ativos"
                value={String(activeCount)}
                delta="+2 esta semana"
                tone="brand"
              />
              <SummaryCard
                icon={CheckCircle2}
                label="Vídeos publicados"
                value={String(publishedCount)}
                delta="+4 este mês"
                tone="success"
              />
              <SummaryCard
                icon={CalendarClock}
                label="Próxima publicação"
                value={channel.nextPublish.split(" · ")[0]}
                delta={channel.nextPublish.split(" · ")[1] ?? ""}
                tone="info"
              />
              <SummaryCard
                icon={Clock}
                label="Tempo médio por projeto"
                value="3d 4h"
                delta="−11h vs. média"
                tone="brand"
              />
              <SummaryCard
                icon={AlertTriangle}
                label="Processos com erro"
                value={String(errorCount)}
                delta="requer atenção"
                tone="error"
              />
              <SummaryCard
                icon={TrendingUp}
                label="Conclusão no prazo"
                value="86%"
                delta="+3% vs. mês passado"
                tone="success"
              />
            </section>

            {/* Pipeline */}
            <section className="glass rounded-2xl border border-border/60 p-5">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Pipeline do canal</h3>
                  <p className="text-xs text-muted-foreground">
                    Distribuição atual dos projetos pelas nove etapas.
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground">
                  <Settings2 className="size-3.5" />
                  Configurar
                </Button>
              </div>
              <PipelineChannel counts={pipelineCounts} />
            </section>

            {/* Filters + views */}
            <section className="space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar projeto…"
                      className="h-9 border-border/60 bg-background/60 pl-8 text-xs"
                    />
                  </div>

                  <FilterSelect
                    icon={Filter}
                    value={statusFilter}
                    onChange={setStatusFilter}
                    placeholder="Status"
                    options={[
                      { value: "all", label: "Todos status" },
                      ...Object.entries(STATE_META).map(([v, m]) => ({ value: v, label: m.label })),
                    ]}
                  />
                  <FilterSelect
                    icon={Workflow}
                    value={processFilter}
                    onChange={setProcessFilter}
                    placeholder="Processo"
                    options={[
                      { value: "all", label: "Todos processos" },
                      ...PROCESS_ORDER.map((p) => ({ value: p, label: PROCESS_META[p].label })),
                    ]}
                  />
                  <FilterSelect
                    icon={Users}
                    value={assigneeFilter}
                    onChange={setAssigneeFilter}
                    placeholder="Responsável"
                    options={[
                      { value: "all", label: "Todos responsáveis" },
                      ...assignees.map(([initials, name]) => ({ value: initials, label: name })),
                    ]}
                  />
                  <FilterSelect
                    icon={CalendarIcon}
                    value={periodFilter}
                    onChange={setPeriodFilter}
                    placeholder="Período"
                    options={[
                      { value: "all", label: "Todo período" },
                      { value: "7d", label: "Últimos 7 dias" },
                      { value: "30d", label: "Últimos 30 dias" },
                      { value: "quarter", label: "Este trimestre" },
                    ]}
                  />
                  <FilterSelect
                    icon={AlertTriangle}
                    value={priorityFilter}
                    onChange={setPriorityFilter}
                    placeholder="Prioridade"
                    options={[
                      { value: "all", label: "Todas prioridades" },
                      { value: "high", label: "Alta" },
                      { value: "medium", label: "Média" },
                      { value: "low", label: "Baixa" },
                    ]}
                  />
                </div>

                <div className="inline-flex rounded-md border border-border/60 bg-background/40 p-0.5">
                  <ViewToggle current={view} value="table" onClick={() => setView("table")} icon={TableIcon} label="Tabela" />
                  <ViewToggle current={view} value="cards" onClick={() => setView("cards")} icon={LayoutGrid} label="Cards" />
                  <ViewToggle current={view} value="calendar" onClick={() => setView("calendar")} icon={CalendarIcon} label="Calendário" />
                </div>
              </div>

              {view === "table" && (
                <ProjectsTable projects={filtered} onSelect={setSelected} />
              )}
              {view === "cards" && (
                <ProjectsCards projects={filtered} onSelect={setSelected} />
              )}
              {view === "calendar" && <ProjectsCalendar projects={filtered} onSelect={setSelected} />}
            </section>
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <ProjectsCalendar projects={projects} onSelect={setSelected} />
          </TabsContent>

          <TabsContent value="library" className="mt-6">
            <PlaceholderPanel
              icon={Library}
              title="Biblioteca do canal"
              description="Assets, thumbnails, roteiros aprovados e trilhas ficam disponíveis aqui."
            />
          </TabsContent>

          <TabsContent value="processes" className="mt-6">
            <PlaceholderPanel
              icon={Workflow}
              title="Configurações dos processos"
              description="Defina automações, aprovadores e SLA para cada uma das nove etapas."
            />
          </TabsContent>

          <TabsContent value="identity" className="mt-6">
            <PlaceholderPanel
              icon={Palette}
              title="Identidade do canal"
              description="Paleta, tipografia, tom de voz, logos e templates visuais deste canal."
            />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <PlaceholderPanel
              icon={History}
              title="Histórico"
              description="Linha do tempo completa de publicações, edições e mudanças de configuração."
            />
          </TabsContent>
        </Tabs>
      </main>

      <ProjectDrawer project={selected} onClose={() => setSelected(null)} />
    </AppShell>
  );
}

// ---------- subcomponents ----------

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  delta,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: string;
  delta: string;
  tone: "brand" | "success" | "warning" | "error" | "info";
}) {
  const toneCls = {
    brand: "text-brand-soft bg-brand/15 border-brand/30",
    success: "text-success bg-success/10 border-success/30",
    warning: "text-warning bg-warning/10 border-warning/30",
    error: "text-destructive bg-destructive/10 border-destructive/30",
    info: "text-info bg-info/10 border-info/30",
  }[tone];
  return (
    <div className="glass rounded-xl border border-border/60 p-4">
      <div className="flex items-start justify-between">
        <div className={cn("grid size-8 place-items-center rounded-md border", toneCls)}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-3 text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 truncate text-[11px] text-muted-foreground">{delta}</p>
    </div>
  );
}

function PipelineChannel({
  counts,
}: {
  counts: Record<ProcessId, { total: number; errors: number; review: number }>;
}) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1">
      {PROCESS_ORDER.map((id, i) => {
        const meta = PROCESS_META[id];
        const Icon = meta.icon;
        const c = counts[id];
        const has = c.total > 0;
        const err = c.errors > 0;
        const rev = c.review > 0;
        const tone = err
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : rev
            ? "border-warning/40 bg-warning/10 text-warning"
            : has
              ? "border-brand/40 bg-brand/10 text-brand-soft"
              : "border-border bg-muted/20 text-muted-foreground";
        return (
          <div key={id} className="flex items-center gap-2">
            <button
              className={cn(
                "group relative flex min-w-[110px] flex-col items-start gap-1.5 rounded-lg border px-3 py-2.5 text-left transition hover:border-brand/50",
                tone,
              )}
            >
              <div className="flex w-full items-center justify-between">
                <Icon className="size-3.5" />
                <span className="font-mono text-[11px] font-semibold text-foreground">
                  {c.total.toString().padStart(2, "0")}
                </span>
              </div>
              <span className="text-[11px] font-medium text-foreground">{meta.label}</span>
              <div className="flex items-center gap-1">
                {err && (
                  <span className="inline-flex items-center gap-0.5 rounded-sm bg-destructive/20 px-1 py-0.5 text-[9px] font-semibold text-destructive">
                    <AlertTriangle className="size-2.5" />
                    {c.errors}
                  </span>
                )}
                {rev && (
                  <span className="inline-flex items-center gap-0.5 rounded-sm bg-warning/20 px-1 py-0.5 text-[9px] font-semibold text-warning">
                    revisão
                  </span>
                )}
              </div>
              <Settings2 className="absolute right-2 top-2 size-3 opacity-0 transition group-hover:opacity-60" />
            </button>
            {i < PROCESS_ORDER.length - 1 && (
              <ChevronRight className="size-3 shrink-0 text-muted-foreground/60" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  placeholder,
  icon: Icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
  icon: typeof Users;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px] gap-1.5 border-border/60 bg-background/60 text-xs">
        <Icon className="size-3.5 text-muted-foreground" />
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ViewToggle({
  current,
  value,
  onClick,
  icon: Icon,
  label,
}: {
  current: string;
  value: string;
  onClick: () => void;
  icon: typeof Users;
  label: string;
}) {
  const active = current === value;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-medium transition",
            active
              ? "bg-brand/20 text-foreground shadow-[inset_0_0_0_1px_var(--brand)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

function ProjectThumb({ hue, size = "md" }: { hue: number; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-9 w-16" : "h-16 w-28";
  return (
    <div
      className={cn("relative shrink-0 overflow-hidden rounded-md ring-1 ring-white/10", dim)}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${(hue + 60) % 360} 60% 25%))`,
      }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
      <ImageIcon className="absolute right-1 top-1 size-3 text-white/40" />
    </div>
  );
}

function ProjectsTable({
  projects,
  onSelect,
}: {
  projects: ChannelProject[];
  onSelect: (p: ChannelProject) => void;
}) {
  return (
    <div className="glass overflow-hidden rounded-xl border border-border/60">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="w-[36%]">Projeto</TableHead>
            <TableHead>Processo atual</TableHead>
            <TableHead>Progresso</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Criado</TableHead>
            <TableHead>Publicação</TableHead>
            <TableHead>Atualizado</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => {
            const meta = PROCESS_META[p.currentStage];
            const Icon = meta.icon;
            return (
              <TableRow
                key={p.id}
                onClick={() => onSelect(p)}
                className="cursor-pointer border-border/60 transition hover:bg-brand/5"
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <ProjectThumb hue={p.thumbHue} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{p.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {p.provisionalTitle}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="inline-flex items-center gap-1.5 text-xs">
                    <Icon className="size-3.5 text-brand-soft" />
                    {meta.label}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex w-32 items-center gap-2">
                    <Progress value={p.progress} className="h-1.5" />
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {p.progress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>{stateBadge(p.state)}</TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                      PRIORITY_META[p.priority].cls,
                    )}
                  >
                    {PRIORITY_META[p.priority].label}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.createdAt}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.publishAt}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{p.updatedAt}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 text-muted-foreground">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Abrir projeto</DropdownMenuItem>
                      <DropdownMenuItem>Duplicar</DropdownMenuItem>
                      <DropdownMenuItem>Reatribuir</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">Arquivar</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
          {projects.length === 0 && (
            <TableRow>
              <TableCell colSpan={9} className="py-10 text-center text-sm text-muted-foreground">
                Nenhum projeto encontrado com os filtros aplicados.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function ProjectsCards({
  projects,
  onSelect,
}: {
  projects: ChannelProject[];
  onSelect: (p: ChannelProject) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onSelect(p)}
          className="glass group flex flex-col gap-3 rounded-xl border border-border/60 p-4 text-left transition hover:border-brand/40"
        >
          <div className="flex items-start gap-3">
            <ProjectThumb hue={p.thumbHue} />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{p.title}</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {stateBadge(p.state)}
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium",
                    PRIORITY_META[p.priority].cls,
                  )}
                >
                  {PRIORITY_META[p.priority].label}
                </span>
              </div>
            </div>
          </div>

          <PipelineTrack stages={p.stages} compact />

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3" />
              {p.publishAt}
            </span>
            <div className="inline-flex items-center gap-1.5">
              <div className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft text-[9px] font-bold text-white">
                {p.assignee.initials}
              </div>
              {p.updatedAt}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

function ProjectsCalendar({
  projects,
  onSelect,
}: {
  projects: ChannelProject[];
  onSelect: (p: ChannelProject) => void;
}) {
  const days = Array.from({ length: 28 }, (_, i) => i + 1);
  return (
    <div className="glass rounded-xl border border-border/60 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Novembro 2025</h3>
        <div className="text-[11px] text-muted-foreground">Publicações planejadas</div>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((d) => (
          <div key={d} className="pb-1 text-center text-[10px] uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const hits = projects.filter((p) => p.publishAt.startsWith(`${d} `) || p.publishAt.startsWith(`${d + 10} `));
          return (
            <div
              key={d}
              className="min-h-[84px] rounded-md border border-border/50 bg-background/40 p-1.5 transition hover:border-brand/40"
            >
              <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="font-mono">{String(d).padStart(2, "0")}</span>
              </div>
              <div className="space-y-1">
                {hits.slice(0, 2).map((p) => (
                  <button
                    key={p.id}
                    onClick={() => onSelect(p)}
                    className="w-full truncate rounded bg-brand/15 px-1.5 py-0.5 text-left text-[10px] text-brand-soft hover:bg-brand/25"
                  >
                    {p.title}
                  </button>
                ))}
                {hits.length > 2 && (
                  <div className="px-1 text-[10px] text-muted-foreground">
                    +{hits.length - 2}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PlaceholderPanel({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Users;
  title: string;
  description: string;
}) {
  return (
    <div className="glass flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 px-6 py-20 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-brand/15 text-brand-soft">
        <Icon className="size-5" />
      </div>
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" className="mt-4 h-8 border-border/60 bg-background/40 text-xs">
        Configurar
      </Button>
    </div>
  );
}

function ProjectDrawer({
  project,
  onClose,
}: {
  project: ChannelProject | null;
  onClose: () => void;
}) {
  const open = !!project;
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {project && (
          <div className="flex h-full flex-col">
            <SheetHeader className="space-y-3 border-b border-border/60 pb-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Projeto
                  </p>
                  <SheetTitle className="mt-0.5 text-base leading-snug">
                    {project.title}
                  </SheetTitle>
                </div>
                <Button variant="ghost" size="icon" className="size-8" onClick={onClose}>
                  <X className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {stateBadge(project.state)}
                <span
                  className={cn(
                    "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                    PRIORITY_META[project.priority].cls,
                  )}
                >
                  {PRIORITY_META[project.priority].label}
                </span>
              </div>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto py-4">
              <ProjectThumb hue={project.thumbHue} size="md" />

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Informações básicas
                </h4>
                <dl className="grid grid-cols-2 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">Criado em</dt>
                  <dd>{project.createdAt}</dd>
                  <dt className="text-muted-foreground">Publicação</dt>
                  <dd>{project.publishAt}</dd>
                  <dt className="text-muted-foreground">Duração</dt>
                  <dd className="font-mono">{project.duration}</dd>
                  <dt className="text-muted-foreground">Responsável</dt>
                  <dd>{project.assignee.name}</dd>
                </dl>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Processo atual
                </h4>
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex items-center gap-2 text-sm font-medium">
                      {(() => {
                        const M = PROCESS_META[project.currentStage].icon;
                        return <M className="size-4 text-brand-soft" />;
                      })()}
                      {PROCESS_META[project.currentStage].label}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {project.progress}%
                    </span>
                  </div>
                  <Progress value={project.progress} className="mt-2 h-1.5" />
                </div>
                <div className="mt-3">
                  <PipelineTrack stages={project.stages} compact />
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Últimas atividades
                </h4>
                <ul className="space-y-2 text-xs">
                  {[
                    { t: project.updatedAt, m: `Progresso atualizado para ${project.progress}%` },
                    { t: "há 2 h", m: "Roteiro revisado por Marina Costa" },
                    { t: "ontem", m: "Thumbnail selecionada" },
                    { t: "há 2 dias", m: "Projeto criado" },
                  ].map((a, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                      <div className="flex-1">
                        <p>{a.m}</p>
                        <p className="text-[10px] text-muted-foreground">{a.t}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Pendências
                </h4>
                <ul className="space-y-1.5 text-xs">
                  {["Aprovar título final", "Revisar corte principal", "Confirmar horário de publicação"].map((t) => (
                    <li
                      key={t}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2"
                    >
                      <span className="size-1.5 rounded-full bg-warning" />
                      {t}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Artefatos disponíveis
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { icon: FileText, label: "Roteiro v3", meta: "12 KB" },
                    { icon: ImageIcon, label: "Thumb final", meta: "1920×1080" },
                    { icon: FileText, label: "Legenda", meta: "srt" },
                    { icon: ImageIcon, label: "Storyboard", meta: "24 quadros" },
                  ].map((a) => (
                    <div
                      key={a.label}
                      className="flex items-center gap-2 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs"
                    >
                      <a.icon className="size-3.5 text-brand-soft" />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{a.label}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{a.meta}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <div className="border-t border-border/60 pt-3">
              <Button className="w-full gap-1.5 gradient-brand text-white">
                Abrir projeto
                <ArrowUpRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
