import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Download,
  Check,
  MessageSquare,
  MessageSquarePlus,
  GitCompare,
  Send,
  ChevronRight,
  Film,
  Music,
  Sparkles,
  Layers,
  Megaphone,
  BookOpen,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  HardDrive,
  Monitor,
  FileVideo,
  Calendar,
  Settings2,
  Wand2,
  X,
  ArrowRightLeft,
  History,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/edit")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Edição — ${p.title} · ContentFlow OS`
            : "Edição · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Prévia do vídeo editado com timeline, comentários por tempo e controle de renderização.",
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
  component: EditView,
});

// ---------------- types ----------------

type RenderStatus = "queued" | "rendering" | "done" | "error";

type MarkerKind = "music" | "transition" | "effect" | "overlay" | "cta" | "block";

type Marker = {
  id: string;
  at: number;
  kind: MarkerKind;
  label: string;
};

type Comment = {
  id: string;
  at: number;
  author: string;
  initials: string;
  hue: number;
  text: string;
  createdAt: string;
  resolved?: boolean;
};

type RenderVersion = {
  id: string;
  label: string;
  status: RenderStatus;
  progress?: number; // 0..100 (when rendering)
  errorMsg?: string;
  resolution: string;
  format: string;
  duration: number; // seconds
  sizeMb: number;
  renderedAt: string;
  config: {
    codec: string;
    bitrate: string;
    fps: number;
    color: string;
  };
};

// ---------------- meta ----------------

const MARKER_META: Record<
  MarkerKind,
  { label: string; icon: typeof Music; color: string; track: string }
> = {
  music: {
    label: "Música",
    icon: Music,
    color: "text-pink-300 border-pink-500/40 bg-pink-500/10",
    track: "bg-pink-500/30 border-pink-400/50",
  },
  transition: {
    label: "Transição",
    icon: ArrowRightLeft,
    color: "text-sky-300 border-sky-500/40 bg-sky-500/10",
    track: "bg-sky-500/30 border-sky-400/50",
  },
  effect: {
    label: "Efeito",
    icon: Sparkles,
    color: "text-amber-300 border-amber-500/40 bg-amber-500/10",
    track: "bg-amber-500/30 border-amber-400/50",
  },
  overlay: {
    label: "Overlay",
    icon: Layers,
    color: "text-cyan-300 border-cyan-500/40 bg-cyan-500/10",
    track: "bg-cyan-500/30 border-cyan-400/50",
  },
  cta: {
    label: "CTA",
    icon: Megaphone,
    color: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
    track: "bg-emerald-500/30 border-emerald-400/50",
  },
  block: {
    label: "Bloco do roteiro",
    icon: BookOpen,
    color: "text-indigo-300 border-indigo-500/40 bg-indigo-500/10",
    track: "bg-indigo-500/30 border-indigo-400/50",
  },
};

const TRACK_ORDER: MarkerKind[] = [
  "block",
  "music",
  "transition",
  "effect",
  "overlay",
  "cta",
];

const STATUS_META: Record<
  RenderStatus,
  { label: string; icon: typeof Loader2; color: string; dot: string }
> = {
  queued: {
    label: "Na fila",
    icon: Clock,
    color: "border-slate-500/40 bg-slate-500/10 text-slate-200",
    dot: "bg-slate-400",
  },
  rendering: {
    label: "Renderizando",
    icon: Loader2,
    color: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
  },
  done: {
    label: "Concluída",
    icon: CheckCircle2,
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
  },
  error: {
    label: "Erro",
    icon: AlertTriangle,
    color: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
  },
};

// ---------------- mock ----------------

