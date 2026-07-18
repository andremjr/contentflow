import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Gauge,
  Download,
  Flag,
  History,
  GitCompare,
  Mic,
  FileAudio,
  Clock,
  Calendar,
  Settings2,
  Check,
  AlertTriangle,
  Pause as PauseIcon,
  Megaphone,
  BookOpen,
  Layers,
  Plus,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/narration")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Narração — ${p.title} · ContentFlow OS`
            : "Narração · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Player de narração com waveform, transcrição sincronizada, marcadores e comparação entre versões.",
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
  component: NarrationView,
});

// ---------------- types ----------------

type MarkerKind = "pause" | "pronunciation" | "error" | "cta" | "block";

type Marker = {
  id: string;
  at: number; // seconds
  kind: MarkerKind;
  label: string;
  note?: string;
};

type Segment = {
  id: string;
  from: number;
  to: number;
  text: string;
  block?: string;
};

type NarrationVersion = {
  id: string;
  label: string;
  voice: string;
  format: string;
  sizeMb: number;
  duration: number; // seconds
  createdAt: string;
  status: "Rascunho" | "Em análise" | "Aprovado" | "Reprovado";
  config: {
    speed: number;
    stability: number;
    style: string;
  };
  seed: number;
};

// ---------------- mock ----------------

const MARKER_META: Record<
  MarkerKind,
  { label: string; icon: typeof Flag; color: string; ring: string }
> = {
  pause: {
    label: "Pausa",
    icon: PauseIcon,
    color: "text-sky-300 bg-sky-500/15 border-sky-500/40",
    ring: "bg-sky-400",
  },
  pronunciation: {
    label: "Pronúncia",
    icon: BookOpen,
    color: "text-violet-300 bg-violet-500/15 border-violet-500/40",
    ring: "bg-violet-400",
  },
  error: {
    label: "Possível erro",
    icon: AlertTriangle,
    color: "text-amber-300 bg-amber-500/15 border-amber-500/40",
    ring: "bg-amber-400",
  },
  cta: {
    label: "CTA",
    icon: Megaphone,
    color: "text-emerald-300 bg-emerald-500/15 border-emerald-500/40",
    ring: "bg-emerald-400",
  },
  block: {
    label: "Mudança de bloco",
    icon: Layers,
    color: "text-indigo-300 bg-indigo-500/15 border-indigo-500/40",
    ring: "bg-indigo-400",
  },
};

const STATUS_STYLES: Record<NarrationVersion["status"], string> = {
  Rascunho: "border-slate-500/40 bg-slate-500/10 text-slate-200",
  "Em análise": "border-amber-500/40 bg-amber-500/10 text-amber-200",
  Aprovado: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  Reprovado: "border-rose-500/40 bg-rose-500/10 text-rose-200",
};

const VERSIONS: NarrationVersion[] = [
  {
    id: "v3",
    label: "v3 · leitura final",
    voice: "Aurora PT-BR",
    format: "WAV 48kHz · 24-bit",
    sizeMb: 148.2,
    duration: 812,
    createdAt: "Hoje, 09:42",
    status: "Em análise",
    config: { speed: 1.0, stability: 78, style: "Documental sóbrio" },
    seed: 73,
  },
  {
    id: "v2",
    label: "v2 · ajuste de ritmo",
    voice: "Aurora PT-BR",
    format: "MP3 320kbps",
    sizeMb: 62.4,
    duration: 798,
    createdAt: "Ontem, 18:10",
    status: "Rascunho",
    config: { speed: 1.05, stability: 72, style: "Documental sóbrio" },
    seed: 44,
  },
  {
    id: "v1",
    label: "v1 · leitura inicial",
    voice: "Lívia PT-BR",
    format: "MP3 192kbps",
    sizeMb: 41.1,
    duration: 826,
    createdAt: "Terça, 15:20",
    status: "Reprovado",
    config: { speed: 0.98, stability: 65, style: "Neutro" },
    seed: 12,
  },
];

