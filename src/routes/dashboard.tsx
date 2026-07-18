import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  Plus,
  Download,
  ExternalLink,
  MoreHorizontal,
  Radio,
  FolderKanban,
  CheckCircle2,
  AlertTriangle,
  LayoutGrid,
  Table as TableIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Calendar,
  Info,
  Type,
  FileText,
  Image as ImageIcon,
  Mic,
  Upload,
  ArrowRight,
  Workflow,
} from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ProcessStatus } from "@/components/process-status";
import { PipelineTrack } from "@/components/pipeline-track";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  channels,
  projects,
  actionItems,
  PROCESS_META,
  type Channel,
  type ActionItem,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ContentFlow OS" },
      {
        name: "description",
        content:
          "Central de comando dos canais do YouTube — métricas, produção em andamento e ações necessárias.",
      },
      { property: "og:title", content: "Dashboard — ContentFlow OS" },
      {
        property: "og:description",
        content:
          "Acompanhe seus canais e fluxos de produção em um único painel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const [view, setView] = useState<"cards" | "table">("cards");
  const hasChannels = channels.length > 0;

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Visão geral" }]}
        title="Visão geral"
        subtitle="Acompanhe seus canais e fluxos de produção"
        actions={
          <>
            <Select defaultValue="30d">
              <SelectTrigger className="h-9 w-[140px] border-border/60 bg-background/40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
                <SelectItem value="ytd">Este ano</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 border-border/60 bg-background/40"
            >
              <Download className="size-3.5" />
              Importar canal
            </Button>
          </>
        }
      />

      <main className="flex-1 space-y-8 px-6 py-6">
        {hasChannels ? (
          <>
            <MetricsRow />
            <ChannelsSection view={view} onViewChange={setView} />
            <ProductionTimeline />
            <ActionsSection />
          </>
        ) : (
          <EmptyState />
        )}
      </main>
    </AppShell>
  );
}

/* ---------------- Metrics ---------------- */

const METRICS = [
  {
    id: "m1",
    label: "Canais ativos",
    value: "04",
    delta: "+1 vs. período anterior",
    trend: "up" as const,
    icon: Radio,
    tooltip: "Canais com pelo menos um projeto em movimento no período.",
    series: [2, 3, 3, 3, 4, 4, 4],
  },
  {
    id: "m2",
    label: "Projetos em produção",
    value: "24",
    delta: "+18% vs. período anterior",
    trend: "up" as const,
    icon: FolderKanban,
    tooltip: "Projetos ativos em qualquer etapa do pipeline.",
    series: [12, 14, 15, 18, 19, 22, 24],
  },
  {
    id: "m3",
    label: "Publicados no período",
    value: "18",
    delta: "+22% vs. período anterior",
    trend: "up" as const,
    icon: CheckCircle2,
    tooltip: "Vídeos publicados durante o período selecionado.",
    series: [3, 5, 6, 8, 10, 14, 18],
  },
  {
    id: "m4",
    label: "Aguardando revisão",
    value: "07",
    delta: "2 há mais de 24h",
    trend: "warning" as const,
    icon: AlertTriangle,
    tooltip: "Processos que exigem sua aprovação para continuar.",
    series: [4, 3, 5, 6, 5, 6, 7],
  },
];