const VERSIONS: RenderVersion[] = [
  {
    id: "v4",
    label: "v4 · corte final",
    status: "done",
    resolution: "3840 × 2160 (4K UHD)",
    format: "MP4 · H.264",
    duration: 812,
    sizeMb: 1284,
    renderedAt: "Hoje, 09:42",
    config: { codec: "H.264 High", bitrate: "45 Mbps", fps: 30, color: "Rec.709" },
  },
  {
    id: "v3",
    label: "v3 · com legendas",
    status: "rendering",
    progress: 68,
    resolution: "1920 × 1080",
    format: "MP4 · H.264",
    duration: 812,
    sizeMb: 640,
    renderedAt: "Iniciado 10:12",
    config: { codec: "H.264 Main", bitrate: "18 Mbps", fps: 30, color: "Rec.709" },
  },
  {
    id: "v2",
    label: "v2 · pré-corte",
    status: "error",
    errorMsg: "Falha no encoder de áudio na faixa 3 (07:24). Nenhum arquivo gerado.",
    resolution: "1920 × 1080",
    format: "MP4 · H.264",
    duration: 798,
    sizeMb: 0,
    renderedAt: "Ontem, 22:10",
    config: { codec: "H.264 Main", bitrate: "18 Mbps", fps: 30, color: "Rec.709" },
  },
  {
    id: "v1",
    label: "v1 · rascunho",
    status: "done",
    resolution: "1280 × 720",
    format: "MP4 · H.264",
    duration: 826,
    sizeMb: 210,
    renderedAt: "Ontem, 15:20",
    config: { codec: "H.264 Baseline", bitrate: "8 Mbps", fps: 30, color: "sRGB" },
  },
];

const BLOCKS: { name: string; from: number; to: number }[] = [
  { name: "Abertura", from: 0, to: 42 },
  { name: "Contexto", from: 42, to: 126 },
  { name: "Desenvolvimento", from: 126, to: 214 },
  { name: "Ponto-chave", from: 214, to: 252 },
  { name: "CTA", from: 252, to: 296 },
  { name: "Aprofundamento", from: 296, to: 456 },
  { name: "Consequências", from: 456, to: 568 },
  { name: "Contra-argumento", from: 568, to: 686 },
  { name: "Fecho", from: 686, to: 812 },
];

const MARKERS: Marker[] = [
  ...BLOCKS.map((b, i) => ({
    id: `blk-${i}`,
    at: b.from,
    kind: "block" as const,
    label: b.name,
  })),
  { id: "mu1", at: 0, kind: "music", label: "Trilha de abertura" },
  { id: "mu2", at: 126, kind: "music", label: "Trilha ambiente" },
  { id: "mu3", at: 456, kind: "music", label: "Camada de tensão" },
  { id: "mu4", at: 686, kind: "music", label: "Trilha de fecho" },
  { id: "tr1", at: 42, kind: "transition", label: "Corte seco" },
  { id: "tr2", at: 214, kind: "transition", label: "Cross dissolve" },
  { id: "tr3", at: 296, kind: "transition", label: "Whip pan" },
  { id: "tr4", at: 568, kind: "transition", label: "Fade" },
  { id: "ef1", at: 58, kind: "effect", label: "Zoom lento" },
  { id: "ef2", at: 168, kind: "effect", label: "Grão de filme" },
  { id: "ef3", at: 372, kind: "effect", label: "Glitch curto" },
  { id: "ef4", at: 624, kind: "effect", label: "Vinheta" },
  { id: "ov1", at: 4, kind: "overlay", label: "Título + canal" },
  { id: "ov2", at: 132, kind: "overlay", label: "Citação Hawking" },
  { id: "ov3", at: 320, kind: "overlay", label: "Fonte NASA" },
  { id: "ov4", at: 620, kind: "overlay", label: "Rodapé com créditos" },
  { id: "ct1", at: 252, kind: "cta", label: "Inscreva-se" },
  { id: "ct2", at: 780, kind: "cta", label: "Próximo vídeo" },
];

