import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Eye,
  MessageSquare,
  Users,
  Clock,
  TrendingUp,
  Sparkles,
  BookmarkPlus,
  Check,
  X,
  BarChart3,
  Play,
  Lightbulb,
  Calendar,
  Youtube,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/research")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Pesquisa — ${p.title} · ContentFlow OS`
            : "Pesquisa · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Resultados de pesquisa de vídeos concorrentes para inspirar a produção do projeto.",
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
  component: ResearchResults,
});

// ---------- mock results ----------

type ResearchResult = {
  id: string;
  title: string;
  channel: string;
  channelHandle: string;
  postedAt: string;
  postedDaysAgo: number;
  duration: string;
  durationSec: number;
  views: number;
  comments: number;
  subscribers: number;
  keyword: string;
  theme: string;
  relevance: number; // 0-100
  hue: number;
  description: string;
  tags: string[];
};

const RAW_RESULTS: ResearchResult[] = [
  {
    id: "r1",
    title: "O que ninguém te conta sobre buracos negros supermassivos",
    channel: "Cosmos Explained",
    channelHandle: "@cosmosexplained",
    postedAt: "há 12 dias",
    postedDaysAgo: 12,
    duration: "14:22",
    durationSec: 862,
    views: 1_240_000,
    comments: 4_820,
    subscribers: 3_100_000,
    keyword: "buraco negro supermassivo",
    theme: "Ciência",
    relevance: 96,
    hue: 220,
    description:
      "Documentário curto explicando por que a formação de buracos negros supermassivos ainda é um enigma para a astrofísica moderna.",
    tags: ["astrofísica", "cosmologia", "documentário"],
  },
  {
    id: "r2",
    title: "Por que o universo pode estar preso em um paradoxo",
    channel: "Deep Physics",
    channelHandle: "@deepphysics",
    postedAt: "há 34 dias",
    postedDaysAgo: 34,
    duration: "22:18",
    durationSec: 1338,
    views: 685_000,
    comments: 2_140,
    subscribers: 890_000,
    keyword: "paradoxo",
    theme: "Ciência",
    relevance: 88,
    hue: 260,
    description:
      "Vídeo longo com abordagem narrativa sobre paradoxos cosmológicos, incluindo entropia e a seta do tempo.",
    tags: ["física", "paradoxo", "cosmologia"],
  },
  {
    id: "r3",
    title: "5 mistérios do cosmos que a ciência não explica",
    channel: "Space Weekly",
    channelHandle: "@spaceweekly",
    postedAt: "há 3 dias",
    postedDaysAgo: 3,
    duration: "08:45",
    durationSec: 525,
    views: 312_000,
    comments: 980,
    subscribers: 450_000,
    keyword: "mistérios cosmos",
    theme: "Curiosidades",
    relevance: 74,
    hue: 200,
    description:
      "Formato de listicle, ritmo acelerado, ideal para referência de estrutura narrativa curta.",
    tags: ["listicle", "curiosidades", "espaço"],
  },
  {
    id: "r4",
    title: "A verdade sobre a matéria escura em 12 minutos",
    channel: "Cosmos Explained",
    channelHandle: "@cosmosexplained",
    postedAt: "há 60 dias",
    postedDaysAgo: 60,
    duration: "12:05",
    durationSec: 725,
    views: 2_450_000,
    comments: 8_120,
    subscribers: 3_100_000,
    keyword: "matéria escura",
    theme: "Ciência",
    relevance: 82,
    hue: 240,
    description:
      "Video de alta performance do mesmo canal de referência. Bom exemplo de gancho inicial e ritmo.",
    tags: ["matéria escura", "física", "alto ctr"],
  },
  {
    id: "r5",
    title: "Interstellar: a física do filme está certa?",
    channel: "Cine Ciência",
    channelHandle: "@cineciencia",
    postedAt: "há 21 dias",
    postedDaysAgo: 21,
    duration: "18:32",
    durationSec: 1112,
    views: 540_000,
    comments: 3_200,
    subscribers: 620_000,
    keyword: "buraco negro",
    theme: "Cinema",
    relevance: 68,
    hue: 300,
    description:
      "Cruzamento entre cinema e ciência. Pode inspirar abertura conectando o tema com cultura pop.",
    tags: ["cinema", "física", "análise"],
  },
  {
    id: "r6",
    title: "Como sabemos que existem buracos negros?",
    channel: "Astro Curioso",
    channelHandle: "@astrocurioso",
    postedAt: "há 90 dias",
    postedDaysAgo: 90,
    duration: "10:14",
    durationSec: 614,
    views: 128_000,
    comments: 410,
    subscribers: 210_000,
    keyword: "buraco negro",
    theme: "Educação",
    relevance: 63,
    hue: 180,
    description:
      "Explicação didática e enxuta. Ritmo mais lento, útil como referência de clareza pedagógica.",
    tags: ["educação", "básico", "explicação"],
  },
  {
    id: "r7",
    title: "A galáxia que não deveria existir",
    channel: "Deep Physics",
    channelHandle: "@deepphysics",
    postedAt: "há 5 dias",
    postedDaysAgo: 5,
    duration: "16:40",
    durationSec: 1000,
    views: 1_950_000,
    comments: 6_780,
    subscribers: 890_000,
    keyword: "galáxia",
    theme: "Ciência",
    relevance: 91,
    hue: 280,
    description:
      "Alto engajamento por inscrito. Estrutura de mistério bem executada.",
    tags: ["galáxia", "mistério", "viral"],
  },
];

