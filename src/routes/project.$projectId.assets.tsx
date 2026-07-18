import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Image as ImageIcon,
  Film,
  Frame,
  Type,
  Sparkles,
  Layers,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Grid3x3,
  ChevronRight,
  Download,
  Upload,
  Plus,
  MoreHorizontal,
  X,
  Play,
  Wand2,
  ExternalLink,
  Repeat2,
  FileWarning,
  Ban,
  RectangleHorizontal,
  RectangleVertical,
  Square,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
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

export const Route = createFileRoute("/project/$projectId/assets")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Assets — ${p.title} · ContentFlow OS`
            : "Assets · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Biblioteca e timeline de assets visuais alinhados aos blocos do roteiro.",
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
  component: AssetsView,
});

// ---------------- types ----------------

type AssetKind = "video" | "image" | "frame" | "text" | "consistent" | "overlay";
type AssetStatus = "Aprovado" | "Em revisão" | "Rascunho" | "Reprovado";
type AssetOrigin = "Banco interno" | "Gerado por IA" | "Upload" | "Web" | "Stock";
type Orientation = "landscape" | "portrait" | "square";

type ScriptBlock = {
  id: string;
  name: string;
  from: number; // seconds
  to: number;
  kind: "intro" | "body" | "cta" | "transition" | "outro";
};

type IssueKind =
  | "missing"
  | "duplicate"
  | "invalid_duration"
  | "invalid_type"
  | "missing_required";

type Asset = {
  id: string;
  name: string;
  kind: AssetKind;
  origin: AssetOrigin;
  status: AssetStatus;
  orientation: Orientation;
  fileType: string;
  sizeMb: number;
  createdAt: string;
  hue: number; // for placeholder swatch
  // placement (optional — assets in library may not be placed)
  placement?: { blockId: string; from: number; duration: number };
  issues?: IssueKind[];
  notes?: string;
  usageCount?: number;
};

// ---------------- mock ----------------

const KIND_META: Record<
  AssetKind,
  { label: string; icon: typeof ImageIcon; color: string; trackColor: string }
> = {
  video: {
    label: "Vídeo",
    icon: Film,
    color: "text-sky-300 border-sky-500/40 bg-sky-500/10",
    trackColor: "bg-sky-500/25 border-sky-400/50 text-sky-100",
  },
  image: {
    label: "Imagem",
    icon: ImageIcon,
    color: "text-violet-300 border-violet-500/40 bg-violet-500/10",
    trackColor: "bg-violet-500/25 border-violet-400/50 text-violet-100",
  },
  frame: {
    label: "Frame",
    icon: Frame,
    color: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    trackColor: "bg-amber-500/25 border-amber-400/50 text-amber-100",
  },
  text: {
    label: "Texto",
    icon: Type,
    color: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    trackColor: "bg-emerald-500/25 border-emerald-400/50 text-emerald-100",
  },
  consistent: {
    label: "Elementos consistentes",
    icon: Sparkles,
    color: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10",
    trackColor: "bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-100",
  },
  overlay: {
    label: "Overlays",
    icon: Layers,
    color: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
    trackColor: "bg-cyan-500/25 border-cyan-400/50 text-cyan-100",
  },
};

const TRACK_ORDER: AssetKind[] = [
  "video",
  "image",
  "frame",
  "text",
  "consistent",
  "overlay",
];

const STATUS_STYLES: Record<AssetStatus, string> = {
  Aprovado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  "Em revisão": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Rascunho: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  Reprovado: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const ISSUE_META: Record<
  IssueKind,
  { label: string; icon: typeof AlertTriangle; color: string }
> = {
  missing: {
    label: "Trecho sem asset",
    icon: FileWarning,
    color: "text-rose-300 border-rose-500/40 bg-rose-500/10",
  },
  duplicate: {
    label: "Asset repetido",
    icon: Repeat2,
    color: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  },
  invalid_duration: {
    label: "Duração inválida",
    icon: Clock,
    color: "text-orange-300 border-orange-500/40 bg-orange-500/10",
  },
  invalid_type: {
    label: "Tipo não permitido",
    icon: Ban,
    color: "text-red-300 border-red-500/40 bg-red-500/10",
  },
  missing_required: {
    label: "Falta elemento obrigatório",
    icon: AlertTriangle,
    color: "text-yellow-300 border-yellow-500/40 bg-yellow-500/10",
  },
};

const BLOCKS: ScriptBlock[] = [
  { id: "b1", name: "Abertura", from: 0, to: 42, kind: "intro" },
  { id: "b2", name: "Contexto", from: 42, to: 126, kind: "body" },
  { id: "b3", name: "Desenvolvimento", from: 126, to: 214, kind: "body" },
  { id: "b4", name: "Ponto-chave", from: 214, to: 252, kind: "body" },
  { id: "b5", name: "CTA", from: 252, to: 296, kind: "cta" },
  { id: "b6", name: "Aprofundamento", from: 296, to: 456, kind: "body" },
  { id: "b7", name: "Consequências", from: 456, to: 568, kind: "body" },
  { id: "b8", name: "Contra-argumento", from: 568, to: 686, kind: "body" },
  { id: "b9", name: "Fecho", from: 686, to: 782, kind: "outro" },
];

const TOTAL = BLOCKS[BLOCKS.length - 1].to;

const BLOCK_KIND_COLOR: Record<ScriptBlock["kind"], string> = {
  intro: "bg-indigo-500/15 border-indigo-500/40 text-indigo-200",
  body: "bg-slate-500/15 border-slate-500/40 text-slate-200",
  cta: "bg-emerald-500/15 border-emerald-500/40 text-emerald-200",
  transition: "bg-sky-500/15 border-sky-500/40 text-sky-200",
  outro: "bg-violet-500/15 border-violet-500/40 text-violet-200",
};

const ASSETS: Asset[] = [
  { id: "a1", name: "Buracos negros — B-roll", kind: "video", origin: "Stock", status: "Aprovado", orientation: "landscape", fileType: "MP4", sizeMb: 42.1, createdAt: "Ontem", hue: 220, placement: { blockId: "b1", from: 0, duration: 24 }, usageCount: 1 },
  { id: "a2", name: "Título e nome do canal", kind: "text", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "SVG", sizeMb: 0.04, createdAt: "Ontem", hue: 140, placement: { blockId: "b1", from: 4, duration: 10 }, usageCount: 1 },
  { id: "a3", name: "Diagrama Eddington", kind: "image", origin: "Gerado por IA", status: "Em revisão", orientation: "landscape", fileType: "PNG", sizeMb: 3.6, createdAt: "Hoje", hue: 280, placement: { blockId: "b2", from: 50, duration: 28 }, usageCount: 1, notes: "Verificar legenda inferior." },
  { id: "a4", name: "Simulação galáctica — B-roll", kind: "video", origin: "Stock", status: "Aprovado", orientation: "landscape", fileType: "MP4", sizeMb: 88.5, createdAt: "Hoje", hue: 210, placement: { blockId: "b2", from: 80, duration: 40 } },
  { id: "a5", name: "Frame de citação: Hawking", kind: "frame", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 1.2, createdAt: "Ontem", hue: 40, placement: { blockId: "b3", from: 132, duration: 12 } },
  { id: "a6", name: "James Webb — imagem 1", kind: "image", origin: "Web", status: "Aprovado", orientation: "landscape", fileType: "JPG", sizeMb: 2.8, createdAt: "Ontem", hue: 260, placement: { blockId: "b3", from: 150, duration: 22 }, issues: ["duplicate"] },
  { id: "a7", name: "James Webb — imagem 1", kind: "image", origin: "Web", status: "Aprovado", orientation: "landscape", fileType: "JPG", sizeMb: 2.8, createdAt: "Ontem", hue: 260, placement: { blockId: "b6", from: 320, duration: 18 }, issues: ["duplicate"] },
  { id: "a8", name: "Marca d'água do canal", kind: "consistent", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 0.2, createdAt: "Sempre", hue: 300, placement: { blockId: "b1", from: 0, duration: TOTAL }, usageCount: 1 },
  { id: "a9", name: "Legendas dinâmicas", kind: "overlay", origin: "Gerado por IA", status: "Em revisão", orientation: "landscape", fileType: "JSON", sizeMb: 0.1, createdAt: "Hoje", hue: 190, placement: { blockId: "b2", from: 44, duration: 40 } },
  { id: "a10", name: "Overlay CTA — inscreva-se", kind: "overlay", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 0.5, createdAt: "Ontem", hue: 170, placement: { blockId: "b5", from: 258, duration: 30 } },
  { id: "a11", name: "Frame de destaque — Ponto-chave", kind: "frame", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 1.5, createdAt: "Hoje", hue: 50, placement: { blockId: "b4", from: 218, duration: 30 } },
  { id: "a12", name: "Texto: Chamada CTA", kind: "text", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "SVG", sizeMb: 0.02, createdAt: "Hoje", hue: 130, placement: { blockId: "b5", from: 260, duration: 24 } },
  { id: "a13", name: "LIGO — animação", kind: "video", origin: "Gerado por IA", status: "Rascunho", orientation: "landscape", fileType: "MP4", sizeMb: 61.2, createdAt: "Hoje", hue: 200, placement: { blockId: "b6", from: 360, duration: 60 }, issues: ["invalid_duration"], notes: "Excede duração do bloco em 4s." },
  { id: "a14", name: "Gráfico: sementes primordiais", kind: "image", origin: "Gerado por IA", status: "Em revisão", orientation: "landscape", fileType: "PNG", sizeMb: 4.2, createdAt: "Hoje", hue: 290, placement: { blockId: "b7", from: 464, duration: 40 } },
  { id: "a15", name: "Frame: Consequências", kind: "frame", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 1.4, createdAt: "Hoje", hue: 30, placement: { blockId: "b7", from: 510, duration: 40 } },
  { id: "a16", name: "Onda gravitacional — B-roll", kind: "video", origin: "Stock", status: "Aprovado", orientation: "landscape", fileType: "MP4", sizeMb: 54.0, createdAt: "Hoje", hue: 230, placement: { blockId: "b8", from: 574, duration: 66 } },
  { id: "a17", name: "Overlay: rodapé de fonte", kind: "overlay", origin: "Banco interno", status: "Aprovado", orientation: "landscape", fileType: "PNG", sizeMb: 0.3, createdAt: "Ontem", hue: 180, placement: { blockId: "b8", from: 620, duration: 30 } },
  { id: "a18", name: "Texto: Bloco de fecho", kind: "text", origin: "Banco interno", status: "Rascunho", orientation: "landscape", fileType: "SVG", sizeMb: 0.03, createdAt: "Hoje", hue: 120, placement: { blockId: "b9", from: 690, duration: 18 } },
  // Assets not placed in timeline (library-only)
  { id: "a19", name: "Retrato: Villeneuve", kind: "image", origin: "Upload", status: "Rascunho", orientation: "portrait", fileType: "TIFF", sizeMb: 12.4, createdAt: "Hoje", hue: 320, issues: ["invalid_type"], notes: "TIFF não é aceito pelo template. Converter para PNG." },
  { id: "a20", name: "Ícone consistente — inscrever", kind: "consistent", origin: "Banco interno", status: "Aprovado", orientation: "square", fileType: "SVG", sizeMb: 0.02, createdAt: "Sempre", hue: 300, usageCount: 0 },
  { id: "a21", name: "B-roll extra: universo profundo", kind: "video", origin: "Stock", status: "Em revisão", orientation: "landscape", fileType: "MP4", sizeMb: 121.0, createdAt: "Hoje", hue: 240 },
];

// ---------------- helpers ----------------

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const ORIENTATION_ICON: Record<Orientation, typeof RectangleHorizontal> = {
  landscape: RectangleHorizontal,
  portrait: RectangleVertical,
  square: Square,
};

// ---------------- component ----------------

function AssetsView() {
  const { project, channel } = Route.useLoaderData();

  const [assets] = useState<Asset[]>(ASSETS);
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<AssetKind | "all">("all");
  const [blockFilter, setBlockFilter] = useState<string | "all">("all");
  const [originFilter, setOriginFilter] = useState<AssetOrigin | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AssetStatus | "all">("all");
  const [orientationFilter, setOrientationFilter] = useState<Orientation | "all">("all");
  const [durationRange, setDurationRange] = useState<[number, number]>([0, 120]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const selected = assets.find((a) => a.id === selectedId) ?? null;

  // Compute issues at project level (missing coverage)
  const projectIssues = useMemo(() => {
    const missingBlocks: ScriptBlock[] = [];
    for (const b of BLOCKS) {
      const covered = assets.some(
        (a) =>
          a.placement?.blockId === b.id &&
          ["video", "image", "frame"].includes(a.kind),
      );
      if (!covered) missingBlocks.push(b);
    }
    const duplicates = assets.filter((a) => a.issues?.includes("duplicate"));
    const invalidDuration = assets.filter((a) =>
      a.issues?.includes("invalid_duration"),
    );
    const invalidType = assets.filter((a) => a.issues?.includes("invalid_type"));
    const missingRequired = !assets.some((a) => a.kind === "consistent");
    return { missingBlocks, duplicates, invalidDuration, invalidType, missingRequired };
  }, [assets]);

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      if (query && !a.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (kindFilter !== "all" && a.kind !== kindFilter) return false;
      if (blockFilter !== "all" && a.placement?.blockId !== blockFilter)
        return false;
      if (originFilter !== "all" && a.origin !== originFilter) return false;
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (orientationFilter !== "all" && a.orientation !== orientationFilter)
        return false;
      const dur = a.placement?.duration ?? 0;
      if (a.placement && (dur < durationRange[0] || dur > durationRange[1]))
        return false;
      return true;
    });
  }, [
    assets,
    query,
    kindFilter,
    blockFilter,
    originFilter,
    statusFilter,
    orientationFilter,
    durationRange,
  ]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  };

  return (
    <AppShell>
      <TopBar
        title="Assets"
        subtitle={`${project.title} · ${channel.name}`}
      />
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumb */}
          <div className="border-b border-white/5 px-6 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Link
                to="/channel/$channelId"
                params={{ channelId: channel.id }}
                className="hover:text-foreground"
              >
                {channel.name}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <Link
                to="/project/$projectId"
                params={{ projectId: project.id }}
                className="hover:text-foreground"
              >
                {project.title}
              </Link>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">Assets</span>
            </div>
          </div>

          {/* Alerts strip */}
          <IssuesBar
            missing={projectIssues.missingBlocks.length}
            duplicates={projectIssues.duplicates.length}
            invalidDuration={projectIssues.invalidDuration.length}
            invalidType={projectIssues.invalidType.length}
            missingRequired={projectIssues.missingRequired}
          />

          {/* TIMELINE */}
          <TimelineSection
            assets={assets}
            onOpen={openDetail}
            selectedId={selectedId}
            missingBlocks={projectIssues.missingBlocks}
          />

          <Separator className="bg-white/5" />

          {/* LIBRARY */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <LibraryToolbar
              query={query}
              onQuery={setQuery}
              kindFilter={kindFilter}
              onKindFilter={setKindFilter}
              blockFilter={blockFilter}
              onBlockFilter={setBlockFilter}
              originFilter={originFilter}
              onOriginFilter={setOriginFilter}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              orientationFilter={orientationFilter}
              onOrientationFilter={setOrientationFilter}
              durationRange={durationRange}
              onDurationRange={setDurationRange}
              total={assets.length}
              shown={filtered.length}
            />
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-2 gap-3 p-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {filtered.map((a) => (
                  <AssetCard
                    key={a.id}
                    asset={a}
                    active={a.id === selectedId}
                    onClick={() => openDetail(a.id)}
                  />
                ))}
                {filtered.length === 0 && (
                  <div className="col-span-full flex flex-col items-center gap-2 py-16 text-muted-foreground">
                    <Grid3x3 className="h-8 w-8" />
                    <p className="text-sm">
                      Nenhum asset corresponde aos filtros aplicados.
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        {/* Detail sheet */}
        <Sheet open={detailOpen} onOpenChange={setDetailOpen}>
          <SheetContent
            side="right"
            className="w-full overflow-y-auto sm:max-w-xl"
          >
            {selected ? (
              <DetailPanel asset={selected} />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Nenhum asset selecionado.
              </div>
            )}
          </SheetContent>
        </Sheet>
      </TooltipProvider>
    </AppShell>
  );
}

// ---------------- issues bar ----------------

function IssuesBar({
  missing,
  duplicates,
  invalidDuration,
  invalidType,
  missingRequired,
}: {
  missing: number;
  duplicates: number;
  invalidDuration: number;
  invalidType: number;
  missingRequired: boolean;
}) {
  const items: { kind: IssueKind; count: number }[] = [
    { kind: "missing", count: missing },
    { kind: "duplicate", count: duplicates },
    { kind: "invalid_duration", count: invalidDuration },
    { kind: "invalid_type", count: invalidType },
    { kind: "missing_required", count: missingRequired ? 1 : 0 },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);
  return (
    <div className="border-b border-white/5 bg-[hsl(var(--surface-2))]/40 px-6 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2 text-xs">
          {total === 0 ? (
            <>
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <span className="text-emerald-300">
                Tudo certo — nenhum alerta ativo
              </span>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
              <span className="text-amber-200">
                {total} {total === 1 ? "alerta" : "alertas"} de validação
              </span>
            </>
          )}
        </div>
        {items.map(({ kind, count }) => {
          if (count === 0) return null;
          const meta = ISSUE_META[kind];
          const Icon = meta.icon;
          return (
            <Badge
              key={kind}
              variant="outline"
              className={cn("gap-1 text-[11px]", meta.color)}
            >
              <Icon className="h-3 w-3" />
              {meta.label} · {count}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- timeline ----------------

function TimelineSection({
  assets,
  onOpen,
  selectedId,
  missingBlocks,
}: {
  assets: Asset[];
  onOpen: (id: string) => void;
  selectedId: string | null;
  missingBlocks: ScriptBlock[];
}) {
  const missingIds = new Set(missingBlocks.map((b) => b.id));
  const scale = (sec: number) => (sec / TOTAL) * 100;

  return (
    <div className="border-b border-white/5 bg-[hsl(var(--surface))]/60 p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Timeline</h2>
          <p className="text-xs text-muted-foreground">
            Blocos do roteiro com trilhas de assets · duração total {fmt(TOTAL)}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>0:00</span>
          <div className="mx-2 h-px w-24 bg-white/10" />
          <span>{fmt(TOTAL)}</span>
        </div>
      </div>

      {/* Blocks header */}
      <div className="rounded-t-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-2">
        <div className="relative h-10">
          {BLOCKS.map((b) => (
            <Tooltip key={b.id}>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "absolute top-0 flex h-full items-center gap-1.5 overflow-hidden rounded border px-2 text-[11px] font-medium",
                    BLOCK_KIND_COLOR[b.kind],
                    missingIds.has(b.id) &&
                      "outline outline-1 outline-rose-500/60",
                  )}
                  style={{
                    left: `${scale(b.from)}%`,
                    width: `calc(${scale(b.to - b.from)}% - 2px)`,
                  }}
                >
                  <span className="truncate">{b.name}</span>
                  {missingIds.has(b.id) && (
                    <FileWarning className="h-3 w-3 shrink-0 text-rose-300" />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-medium">{b.name}</div>
                <div className="text-xs text-muted-foreground">
                  {fmt(b.from)} – {fmt(b.to)}
                </div>
                {missingIds.has(b.id) && (
                  <div className="mt-1 text-xs text-rose-300">
                    Nenhum asset visual atribuído.
                  </div>
                )}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </div>

      {/* Tracks */}
      <div className="rounded-b-lg border border-t-0 border-white/5 bg-[hsl(var(--surface-2))]/20">
        {TRACK_ORDER.map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const rows = assets.filter((a) => a.kind === kind && a.placement);
          return (
            <div
              key={kind}
              className="grid grid-cols-[160px_1fr] border-t border-white/5 first:border-t-0"
            >
              <div className="flex items-center gap-2 border-r border-white/5 bg-[hsl(var(--surface))]/40 px-3 py-2.5 text-xs">
                <Icon className={cn("h-3.5 w-3.5", meta.color.split(" ")[0])} />
                <span className="font-medium">{meta.label}</span>
              </div>
              <div className="relative h-14 overflow-hidden py-2">
                {/* block guides */}
                {BLOCKS.map((b) => (
                  <div
                    key={b.id}
                    className="pointer-events-none absolute top-0 h-full border-r border-white/5"
                    style={{ left: `${scale(b.to)}%` }}
                  />
                ))}
                {rows.map((a) => {
                  if (!a.placement) return null;
                  const width = scale(a.placement.duration);
                  const left = scale(a.placement.from);
                  const isSelected = a.id === selectedId;
                  const hasIssue = (a.issues?.length ?? 0) > 0;
                  return (
                    <Tooltip key={a.id}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => onOpen(a.id)}
                          className={cn(
                            "absolute top-1 flex h-[calc(100%-8px)] items-center gap-1.5 overflow-hidden rounded border px-2 text-[11px] transition hover:brightness-125",
                            meta.trackColor,
                            isSelected &&
                              "outline outline-2 outline-primary shadow-[0_0_0_2px_hsl(var(--primary)/0.4)]",
                            hasIssue && "outline outline-1 outline-amber-400/70",
                          )}
                          style={{
                            left: `${left}%`,
                            width: `calc(${width}% - 2px)`,
                            minWidth: 30,
                          }}
                        >
                          {/* mini thumb */}
                          <span
                            className="h-4 w-6 shrink-0 rounded-sm"
                            style={{
                              background: `linear-gradient(135deg, hsl(${a.hue} 60% 45%), hsl(${(a.hue + 40) % 360} 60% 30%))`,
                            }}
                          />
                          <span className="truncate">{a.name}</span>
                          {hasIssue && (
                            <AlertTriangle className="h-3 w-3 shrink-0 text-amber-300" />
                          )}
                          {a.status === "Aprovado" && (
                            <CheckCircle2 className="ml-auto h-3 w-3 shrink-0 text-emerald-300" />
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div className="font-medium">{a.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {meta.label} · início {fmt(a.placement.from)} · duração{" "}
                          {a.placement.duration}s
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Origem: {a.origin} · Status: {a.status}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
                {rows.length === 0 && (
                  <div className="flex h-full items-center px-3 text-[11px] text-muted-foreground">
                    Nenhum asset nesta trilha.
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

// ---------------- library toolbar ----------------

function LibraryToolbar(props: {
  query: string;
  onQuery: (v: string) => void;
  kindFilter: AssetKind | "all";
  onKindFilter: (v: AssetKind | "all") => void;
  blockFilter: string | "all";
  onBlockFilter: (v: string | "all") => void;
  originFilter: AssetOrigin | "all";
  onOriginFilter: (v: AssetOrigin | "all") => void;
  statusFilter: AssetStatus | "all";
  onStatusFilter: (v: AssetStatus | "all") => void;
  orientationFilter: Orientation | "all";
  onOrientationFilter: (v: Orientation | "all") => void;
  durationRange: [number, number];
  onDurationRange: (v: [number, number]) => void;
  total: number;
  shown: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-white/5 bg-[hsl(var(--surface))]/50 px-6 py-3">
      <div>
        <h2 className="text-sm font-semibold">Biblioteca de assets</h2>
        <p className="text-xs text-muted-foreground">
          {props.shown} de {props.total} assets
        </p>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            placeholder="Buscar asset..."
            className="h-9 w-56 pl-8"
          />
        </div>

        <Select value={props.kindFilter} onValueChange={(v) => props.onKindFilter(v as AssetKind | "all")}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {TRACK_ORDER.map((k) => (
              <SelectItem key={k} value={k}>
                {KIND_META[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={props.blockFilter} onValueChange={(v) => props.onBlockFilter(v)}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Bloco" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os blocos</SelectItem>
            {BLOCKS.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={props.originFilter} onValueChange={(v) => props.onOriginFilter(v as AssetOrigin | "all")}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Origem" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as origens</SelectItem>
            {(["Banco interno", "Gerado por IA", "Upload", "Web", "Stock"] as AssetOrigin[]).map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={props.statusFilter} onValueChange={(v) => props.onStatusFilter(v as AssetStatus | "all")}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {(["Aprovado", "Em revisão", "Rascunho", "Reprovado"] as AssetStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={props.orientationFilter} onValueChange={(v) => props.onOrientationFilter(v as Orientation | "all")}>
          <SelectTrigger className="h-9 w-[130px] text-xs">
            <SelectValue placeholder="Orientação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="landscape">Paisagem</SelectItem>
            <SelectItem value="portrait">Retrato</SelectItem>
            <SelectItem value="square">Quadrado</SelectItem>
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <Clock className="h-3.5 w-3.5" />
              Duração
              <span className="text-muted-foreground">
                {props.durationRange[0]}–{props.durationRange[1]}s
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Duração (s)</span>
              <span className="font-mono">
                {props.durationRange[0]}–{props.durationRange[1]}
              </span>
            </div>
            <Slider
              value={props.durationRange}
              min={0}
              max={120}
              step={1}
              onValueChange={(v) => props.onDurationRange([v[0], v[1]] as [number, number])}
            />
          </PopoverContent>
        </Popover>

        <Separator orientation="vertical" className="h-6" />

        <Button variant="outline" size="sm" className="h-9">
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Enviar
        </Button>
        <Button size="sm" className="h-9">
          <Wand2 className="mr-1.5 h-3.5 w-3.5" />
          Gerar asset
        </Button>
      </div>
    </div>
  );
}

// ---------------- asset card ----------------

function AssetCard({
  asset,
  active,
  onClick,
}: {
  asset: Asset;
  active: boolean;
  onClick: () => void;
}) {
  const meta = KIND_META[asset.kind];
  const Icon = meta.icon;
  const OrIcon = ORIENTATION_ICON[asset.orientation];
  const hasIssue = (asset.issues?.length ?? 0) > 0;
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border bg-[hsl(var(--surface-2))]/40 text-left transition hover:border-white/20 hover:bg-[hsl(var(--surface-2))]/70",
        active
          ? "border-primary/60 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
          : "border-white/5",
      )}
    >
      <div
        className="relative aspect-video w-full overflow-hidden"
        style={{
          background: `linear-gradient(135deg, hsl(${asset.hue} 55% 40%), hsl(${(asset.hue + 40) % 360} 55% 22%))`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
        <div className="absolute left-2 top-2 flex items-center gap-1">
          <Badge
            variant="outline"
            className={cn("gap-1 backdrop-blur", meta.color, "border")}
          >
            <Icon className="h-3 w-3" />
            {meta.label}
          </Badge>
        </div>
        <div className="absolute right-2 top-2 flex items-center gap-1">
          {asset.status === "Aprovado" && (
            <span className="rounded-full bg-emerald-500/20 p-1 backdrop-blur">
              <CheckCircle2 className="h-3 w-3 text-emerald-300" />
            </span>
          )}
          {hasIssue && (
            <span className="rounded-full bg-amber-500/20 p-1 backdrop-blur">
              <AlertTriangle className="h-3 w-3 text-amber-300" />
            </span>
          )}
        </div>
        {asset.kind === "video" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/40 p-2 backdrop-blur">
              <Play className="ml-0.5 h-4 w-4 text-white" />
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="line-clamp-2 text-sm font-medium leading-tight">
            {asset.name}
          </span>
          <MoreHorizontal className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{asset.fileType}</span>
          <span>·</span>
          <span>{asset.sizeMb < 1 ? `${(asset.sizeMb * 1024).toFixed(0)} KB` : `${asset.sizeMb.toFixed(1)} MB`}</span>
          {asset.placement && (
            <>
              <span>·</span>
              <span>{asset.placement.duration}s</span>
            </>
          )}
          <OrIcon className="ml-auto h-3 w-3" />
        </div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <Badge
            variant="outline"
            className={cn("text-[10px]", STATUS_STYLES[asset.status])}
          >
            {asset.status}
          </Badge>
          <span className="truncate text-[10px] text-muted-foreground">
            {asset.origin}
          </span>
        </div>
      </div>
    </button>
  );
}

// ---------------- detail panel ----------------

function DetailPanel({ asset }: { asset: Asset }) {
  const meta = KIND_META[asset.kind];
  const Icon = meta.icon;
  const OrIcon = ORIENTATION_ICON[asset.orientation];
  const block = asset.placement
    ? BLOCKS.find((b) => b.id === asset.placement!.blockId)
    : null;

  return (
    <>
      <SheetHeader className="space-y-1">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={cn("gap-1", meta.color)}>
            <Icon className="h-3 w-3" />
            {meta.label}
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-[10px]", STATUS_STYLES[asset.status])}
          >
            {asset.status}
          </Badge>
        </div>
        <SheetTitle className="text-left text-lg leading-tight">
          {asset.name}
        </SheetTitle>
        <SheetDescription className="text-left">
          {asset.origin} · {asset.fileType} ·{" "}
          {asset.sizeMb < 1
            ? `${(asset.sizeMb * 1024).toFixed(0)} KB`
            : `${asset.sizeMb.toFixed(1)} MB`}
        </SheetDescription>
      </SheetHeader>

      {/* Preview */}
      <div
        className="relative mt-4 aspect-video w-full overflow-hidden rounded-lg border border-white/10"
        style={{
          background: `linear-gradient(135deg, hsl(${asset.hue} 55% 40%), hsl(${(asset.hue + 40) % 360} 55% 22%))`,
        }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_60%)]" />
        {asset.kind === "video" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-black/40 p-3 backdrop-blur">
              <Play className="ml-0.5 h-5 w-5 text-white" />
            </span>
          </div>
        )}
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <Badge variant="outline" className="gap-1 backdrop-blur">
            <OrIcon className="h-3 w-3" />
            {asset.orientation === "landscape"
              ? "Paisagem"
              : asset.orientation === "portrait"
                ? "Retrato"
                : "Quadrado"}
          </Badge>
        </div>
      </div>

      {/* Issues */}
      {(asset.issues?.length ?? 0) > 0 && (
        <div className="mt-4 space-y-2">
          {asset.issues!.map((k) => {
            const im = ISSUE_META[k];
            const IIcon = im.icon;
            return (
              <div
                key={k}
                className={cn(
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-xs",
                  im.color,
                )}
              >
                <IIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  <div className="font-medium">{im.label}</div>
                  {asset.notes && (
                    <div className="mt-0.5 text-muted-foreground">
                      {asset.notes}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Metadata */}
      <div className="mt-4 rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">Metadados</h3>
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <MetaRow label="Tipo" value={meta.label} />
          <MetaRow label="Origem" value={asset.origin} />
          <MetaRow label="Arquivo" value={asset.fileType} />
          <MetaRow
            label="Tamanho"
            value={
              asset.sizeMb < 1
                ? `${(asset.sizeMb * 1024).toFixed(0)} KB`
                : `${asset.sizeMb.toFixed(1)} MB`
            }
          />
          <MetaRow
            label="Orientação"
            value={
              asset.orientation === "landscape"
                ? "Paisagem"
                : asset.orientation === "portrait"
                  ? "Retrato"
                  : "Quadrado"
            }
          />
          <MetaRow label="Criado" value={asset.createdAt} />
          <MetaRow label="Status" value={asset.status} />
          <MetaRow
            label="Duração"
            value={asset.placement ? `${asset.placement.duration}s` : "—"}
          />
        </dl>
      </div>

      {/* Usage */}
      <div className="mt-4 rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
        <h3 className="mb-3 text-sm font-semibold">Uso na timeline</h3>
        {asset.placement && block ? (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Bloco</span>
              <Badge
                variant="outline"
                className={cn("text-[11px]", BLOCK_KIND_COLOR[block.kind])}
              >
                {block.name}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Início</span>
              <span className="font-mono">{fmt(asset.placement.from)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Duração</span>
              <span className="font-mono">{asset.placement.duration}s</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Fim</span>
              <span className="font-mono">
                {fmt(asset.placement.from + asset.placement.duration)}
              </span>
            </div>
            {/* Mini timeline strip */}
            <div className="mt-3 h-6 overflow-hidden rounded border border-white/10 bg-black/30">
              <div className="relative h-full">
                <div
                  className="absolute top-0 h-full bg-primary/60"
                  style={{
                    left: `${(asset.placement.from / TOTAL) * 100}%`,
                    width: `${(asset.placement.duration / TOTAL) * 100}%`,
                  }}
                />
                {BLOCKS.map((b) => (
                  <div
                    key={b.id}
                    className="absolute top-0 h-full border-r border-white/10"
                    style={{ left: `${(b.to / TOTAL) * 100}%` }}
                  />
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Este asset ainda não foi posicionado na timeline.
          </p>
        )}
      </div>

      {/* Notes */}
      <div className="mt-4 rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
        <h3 className="mb-2 text-sm font-semibold">Observações</h3>
        <p className="text-sm text-muted-foreground">
          {asset.notes ?? "Sem observações adicionais registradas."}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm">
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Aprovar
        </Button>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar à timeline
        </Button>
        <Button size="sm" variant="outline">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Baixar
        </Button>
        <Button size="sm" variant="ghost">
          <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
          Abrir original
        </Button>
        <Button size="sm" variant="ghost" className="text-rose-300 hover:text-rose-200">
          <X className="mr-1.5 h-3.5 w-3.5" />
          Remover
        </Button>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm">{value}</dd>
    </>
  );
}