const INITIAL_COMMENTS: Comment[] = [
  {
    id: "c1",
    at: 12,
    author: "Marina",
    initials: "MC",
    hue: 210,
    text: "A abertura ficou muito boa, só ajustaria o volume da trilha em -3 dB.",
    createdAt: "Hoje, 09:58",
  },
  {
    id: "c2",
    at: 96,
    author: "Rafa",
    initials: "RS",
    hue: 300,
    text: "Aqui a legenda cobre parte do gráfico Eddington. Recuar 30px pra cima.",
    createdAt: "Hoje, 10:04",
  },
  {
    id: "c3",
    at: 254,
    author: "Marina",
    initials: "MC",
    hue: 210,
    text: "CTA soa um pouco atropelado. Segurar 0.5s antes da fala.",
    createdAt: "Hoje, 10:11",
  },
  {
    id: "c4",
    at: 372,
    author: "Bruno",
    initials: "BT",
    hue: 40,
    text: "Glitch está funcionando, mas mantém o áudio limpo por baixo.",
    createdAt: "Hoje, 10:19",
    resolved: true,
  },
  {
    id: "c5",
    at: 720,
    author: "Rafa",
    initials: "RS",
    hue: 300,
    text: "Fecho pede um respiro maior antes do outro CTA. Considerar 1s.",
    createdAt: "Hoje, 10:26",
  },
];