const THEMES = ["Ciência", "Curiosidades", "Cinema", "Educação"];

// ---------- helpers ----------

const fmtViews = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} mil`;
  return String(n);
};
const fmtSubs = fmtViews;
const ratio = (v: number, s: number) => v / Math.max(1, s);
const fmtRatio = (r: number) => `${(r * 100).toFixed(0)}%`;

// ---------- component ----------

function ResearchResults() {
  const { project, channel } = Route.useLoaderData();

  const [search, setSearch] = useState("");
  const [themeFilter, setThemeFilter] = useState<string>("all");
  const [minViews, setMinViews] = useState<string>("0");
  const [durationFilter, setDurationFilter] = useState<string>("all");
  const [sort, setSort] = useState<
    "relevance" | "views" | "recent" | "engagement"
  >("relevance");
  const [view, setView] = useState<"table" | "cards">("table");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["r1"]));
  const [detail, setDetail] = useState<ResearchResult | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minV = parseInt(minViews) || 0;
    return RAW_RESULTS.filter((r) => {
      if (themeFilter !== "all" && r.theme !== themeFilter) return false;
      if (r.views < minV) return false;
      if (durationFilter === "short" && r.durationSec > 600) return false;
      if (
        durationFilter === "medium" &&
        (r.durationSec <= 600 || r.durationSec > 1200)
      )
        return false;
      if (durationFilter === "long" && r.durationSec <= 1200) return false;
      if (q && !`${r.title} ${r.channel} ${r.keyword}`.toLowerCase().includes(q))
        return false;
      return true;
    }).sort((a, b) => {
      if (sort === "views") return b.views - a.views;
      if (sort === "recent") return a.postedDaysAgo - b.postedDaysAgo;
      if (sort === "engagement")
        return ratio(b.views, b.subscribers) - ratio(a.views, a.subscribers);
      return b.relevance - a.relevance;
    });
  }, [search, themeFilter, minViews, durationFilter, sort]);

  const allSelected =
    filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const someSelected = filtered.some((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };
  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const themeDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filtered.forEach((r) => map.set(r.theme, (map.get(r.theme) ?? 0) + 1));
    return THEMES.map((t) => ({ label: t, value: map.get(t) ?? 0 }));
  }, [filtered]);

  const durationDistribution = useMemo(() => {
    const buckets = [
      { label: "< 10min", test: (s: number) => s < 600 },
      { label: "10–20min", test: (s: number) => s >= 600 && s < 1200 },
      { label: "> 20min", test: (s: number) => s >= 1200 },
    ];
    return buckets.map((b) => ({
      label: b.label,
      value: filtered.filter((r) => b.test(r.durationSec)).length,
    }));
  }, [filtered]);

  const performanceDistribution = useMemo(() => {
    const buckets = [
      { label: "Baixo", test: (r: number) => r < 0.3 },
      { label: "Médio", test: (r: number) => r >= 0.3 && r < 1 },
      { label: "Alto", test: (r: number) => r >= 1 && r < 2 },
      { label: "Viral", test: (r: number) => r >= 2 },
    ];
    return buckets.map((b) => ({
      label: b.label,
      value: filtered.filter((r) =>
        b.test(ratio(r.views, r.subscribers)),
      ).length,
    }));
  }, [filtered]);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Pesquisa"
          subtitle={`${project.title} · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Projetos" },
            {
              label: project.title,
              to: `/project/${project.id}` as never,
            },
            { label: "Pesquisa" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] space-y-5 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Search className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-xl font-semibold tracking-tight">
                  Resultados da pesquisa
                </h1>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {filtered.length} vídeos analisados ·{" "}
                  {selected.size} selecionado(s)
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={selected.size === 0}>
                  <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar às referências
                </Button>
                <Button size="sm" disabled={selected.size === 0}>
                  <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                  Usar na geração de ideias
                </Button>
              </div>
            </div>

            {/* Charts */}
            <div className="grid gap-3 md:grid-cols-3">
              <MiniChart
                icon={<Sparkles className="h-3.5 w-3.5" />}
                title="Distribuição por tema"
                data={themeDistribution}
              />
              <MiniChart
                icon={<Clock className="h-3.5 w-3.5" />}
                title="Distribuição por duração"
                data={durationDistribution}
              />
              <MiniChart
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                title="Desempenho (views/inscrito)"
                data={performanceDistribution}
                accent
              />
            </div>

            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/50 p-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por título, canal ou palavra-chave..."
                  className="h-9 pl-8"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="mr-1.5 h-3.5 w-3.5" />
                    Filtros
                    {(themeFilter !== "all" ||
                      minViews !== "0" ||
                      durationFilter !== "all") && (
                      <Badge
                        variant="secondary"
                        className="ml-1.5 bg-primary/15 px-1 text-[9px] text-primary"
                      >
                        {
                          [
                            themeFilter !== "all",
                            minViews !== "0",
                            durationFilter !== "all",
                          ].filter(Boolean).length
                        }
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 space-y-3" align="end">
                  <FilterField label="Tema">
                    <Select value={themeFilter} onValueChange={setThemeFilter}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {THEMES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="Duração">
                    <Select
                      value={durationFilter}
                      onValueChange={setDurationFilter}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Qualquer</SelectItem>
                        <SelectItem value="short">Menos de 10 min</SelectItem>
                        <SelectItem value="medium">10 a 20 min</SelectItem>
                        <SelectItem value="long">Mais de 20 min</SelectItem>
                      </SelectContent>
                    </Select>
                  </FilterField>
                  <FilterField label="Views mínimas">
                    <Input
                      type="number"
                      min={0}
                      step={10000}
                      value={minViews}
                      onChange={(e) => setMinViews(e.target.value)}
                      className="h-8"
                    />
                  </FilterField>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setThemeFilter("all");
                      setMinViews("0");
                      setDurationFilter("all");
                    }}
                  >
                    <X className="mr-1.5 h-3 w-3" />
                    Limpar filtros
                  </Button>
                </PopoverContent>
              </Popover>

              <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                <SelectTrigger className="h-9 w-[180px]">
                  <ArrowUpDown className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="relevance">Mais relevantes</SelectItem>
                  <SelectItem value="views">Mais visualizadas</SelectItem>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="engagement">Melhor desempenho</SelectItem>
                </SelectContent>
              </Select>

              <div className="flex overflow-hidden rounded-md border border-border">
                <ViewButton
                  active={view === "table"}
                  onClick={() => setView("table")}
                  icon={<TableIcon className="h-3.5 w-3.5" />}
                  label="Tabela"
                />
                <ViewButton
                  active={view === "cards"}
                  onClick={() => setView("cards")}
                  icon={<LayoutGrid className="h-3.5 w-3.5" />}
                  label="Cards"
                />
              </div>
            </div>

            {/* Results */}
            {view === "table" ? (
              <ResultsTable
                results={filtered}
                selected={selected}
                onToggleOne={toggleOne}
                onToggleAll={toggleAll}
                allSelected={allSelected}
                someSelected={someSelected}
                expanded={expanded}
                onToggleExpand={toggleExpand}
                onOpenDetail={setDetail}
              />
            ) : (
              <ResultsCards
                results={filtered}
                selected={selected}
                onToggleOne={toggleOne}
                onOpenDetail={setDetail}
              />
            )}

            {filtered.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                Nenhum resultado para os filtros atuais.
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <DetailPanel result={detail} onClose={() => setDetail(null)} />
      </AppShell>
    </TooltipProvider>
  );
}