function MetricsRow() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {METRICS.map((m) => {
        const trendClass =
          m.trend === "warning" ? "text-warning" : "text-success";
        const chartColor =
          m.trend === "warning" ? "oklch(0.82 0.16 85)" : "oklch(0.58 0.22 264)";
        const data = m.series.map((v, i) => ({ i, v }));
        return (
          <div
            key={m.id}
            className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 transition hover:border-brand/50"
          >
            <div
              className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-60"
              style={{
                background:
                  "linear-gradient(90deg, transparent, oklch(0.58 0.22 264 / 0.6), transparent)",
              }}
            />
            <div className="flex items-start justify-between">
              <div className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <m.icon className="size-3.5 text-brand-soft" />
                {m.label}
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground/70 hover:text-foreground">
                    <Info className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[220px] text-xs">
                  {m.tooltip}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-3xl font-semibold tracking-tight">
                  {m.value}
                </p>
                <p className={cn("mt-1 text-xs", trendClass)}>{m.delta}</p>
              </div>
              <div className="h-10 w-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke={chartColor}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Channels ---------------- */

const STATUS_META: Record<
  Channel["status"],
  { label: string; class: string; dot: string }
> = {
  healthy: {
    label: "Saudável",
    class: "bg-success/10 text-success border-success/40",
    dot: "bg-success",
  },
  attention: {
    label: "Atenção",
    class: "bg-warning/10 text-warning border-warning/40",
    dot: "bg-warning",
  },
  paused: {
    label: "Pausado",
    class: "bg-muted/40 text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/60",
  },
};

function ChannelsSection({
  view,
  onViewChange,
}: {
  view: "cards" | "table";
  onViewChange: (v: "cards" | "table") => void;
}) {
  return (
    <section>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Seus canais</h2>
          <p className="text-xs text-muted-foreground">
            {channels.length} canais gerenciados neste workspace
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-border/60 bg-background/40 p-0.5">
            <button
              onClick={() => onViewChange("cards")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                view === "cards"
                  ? "bg-brand/20 text-brand-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-3.5" /> Cards
            </button>
            <button
              onClick={() => onViewChange("table")}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                view === "table"
                  ? "bg-brand/20 text-brand-soft"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <TableIcon className="size-3.5" /> Tabela
            </button>
          </div>
          <Button
            size="sm"
            className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]"
          >
            <Plus className="size-4" />
            Novo canal
          </Button>
        </div>
      </header>

      {view === "cards" ? <ChannelCards /> : <ChannelTable />}
    </section>
  );
}

function ChannelCards() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
      {channels.map((c) => {
        const status = STATUS_META[c.status];
        return (
          <article
            key={c.id}
            className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 transition hover:border-brand/50"
          >
            <div
              className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-70"
              style={{
                background: `linear-gradient(90deg, transparent, ${c.color}, transparent)`,
              }}
            />
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <ChannelAvatar channel={c} size="lg" />
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold">{c.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    {c.handle} · {c.niche} · {c.language}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                    status.class,
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", status.dot)} />
                  {status.label}
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem>Editar canal</DropdownMenuItem>
                    <DropdownMenuItem>Pausar produção</DropdownMenuItem>
                    <DropdownMenuItem>Duplicar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <dl className="mt-5 grid grid-cols-4 gap-3">
              <MiniStat label="Inscritos" value={c.subscribers} mono />
              <MiniStat label="Projetos" value={String(c.activeProjects)} mono />
              <MiniStat label="Frequência" value={c.frequency} />
              <MiniStat label="Próxima" value={c.nextPublish} />
            </dl>

            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Projeto atual</span>
                <span className="font-mono text-foreground">
                  {c.currentProjectProgress}%
                </span>
              </div>
              <Progress value={c.currentProjectProgress} className="h-1.5" />
            </div>

            <div className="mt-4 flex items-center justify-end border-t border-border/50 pt-3">
              <Button
                asChild
                size="sm"
                variant="ghost"
                className="h-8 gap-1 text-xs text-brand-soft hover:text-foreground"
              >
                <Link to="/channel/$channelId" params={{ channelId: c.id }}>
                  Abrir workspace
                  <ExternalLink className="size-3.5" />
                </Link>
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MiniStat({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-0.5 truncate text-sm font-medium",
          mono && "font-mono",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function ChannelTable() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider">
              Canal
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Nicho
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Inscritos
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Projetos
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Frequência
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Próxima
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Progresso
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Status
            </TableHead>
            <TableHead className="w-24" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {channels.map((c) => {
            const status = STATUS_META[c.status];
            return (
              <TableRow key={c.id} className="border-border/50">
                <TableCell>
                  <div className="flex min-w-0 items-center gap-2.5">
                    <ChannelAvatar channel={c} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {c.handle} · {c.language}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.niche}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.subscribers}
                </TableCell>
                <TableCell className="font-mono text-sm">
                  {c.activeProjects}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.frequency}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.nextPublish}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress
                      value={c.currentProjectProgress}
                      className="h-1.5 w-24"
                    />
                    <span className="font-mono text-xs text-muted-foreground">
                      {c.currentProjectProgress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]",
                      status.class,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", status.dot)} />
                    {status.label}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-brand-soft"
                    >
                      <Link to="/channel/$channelId" params={{ channelId: c.id }}>
                        Abrir
                        <ExternalLink className="size-3" />
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem>Editar canal</DropdownMenuItem>
                        <DropdownMenuItem>Pausar produção</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive">
                          Remover
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/* ---------------- Production timeline ---------------- */

function ProductionTimeline() {
  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Produção em andamento</h2>
          <p className="text-xs text-muted-foreground">
            Últimos projetos movidos no pipeline
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </header>
      <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
        {projects.map((p) => {
          const channel = channels.find((c) => c.id === p.channelId)!;
          const stage = PROCESS_META[p.currentStage];
          return (
            <Link
              key={p.id}
              to="/project/$projectId"
              params={{ projectId: p.id }}
              className="group relative w-[300px] shrink-0 snap-start overflow-hidden rounded-xl border border-border/70 bg-card transition hover:border-brand/50"
            >
              {/* Thumbnail placeholder */}
              <div
                className="relative aspect-video overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, oklch(0.4 0.18 ${p.thumbHue}), oklch(0.22 0.05 ${p.thumbHue}))`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)",
                  }}
                />
                <div className="absolute left-2 top-2">
                  <ChannelAvatar channel={channel} size="sm" />
                </div>
                <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur">
                  {p.duration}
                </div>
                {p.isLate && (
                  <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/20 px-2 py-0.5 text-[10px] text-destructive backdrop-blur">
                    <AlertTriangle className="size-3" />
                    Atrasado
                  </div>
                )}
              </div>

              <div className="p-3">
                <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
                  {p.title}
                </h3>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">
                  {channel.name}
                </p>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1.5 text-xs">
                    <stage.icon className="size-3.5 text-brand-soft" />
                    <span className="truncate">{stage.label}</span>
                  </div>
                  <ProcessStatus state={p.state} />
                </div>

                <div className="mt-3">
                  <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>Progresso</span>
                    <span className="font-mono text-foreground">
                      {p.progress}%
                    </span>
                  </div>
                  <Progress value={p.progress} className="h-1" />
                </div>

                <footer className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft font-mono text-[9px] font-bold text-white"
                      title={p.assignee.name}
                    >
                      {p.assignee.initials}
                    </span>
                    <span className="truncate">{p.assignee.name.split(" ")[0]}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      p.isLate && "text-destructive",
                    )}
                  >
                    <Calendar className="size-3" />
                    {p.deadline}
                  </span>
                </footer>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- Actions needed ---------------- */

const ACTION_ICONS: Record<ActionItem["kind"], typeof Type> = {
  approve_titles: Type,
  review_script: FileText,
  select_thumb: ImageIcon,
  fix_narration: Mic,
  confirm_publish: Upload,
};

const PRIORITY_META = {
  high: {
    label: "Alta",
    class: "bg-destructive/10 text-destructive border-destructive/40",
  },
  medium: {
    label: "Média",
    class: "bg-warning/10 text-warning border-warning/40",
  },
  low: {
    label: "Baixa",
    class: "bg-info/10 text-info border-info/40",
  },
} as const;

function ActionsSection() {
  return (
    <section>
      <header className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Ações necessárias</h2>
          <p className="text-xs text-muted-foreground">
            {actionItems.length} tarefas aguardando você
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs text-muted-foreground"
        >
          Ver todas
          <ArrowRight className="size-3" />
        </Button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
        <ul className="divide-y divide-border/50">
          {actionItems.map((a) => {
            const Icon = ACTION_ICONS[a.kind];
            const channel = channels.find((c) => c.id === a.channelId)!;
            const prio = PRIORITY_META[a.priority];
            const isLate = a.deadline.startsWith("atrasado");
            return (
              <li
                key={a.id}
                className="group flex items-center gap-3 px-4 py-3 transition hover:bg-brand/5"
              >
                <div className="grid size-9 shrink-0 place-items-center rounded-lg border border-border/60 bg-background/60 text-brand-soft">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{a.title}</p>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium",
                        prio.class,
                      )}
                    >
                      {prio.label}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-muted-foreground">
                    <span className="text-foreground/80">{channel.name}</span>
                    <span className="mx-1 opacity-40">·</span>
                    {a.projectTitle}
                  </p>
                </div>
                <div className="hidden items-center gap-1.5 sm:flex">
                  <ChannelAvatar channel={channel} size="sm" />
                </div>
                <div
                  className={cn(
                    "hidden min-w-[100px] items-center gap-1 text-[11px] sm:flex",
                    isLate ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  <Clock className="size-3" />
                  {a.deadline}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border/60 bg-background/40 text-xs group-hover:border-brand/50"
                >
                  Executar
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Empty state ---------------- */

function EmptyState() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="max-w-md text-center">
        {/* Abstract illustration */}
        <div className="relative mx-auto mb-6 size-40">
          <div className="absolute inset-0 rounded-full bg-brand/10 blur-2xl" />
          <svg
            viewBox="0 0 160 160"
            className="relative size-full"
            fill="none"
            aria-hidden
          >
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="oklch(0.58 0.22 264)" />
                <stop offset="1" stopColor="oklch(0.72 0.14 255)" />
              </linearGradient>
            </defs>
            <circle
              cx="80"
              cy="80"
              r="60"
              stroke="url(#g)"
              strokeWidth="1"
              strokeDasharray="3 5"
              opacity="0.5"
            />
            <circle
              cx="80"
              cy="80"
              r="40"
              stroke="url(#g)"
              strokeWidth="1"
              opacity="0.6"
            />
            <rect
              x="60"
              y="60"
              width="40"
              height="40"
              rx="8"
              fill="url(#g)"
              opacity="0.9"
            />
            <path
              d="M74 72v16l14-8z"
              fill="oklch(0.99 0 0)"
            />
            <circle cx="30" cy="50" r="6" fill="url(#g)" opacity="0.7" />
            <circle cx="130" cy="110" r="4" fill="url(#g)" opacity="0.6" />
            <circle cx="120" cy="40" r="3" fill="url(#g)" opacity="0.5" />
            <circle cx="40" cy="120" r="5" fill="url(#g)" opacity="0.6" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold">Nenhum canal ainda</h2>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
          Adicione o primeiro canal ao ContentFlow OS para começar a orquestrar
          pesquisa, roteiro, narração, edição e publicação em um só lugar.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Button className="gradient-brand text-white shadow-[0_8px_24px_-8px_oklch(0.58_0.22_264/0.8)]">
            <Plus className="size-4" />
            Adicionar primeiro canal
          </Button>
          <Button variant="outline" className="border-border/60 bg-background/40">
            <Workflow className="size-4" />
            Ver um exemplo
          </Button>
        </div>
      </div>
    </div>
  );
}

// Keep unused imports referenced (Link, PROCESS_META already used above)
void Link;