const SEGMENTS: Segment[] = [
  {
    id: "s1",
    from: 0,
    to: 18,
    block: "Abertura",
    text: "Existe uma pergunta que a física ainda não conseguiu responder: como buracos negros supermassivos crescem tão rápido no início do universo?",
  },
  {
    id: "s2",
    from: 18,
    to: 42,
    block: "Abertura",
    text: "Nas últimas décadas, telescópios detectaram monstros com bilhões de massas solares em uma época em que o próprio cosmos ainda estava se organizando.",
  },
  {
    id: "s3",
    from: 42,
    to: 78,
    block: "Contexto",
    text: "Para entender por que isso é estranho, precisamos falar sobre o tempo que a matéria leva para colapsar, e sobre um limite chamado luminosidade de Eddington, que restringe a velocidade com que um buraco negro pode acumular gás.",
  },
  {
    id: "s4",
    from: 78,
    to: 126,
    block: "Contexto",
    text: "O problema é que, mesmo com esse limite, não haveria tempo suficiente desde o Big Bang para que um buraco negro estelar comum crescesse até essas escalas. Alguma coisa está faltando na nossa história.",
  },
  {
    id: "s5",
    from: 126,
    to: 168,
    block: "Desenvolvimento",
    text: "A hipótese mais discutida hoje envolve os chamados buracos negros primordiais, formados diretamente do colapso de nuvens gigantescas de gás nos primeiros milhões de anos.",
  },
  {
    id: "s6",
    from: 168,
    to: 214,
    block: "Desenvolvimento",
    text: "Esses objetos nasceriam já com dezenas de milhares de massas solares, uma espécie de atalho evolutivo. Observações recentes do telescópio James Webb começam a apontar candidatos coerentes com essa ideia.",
  },
  {
    id: "s7",
    from: 214,
    to: 252,
    block: "Ponto-chave",
    text: "Se essa hipótese estiver certa, ela muda a forma como pensamos a formação das primeiras galáxias, porque os buracos negros deixariam de ser consequência e passariam a ser motor do processo.",
  },
  {
    id: "s8",
    from: 252,
    to: 296,
    block: "CTA",
    text: "Antes de a gente entrar na parte mais estranha, deixa o like se você quer que esse tipo de conteúdo continue por aqui, e se inscreve no canal para não perder o próximo vídeo, onde a gente vai olhar diretamente para os dados do James Webb.",
  },
  {
    id: "s9",
    from: 296,
    to: 344,
    block: "Aprofundamento",
    text: "Voltando: existem também modelos alternativos, envolvendo fusão em cascata de buracos negros menores em regiões extremamente densas. É uma corrida evolutiva que só faz sentido em ambientes muito específicos.",
  },
  {
    id: "s10",
    from: 344,
    to: 402,
    block: "Aprofundamento",
    text: "Nesses ambientes, a densidade de estrelas é tão alta que colisões seriam frequentes. Cada fusão libera ondas gravitacionais, e é justamente por essas ondas que observatórios como LIGO tentam procurar pistas indiretas.",
  },
  {
    id: "s11",
    from: 402,
    to: 456,
    block: "Aprofundamento",
    text: "O ponto interessante é que as duas hipóteses não são necessariamente excludentes. Pode ser que parte dos buracos negros supermassivos venha de sementes primordiais e outra parte de fusões sucessivas.",
  },
  {
    id: "s12",
    from: 456,
    to: 512,
    block: "Ponto-chave",
    text: "E é aqui que a história fica realmente sensível: cada hipótese exige um universo ligeiramente diferente logo depois do Big Bang. Estudar buracos negros gigantes é, na prática, estudar as primeiras horas do cosmos.",
  },
  {
    id: "s13",
    from: 512,
    to: 568,
    block: "Consequências",
    text: "As consequências ultrapassam a astrofísica. Se conseguirmos mapear como e quando esses objetos surgiram, teremos indícios sobre a natureza da matéria escura, sobre inflação e sobre a topologia inicial do espaço-tempo.",
  },
  {
    id: "s14",
    from: 568,
    to: 624,
    block: "Consequências",
    text: "Nada disso é retórica. Cada nova detecção do James Webb ou do Event Horizon Telescope adiciona uma peça, e muitas dessas peças estão desafiando modelos que pareciam consolidados há uma década.",
  },
  {
    id: "s15",
    from: 624,
    to: 686,
    block: "Contra-argumento",
    text: "Claro, existem físicos céticos. Eles argumentam que a estatística ainda é pequena, e que candidatos observados podem ser artefatos, contaminação de galáxias vizinhas ou lentes gravitacionais mal interpretadas.",
  },
  {
    id: "s16",
    from: 686,
    to: 742,
    block: "Contra-argumento",
    text: "É uma crítica legítima, e a comunidade responde com o que ela sabe fazer melhor: coletar mais dados, revisar métodos e cruzar observações independentes até que a incerteza deixe de ser um problema.",
  },
  {
    id: "s17",
    from: 742,
    to: 782,
    block: "Fecho",
    text: "O que já dá para dizer com segurança é que o cenário simples, aquele que a maioria dos livros didáticos ainda usa, provavelmente não sobrevive a esta década.",
  },
  {
    id: "s18",
    from: 782,
    to: 812,
    block: "Fecho",
    text: "E talvez seja isso o que torna a física tão viva: não a certeza, mas a distância entre o que a gente vê e o que a gente ainda não consegue explicar.",
  },
];