// ---------- table ----------

function ResultsTable({
  results,
  selected,
  onToggleOne,
  onToggleAll,
  allSelected,
  someSelected,
  expanded,
  onToggleExpand,
  onOpenDetail,
}: {
  results: ResearchResult[];
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  expanded: Set<string>;
  onToggleExpand: (id: string) => void;
  onOpenDetail: (r: ResearchResult) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/50">
      <div className="grid grid-cols-[36px_28px_minmax(280px,1.6fr)_minmax(140px,1fr)_90px_90px_90px_90px_100px_90px_44px] items-center gap-3 border-b border-border bg-secondary/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <Checkbox
          checked={
            allSelected ? true : someSelected ? "indeterminate" : false
          }
          onCheckedChange={onToggleAll}
          aria-label="Selecionar todos"
        />
        <span />
        <span>Vídeo</span>
        <span>Canal</span>
        <span className="text-right">Postado</span>
        <span className="text-right">Duração</span>
        <span className="text-right">Views</span>
        <span className="text-right">Coment.</span>
        <span className="text-right">V/Inscrito</span>
        <span className="text-right">Relev.</span>
        <span />
      </div>

      <div className="divide-y divide-border">
        {results.map((r) => (
          <TableRow
            key={r.id}
            result={r}
            selected={selected.has(r.id)}
            onToggle={() => onToggleOne(r.id)}
            expanded={expanded.has(r.id)}
            onToggleExpand={() => onToggleExpand(r.id)}
            onOpenDetail={() => onOpenDetail(r)}
          />
        ))}
      </div>
    </div>
  );
}

