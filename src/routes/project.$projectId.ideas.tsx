import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Search,
  Filter,
  ArrowUpDown,
  LayoutGrid,
  Table as TableIcon,
  Columns3,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Flame,
  HeartCrack,
  Heart,
  ShieldAlert,
  HelpCircle,
  History,
  Send,
  ChevronDown,
  Target,
  AlertTriangle,
  Repeat,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/ideas")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Ideias — ${p.title} · ContentFlow OS`
            : "Ideias · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Geração e curadoria de ideias de vídeo com ranqueamento, kanban e conexão emocional.",
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
  component: IdeasView,
});

// ---------------- mock ----------------

type EmotionalTrigger = "Dor" | "Desejo" | "Medo" | "Curiosidade";
type IdeaOrigin =
  | "Tendência"
  | "Histórico do canal"
  | "Pesquisa"
  | "Manual"
  | "Comunidade";
type IdeaStatus = "Nova" | "Em análise" | "Selecionada" | "Descartada";

type Idea = {
  id: string;
  theme: string;
  summary: string;
  angle: string;
  emotional: EmotionalTrigger;
  origin: IdeaOrigin;
  trend: number; // 0-100
  fit: number; // compatibilidade com canal
  potential: number; // potencial estimado
  repetitionRisk: number; // risco de repetição
  tags: string[];
  status: IdeaStatus;
  hue: number;
  createdAt: string;
};

const RAW_IDEAS: Idea[] = [
  {
    id: "i1",
    theme: "O paradoxo do universo em expansão",
    summary:
      "Explorar por que a aceleração do universo desafia o senso comum e o que isso implica para o destino do cosmos.",
    angle: "Narrativa investigativa em ritmo lento com ganchos de mistério.",
    emotional: "Curiosidade",
    origin: "Pesquisa",
    trend: 78,
    fit: 92,
    potential: 88,
    repetitionRisk: 18,
    tags: ["cosmologia", "mistério", "long form"],
    status: "Selecionada",
    hue: 220,
    createdAt: "há 2 dias",
  },
  {
    id: "i2",
    theme: "5 coisas que a ciência não consegue explicar",
    summary:
      "Formato listicle acelerado com fenômenos populares que geram debate nos comentários.",
    angle: "Ritmo acelerado, cortes rápidos, tom provocativo.",
    emotional: "Curiosidade",
    origin: "Tendência",
    trend: 92,
    fit: 74,
    potential: 82,
    repetitionRisk: 62,
    tags: ["listicle", "curiosidades"],
    status: "Em análise",
    hue: 200,
    createdAt: "há 4 dias",
  },
  {
    id: "i3",
    theme: "Por que você tem medo do infinito",
    summary:
      "Vídeo emocional que conecta o conceito matemático de infinito com o desconforto humano diante da eternidade.",
    angle: "Ensaio pessoal com narração íntima e trilha melancólica.",
    emotional: "Medo",
    origin: "Manual",
    trend: 54,
    fit: 88,
    potential: 79,
    repetitionRisk: 22,
    tags: ["ensaio", "filosofia", "existencial"],
    status: "Nova",
    hue: 280,
    createdAt: "há 6 horas",
  },
  {
    id: "i4",
    theme: "A dor de descobrir que o tempo não existe",
    summary:
      "Aprofundar teorias contemporâneas que sugerem que a percepção temporal é uma ilusão do cérebro.",
    angle: "Documentário-ensaio com entrevistas simuladas de físicos.",
    emotional: "Dor",
    origin: "Pesquisa",
    trend: 66,
    fit: 90,
    potential: 84,
    repetitionRisk: 26,
    tags: ["tempo", "física", "documentário"],
    status: "Em análise",
    hue: 260,
    createdAt: "há 1 dia",
  },
  {
    id: "i5",
    theme: "O desejo secreto de todo astrônomo amador",
    summary:
      "História leve sobre a paixão de descobrir algo novo no céu — com foco em cometas caseiros.",
    angle: "Tom inspiracional, entrevistas rápidas e imagens noturnas.",
    emotional: "Desejo",
    origin: "Comunidade",
    trend: 41,
    fit: 68,
    potential: 61,
    repetitionRisk: 12,
    tags: ["astronomia amadora", "inspiracional"],
    status: "Nova",
    hue: 180,
    createdAt: "há 8 horas",
  },
  {
    id: "i6",
    theme: "Recriando o Big Bang em 10 minutos",
    summary:
      "Formato didático que reconstrói os primeiros instantes do universo com animações.",
    angle: "Explicativo, animação heavy, ritmo médio.",
    emotional: "Curiosidade",
    origin: "Histórico do canal",
    trend: 70,
    fit: 96,
    potential: 90,
    repetitionRisk: 44,
    tags: ["big bang", "explicativo"],
    status: "Selecionada",
    hue: 30,
    createdAt: "há 3 dias",
  },
  {
    id: "i7",
    theme: "O medo silencioso dos astronautas",
    summary:
      "Investigação sobre a saúde mental de astronautas em missões longas e o preço psicológico do isolamento.",
    angle: "Documental sério, depoimentos, trilha densa.",
    emotional: "Medo",
    origin: "Tendência",
    trend: 82,
    fit: 78,
    potential: 86,
    repetitionRisk: 20,
    tags: ["astronautas", "psicologia", "documental"],
    status: "Nova",
    hue: 340,
    createdAt: "há 12 horas",
  },
  {
    id: "i8",
    theme: "Repetir Marte: por que insistimos em ir",
    summary:
      "Análise crítica do fascínio da humanidade por Marte e o custo real das missões.",
    angle: "Ensaio opinativo com dados de missões passadas.",
    emotional: "Desejo",
    origin: "Histórico do canal",
    trend: 58,
    fit: 82,
    potential: 72,
    repetitionRisk: 70,
    tags: ["marte", "espaço", "opinião"],
    status: "Descartada",
    hue: 10,
    createdAt: "há 5 dias",
  },
  {
    id: "i9",
    theme: "A curiosidade que originou a astrofísica moderna",
    summary:
      "História de descobertas fundamentais movidas por perguntas aparentemente ingênuas.",
    angle: "Narrativa histórica, ritmo médio, trilha épica.",
    emotional: "Curiosidade",
    origin: "Manual",
    trend: 49,
    fit: 86,
    potential: 74,
    repetitionRisk: 16,
    tags: ["história da ciência"],
    status: "Em análise",
    hue: 40,
    createdAt: "há 2 dias",
  },
];