const MARKERS: Marker[] = [
  { id: "m1", at: 6, kind: "block", label: "Abertura" },
  { id: "m2", at: 18, kind: "pause", label: "Respiro curto", note: "Pausa de 400ms para ênfase." },
  { id: "m3", at: 42, kind: "block", label: "Contexto" },
  { id: "m4", at: 58, kind: "pronunciation", label: "Eddington", note: "Ênfase na sílaba 'Ed'." },
  { id: "m5", at: 96, kind: "error", label: "Ruído respiratório", note: "Possível estalo de boca." },
  { id: "m6", at: 126, kind: "block", label: "Desenvolvimento" },
  { id: "m7", at: 214, kind: "block", label: "Ponto-chave" },
  { id: "m8", at: 252, kind: "cta", label: "CTA de inscrição", note: "Manter energia levemente maior." },
  { id: "m9", at: 296, kind: "block", label: "Aprofundamento" },
  { id: "m10", at: 372, kind: "pronunciation", label: "LIGO", note: "Pronunciar 'lai-go'." },
  { id: "m11", at: 456, kind: "block", label: "Ponto-chave" },
  { id: "m12", at: 508, kind: "error", label: "Palavra cortada", note: "Verificar 'sensível'." },
  { id: "m13", at: 512, kind: "block", label: "Consequências" },
  { id: "m14", at: 624, kind: "block", label: "Contra-argumento" },
  { id: "m15", at: 742, kind: "block", label: "Fecho" },
  { id: "m16", at: 796, kind: "pause", label: "Silêncio final", note: "1.2s antes do encerramento." },
];

// ---------------- helpers ----------------

const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const fmtSize = (mb: number) =>
  mb >= 100 ? `${mb.toFixed(0)} MB` : `${mb.toFixed(1)} MB`;

// Deterministic pseudo-random waveform from a seed
function buildWaveform(seed: number, bars = 220) {
  const arr: number[] = [];
  let s = seed;
  for (let i = 0; i < bars; i++) {
    s = (s * 9301 + 49297) % 233280;
    const base = 0.25 + (s / 233280) * 0.75;
    // add a slow envelope so it feels like a real narration
    const env = 0.6 + 0.4 * Math.sin((i / bars) * Math.PI * 3 + seed * 0.11);
    arr.push(Math.max(0.08, Math.min(1, base * env)));
  }
  return arr;
}

// ---------------- component ----------------