function TableRow({
  result,
  selected,
  onToggle,
  expanded,
  onToggleExpand,
  onOpenDetail,
}: {
  result: ResearchResult;
  selected: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
  onOpenDetail: () => void;
}) {
  const r = ratio(result.views, result.subscribers);
  return (
    <div className={cn(selected && "bg-primary/5")}>
      <div className="grid grid-cols-[36px_28px_minmax(280px,1.6fr)_minmax(140px,1fr)_90px_90px_90px_90px_100px_90px_44px] items-center gap-3 px-4 py-2.5 text-sm">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          aria-label="Selecionar"
        />
        <button
          type="button"
          onClick={onToggleExpand}
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label={expanded ? "Recolher" : "Expandir"}
        >
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpenDetail}
          className="flex min-w-0 items-center gap-3 text-left"
        >
          <Thumbnail hue={result.hue} duration={result.duration} small />
          <div className="min-w-0">
            <div className="truncate font-medium">{result.title}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Badge
                variant="secondary"
                className="bg-primary/15 py-0 text-[9px] text-primary"
              >
                {result.keyword}
              </Badge>
              <span className="truncate">{result.theme}</span>
            </div>
          </div>
        </button>

        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{result.channel}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            {fmtSubs(result.subscribers)} inscritos
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          {result.postedAt}
        </div>
        <div className="text-right font-mono text-xs">{result.duration}</div>
        <div className="text-right font-mono text-xs">
          {fmtViews(result.views)}
        </div>
        <div className="text-right font-mono text-xs text-muted-foreground">
          {fmtViews(result.comments)}
        </div>
        <div className="text-right">
          <RatioBadge ratio={r} />
        </div>
        <div className="text-right">
          <RelevanceBar value={result.relevance} />
        </div>
        <div className="flex justify-end">
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href="#"
                onClick={(e) => e.preventDefault()}
                className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                aria-label="Abrir no YouTube"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Abrir no YouTube</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/60 bg-secondary/20 px-4 py-4">
          <ExpandedRow result={result} onOpenDetail={onOpenDetail} />
        </div>
      )}
    </div>
  );
}

