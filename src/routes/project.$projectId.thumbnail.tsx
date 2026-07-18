import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ImageIcon,
  Star,
  Check,
  MessageSquarePlus,
  Download,
  Plus,
  GitCompare,
  ZoomIn,
  Monitor,
  Smartphone,
  Youtube,
  Search,
  Filter,
  LayoutGrid,
  Layers,
  Eye,
  MoreHorizontal,
  MessageCircle,
  X,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/thumbnail")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Thumbnail — ${p.title} · ContentFlow OS`
            : "Thumbnail · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Versões de thumbnails com comparação, simulações no YouTube e alternância desktop/mobile.",
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
  component: ThumbnailView,
});

// ---------------- mock ----------------

type ThumbStatus = "Rascunho" | "Em análise" | "Aprovada" | "Alteração pedida";

type MockThumb = {
  id: string;
  version: number;
  layout: string;
  refs: string[];
  createdAt: string;
  status: ThumbStatus;
  comments: number;
  favorite: boolean;
  hueA: number;
  hueB: number;
  bigText: string;
  subText: string;
  face: "left" | "right" | "center" | "none";
  badge?: string;
};

const RAW_THUMBS: MockThumb[] = [
  {
    id: "th1",
    version: 5,
    layout: "Face + texto lateral",
    refs: ["MrBeast v3", "Space Weekly", "Referência interna 12"],
    createdAt: "há 30 min",
    status: "Em análise",
    comments: 3,
    favorite: true,
    hueA: 220,
    hueB: 260,
    bigText: "IMPOSSÍVEL",
    subText: "de explicar",
    face: "right",
    badge: "NOVO",
  },
  {
    id: "th2",
    version: 4,
    layout: "Split diagonal",
    refs: ["Cosmos Explained", "Deep Physics"],
    createdAt: "há 2 h",
    status: "Rascunho",
    comments: 0,
    favorite: false,
    hueA: 340,
    hueB: 20,
    bigText: "PARADOXO",
    subText: "do universo",
    face: "left",
  },
  {
    id: "th3",
    version: 3,
    layout: "Centralizado + moldura",
    refs: ["Referência interna 08"],
    createdAt: "há 5 h",
    status: "Alteração pedida",
    comments: 5,
    favorite: false,
    hueA: 30,
    hueB: 340,
    bigText: "5 MISTÉRIOS",
    subText: "que ninguém conta",
    face: "center",
    badge: "?",
  },
  {
    id: "th4",
    version: 2,
    layout: "Full-bleed dramático",
    refs: ["Kurzgesagt v2"],
    createdAt: "ontem",
    status: "Aprovada",
    comments: 2,
    favorite: true,
    hueA: 260,
    hueB: 180,
    bigText: "COSMOS",
    subText: "explicado",
    face: "none",
  },
  {
    id: "th5",
    version: 1,
    layout: "Face + texto lateral",
    refs: ["Referência interna 03"],
    createdAt: "há 2 dias",
    status: "Rascunho",
    comments: 1,
    favorite: false,
    hueA: 200,
    hueB: 280,
    bigText: "OLHE PRA CIMA",
    subText: "e entenda",
    face: "left",
  },
  {
    id: "th6",
    version: 1,
    layout: "Split diagonal",
    refs: ["Space Weekly", "Cosmos Explained"],
    createdAt: "há 3 dias",
    status: "Rascunho",
    comments: 0,
    favorite: false,
    hueA: 10,
    hueB: 220,
    bigText: "O ERRO",
    subText: "de Einstein",
    face: "right",
  },
];

const STATUSES: ThumbStatus[] = [
  "Rascunho",
  "Em análise",
  "Aprovada",
  "Alteração pedida",
];