function NarrationView() {
  const { project, channel } = Route.useLoaderData();

  const [versionId, setVersionId] = useState(VERSIONS[0].id);
  const version = VERSIONS.find((v) => v.id === versionId) ?? VERSIONS[0];

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [muted, setMuted] = useState(false);
  const [markerFilter, setMarkerFilter] = useState<Set<MarkerKind>>(
    new Set(["pause", "pronunciation", "error", "cta", "block"]),
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeft, setCompareLeft] = useState<string>("v3");
  const [compareRight, setCompareRight] = useState<string>("v2");
  const transcriptRef = useRef<HTMLDivElement>(null);
  const activeSegmentRef = useRef<HTMLDivElement>(null);

  // simulate playback
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCurrent((c) => {
        const next = c + 0.25 * speed;
        if (next >= version.duration) {
          setPlaying(false);
          return version.duration;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, speed, version.duration]);

  // reset time when swapping versions
  useEffect(() => {
    setCurrent(0);
    setPlaying(false);
  }, [versionId]);

  const waveform = useMemo(() => buildWaveform(version.seed), [version.seed]);
  const progress = current / version.duration;

  const activeSegment =
    SEGMENTS.find((s) => current >= s.from && current < s.to) ?? SEGMENTS[0];

  // auto-scroll transcript
  useEffect(() => {
    activeSegmentRef.current?.scrollIntoView({
      block: "center",
      behavior: "smooth",
    });
  }, [activeSegment.id]);

  const visibleMarkers = MARKERS.filter((m) => markerFilter.has(m.kind));

  const seekTo = (sec: number) =>
    setCurrent(Math.max(0, Math.min(version.duration, sec)));

  const toggleMarkerKind = (k: MarkerKind) =>
    setMarkerFilter((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <AppShell>
      <TopBar title="Narração" subtitle={`${project.title} · ${channel.name}`} />
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b border-white/5 bg-[hsl(var(--surface))]/60 px-6 py-4 backdrop-blur">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
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
                  <span className="text-foreground">Narração</span>
                </div>
                <h1 className="mt-1 flex items-center gap-2 text-lg font-semibold">
                  <Mic className="h-4 w-4 text-primary" />
                  Narração
                </h1>
              </div>
              <div className="flex items-center gap-2">
                <Select value={versionId} onValueChange={setVersionId}>
                  <SelectTrigger className="w-[240px]">
                    <History className="mr-2 h-3.5 w-3.5" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VERSIONS.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCompareOpen(true)}
                >
                  <GitCompare className="mr-2 h-4 w-4" />
                  Comparar versões
                </Button>
                <Button variant="outline" size="sm">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </Button>
                <Button size="sm">
                  <Check className="mr-2 h-4 w-4" />
                  Aprovar
                </Button>
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[1fr_360px]">
            {/* Left column */}
            <div className="flex flex-col overflow-hidden">
              {/* Player */}
              <div className="border-b border-white/5 bg-[hsl(var(--surface-2))]/40 p-6">
                <PlayerCard
                  waveform={waveform}
                  markers={visibleMarkers}
                  duration={version.duration}
                  current={current}
                  playing={playing}
                  onTogglePlay={() => setPlaying((p) => !p)}
                  onSeek={seekTo}
                  speed={speed}
                  onSpeedChange={setSpeed}
                  volume={volume}
                  muted={muted}
                  onVolumeChange={setVolume}
                  onToggleMute={() => setMuted((m) => !m)}
                />

                {/* Marker filters */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Marcadores:
                  </span>
                  {(Object.keys(MARKER_META) as MarkerKind[]).map((k) => {
                    const meta = MARKER_META[k];
                    const active = markerFilter.has(k);
                    const Icon = meta.icon;
                    return (
                      <button
                        key={k}
                        onClick={() => toggleMarkerKind(k)}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition",
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

              {/* Transcript */}
              <div className="flex flex-1 flex-col overflow-hidden">
                <div className="flex items-center justify-between border-b border-white/5 px-6 py-3">
                  <div className="flex items-center gap-2">
                    <FileAudio className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Transcrição sincronizada
                    </span>
                    <Badge
                      variant="outline"
                      className="border-white/10 bg-white/[0.03] text-[10px]"
                    >
                      {SEGMENTS.length} segmentos
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Clique em qualquer trecho para reposicionar o áudio
                  </span>
                </div>
                <ScrollArea className="flex-1">
                  <div ref={transcriptRef} className="space-y-3 px-6 py-6">
                    {SEGMENTS.map((seg) => {
                      const isActive = seg.id === activeSegment.id;
                      const isPast = current >= seg.to;
                      const markersHere = visibleMarkers.filter(
                        (m) => m.at >= seg.from && m.at < seg.to,
                      );
                      return (
                        <div
                          key={seg.id}
                          ref={isActive ? activeSegmentRef : undefined}
                          className={cn(
                            "group rounded-lg border p-4 transition-all",
                            isActive
                              ? "border-primary/60 bg-primary/[0.08] shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
                              : "border-white/5 bg-white/[0.015] hover:border-white/10 hover:bg-white/[0.03]",
                          )}
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => seekTo(seg.from)}
                                className="font-mono text-xs text-muted-foreground hover:text-foreground"
                              >
                                {fmtTime(seg.from)} – {fmtTime(seg.to)}
                              </button>
                              {seg.block && (
                                <Badge
                                  variant="outline"
                                  className="border-indigo-500/30 bg-indigo-500/10 text-[10px] text-indigo-200"
                                >
                                  {seg.block}
                                </Badge>
                              )}
                              {markersHere.map((m) => {
                                const meta = MARKER_META[m.kind];
                                const Icon = meta.icon;
                                return (
                                  <Tooltip key={m.id}>
                                    <TooltipTrigger asChild>
                                      <span
                                        className={cn(
                                          "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]",
                                          meta.color,
                                        )}
                                      >
                                        <Icon className="h-2.5 w-2.5" />
                                        {m.label}
                                      </span>
                                    </TooltipTrigger>
                                    {m.note && (
                                      <TooltipContent>{m.note}</TooltipContent>
                                    )}
                                  </Tooltip>
                                );
                              })}
                            </div>
                          </div>
                          <p
                            onClick={() => seekTo(seg.from)}
                            className={cn(
                              "cursor-pointer text-sm leading-relaxed",
                              isActive
                                ? "text-foreground"
                                : isPast
                                  ? "text-muted-foreground/70"
                                  : "text-foreground/85",
                            )}
                          >
                            {seg.text}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {/* Right column */}
            <div className="flex flex-col overflow-hidden border-l border-white/5 bg-[hsl(var(--surface))]/40">
              <ScrollArea className="flex-1">
                <div className="space-y-4 p-5">
                  <VersionDetails version={version} />

                  <MarkersList
                    markers={visibleMarkers}
                    onSeek={(s) => {
                      seekTo(s);
                      if (!playing) setPlaying(true);
                    }}
                    currentAt={current}
                  />

                  <VersionsHistory
                    versions={VERSIONS}
                    active={versionId}
                    onSelect={setVersionId}
                    onCompare={() => setCompareOpen(true)}
                  />
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>

        <CompareDialog
          open={compareOpen}
          onOpenChange={setCompareOpen}
          left={compareLeft}
          right={compareRight}
          onLeftChange={setCompareLeft}
          onRightChange={setCompareRight}
        />
      </TooltipProvider>
    </AppShell>
  );
}

// ---------------- player ----------------

function PlayerCard({
  waveform,
  markers,
  duration,
  current,
  playing,
  onTogglePlay,
  onSeek,
  speed,
  onSpeedChange,
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  waveform: number[];
  markers: Marker[];
  duration: number;
  current: number;
  playing: boolean;
  onTogglePlay: () => void;
  onSeek: (s: number) => void;
  speed: number;
  onSpeedChange: (n: number) => void;
  volume: number;
  muted: boolean;
  onVolumeChange: (n: number) => void;
  onToggleMute: () => void;
}) {
  const barsRef = useRef<HTMLDivElement>(null);
  const progress = current / duration;

  const handleWaveClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek(ratio * duration);
  };

  return (
    <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface))]/70 p-5 shadow-lg backdrop-blur">
      {/* Waveform */}
      <div
        ref={barsRef}
        onClick={handleWaveClick}
        className="relative h-32 cursor-pointer select-none overflow-hidden rounded-md bg-black/30"
      >
        {/* bars */}
        <div className="absolute inset-0 flex items-center gap-[2px] px-2">
          {waveform.map((h, i) => {
            const filled = i / waveform.length < progress;
            return (
              <div
                key={i}
                className={cn(
                  "flex-1 rounded-sm transition-colors",
                  filled ? "bg-primary/90" : "bg-white/15",
                )}
                style={{ height: `${h * 100}%` }}
              />
            );
          })}
        </div>

        {/* markers */}
        {markers.map((m) => {
          const left = (m.at / duration) * 100;
          const meta = MARKER_META[m.kind];
          const Icon = meta.icon;
          return (
            <Tooltip key={m.id}>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeek(m.at);
                  }}
                  className="absolute top-0 flex h-full -translate-x-1/2 flex-col items-center"
                  style={{ left: `${left}%` }}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-black/50",
                      meta.ring,
                    )}
                  >
                    <Icon className="h-2.5 w-2.5 text-black" />
                  </span>
                  <span className="mt-0.5 h-full w-px bg-white/25" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">
                  {fmtTime(m.at)} · {meta.label}
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}

        {/* playhead */}
        <div
          className="pointer-events-none absolute top-0 h-full w-[2px] bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
          style={{ left: `${progress * 100}%` }}
        />
      </div>

      {/* Controls */}
      <div className="mt-4 flex items-center gap-4">
        <Button
          size="icon"
          onClick={onTogglePlay}
          className="h-10 w-10 shrink-0 rounded-full"
        >
          {playing ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="ml-0.5 h-4 w-4" />
          )}
        </Button>

        <div className="min-w-[120px] font-mono text-sm tabular-nums">
          <span className="text-foreground">{fmtTime(current)}</span>
          <span className="text-muted-foreground"> / {fmtTime(duration)}</span>
        </div>

        <Separator orientation="vertical" className="h-6" />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <Gauge className="h-4 w-4" />
              {speed.toFixed(2)}x
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-3">
            <div className="mb-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Velocidade</span>
              <span className="font-mono">{speed.toFixed(2)}x</span>
            </div>
            <Slider
              value={[speed * 100]}
              min={50}
              max={200}
              step={5}
              onValueChange={([v]) => onSpeedChange(v / 100)}
            />
            <div className="mt-3 flex flex-wrap gap-1">
              {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => onSpeedChange(s)}
                  className={cn(
                    "rounded border border-white/10 px-2 py-0.5 text-[11px]",
                    Math.abs(speed - s) < 0.01
                      ? "bg-primary/20 text-primary"
                      : "hover:bg-white/5",
                  )}
                >
                  {s}x
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onToggleMute}>
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Slider
            value={[muted ? 0 : volume]}
            max={100}
            step={1}
            onValueChange={([v]) => {
              onVolumeChange(v);
            }}
            className="w-24"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <Flag className="mr-1.5 h-3.5 w-3.5" />
            Adicionar marcador
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- side panels ----------------

function VersionDetails({ version }: { version: NarrationVersion }) {
  return (
    <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Detalhes do áudio</h3>
        <Badge
          variant="outline"
          className={cn("text-[10px]", STATUS_STYLES[version.status])}
        >
          {version.status}
        </Badge>
      </div>
      <dl className="space-y-2 text-sm">
        <Row icon={Mic} label="Voz" value={version.voice} />
        <Row icon={FileAudio} label="Formato" value={version.format} />
        <Row icon={Layers} label="Tamanho" value={fmtSize(version.sizeMb)} />
        <Row icon={Clock} label="Duração" value={fmtTime(version.duration)} />
        <Row icon={Calendar} label="Criado em" value={version.createdAt} />
      </dl>

      <Separator className="my-3 bg-white/5" />
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Settings2 className="h-3.5 w-3.5" />
        Configuração utilizada
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <MiniStat label="Velocidade" value={`${version.config.speed.toFixed(2)}x`} />
        <MiniStat label="Estabilidade" value={`${version.config.stability}%`} />
        <MiniStat label="Estilo" value={version.config.style} small />
      </div>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mic;
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

function MiniStat({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded border border-white/5 bg-white/[0.02] p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-medium",
          small ? "text-[11px] leading-tight" : "text-sm",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MarkersList({
  markers,
  onSeek,
  currentAt,
}: {
  markers: Marker[];
  onSeek: (s: number) => void;
  currentAt: number;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Marcadores{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({markers.length})
          </span>
        </h3>
        <Button variant="ghost" size="sm" className="h-7 px-2">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="space-y-1.5">
        {markers.map((m) => {
          const meta = MARKER_META[m.kind];
          const Icon = meta.icon;
          const isActive = Math.abs(currentAt - m.at) < 4;
          return (
            <button
              key={m.id}
              onClick={() => onSeek(m.at)}
              className={cn(
                "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition",
                isActive
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border",
                  meta.color,
                )}
              >
                <Icon className="h-3 w-3" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-foreground">
                    {m.label}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">
                    {fmtTime(m.at)}
                  </span>
                </span>
                {m.note && (
                  <span className="mt-0.5 block truncate text-muted-foreground">
                    {m.note}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function VersionsHistory({
  versions,
  active,
  onSelect,
  onCompare,
}: {
  versions: NarrationVersion[];
  active: string;
  onSelect: (id: string) => void;
  onCompare: () => void;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Versões</h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2" onClick={onCompare}>
          <GitCompare className="h-3.5 w-3.5" />
          Comparar
        </Button>
      </div>
      <div className="space-y-1.5">
        {versions.map((v) => {
          const isActive = v.id === active;
          return (
            <button
              key={v.id}
              onClick={() => onSelect(v.id)}
              className={cn(
                "flex w-full items-start justify-between gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition",
                isActive
                  ? "border-primary/50 bg-primary/10"
                  : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]",
              )}
            >
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">
                  {v.label}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                  <span>{v.voice}</span>
                  <span>·</span>
                  <span>{fmtTime(v.duration)}</span>
                  <span>·</span>
                  <span>{fmtSize(v.sizeMb)}</span>
                </div>
                <div className="text-muted-foreground/70">{v.createdAt}</div>
              </div>
              <Badge
                variant="outline"
                className={cn("shrink-0 text-[10px]", STATUS_STYLES[v.status])}
              >
                {v.status}
              </Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- compare dialog ----------------

function CompareDialog({
  open,
  onOpenChange,
  left,
  right,
  onLeftChange,
  onRightChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  left: string;
  right: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comparar versões da narração</DialogTitle>
          <DialogDescription>
            Reproduza dois áudios lado a lado para avaliar diferenças de voz,
            ritmo e configuração.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <ComparePane value={left} onChange={onLeftChange} side="A" />
          <ComparePane value={right} onChange={onRightChange} side="B" />
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
  onChange: (id: string) => void;
  side: "A" | "B";
}) {
  const v = VERSIONS.find((x) => x.id === value) ?? VERSIONS[0];
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const waveform = useMemo(() => buildWaveform(v.seed, 140), [v.seed]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setCurrent((c) => {
        const n = c + 0.5;
        if (n >= v.duration) {
          setPlaying(false);
          return v.duration;
        }
        return n;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [playing, v.duration]);

  useEffect(() => {
    setCurrent(0);
    setPlaying(false);
  }, [value]);

  const progress = current / v.duration;

  return (
    <div className="rounded-lg border border-white/5 bg-[hsl(var(--surface-2))]/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
          Áudio {side}
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
      <div className="relative h-20 overflow-hidden rounded bg-black/30">
        <div className="absolute inset-0 flex items-center gap-[2px] px-1.5">
          {waveform.map((h, i) => (
            <div
              key={i}
              className={cn(
                "flex-1 rounded-sm",
                i / waveform.length < progress ? "bg-primary/90" : "bg-white/15",
              )}
              style={{ height: `${h * 100}%` }}
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-0 h-full w-[2px] bg-primary"
          style={{ left: `${progress * 100}%` }}
        />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Button
          size="icon"
          variant="secondary"
          className="h-8 w-8 rounded-full"
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="ml-0.5 h-3.5 w-3.5" />}
        </Button>
        <div className="font-mono text-xs text-muted-foreground">
          {fmtTime(current)} / {fmtTime(v.duration)}
        </div>
      </div>
      <Separator className="my-3 bg-white/5" />
      <dl className="space-y-1.5 text-xs">
        <CompareRow label="Voz" value={v.voice} />
        <CompareRow label="Formato" value={v.format} />
        <CompareRow label="Tamanho" value={fmtSize(v.sizeMb)} />
        <CompareRow label="Duração" value={fmtTime(v.duration)} />
        <CompareRow
          label="Velocidade"
          value={`${v.config.speed.toFixed(2)}x`}
        />
        <CompareRow label="Estabilidade" value={`${v.config.stability}%`} />
        <CompareRow label="Estilo" value={v.config.style} />
        <CompareRow label="Status" value={v.status} />
      </dl>
    </div>
  );
}

function CompareRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-foreground">{value}</dd>
    </div>
  );
}