// ---------------- helpers ----------------

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const fmtSize = (mb: number) =>
  mb === 0 ? "—" : mb >= 1000 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(0)} MB`;

// ---------------- component ----------------

function EditView() {
  const { project, channel } = Route.useLoaderData();

  const [versionId, setVersionId] = useState(VERSIONS[0].id);
  const version = VERSIONS.find((v) => v.id === versionId) ?? VERSIONS[0];

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [comments, setComments] = useState<Comment[]>(INITIAL_COMMENTS);
  const [newComment, setNewComment] = useState("");
  const [markerFilter, setMarkerFilter] = useState<Set<MarkerKind>>(
    new Set(TRACK_ORDER),
  );
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    setCurrent(0);
    setPlaying(false);
  }, [versionId]);

  useEffect(() => {
    if (!playing || version.status !== "done") return;
    const id = window.setInterval(() => {
      setCurrent((c) => {
        const n = c + 0.5;
        if (n >= version.duration) {
          setPlaying(false);
          return version.duration;
        }
        return n;
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [playing, version.duration, version.status]);

  const sortedComments = useMemo(
    () => [...comments].sort((a, b) => a.at - b.at),
    [comments],
  );

  const activeComment = comments.find(
    (c) => Math.abs(c.at - current) < 2 && !c.resolved,
  );

  const addComment = () => {
    if (!newComment.trim()) return;
    setComments((prev) => [
      ...prev,
      {
        id: `c${Date.now().toString(36)}`,
        at: Math.floor(current),
        author: "Você",
        initials: "VC",
        hue: 190,
        text: newComment.trim(),
        createdAt: "Agora",
      },
    ]);
    setNewComment("");
  };

  const toggleResolved = (id: string) =>
    setComments((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)),
    );

  const removeComment = (id: string) =>
    setComments((prev) => prev.filter((c) => c.id !== id));

  const seekTo = (s: number) =>
    setCurrent(Math.max(0, Math.min(version.duration, s)));

  const toggleTrack = (k: MarkerKind) =>
    setMarkerFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <AppShell>
      <TopBar
        title="Edição"
        subtitle={`${project.title} · ${channel.name}`}
      />
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumb + top actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 bg-[hsl(var(--surface))]/60 px-6 py-3">
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
              <span className="text-foreground">Edição</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={versionId} onValueChange={setVersionId}>
                <SelectTrigger className="h-9 w-[220px] text-xs">
                  <History className="mr-1.5 h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERSIONS.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            STATUS_META[v.status].dot,
                          )}
                        />
                        {v.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => setCompareOpen(true)}>
                <GitCompare className="mr-1.5 h-4 w-4" />
                Comparar versões
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={version.status !== "done"}
              >
                <Download className="mr-1.5 h-4 w-4" />
                Baixar MP4
              </Button>
              <Button variant="outline" size="sm">
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Solicitar alteração
              </Button>
              <Button size="sm" disabled={version.status !== "done"}>
                <Check className="mr-1.5 h-4 w-4" />
                Aprovar edição
              </Button>
              <Button size="sm" variant="secondary" disabled={version.status !== "done"}>
                <Send className="mr-1.5 h-4 w-4" />
                Enviar para publicação
              </Button>
            </div>
          </div>

          {/* Player + side info */}
          <div className="grid grid-cols-1 gap-4 border-b border-white/5 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <PlayerBlock
              version={version}
              current={current}
              playing={playing}
              volume={volume}
              muted={muted}
              onTogglePlay={() => setPlaying((p) => !p)}
              onSeek={seekTo}
              onVolume={setVolume}
              onToggleMute={() => setMuted((m) => !m)}
              activeComment={activeComment ?? null}
            />
            <RenderInfoCard version={version} />
          </div>

          {/* Timeline */}
          <TimelineBlock
            markers={MARKERS.filter((m) => markerFilter.has(m.kind))}
            markerFilter={markerFilter}
            onToggleTrack={toggleTrack}
            duration={version.duration}
            current={current}
            onSeek={seekTo}
            comments={sortedComments}
            onSelectComment={(c) => seekTo(c.at)}
          />

          {/* Comments */}
          <CommentsBlock
            comments={sortedComments}
            current={current}
            onSeek={seekTo}
            onAdd={addComment}
            newComment={newComment}
            onNewComment={setNewComment}
            onToggleResolved={toggleResolved}
            onRemove={removeComment}
          />
        </div>

        <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} />
      </TooltipProvider>
    </AppShell>
  );
}

// ---------------- player ----------------

function PlayerBlock({
  version,
  current,
  playing,
  volume,
  muted,
  onTogglePlay,
  onSeek,
  onVolume,
  onToggleMute,
  activeComment,
}: {
  version: RenderVersion;
  current: number;
  playing: boolean;
  volume: number;
  muted: boolean;
  onTogglePlay: () => void;
  onSeek: (s: number) => void;
  onVolume: (n: number) => void;
  onToggleMute: () => void;
  activeComment: Comment | null;
}) {
  const status = STATUS_META[version.status];
  const StatusIcon = status.icon;
  const progress = current / version.duration;

  const handleBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * version.duration);
  };

  return (
    <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface))]/70 p-4 shadow-lg">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
        {/* Backdrop simulation */}
        <div
          className={cn(
            "absolute inset-0",
            version.status === "done"
              ? "bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.25),transparent_60%),radial-gradient(circle_at_80%_70%,rgba(168,85,247,0.2),transparent_50%),#050914]"
              : "bg-[#050914]",
          )}
        />

        {/* State overlays */}
        {version.status === "rendering" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 text-center backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-sky-300" />
            <div>
              <p className="text-sm font-medium text-sky-100">
                Renderização em andamento
              </p>
              <p className="text-xs text-muted-foreground">
                {version.progress ?? 0}% concluído · ETA ~
                {Math.max(1, Math.round(((100 - (version.progress ?? 0)) / 100) * 12))}{" "}
                min
              </p>
            </div>
            <div className="h-1.5 w-64 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-sky-400 transition-all"
                style={{ width: `${version.progress ?? 0}%` }}
              />
            </div>
          </div>
        )}
        {version.status === "queued" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-center backdrop-blur-sm">
            <Clock className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-100">
              Aguardando fila de renderização
            </p>
            <Button size="sm" variant="secondary">
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              Iniciar agora
            </Button>
          </div>
        )}
        {version.status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-rose-950/70 p-6 text-center backdrop-blur-sm">
            <AlertTriangle className="h-8 w-8 text-rose-300" />
            <p className="text-sm font-medium text-rose-100">
              Falha na renderização
            </p>
            <p className="max-w-md text-xs text-rose-200/80">
              {version.errorMsg}
            </p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="secondary">
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Tentar novamente
              </Button>
              <Button size="sm" variant="ghost">
                Ver log completo
              </Button>
            </div>
          </div>
        )}
        {version.status === "done" && !playing && (
          <button
            onClick={onTogglePlay}
            className="absolute inset-0 flex items-center justify-center"
          >
            <span className="rounded-full bg-black/50 p-5 backdrop-blur transition hover:bg-black/70">
              <Play className="ml-0.5 h-7 w-7 text-white" />
            </span>
          </button>
        )}

        {/* Comment pop */}
        {activeComment && (
          <div
            className="absolute bottom-16 left-1/2 max-w-xs -translate-x-1/2 rounded-lg border border-white/15 bg-black/70 p-2.5 text-xs shadow-lg backdrop-blur"
            style={{ borderColor: `hsl(${activeComment.hue} 60% 50%)` }}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ backgroundColor: `hsl(${activeComment.hue} 55% 45%)` }}
              >
                {activeComment.initials}
              </span>
              <span className="font-medium">{activeComment.author}</span>
              <span className="ml-auto font-mono text-muted-foreground">
                {fmt(activeComment.at)}
              </span>
            </div>
            <p className="text-white/90">{activeComment.text}</p>
          </div>
        )}

        {/* Status pill */}
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn("gap-1.5 backdrop-blur", status.color)}
          >
            <StatusIcon
              className={cn(
                "h-3 w-3",
                version.status === "rendering" && "animate-spin",
              )}
            />
            {status.label}
            {version.status === "rendering" && ` · ${version.progress ?? 0}%`}
          </Badge>
          <Badge
            variant="outline"
            className="gap-1 border-white/10 bg-black/40 text-white/80 backdrop-blur"
          >
            <Monitor className="h-3 w-3" />
            {version.resolution.split(" ")[0]}
          </Badge>
        </div>

        {/* Fullscreen icon */}
        <button className="absolute right-3 top-3 rounded-md bg-black/40 p-1.5 backdrop-blur hover:bg-black/60">
          <Maximize2 className="h-3.5 w-3.5 text-white" />
        </button>

        {/* Controls bar (only when done) */}
        {version.status === "done" && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3">
            {/* seek bar */}
            <div
              onClick={handleBar}
              className="group relative h-1.5 cursor-pointer rounded-full bg-white/20"
            >
              <div
                className="absolute top-0 h-full rounded-full bg-primary"
                style={{ width: `${progress * 100}%` }}
              />
              <div
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <button
                onClick={onTogglePlay}
                className="rounded-full bg-white/10 p-1.5 hover:bg-white/20"
              >
                {playing ? (
                  <Pause className="h-3.5 w-3.5 text-white" />
                ) : (
                  <Play className="ml-0.5 h-3.5 w-3.5 text-white" />
                )}
              </button>
              <span className="font-mono text-xs text-white/90 tabular-nums">
                {fmt(current)} / {fmt(version.duration)}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={onToggleMute} className="text-white/80 hover:text-white">
                  {muted || volume === 0 ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                </button>
                <Slider
                  value={[muted ? 0 : volume]}
                  onValueChange={([v]) => onVolume(v)}
                  max={100}
                  className="w-24"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- render info card ----------------

function RenderInfoCard({ version }: { version: RenderVersion }) {
  const status = STATUS_META[version.status];
  const StatusIcon = status.icon;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/5 bg-[hsl(var(--surface))]/70 p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Renderização</h3>
        <Badge variant="outline" className={cn("gap-1.5", status.color)}>
          <StatusIcon
            className={cn(
              "h-3 w-3",
              version.status === "rendering" && "animate-spin",
            )}
          />
          {status.label}
        </Badge>
      </div>
      {version.status === "rendering" && (
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>Progresso</span>
            <span className="font-mono">{version.progress ?? 0}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full bg-sky-400 transition-all"
              style={{ width: `${version.progress ?? 0}%` }}
            />
          </div>
        </div>
      )}
      {version.status === "error" && (
        <div className="rounded-md border border-rose-500/40 bg-rose-500/10 p-2.5 text-xs text-rose-200">
          {version.errorMsg}
        </div>
      )}
      <Separator className="bg-white/5" />
      <dl className="space-y-2 text-sm">
        <InfoRow icon={History} label="Versão" value={version.label} />
        <InfoRow icon={Monitor} label="Resolução" value={version.resolution} />
        <InfoRow icon={FileVideo} label="Formato" value={version.format} />
        <InfoRow icon={Clock} label="Duração" value={fmt(version.duration)} />
        <InfoRow icon={HardDrive} label="Tamanho" value={fmtSize(version.sizeMb)} />
        <InfoRow icon={Calendar} label="Renderizada em" value={version.renderedAt} />
      </dl>
      <Separator className="bg-white/5" />
      <div>
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" />
          Configuração utilizada
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <MiniStat label="Codec" value={version.config.codec} />
          <MiniStat label="Bitrate" value={version.config.bitrate} />
          <MiniStat label="FPS" value={`${version.config.fps} fps`} />
          <MiniStat label="Cor" value={version.config.color} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </dt>
      <dd className="truncate text-right text-sm">{value}</dd>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-medium">{value}</div>
    </div>
  );
}

// ---------------- timeline ----------------

function TimelineBlock({
  markers,
  markerFilter,
  onToggleTrack,
  duration,
  current,
  onSeek,
  comments,
  onSelectComment,
}: {
  markers: Marker[];
  markerFilter: Set<MarkerKind>;
  onToggleTrack: (k: MarkerKind) => void;
  duration: number;
  current: number;
  onSeek: (s: number) => void;
  comments: Comment[];
  onSelectComment: (c: Comment) => void;
}) {
  const scale = (s: number) => (s / duration) * 100;
  const barRef = useRef<HTMLDivElement>(null);

  const handleBar = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek(((e.clientX - rect.left) / rect.width) * duration);
  };

  return (
    <div className="border-b border-white/5 bg-[hsl(var(--surface-2))]/40 p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Timeline</h3>
          <p className="text-xs text-muted-foreground">
            Marcadores por trilha · duração total {fmt(duration)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TRACK_ORDER.map((k) => {
            const meta = MARKER_META[k];
            const Icon = meta.icon;
            const active = markerFilter.has(k);
            return (
              <button
                key={k}
                onClick={() => onToggleTrack(k)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition",
                  active
                    ? meta.color
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3" />
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface))]/50">
        {/* ruler */}
        <div
          ref={barRef}
          onClick={handleBar}
          className="relative h-6 cursor-pointer border-b border-white/5"
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const t = (duration / 8) * i;
            return (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-white/10 pl-1 text-[10px] text-muted-foreground"
                style={{ left: `${(i / 8) * 100}%` }}
              >
                {fmt(t)}
              </div>
            );
          })}
          {/* playhead in ruler */}
          <div
            className="pointer-events-none absolute top-0 h-full w-[2px] bg-primary"
            style={{ left: `${scale(current)}%` }}
          />
        </div>

        {/* tracks */}
        <div className="relative">
          {TRACK_ORDER.filter((k) => markerFilter.has(k)).map((kind) => {
            const meta = MARKER_META[kind];
            const Icon = meta.icon;
            const rows = markers.filter((m) => m.kind === kind);
            const isBlocks = kind === "block";
            return (
              <div
                key={kind}
                className="grid grid-cols-[140px_1fr] border-b border-white/5 last:border-b-0"
              >
                <div className="flex items-center gap-2 border-r border-white/5 bg-[hsl(var(--surface))]/60 px-3 py-2 text-xs">
                  <Icon
                    className={cn("h-3.5 w-3.5", meta.color.split(" ")[0])}
                  />
                  <span className="font-medium">{meta.label}</span>
                </div>
                <div className="relative h-9">
                  {isBlocks
                    ? BLOCKS.map((b, i) => (
                        <Tooltip key={i}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onSeek(b.from)}
                              className={cn(
                                "absolute top-1 flex h-[calc(100%-8px)] items-center overflow-hidden rounded border px-2 text-[11px] text-indigo-100 transition hover:brightness-125",
                                meta.track,
                              )}
                              style={{
                                left: `${scale(b.from)}%`,
                                width: `calc(${scale(b.to - b.from)}% - 2px)`,
                              }}
                            >
                              <span className="truncate">{b.name}</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {b.name} · {fmt(b.from)}–{fmt(b.to)}
                          </TooltipContent>
                        </Tooltip>
                      ))
                    : rows.map((m) => (
                        <Tooltip key={m.id}>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => onSeek(m.at)}
                              className={cn(
                                "absolute top-1.5 flex h-[calc(100%-12px)] w-1.5 -translate-x-1/2 items-center justify-center rounded-sm border",
                                meta.track,
                              )}
                              style={{ left: `${scale(m.at)}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <div className="font-medium">{m.label}</div>
                            <div className="text-xs text-muted-foreground">
                              {meta.label} · {fmt(m.at)}
                            </div>
                          </TooltipContent>
                        </Tooltip>
                      ))}
                </div>
              </div>
            );
          })}

          {/* comments track */}
          <div className="grid grid-cols-[140px_1fr] border-t border-white/5">
            <div className="flex items-center gap-2 border-r border-white/5 bg-[hsl(var(--surface))]/60 px-3 py-2 text-xs">
              <MessageSquare className="h-3.5 w-3.5 text-primary" />
              <span className="font-medium">Comentários</span>
            </div>
            <div className="relative h-9">
              {comments.map((c) => (
                <Tooltip key={c.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onSelectComment(c)}
                      className={cn(
                        "absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-[9px] font-semibold text-white shadow",
                        c.resolved && "opacity-50",
                      )}
                      style={{
                        left: `${scale(c.at)}%`,
                        backgroundColor: `hsl(${c.hue} 55% 45%)`,
                        borderColor: `hsl(${c.hue} 60% 60%)`,
                        width: 22,
                        height: 22,
                      }}
                    >
                      {c.initials}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <div className="font-medium">
                      {c.author} · {fmt(c.at)}
                    </div>
                    <div className="mt-0.5 text-xs">{c.text}</div>
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          {/* playhead line spanning tracks */}
          <div
            className="pointer-events-none absolute left-[140px] top-0 h-full"
            style={{
              width: `calc(100% - 140px)`,
            }}
          >
            <div
              className="absolute top-0 h-full w-[2px] bg-primary/80 shadow-[0_0_8px_hsl(var(--primary))]"
              style={{ left: `${scale(current)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- comments ----------------

function CommentsBlock({
  comments,
  current,
  onSeek,
  onAdd,
  newComment,
  onNewComment,
  onToggleResolved,
  onRemove,
}: {
  comments: Comment[];
  current: number;
  onSeek: (s: number) => void;
  onAdd: () => void;
  newComment: string;
  onNewComment: (v: string) => void;
  onToggleResolved: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const open = comments.filter((c) => !c.resolved);
  const resolved = comments.filter((c) => c.resolved);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-white/5 bg-[hsl(var(--surface))]/50 px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <MessageSquare className="h-4 w-4 text-primary" />
          <div>
            <div className="text-sm font-semibold">
              Comentários por tempo{" "}
              <span className="font-normal text-muted-foreground">
                ({open.length} aberto{open.length === 1 ? "" : "s"})
              </span>
            </div>
            <div className="text-xs text-muted-foreground">
              Marcados no vídeo e sincronizados com a timeline
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-white/10 bg-white/[0.03] font-mono text-[11px]"
            >
              <Clock className="mr-1 h-3 w-3" />
              {fmt(current)}
            </Badge>
            <div className="flex items-center gap-2">
              <Input
                value={newComment}
                onChange={(e) => onNewComment(e.target.value)}
                placeholder={`Comentar em ${fmt(current)}...`}
                className="h-9 w-[280px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onAdd();
                  }
                }}
              />
              <Button size="sm" onClick={onAdd} disabled={!newComment.trim()}>
                <MessageSquarePlus className="mr-1.5 h-4 w-4" />
                Comentar aqui
              </Button>
            </div>
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="grid gap-3 p-6 md:grid-cols-2 xl:grid-cols-3">
          {open.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onSeek={onSeek}
              onToggleResolved={onToggleResolved}
              onRemove={onRemove}
            />
          ))}
          {resolved.map((c) => (
            <CommentCard
              key={c.id}
              comment={c}
              onSeek={onSeek}
              onToggleResolved={onToggleResolved}
              onRemove={onRemove}
            />
          ))}
          {comments.length === 0 && (
            <div className="col-span-full flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <MessageSquare className="h-6 w-6" />
              <p className="text-sm">
                Nenhum comentário registrado. Use o tempo atual para começar.
              </p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function CommentCard({
  comment,
  onSeek,
  onToggleResolved,
  onRemove,
}: {
  comment: Comment;
  onSeek: (s: number) => void;
  onToggleResolved: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-3 transition",
        comment.resolved
          ? "border-white/5 bg-white/[0.02] opacity-70"
          : "border-white/10 bg-[hsl(var(--surface-2))]/50 hover:border-white/20",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white"
          style={{ backgroundColor: `hsl(${comment.hue} 55% 45%)` }}
        >
          {comment.initials}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{comment.author}</div>
          <div className="text-[11px] text-muted-foreground">
            {comment.createdAt}
          </div>
        </div>
        <button
          onClick={() => onSeek(comment.at)}
          className="ml-auto rounded border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[11px] hover:border-primary/50 hover:text-primary"
        >
          {fmt(comment.at)}
        </button>
      </div>
      <p
        className={cn(
          "text-sm leading-relaxed",
          comment.resolved && "line-through",
        )}
      >
        {comment.text}
      </p>
      <div className="flex items-center gap-1 pt-1">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          onClick={() => onToggleResolved(comment.id)}
        >
          <Check className="mr-1 h-3 w-3" />
          {comment.resolved ? "Reabrir" : "Resolver"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs text-rose-300 hover:text-rose-200"
          onClick={() => onRemove(comment.id)}
        >
          <X className="mr-1 h-3 w-3" />
          Remover
        </Button>
      </div>
    </div>
  );
}

// ---------------- compare dialog ----------------

function CompareDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [left, setLeft] = useState("v4");
  const [right, setRight] = useState("v1");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comparar versões renderizadas</DialogTitle>
          <DialogDescription>
            Visualize duas versões lado a lado para revisar diferenças de configuração e status.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <ComparePane value={left} onChange={setLeft} side="A" />
          <ComparePane value={right} onChange={setRight} side="B" />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ComparePane({
  value,
  onChange,
  side,
}: {
  value: string;
  onChange: (v: string) => void;
  side: "A" | "B";
}) {
  const v = VERSIONS.find((x) => x.id === value) ?? VERSIONS[0];
  const status = STATUS_META[v.status];
  const StatusIcon = status.icon;
  return (
    <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Badge
          variant="outline"
          className="border-primary/40 bg-primary/10 text-primary"
        >
          Versão {side}
        </Badge>
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {VERSIONS.map((ver) => (
              <SelectItem key={ver.id} value={ver.id}>
                {ver.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="relative aspect-video overflow-hidden rounded border border-white/10 bg-black">
        <div
          className={cn(
            "absolute inset-0",
            v.status === "done"
              ? "bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.25),transparent_60%),#050914]"
              : v.status === "error"
                ? "bg-rose-950/60"
                : "bg-[#050914]",
          )}
        />
        <Badge
          variant="outline"
          className={cn(
            "absolute left-2 top-2 gap-1 backdrop-blur",
            status.color,
          )}
        >
          <StatusIcon
            className={cn(
              "h-3 w-3",
              v.status === "rendering" && "animate-spin",
            )}
          />
          {status.label}
        </Badge>
      </div>
      <dl className="mt-3 space-y-1.5 text-xs">
        <CmpRow label="Resolução" value={v.resolution} />
        <CmpRow label="Formato" value={v.format} />
        <CmpRow label="Duração" value={fmt(v.duration)} />
        <CmpRow label="Tamanho" value={fmtSize(v.sizeMb)} />
        <CmpRow label="Codec" value={v.config.codec} />
        <CmpRow label="Bitrate" value={v.config.bitrate} />
        <CmpRow label="FPS" value={`${v.config.fps} fps`} />
        <CmpRow label="Renderizada" value={v.renderedAt} />
      </dl>
    </div>
  );
}

function CmpRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}