const EMOTIONAL_FILTERS: {
  key: EmotionalTrigger;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}[] = [
  { key: "Dor", icon: HeartCrack, color: "text-rose-300" },
  { key: "Desejo", icon: Heart, color: "text-pink-300" },
  { key: "Medo", icon: ShieldAlert, color: "text-amber-300" },
  { key: "Curiosidade", icon: HelpCircle, color: "text-sky-300" },
];

const ORIGIN_FILTERS: {
  key: IdeaOrigin;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "Tendência", icon: TrendingUp },
  { key: "Histórico do canal", icon: History },
  { key: "Pesquisa", icon: Search },
  { key: "Manual", icon: Lightbulb },
  { key: "Comunidade", icon: Sparkles },
];

const STATUSES: IdeaStatus[] = ["Nova", "Em análise", "Selecionada", "Descartada"];

const STATUS_STYLES: Record<IdeaStatus, string> = {
  Nova: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  "Em análise": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Selecionada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  Descartada: "border-slate-500/40 bg-slate-500/10 text-slate-300",
};

// ---------------- component ----------------

type ViewMode = "ranked" | "cards" | "kanban";

function IdeasView() {
  const { project, channel } = Route.useLoaderData();

  const [ideas, setIdeas] = useState<Idea[]>(RAW_IDEAS);
  const [view, setView] = useState<ViewMode>("ranked");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sortBy, setSortBy] = useState<
    "potential" | "trend" | "fit" | "recent"
  >("potential");
  const [openIdeaId, setOpenIdeaId] = useState<string | null>(null);

  const [emotionSet, setEmotionSet] = useState<Set<EmotionalTrigger>>(new Set());
  const [originSet, setOriginSet] = useState<Set<IdeaOrigin>>(new Set());
  const [onlyTrending, setOnlyTrending] = useState(false);

  const filtered = useMemo(() => {
    let arr = ideas.filter((i) => {
      if (query) {
        const q = query.toLowerCase();
        const hay = `${i.theme} ${i.summary} ${i.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (emotionSet.size > 0 && !emotionSet.has(i.emotional)) return false;
      if (originSet.size > 0 && !originSet.has(i.origin)) return false;
      if (onlyTrending && i.trend < 70) return false;
      return true;
    });

    switch (sortBy) {
      case "potential":
        arr = [...arr].sort((a, b) => b.potential - a.potential);
        break;
      case "trend":
        arr = [...arr].sort((a, b) => b.trend - a.trend);
        break;
      case "fit":
        arr = [...arr].sort((a, b) => b.fit - a.fit);
        break;
      case "recent":
        // mock: ordem inversa do array
        arr = [...arr].reverse();
        break;
    }
    return arr;
  }, [ideas, query, emotionSet, originSet, onlyTrending, sortBy]);

  const selectedIdeas = filtered.filter((i) => selected.has(i.id));
  const activeFilterCount =
    emotionSet.size + originSet.size + (onlyTrending ? 1 : 0);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleEmotion = (k: EmotionalTrigger) => {
    setEmotionSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };
  const toggleOrigin = (k: IdeaOrigin) => {
    setOriginSet((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  const openIdea = ideas.find((i) => i.id === openIdeaId) ?? null;

  const setIdeaStatus = (id: string, status: IdeaStatus) => {
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
  };

  return (
    <TooltipProvider delayDuration={100}>
      <AppShell>
        <TopBar
          title="Ideias"
          subtitle={`${project.title} · ${channel.name}`}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
            {/* header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Processo · Ideias
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-slate-50">
                  Curadoria de ideias
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  {ideas.length} ideias geradas · {selected.size} selecionadas
                  para envio ao processo de títulos.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  Gerar novas ideias
                </Button>
                <Button
                  disabled={selected.size === 0}
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Send className="mr-2 h-4 w-4" />
                  Enviar {selected.size > 0 ? `${selected.size} ` : ""}selecionadas
                  para títulos
                </Button>
              </div>
            </div>

            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3 backdrop-blur">
              <div className="relative min-w-[240px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por tema, resumo ou tag…"
                  className="border-white/10 bg-white/[0.04] pl-9 text-slate-100 placeholder:text-slate-500"
                />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  >
                    <Filter className="mr-2 h-4 w-4" />
                    Filtros
                    {activeFilterCount > 0 && (
                      <Badge className="ml-2 h-5 border-primary/40 bg-primary/20 px-1.5 text-[10px] text-primary-foreground">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-80 border-white/10 bg-[#0F172A]/95 p-4 text-slate-100 backdrop-blur"
                >
                  <div className="space-y-4">
                    <div>
                      <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
                        Conexão emocional
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {EMOTIONAL_FILTERS.map(({ key, icon: Icon }) => {
                          const active = emotionSet.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleEmotion(key)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                                active
                                  ? "border-primary/50 bg-primary/20 text-slate-50"
                                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <div>
                      <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
                        Origem da ideia
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ORIGIN_FILTERS.map(({ key, icon: Icon }) => {
                          const active = originSet.has(key);
                          return (
                            <button
                              key={key}
                              onClick={() => toggleOrigin(key)}
                              className={cn(
                                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition",
                                active
                                  ? "border-primary/50 bg-primary/20 text-slate-50"
                                  : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/10",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {key}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Separator className="bg-white/10" />

                    <label className="flex items-center gap-2 text-sm text-slate-200">
                      <Checkbox
                        checked={onlyTrending}
                        onCheckedChange={(v) => setOnlyTrending(Boolean(v))}
                      />
                      <Flame className="h-4 w-4 text-amber-300" />
                      Apenas em alta tendência (&gt;70)
                    </label>

                    <div className="flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEmotionSet(new Set());
                          setOriginSet(new Set());
                          setOnlyTrending(false);
                        }}
                        className="text-slate-400 hover:text-slate-100"
                      >
                        Limpar filtros
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
                <SelectTrigger className="w-[220px] border-white/10 bg-white/[0.03] text-slate-200">
                  <ArrowUpDown className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                  <SelectItem value="potential">Potencial estimado</SelectItem>
                  <SelectItem value="trend">Tendência</SelectItem>
                  <SelectItem value="fit">Compatibilidade</SelectItem>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                </SelectContent>
              </Select>

              <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                <ViewButton
                  active={view === "ranked"}
                  onClick={() => setView("ranked")}
                  icon={TableIcon}
                  label="Lista"
                />
                <ViewButton
                  active={view === "cards"}
                  onClick={() => setView("cards")}
                  icon={LayoutGrid}
                  label="Cards"
                />
                <ViewButton
                  active={view === "kanban"}
                  onClick={() => setView("kanban")}
                  icon={Columns3}
                  label="Kanban"
                />
              </div>
            </div>

            {/* content */}
            {view === "ranked" && (
              <RankedList
                ideas={filtered}
                selected={selected}
                onToggle={toggleSelect}
                onOpen={(id) => setOpenIdeaId(id)}
              />
            )}
            {view === "cards" && (
              <CardsGrid
                ideas={filtered}
                selected={selected}
                onToggle={toggleSelect}
                onOpen={(id) => setOpenIdeaId(id)}
              />
            )}
            {view === "kanban" && (
              <KanbanBoard
                ideas={filtered}
                selected={selected}
                onToggle={toggleSelect}
                onOpen={(id) => setOpenIdeaId(id)}
                onSetStatus={setIdeaStatus}
              />
            )}
          </div>
        </div>

        {/* details sheet */}
        <Sheet
          open={!!openIdea}
          onOpenChange={(v) => !v && setOpenIdeaId(null)}
        >
          <SheetContent
            side="right"
            className="w-full border-white/10 bg-[#0F172A]/98 text-slate-100 sm:max-w-lg"
          >
            {openIdea && (
              <IdeaDetails
                idea={openIdea}
                onSetStatus={(s) => setIdeaStatus(openIdea.id, s)}
              />
            )}
          </SheetContent>
        </Sheet>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------------- shared bits ----------------

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition",
        active
          ? "bg-primary text-primary-foreground"
          : "text-slate-300 hover:bg-white/10",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function EmotionalBadge({ e }: { e: EmotionalTrigger }) {
  const cfg = EMOTIONAL_FILTERS.find((f) => f.key === e)!;
  const Icon = cfg.icon;
  return (
    <span className={cn(
      "inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px]",
      cfg.color,
    )}>
      <Icon className="h-3 w-3" />
      {e}
    </span>
  );
}

function OriginBadge({ o }: { o: IdeaOrigin }) {
  const cfg = ORIGIN_FILTERS.find((f) => f.key === o)!;
  const Icon = cfg.icon;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300">
      <Icon className="h-3 w-3" />
      {o}
    </span>
  );
}

function StatusBadge({ s }: { s: IdeaStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border px-2 py-0.5 text-[11px]", STATUS_STYLES[s])}
    >
      {s}
    </Badge>
  );
}

function ScoreBar({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string;
  value: number;
  tone: "primary" | "amber" | "emerald" | "rose";
  icon: React.ComponentType<{ className?: string }>;
}) {
  const toneMap = {
    primary: "bg-primary",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
    rose: "bg-rose-400",
  } as const;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-slate-400">
        <span className="inline-flex items-center gap-1">
          <Icon className="h-3 w-3" />
          {label}
        </span>
        <span className="tabular-nums text-slate-200">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full", toneMap[tone])}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

// ---------------- ranked list ----------------

function RankedList({
  ideas,
  selected,
  onToggle,
  onOpen,
}: {
  ideas: Idea[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (ideas.length === 0) return <EmptyState />;
  return (
    <div className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.02]">
      <div className="grid grid-cols-[36px_36px_1fr_120px_120px_100px_100px_120px] items-center gap-3 border-b border-white/5 bg-white/[0.03] px-4 py-2 text-[11px] uppercase tracking-wider text-slate-400">
        <span></span>
        <span>#</span>
        <span>Ideia</span>
        <span>Emocional</span>
        <span>Origem</span>
        <span className="text-right">Tendência</span>
        <span className="text-right">Compat.</span>
        <span className="text-right">Potencial</span>
      </div>
      <ol className="divide-y divide-white/5">
        {ideas.map((idea, idx) => {
          const isSelected = selected.has(idea.id);
          return (
            <li
              key={idea.id}
              className={cn(
                "grid grid-cols-[36px_36px_1fr_120px_120px_100px_100px_120px] items-center gap-3 px-4 py-3 text-sm transition hover:bg-white/[0.03]",
                isSelected && "bg-primary/[0.06]",
              )}
            >
              <div className="flex items-center justify-center">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggle(idea.id)}
                />
              </div>
              <div className="text-xs font-semibold tabular-nums text-slate-400">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <button
                onClick={() => onOpen(idea.id)}
                className="min-w-0 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-100">
                    {idea.theme}
                  </span>
                  <StatusBadge s={idea.status} />
                  {idea.repetitionRisk >= 50 && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 text-[10px] text-rose-200">
                          <AlertTriangle className="h-3 w-3" />
                          Repetição
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        Alto risco de repetição: {idea.repetitionRisk}%
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
                <div className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                  {idea.summary}
                </div>
              </button>
              <div><EmotionalBadge e={idea.emotional} /></div>
              <div><OriginBadge o={idea.origin} /></div>
              <ScoreCell value={idea.trend} tone="amber" />
              <ScoreCell value={idea.fit} tone="primary" />
              <ScoreCell value={idea.potential} tone="emerald" />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ScoreCell({
  value,
  tone,
}: {
  value: number;
  tone: "primary" | "amber" | "emerald";
}) {
  const toneMap = {
    primary: "bg-primary",
    amber: "bg-amber-400",
    emerald: "bg-emerald-400",
  } as const;
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={cn("h-full rounded-full", toneMap[tone])}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-7 text-right text-xs tabular-nums text-slate-200">
        {value}
      </span>
    </div>
  );
}

// ---------------- cards grid ----------------

function CardsGrid({
  ideas,
  selected,
  onToggle,
  onOpen,
}: {
  ideas: Idea[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (ideas.length === 0) return <EmptyState />;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ideas.map((idea) => (
        <IdeaCard
          key={idea.id}
          idea={idea}
          selected={selected.has(idea.id)}
          onToggle={() => onToggle(idea.id)}
          onOpen={() => onOpen(idea.id)}
        />
      ))}
    </div>
  );
}

function IdeaCard({
  idea,
  selected,
  onToggle,
  onOpen,
  compact = false,
}: {
  idea: Idea;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white/[0.02] p-4 backdrop-blur transition hover:border-white/20",
        selected ? "border-primary/60 ring-1 ring-primary/40" : "border-white/5",
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-16 opacity-40"
        style={{
          background: `linear-gradient(180deg, hsl(${idea.hue} 70% 45% / 0.35), transparent)`,
        }}
      />
      <div className="relative flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            className="mt-1"
          />
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge s={idea.status} />
              <OriginBadge o={idea.origin} />
            </div>
            <button
              onClick={onOpen}
              className="mt-1.5 text-left text-base font-semibold leading-snug text-slate-50 hover:text-white"
            >
              {idea.theme}
            </button>
          </div>
        </div>
      </div>

      <p className="relative mt-3 line-clamp-2 text-sm text-slate-400">
        {idea.summary}
      </p>

      {!compact && (
        <div className="relative mt-3 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 text-xs text-slate-300">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
            Ângulo
          </div>
          {idea.angle}
        </div>
      )}

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        <EmotionalBadge e={idea.emotional} />
        {idea.tags.slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-slate-300"
          >
            #{t}
          </span>
        ))}
      </div>

      <div className="relative mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
        <ScoreBar label="Tendência" value={idea.trend} tone="amber" icon={TrendingUp} />
        <ScoreBar label="Compat. canal" value={idea.fit} tone="primary" icon={Target} />
        <ScoreBar label="Potencial" value={idea.potential} tone="emerald" icon={Sparkles} />
        <ScoreBar label="Risco repet." value={idea.repetitionRisk} tone="rose" icon={Repeat} />
      </div>
    </div>
  );
}

// ---------------- kanban ----------------

function KanbanBoard({
  ideas,
  selected,
  onToggle,
  onOpen,
  onSetStatus,
}: {
  ideas: Idea[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
  onSetStatus: (id: string, s: IdeaStatus) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {STATUSES.map((status) => {
        const col = ideas.filter((i) => i.status === status);
        return (
          <div
            key={status}
            className="flex flex-col rounded-2xl border border-white/5 bg-white/[0.02] p-3"
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge s={status} />
                <span className="text-xs text-slate-400">{col.length}</span>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {col.length === 0 && (
                <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-xs text-slate-500">
                  Sem ideias nesta coluna
                </div>
              )}
              {col.map((idea) => (
                <div key={idea.id} className="relative">
                  <IdeaCard
                    idea={idea}
                    selected={selected.has(idea.id)}
                    onToggle={() => onToggle(idea.id)}
                    onOpen={() => onOpen(idea.id)}
                    compact
                  />
                  <div className="mt-2 flex items-center justify-end">
                    <Select
                      value={idea.status}
                      onValueChange={(v) =>
                        onSetStatus(idea.id, v as IdeaStatus)
                      }
                    >
                      <SelectTrigger className="h-7 w-[150px] border-white/10 bg-white/[0.04] text-xs text-slate-300">
                        <SelectValue />
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </SelectTrigger>
                      <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            Mover para {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------- details ----------------

function IdeaDetails({
  idea,
  onSetStatus,
}: {
  idea: Idea;
  onSetStatus: (s: IdeaStatus) => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="space-y-2 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge s={idea.status} />
          <OriginBadge o={idea.origin} />
          <EmotionalBadge e={idea.emotional} />
        </div>
        <SheetTitle className="text-xl text-slate-50">{idea.theme}</SheetTitle>
        <SheetDescription className="text-slate-400">
          {idea.summary}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 flex-1 space-y-6 overflow-y-auto pr-1">
        <section>
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
            Ângulo narrativo
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3 text-sm text-slate-200">
            {idea.angle}
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4">
          <ScoreBar label="Tendência" value={idea.trend} tone="amber" icon={TrendingUp} />
          <ScoreBar label="Compat. canal" value={idea.fit} tone="primary" icon={Target} />
          <ScoreBar label="Potencial estimado" value={idea.potential} tone="emerald" icon={Sparkles} />
          <ScoreBar label="Risco de repetição" value={idea.repetitionRisk} tone="rose" icon={Repeat} />
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
            Tags
          </div>
          <div className="flex flex-wrap gap-1.5">
            {idea.tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-slate-300"
              >
                #{t}
              </span>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
            Progresso de qualidade
          </div>
          <div className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Score composto</span>
              <span className="tabular-nums text-slate-200">
                {Math.round(
                  (idea.trend + idea.fit + idea.potential - idea.repetitionRisk) /
                    3,
                )}
              </span>
            </div>
            <Progress
              value={Math.max(
                0,
                Math.min(
                  100,
                  (idea.trend + idea.fit + idea.potential - idea.repetitionRisk) /
                    3,
                ),
              )}
              className="mt-2 h-1.5 bg-white/[0.06]"
            />
          </div>
        </section>

        <section>
          <div className="mb-2 text-xs uppercase tracking-wider text-slate-400">
            Criada
          </div>
          <div className="text-sm text-slate-300">{idea.createdAt}</div>
        </section>
      </div>

      <div className="mt-6 flex flex-col gap-2 border-t border-white/10 pt-4">
        <Select
          value={idea.status}
          onValueChange={(v) => onSetStatus(v as IdeaStatus)}
        >
          <SelectTrigger className="w-full border-white/10 bg-white/[0.04] text-slate-100">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                Mover para {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
          <Send className="mr-2 h-4 w-4" />
          Enviar para títulos
        </Button>
      </div>
    </div>
  );
}

// ---------------- empty ----------------

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
      <Lightbulb className="mx-auto h-8 w-8 text-slate-500" />
      <h3 className="mt-3 text-sm font-medium text-slate-200">
        Nenhuma ideia corresponde aos filtros
      </h3>
      <p className="mt-1 text-xs text-slate-500">
        Ajuste os filtros ou gere novas ideias para o projeto.
      </p>
    </div>
  );
}