function ExpandedRow({
  result,
  onOpenDetail,
}: {
  result: ResearchResult;
  onOpenDetail: () => void;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-[220px_1fr_auto]">
      <Thumbnail hue={result.hue} duration={result.duration} />
      <div>
        <p className="text-sm text-muted-foreground">{result.description}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {result.tags.map((t) => (
            <Badge
              key={t}
              variant="secondary"
              className="bg-secondary/70 text-[10px] text-muted-foreground"
            >
              #{t}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Button size="sm" variant="outline" onClick={onOpenDetail}>
          <Eye className="mr-1.5 h-3.5 w-3.5" />
          Ver detalhes
        </Button>
        <Button size="sm" variant="ghost">
          <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar
        </Button>
        <Button size="sm" variant="ghost">
          <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
          Usar em ideias
        </Button>
      </div>
    </div>
  );
}

// ---------- cards ----------

function ResultsCards({
  results,
  selected,
  onToggleOne,
  onOpenDetail,
}: {
  results: ResearchResult[];
  selected: Set<string>;
  onToggleOne: (id: string) => void;
  onOpenDetail: (r: ResearchResult) => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {results.map((r) => (
        <ResultCard
          key={r.id}
          result={r}
          selected={selected.has(r.id)}
          onToggle={() => onToggleOne(r.id)}
          onOpenDetail={() => onOpenDetail(r)}
        />
      ))}
    </div>
  );
}

function ResultCard({
  result,
  selected,
  onToggle,
  onOpenDetail,
}: {
  result: ResearchResult;
  selected: boolean;
  onToggle: () => void;
  onOpenDetail: () => void;
}) {
  const r = ratio(result.views, result.subscribers);
  return (
    <div
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border bg-card/60 transition-all",
        selected
          ? "border-primary ring-2 ring-primary/40"
          : "border-border hover:border-border/80",
      )}
    >
      <div className="relative">
        <Thumbnail hue={result.hue} duration={result.duration} full />
        <div className="absolute left-2 top-2">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            aria-label="Selecionar"
            className="bg-background/80 backdrop-blur"
          />
        </div>
        <div className="absolute right-2 top-2">
          <Badge className="bg-primary/90 text-[10px] text-primary-foreground">
            Relev. {result.relevance}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-3">
        <button
          type="button"
          onClick={onOpenDetail}
          className="text-left text-sm font-semibold leading-snug hover:text-primary line-clamp-2"
        >
          {result.title}
        </button>

        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="truncate">{result.channel}</span>
          <span>·</span>
          <span>{fmtSubs(result.subscribers)}</span>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
          <MiniStat icon={<Eye className="h-3 w-3" />} value={fmtViews(result.views)} />
          <MiniStat
            icon={<MessageSquare className="h-3 w-3" />}
            value={fmtViews(result.comments)}
          />
          <MiniStat
            icon={<TrendingUp className="h-3 w-3" />}
            value={fmtRatio(r)}
            tone={r >= 1 ? "success" : undefined}
          />
        </div>

        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {result.postedAt}
          <Badge
            variant="secondary"
            className="ml-auto bg-primary/15 py-0 text-[9px] text-primary"
          >
            {result.keyword}
          </Badge>
        </div>

        <div className="mt-3 flex gap-1.5 border-t border-border/60 pt-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 flex-1 text-[11px]"
            onClick={onOpenDetail}
          >
            <Eye className="mr-1 h-3 w-3" />
            Detalhes
          </Button>
          <Button size="sm" variant="ghost" className="h-7 flex-1 text-[11px]">
            <BookmarkPlus className="mr-1 h-3 w-3" />
            Salvar
          </Button>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Abrir no YouTube"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------- shared ----------

function Thumbnail({
  hue,
  duration,
  full,
  small,
}: {
  hue: number;
  duration: string;
  full?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md",
        full && "aspect-video w-full rounded-none",
        small ? "h-10 w-16" : !full && "aspect-video w-full",
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 60% 30%), hsl(${hue + 40} 55% 18%))`,
      }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className={cn(
            "rounded-full bg-white/15 backdrop-blur",
            small ? "p-1" : "p-2",
          )}
        >
          <Play
            className={cn(small ? "h-2.5 w-2.5" : "h-4 w-4", "text-white")}
            fill="currentColor"
          />
        </div>
      </div>
      <span
        className={cn(
          "absolute rounded bg-black/70 font-mono text-white",
          small
            ? "bottom-0.5 right-0.5 px-1 text-[8px]"
            : "bottom-1.5 right-1.5 px-1.5 py-0.5 text-[10px]",
        )}
      >
        {duration}
      </span>
    </div>
  );
}

function RatioBadge({ ratio }: { ratio: number }) {
  const tone =
    ratio >= 1
      ? "bg-emerald-500/15 text-emerald-400"
      : ratio >= 0.3
        ? "bg-primary/15 text-primary"
        : "bg-secondary text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold",
        tone,
      )}
    >
      {fmtRatio(ratio)}
    </span>
  );
}

function RelevanceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div className="h-1 w-12 overflow-hidden rounded-full bg-secondary/70">
        <div
          className={cn(
            "h-full",
            value >= 80
              ? "bg-emerald-500"
              : value >= 60
                ? "bg-primary"
                : "bg-muted-foreground",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-mono text-[10px] text-muted-foreground">
        {value}
      </span>
    </div>
  );
}

function MiniStat({
  icon,
  value,
  tone,
}: {
  icon: React.ReactNode;
  value: string;
  tone?: "success";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1 rounded bg-secondary/50 px-1.5 py-1",
        tone === "success" && "bg-emerald-500/10 text-emerald-400",
      )}
    >
      {icon}
      <span className="font-mono text-[10px] font-semibold">{value}</span>
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "bg-transparent text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------- mini chart ----------

function MiniChart({
  icon,
  title,
  data,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  data: { label: string; value: number }[];
  accent?: boolean;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
        <BarChart3 className="ml-auto h-3 w-3" />
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-2">
            <span className="w-16 truncate text-[11px] text-muted-foreground">
              {d.label}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary/60">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  accent ? "bg-emerald-500" : "bg-primary",
                )}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="w-6 text-right font-mono text-[11px]">
              {d.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- detail sheet ----------

function DetailPanel({
  result,
  onClose,
}: {
  result: ResearchResult | null;
  onClose: () => void;
}) {
  const open = !!result;
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto sm:max-w-[460px]"
      >
        {result && (
          <>
            <SheetHeader className="text-left">
              <SheetTitle className="text-base leading-snug">
                {result.title}
              </SheetTitle>
              <SheetDescription>
                {result.channel} · {result.channelHandle}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4 space-y-4">
              <Thumbnail hue={result.hue} duration={result.duration} full />

              <div className="grid grid-cols-2 gap-2">
                <DetailStat
                  icon={<Eye className="h-3.5 w-3.5" />}
                  label="Visualizações"
                  value={fmtViews(result.views)}
                />
                <DetailStat
                  icon={<MessageSquare className="h-3.5 w-3.5" />}
                  label="Comentários"
                  value={fmtViews(result.comments)}
                />
                <DetailStat
                  icon={<Users className="h-3.5 w-3.5" />}
                  label="Inscritos"
                  value={fmtSubs(result.subscribers)}
                />
                <DetailStat
                  icon={<TrendingUp className="h-3.5 w-3.5" />}
                  label="V/Inscrito"
                  value={fmtRatio(ratio(result.views, result.subscribers))}
                />
                <DetailStat
                  icon={<Clock className="h-3.5 w-3.5" />}
                  label="Duração"
                  value={result.duration}
                />
                <DetailStat
                  icon={<Calendar className="h-3.5 w-3.5" />}
                  label="Postado"
                  value={result.postedAt}
                />
              </div>

              <div>
                <Label>Palavra-chave encontrada</Label>
                <Badge className="bg-primary/15 text-primary">
                  {result.keyword}
                </Badge>
              </div>

              <div>
                <Label>Relevância</Label>
                <div className="flex items-center gap-2">
                  <Progress value={result.relevance} className="h-2 flex-1" />
                  <span className="font-mono text-sm font-semibold">
                    {result.relevance}
                  </span>
                </div>
              </div>

              <div>
                <Label>Descrição</Label>
                <p className="text-sm text-muted-foreground">
                  {result.description}
                </p>
              </div>

              <div>
                <Label>Tags</Label>
                <div className="flex flex-wrap gap-1">
                  {result.tags.map((t) => (
                    <Badge
                      key={t}
                      variant="secondary"
                      className="bg-secondary/70 text-[11px] text-muted-foreground"
                    >
                      #{t}
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Button className="w-full">
                  <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
                  Usar na geração de ideias
                </Button>
                <Button variant="outline" className="w-full">
                  <BookmarkPlus className="mr-1.5 h-3.5 w-3.5" />
                  Adicionar às referências
                </Button>
                <a
                  href="#"
                  onClick={(e) => e.preventDefault()}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  <Youtube className="h-3.5 w-3.5 text-red-500" />
                  Abrir no YouTube
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 font-mono text-sm font-semibold">{value}</div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}