const STATUS_STYLES: Record<ThumbStatus, string> = {
  Rascunho: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  "Em análise": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Aprovada: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  "Alteração pedida": "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const LAYOUTS = ["Face + texto lateral", "Split diagonal", "Centralizado + moldura", "Full-bleed dramático"];

// ---------------- component ----------------

type Density = "compact" | "regular" | "large";

function ThumbnailView() {
  const { project, channel } = Route.useLoaderData();
  const projectTitle = project.title;

  const [thumbs, setThumbs] = useState<MockThumb[]>(RAW_THUMBS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ThumbStatus | "all">("all");
  const [layoutFilter, setLayoutFilter] = useState<string | "all">("all");
  const [density, setDensity] = useState<Density>("regular");

  const [zoomId, setZoomId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  const [simOpen, setSimOpen] = useState(false);
  const [simDevice, setSimDevice] = useState<"desktop" | "mobile">("desktop");
  const [simMode, setSimMode] = useState<"home" | "search">("home");
  const [simThumbId, setSimThumbId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return thumbs.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (layoutFilter !== "all" && t.layout !== layoutFilter) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${t.layout} ${t.refs.join(" ")} v${t.version}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [thumbs, statusFilter, layoutFilter, query]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleFav = (id: string) =>
    setThumbs((p) => p.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)));

  const setStatus = (id: string, status: ThumbStatus) =>
    setThumbs((p) => p.map((t) => (t.id === id ? { ...t, status } : t)));

  const createNewVersion = (id?: string) => {
    setThumbs((p) => {
      const src = id ? p.find((t) => t.id === id) : p[0];
      const maxV = Math.max(...p.map((t) => t.version));
      const nv: MockThumb = {
        id: `th-${Date.now().toString(36)}`,
        version: maxV + 1,
        layout: src?.layout ?? LAYOUTS[0],
        refs: src?.refs ?? [],
        createdAt: "agora",
        status: "Rascunho",
        comments: 0,
        favorite: false,
        hueA: (src?.hueA ?? 220) + 20,
        hueB: (src?.hueB ?? 260) + 20,
        bigText: src?.bigText ?? "NOVO",
        subText: src?.subText ?? "rascunho",
        face: src?.face ?? "center",
      };
      return [nv, ...p];
    });
  };

  const openSim = (id: string) => {
    setSimThumbId(id);
    setSimOpen(true);
  };
  const openZoom = (id: string) => setZoomId(id);

  const zoomThumb = thumbs.find((t) => t.id === zoomId);
  const simThumb = thumbs.find((t) => t.id === simThumbId) ?? filtered[0] ?? thumbs[0];
  const compareList = thumbs.filter((t) => selected.has(t.id));

  const densityGrid = {
    compact: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5",
    regular: "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
    large: "grid-cols-1 lg:grid-cols-2",
  }[density];

  return (
    <TooltipProvider delayDuration={100}>
      <AppShell>
        <TopBar title="Thumbnail" subtitle={`${project.title} · ${channel.name}`} />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-6 py-6">
            {/* header */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-400">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Processo · Thumbnail
                </div>
                <h1 className="mt-2 text-2xl font-semibold text-slate-50">
                  Galeria de versões
                </h1>
                <p className="mt-1 max-w-2xl text-sm text-slate-400">
                  {thumbs.length} versões · {selected.size} selecionadas para comparação.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  onClick={() => setCompareOpen(true)}
                  disabled={selected.size < 2}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Comparar {selected.size >= 2 ? `(${selected.size})` : ""}
                </Button>
                <Button
                  variant="outline"
                  className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  onClick={() => filtered[0] && openSim(filtered[0].id)}
                >
                  <Youtube className="mr-2 h-4 w-4 text-rose-400" />
                  Simular no YouTube
                </Button>
                <Button
                  className="bg-primary text-primary-foreground hover:bg-primary/90"
                  onClick={() => createNewVersion()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Nova versão
                </Button>
              </div>
            </div>

            {/* toolbar */}
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por layout, referência ou versão…"
                  className="border-white/10 bg-white/[0.04] pl-9 text-slate-100 placeholder:text-slate-500"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as ThumbStatus | "all")}
              >
                <SelectTrigger className="w-[180px] border-white/10 bg-white/[0.03] text-slate-200">
                  <Filter className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                  <SelectItem value="all">Todos os status</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={layoutFilter}
                onValueChange={(v) => setLayoutFilter(v)}
              >
                <SelectTrigger className="w-[220px] border-white/10 bg-white/[0.03] text-slate-200">
                  <Layers className="mr-2 h-4 w-4 text-slate-400" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="border-white/10 bg-[#0F172A] text-slate-100">
                  <SelectItem value="all">Todos os layouts</SelectItem>
                  {LAYOUTS.map((l) => (
                    <SelectItem key={l} value={l}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                {(
                  [
                    { k: "compact", label: "Reduzido" },
                    { k: "regular", label: "Padrão" },
                    { k: "large", label: "Grande" },
                  ] as const
                ).map(({ k, label }) => (
                  <button
                    key={k}
                    onClick={() => setDensity(k)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition",
                      density === k
                        ? "bg-primary text-primary-foreground"
                        : "text-slate-300 hover:bg-white/10",
                    )}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* grid */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
                <ImageIcon className="mx-auto h-8 w-8 text-slate-500" />
                <h3 className="mt-3 text-sm font-medium text-slate-200">
                  Nenhuma thumbnail encontrada
                </h3>
              </div>
            ) : (
              <div className={cn("grid gap-4", densityGrid)}>
                {filtered.map((t) => (
                  <ThumbCard
                    key={t.id}
                    thumb={t}
                    density={density}
                    selected={selected.has(t.id)}
                    onToggle={() => toggleSelect(t.id)}
                    onFav={() => toggleFav(t.id)}
                    onZoom={() => openZoom(t.id)}
                    onSim={() => openSim(t.id)}
                    onApprove={() => setStatus(t.id, "Aprovada")}
                    onRequest={() => setStatus(t.id, "Alteração pedida")}
                    onNewVersion={() => createNewVersion(t.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* zoom dialog */}
        <Dialog open={!!zoomId} onOpenChange={(v) => !v && setZoomId(null)}>
          <DialogContent className="max-w-5xl border-white/10 bg-[#0F172A] p-6 text-slate-100">
            {zoomThumb && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <ZoomIn className="h-4 w-4 text-primary" />
                    Versão {zoomThumb.version} · {zoomThumb.layout}
                  </DialogTitle>
                  <DialogDescription className="text-slate-400">
                    Criada {zoomThumb.createdAt} · {zoomThumb.refs.length} referências
                  </DialogDescription>
                </DialogHeader>
                <div className="overflow-hidden rounded-xl border border-white/10">
                  <ThumbCanvas thumb={zoomThumb} className="text-2xl" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30"
                    onClick={() => {
                      setStatus(zoomThumb.id, "Aprovada");
                      setZoomId(null);
                    }}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Aprovar
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    Solicitar alteração
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Baixar
                  </Button>
                  <Button
                    variant="outline"
                    className="border-white/10 bg-white/[0.03] text-slate-200 hover:bg-white/10"
                    onClick={() => {
                      setZoomId(null);
                      openSim(zoomThumb.id);
                    }}
                  >
                    <Youtube className="mr-2 h-4 w-4 text-rose-400" />
                    Simular no YouTube
                  </Button>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* compare dialog */}
        <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
          <DialogContent className="max-w-6xl border-white/10 bg-[#0F172A] text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <GitCompare className="h-4 w-4 text-primary" />
                Comparação lado a lado
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                {compareList.length} versões selecionadas
              </DialogDescription>
            </DialogHeader>
            {compareList.length < 2 ? (
              <div className="py-8 text-center text-sm text-slate-500">
                Selecione ao menos duas versões.
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(compareList.length, 3)}, minmax(0, 1fr))`,
                }}
              >
                {compareList.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
                  >
                    <ThumbCanvas thumb={t} />
                    <div className="space-y-2 p-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-100">
                          Versão {t.version}
                        </span>
                        <StatusBadge s={t.status} />
                      </div>
                      <div className="text-slate-400">{t.layout}</div>
                      <div className="text-slate-500">
                        {t.refs.length} refs · {t.comments} comentários
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* youtube simulation dialog */}
        <Dialog open={simOpen} onOpenChange={setSimOpen}>
          <DialogContent className="max-w-5xl border-white/10 bg-[#0F172A] p-0 text-slate-100">
            <DialogHeader className="border-b border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <DialogTitle className="flex items-center gap-2">
                  <Youtube className="h-4 w-4 text-rose-400" />
                  Simulação no YouTube · Versão {simThumb.version}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    <button
                      onClick={() => setSimMode("home")}
                      className={cn(
                        "px-3 py-1.5 text-xs",
                        simMode === "home"
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-300 hover:bg-white/10",
                      )}
                    >
                      Página inicial
                    </button>
                    <button
                      onClick={() => setSimMode("search")}
                      className={cn(
                        "px-3 py-1.5 text-xs",
                        simMode === "search"
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-300 hover:bg-white/10",
                      )}
                    >
                      Resultados de busca
                    </button>
                  </div>
                  <div className="inline-flex overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                    <button
                      onClick={() => setSimDevice("desktop")}
                      className={cn(
                        "px-2.5 py-1.5 text-xs",
                        simDevice === "desktop"
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-300 hover:bg-white/10",
                      )}
                    >
                      <Monitor className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setSimDevice("mobile")}
                      className={cn(
                        "px-2.5 py-1.5 text-xs",
                        simDevice === "mobile"
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-300 hover:bg-white/10",
                      )}
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </DialogHeader>
            <div className="max-h-[70vh] overflow-y-auto p-4">
              <YoutubeSimulation
                thumb={simThumb}
                channel={channel.name}
                projectTitle={projectTitle}
                device={simDevice}
                mode={simMode}
              />
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------------- thumb card ----------------

function ThumbCard({
  thumb,
  density,
  selected,
  onToggle,
  onFav,
  onZoom,
  onSim,
  onApprove,
  onRequest,
  onNewVersion,
}: {
  thumb: MockThumb;
  density: Density;
  selected: boolean;
  onToggle: () => void;
  onFav: () => void;
  onZoom: () => void;
  onSim: () => void;
  onApprove: () => void;
  onRequest: () => void;
  onNewVersion: () => void;
}) {
  const compact = density === "compact";
  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-2xl border bg-white/[0.02] transition hover:border-white/20",
        selected ? "border-primary/60 ring-1 ring-primary/40" : "border-white/5",
      )}
    >
      {/* preview */}
      <div className="relative">
        <ThumbCanvas
          thumb={thumb}
          className={cn(
            compact ? "text-sm" : density === "large" ? "text-3xl" : "text-xl",
          )}
        />
        {/* top overlay */}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
          <div className="flex items-center gap-1.5">
            <div
              className="rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur"
            >
              v{thumb.version}
            </div>
            <StatusBadge s={thumb.status} />
          </div>
          <div className="flex items-center gap-1">
            <Checkbox
              checked={selected}
              onCheckedChange={onToggle}
              className="border-white/60 bg-black/40"
            />
            <button
              onClick={onFav}
              className={cn(
                "rounded-md bg-black/60 p-1 backdrop-blur transition",
                thumb.favorite ? "text-amber-300" : "text-white/80 hover:text-white",
              )}
            >
              <Star className={cn("h-3.5 w-3.5", thumb.favorite && "fill-amber-300")} />
            </button>
          </div>
        </div>
        {/* bottom overlay quick actions */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onZoom}
                className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white/90 backdrop-blur hover:bg-black/80"
              >
                <ZoomIn className="h-3 w-3" />
                Zoom
              </button>
            </TooltipTrigger>
            <TooltipContent>Ampliar</TooltipContent>
          </Tooltip>
          <div className="flex items-center gap-1">
            <button
              onClick={onSim}
              className="inline-flex items-center gap-1 rounded-md bg-black/60 px-2 py-1 text-[11px] text-white/90 backdrop-blur hover:bg-black/80"
            >
              <Youtube className="h-3 w-3 text-rose-400" />
              YouTube
            </button>
            <button
              onClick={onApprove}
              className="inline-flex items-center gap-1 rounded-md bg-emerald-500/80 px-2 py-1 text-[11px] font-medium text-white backdrop-blur hover:bg-emerald-500"
            >
              <Check className="h-3 w-3" />
              Aprovar
            </button>
          </div>
        </div>
      </div>

      {/* meta */}
      {!compact && (
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <Layers className="h-3.5 w-3.5 shrink-0 text-slate-500" />
              <span className="truncate text-sm font-medium text-slate-100">
                {thumb.layout}
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-slate-100">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="border-white/10 bg-[#0F172A] text-slate-100"
              >
                <DropdownMenuItem onClick={onZoom}>
                  <ZoomIn className="mr-2 h-4 w-4" /> Zoom
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onSim}>
                  <Youtube className="mr-2 h-4 w-4" /> Simular no YouTube
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onNewVersion}>
                  <Plus className="mr-2 h-4 w-4" /> Criar nova versão
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-white/10" />
                <DropdownMenuItem onClick={onApprove}>
                  <Check className="mr-2 h-4 w-4" /> Aprovar
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onRequest}>
                  <MessageSquarePlus className="mr-2 h-4 w-4" /> Solicitar alteração
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="mr-2 h-4 w-4" /> Baixar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex flex-wrap items-center gap-1">
            {thumb.refs.slice(0, 3).map((r) => (
              <span
                key={r}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] text-slate-300"
              >
                {r}
              </span>
            ))}
            {thumb.refs.length > 3 && (
              <span className="text-[10px] text-slate-500">
                +{thumb.refs.length - 3}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Criada {thumb.createdAt}</span>
            <span className="inline-flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {thumb.comments}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- shared bits ----------------

function StatusBadge({ s }: { s: ThumbStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border px-2 py-0.5 text-[10px]", STATUS_STYLES[s])}
    >
      {s}
    </Badge>
  );
}

function ThumbCanvas({
  thumb,
  className,
}: {
  thumb: MockThumb;
  className?: string;
}) {
  const face =
    thumb.face === "left"
      ? "left-4 bottom-4"
      : thumb.face === "right"
      ? "right-4 bottom-4"
      : thumb.face === "center"
      ? "left-1/2 bottom-4 -translate-x-1/2"
      : "";

  return (
    <div
      className="relative aspect-video w-full overflow-hidden"
      style={{
        background: `radial-gradient(140% 90% at 20% 0%, hsl(${thumb.hueA} 80% 55%) 0%, hsl(${thumb.hueA} 80% 30%) 45%, hsl(${thumb.hueB} 80% 18%) 100%)`,
      }}
    >
      {/* decorative rings */}
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border border-white/10" />
      <div className="pointer-events-none absolute -left-16 bottom-4 h-52 w-52 rounded-full border border-white/10" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.55) 100%)",
        }}
      />

      {/* face silhouette */}
      {thumb.face !== "none" && (
        <div
          className={cn(
            "absolute h-[70%] w-[38%] rounded-t-full bg-white/20",
            face,
          )}
        >
          <div className="absolute left-1/2 top-[30%] h-6 w-6 -translate-x-1/2 rounded-full bg-white/40" />
          <div className="absolute left-1/2 top-[55%] h-4 w-16 -translate-x-1/2 rounded-full bg-white/30" />
        </div>
      )}

      {/* text block */}
      <div
        className={cn(
          "absolute inset-x-4 top-4 flex flex-col",
          thumb.face === "left" ? "items-end text-right" :
          thumb.face === "right" ? "items-start text-left" :
          "items-start text-left",
        )}
      >
        <div
          className={cn(
            "font-black uppercase leading-none text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.5)]",
            className ?? "text-xl",
          )}
          style={{
            WebkitTextStroke: "1px rgba(0,0,0,0.5)",
          }}
        >
          {thumb.bigText}
        </div>
        <div className="mt-1 text-[0.65em] font-semibold uppercase tracking-wider text-white/85">
          {thumb.subText}
        </div>
      </div>

      {/* badge */}
      {thumb.badge && (
        <div className="absolute right-3 top-3 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-black">
          {thumb.badge}
        </div>
      )}

      {/* duration chip */}
      <div className="absolute bottom-2 right-2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
        12:34
      </div>
    </div>
  );
}

// ---------------- youtube simulation ----------------

function YoutubeSimulation({
  thumb,
  channel,
  projectTitle,
  device,
  mode,
}: {
  thumb: MockThumb;
  channel: string;
  projectTitle: string;
  device: "desktop" | "mobile";
  mode: "home" | "search";
}) {
  const isMobile = device === "mobile";

  const distractors: MockThumb[] = RAW_THUMBS.filter((t) => t.id !== thumb.id).slice(0, 5);

  if (mode === "home") {
    return (
      <div
        className={cn(
          "mx-auto rounded-xl border border-white/10 bg-[#0F0F0F] p-4",
          isMobile ? "max-w-[380px]" : "w-full",
        )}
      >
        <YoutubeHeader isMobile={isMobile} />
        <div
          className={cn(
            "mt-4 grid gap-4",
            isMobile ? "grid-cols-1" : "grid-cols-2 lg:grid-cols-3",
          )}
        >
          {/* main */}
          <HomeCard
            thumb={thumb}
            title={projectTitle}
            channel={channel}
            highlight
          />
          {distractors.slice(0, isMobile ? 2 : 5).map((t, i) => (
            <HomeCard
              key={t.id}
              thumb={t}
              title={`Vídeo relacionado ${i + 1}`}
              channel={i % 2 === 0 ? "Cosmos Explained" : "Space Weekly"}
            />
          ))}
        </div>
      </div>
    );
  }

  // search mode
  return (
    <div
      className={cn(
        "mx-auto rounded-xl border border-white/10 bg-[#0F0F0F] p-4",
        isMobile ? "max-w-[380px]" : "w-full",
      )}
    >
      <YoutubeHeader isMobile={isMobile} searchQuery="universo expansão" />
      <div className="mt-4 flex flex-col gap-4">
        <SearchRow
          thumb={thumb}
          title={projectTitle}
          channel={channel}
          isMobile={isMobile}
          highlight
        />
        {distractors.slice(0, 3).map((t, i) => (
          <SearchRow
            key={t.id}
            thumb={t}
            title={`Resultado similar sobre universo #${i + 1}`}
            channel={i % 2 === 0 ? "Deep Physics" : "Space Weekly"}
            isMobile={isMobile}
          />
        ))}
      </div>
    </div>
  );
}

function YoutubeHeader({
  isMobile,
  searchQuery,
}: {
  isMobile: boolean;
  searchQuery?: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-white/10 pb-3">
      <Youtube className="h-5 w-5 text-rose-500" />
      {!isMobile && (
        <span className="text-sm font-semibold text-white">YouTube</span>
      )}
      <div className="ml-auto flex flex-1 items-center gap-2 rounded-full border border-white/10 bg-[#1a1a1a] px-3 py-1.5 text-[11px] text-white/60">
        <Search className="h-3 w-3" />
        {searchQuery ?? "Pesquisar"}
      </div>
    </div>
  );
}

function HomeCard({
  thumb,
  title,
  channel,
  highlight,
}: {
  thumb: MockThumb;
  title: string;
  channel: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-[#0F0F0F]",
      )}
    >
      <ThumbCanvas thumb={thumb} className="text-base" />
      <div className="flex gap-2 p-2">
        <div className="h-8 w-8 shrink-0 rounded-full bg-white/20" />
        <div className="min-w-0">
          <div className="line-clamp-2 text-[13px] font-medium text-white">
            {title}
          </div>
          <div className="mt-0.5 text-[11px] text-white/60">{channel}</div>
          <div className="text-[11px] text-white/50">
            45 mil visualizações · há 2 dias
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchRow({
  thumb,
  title,
  channel,
  isMobile,
  highlight,
}: {
  thumb: MockThumb;
  title: string;
  channel: string;
  isMobile: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg p-2",
        highlight && "ring-2 ring-primary ring-offset-2 ring-offset-[#0F0F0F]",
        isMobile ? "flex-col" : "flex-row",
      )}
    >
      <div
        className={cn(
          "overflow-hidden rounded-lg",
          isMobile ? "w-full" : "w-[280px] shrink-0",
        )}
      >
        <ThumbCanvas thumb={thumb} className="text-base" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[15px] font-medium text-white">
          {title}
        </div>
        <div className="mt-1 text-[11px] text-white/60">
          {channel} · 45 mil visualizações · há 2 dias
        </div>
        <p className="mt-2 line-clamp-2 text-[12px] text-white/50">
          Explorando os limites da compreensão humana sobre o universo em
          expansão e o que a nova física sugere sobre o futuro.
        </p>
      </div>
    </div>
  );
}
