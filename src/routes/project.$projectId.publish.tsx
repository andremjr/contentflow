import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Play,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Bookmark,
  MoreHorizontal,
  Bell,
  Clock,
  Calendar,
  Globe,
  ListVideo,
  Users,
  Eye,
  MessageSquare,
  Pin,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ChevronRight,
  Rocket,
  Copy,
  ExternalLink,
  Sparkles,
  Youtube,
  Loader2,
  Send,
  Timer,
  FilePenLine,
  ImageIcon,
  Type,
  Link2,
  Hash,
  BookMarked,
  Palette,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
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
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { projects, channels } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/publish")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        {
          title: p
            ? `Publicação — ${p.title} · ContentFlow OS`
            : "Publicação · ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Prévia do vídeo publicado com checklist, agendamento e simulação de publicação.",
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
  component: PublishView,
});

// ---------------- types ----------------

type PublishStatus = "draft" | "scheduled" | "published" | "error";
type Visibility = "Público" | "Não listado" | "Privado";

type ChecklistItem = {
  id: string;
  label: string;
  description: string;
  status: "done" | "warning" | "todo";
  icon: typeof CheckCircle2;
};

// ---------------- meta ----------------

const STATUS_META: Record<
  PublishStatus,
  { label: string; color: string; dot: string; icon: typeof Clock }
> = {
  draft: {
    label: "Rascunho",
    color: "border-slate-500/40 bg-slate-500/10 text-slate-200",
    dot: "bg-slate-400",
    icon: FilePenLine,
  },
  scheduled: {
    label: "Agendado",
    color: "border-sky-500/40 bg-sky-500/10 text-sky-200",
    dot: "bg-sky-400",
    icon: Timer,
  },
  published: {
    label: "Publicado",
    color: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
    dot: "bg-emerald-400",
    icon: CheckCircle2,
  },
  error: {
    label: "Erro",
    color: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    dot: "bg-rose-400",
    icon: AlertTriangle,
  },
};

// ---------------- mock ----------------

const CHAPTERS = [
  { at: 0, label: "Abertura" },
  { at: 42, label: "Por que isso é estranho" },
  { at: 126, label: "A hipótese primordial" },
  { at: 214, label: "Ponto-chave" },
  { at: 252, label: "Se inscreva no canal" },
  { at: 296, label: "Fusões em cascata" },
  { at: 456, label: "Consequências cosmológicas" },
  { at: 568, label: "Ceticismo e crítica" },
  { at: 686, label: "Fecho" },
];

const HASHTAGS = ["astrofisica", "buracosnegros", "jameswebb", "universo", "cosmologia"];

const DESCRIPTION = `Como buracos negros supermassivos apareceram tão cedo no universo? Neste vídeo, exploramos a hipótese das sementes primordiais, a corrida evolutiva das fusões em cascata e o que o James Webb começa a revelar sobre as primeiras horas do cosmos.

⏱️ Capítulos abaixo
🔗 Fontes e leituras adicionais no comentário fixado
🎧 Áudio narrado com Aurora PT-BR

Se você quer mais conteúdos assim, deixa o like e se inscreve no canal.`;

const LINKS = [
  { label: "Nasa · Deep Field", url: "nasa.gov/webb" },
  { label: "ESO · Sagittarius A*", url: "eso.org/black-hole" },
  { label: "Nosso Discord", url: "discord.gg/canal" },
];

const PINNED_COMMENT = `Referências deste vídeo:
• Nasa — imagens Deep Field do James Webb
• ESO — dados do Sagittarius A*
• Bower et al., 2023 — sementes primordiais

Qual foi a parte que mais te surpreendeu? Comenta aí 👇`;

const TIMEZONES = [
  "America/Sao_Paulo",
  "America/New_York",
  "Europe/Lisbon",
  "Asia/Tokyo",
];

const PLAYLISTS = [
  "Ciência Profunda",
  "Astrofísica para curiosos",
  "Séries — James Webb",
];

const AUDIENCE = ["Não é conteúdo para crianças", "Feito para crianças"];

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

// ---------------- component ----------------

function PublishView() {
  const { project, channel } = Route.useLoaderData();

  const [status, setStatus] = useState<PublishStatus>("scheduled");
  const [scheduledDate, setScheduledDate] = useState("2026-07-21");
  const [scheduledTime, setScheduledTime] = useState("19:00");
  const [timezone, setTimezone] = useState(TIMEZONES[0]);
  const [visibility, setVisibility] = useState<Visibility>("Público");
  const [playlist, setPlaylist] = useState(PLAYLISTS[0]);
  const [audience, setAudience] = useState(AUDIENCE[0]);
  const [notify, setNotify] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(true);
  const [madeForKids, setMadeForKids] = useState(false);
  const [comments, setComments] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState<{
    at: string;
    url: string;
    views: number;
    likes: number;
    comments: number;
    ctr: number;
  } | null>(null);

  const CHECKLIST: ChecklistItem[] = useMemo(
    () => [
      {
        id: "video",
        label: "Vídeo anexado",
        description: "Render v4 · 4K UHD · 13:32 · 1.25 GB",
        status: "done",
        icon: Play,
      },
      {
        id: "thumb",
        label: "Thumbnail selecionada",
        description: "Versão 3 aprovada · 1280 × 720",
        status: "done",
        icon: ImageIcon,
      },
      {
        id: "title",
        label: "Título aprovado",
        description: `${project.title.length} caracteres · aprovado por Marina`,
        status: "done",
        icon: Type,
      },
      {
        id: "desc",
        label: "Descrição preenchida",
        description: "3 parágrafos · 2 emojis · 3 links",
        status: "done",
        icon: FilePenLine,
      },
      {
        id: "links",
        label: "Links validados",
        description: "3 de 3 links respondendo (HTTP 200)",
        status: "done",
        icon: Link2,
      },
      {
        id: "pinned",
        label: "Comentário preparado",
        description: "Fixação automática após publicação",
        status: "done",
        icon: Pin,
      },
      {
        id: "schedule",
        label: "Horário confirmado",
        description:
          status === "scheduled"
            ? `${scheduledDate} · ${scheduledTime} (${timezone.split("/")[1]?.replace("_", " ")})`
            : "Defina data e horário",
        status: status === "scheduled" ? "done" : "warning",
        icon: Clock,
      },
    ],
    [project.title.length, status, scheduledDate, scheduledTime, timezone],
  );

  const doneCount = CHECKLIST.filter((c) => c.status === "done").length;
  const readyToPublish = doneCount === CHECKLIST.length;

  const simulatePublish = () => {
    setPublishing(true);
    window.setTimeout(() => {
      setPublishing(false);
      setStatus("published");
      setPublished({
        at: new Date().toLocaleString("pt-BR", {
          dateStyle: "medium",
          timeStyle: "short",
        }),
        url: `youtube.com/watch?v=${Math.random().toString(36).slice(2, 13)}`,
        views: 1247,
        likes: 168,
        comments: 24,
        ctr: 8.4,
      });
    }, 2400);
  };

  return (
    <AppShell>
      <TopBar
        title="Publicação"
        subtitle={`${project.title} · ${channel.name}`}
      />
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Breadcrumb */}
          <div className="border-b border-white/5 bg-[hsl(var(--surface))]/60 px-6 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
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
                <span className="text-foreground">Publicação</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn("gap-1.5", STATUS_META[status].color)}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      STATUS_META[status].dot,
                    )}
                  />
                  {STATUS_META[status].label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Published banner */}
          {published && (
            <PublishedBanner
              data={published}
              channel={channel.name}
              title={project.title}
            />
          )}

          <ScrollArea className="flex-1">
            <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_420px]">
              {/* Left — YouTube preview */}
              <YouTubePreview
                title={project.title}
                channel={channel.name}
                published={published}
                status={status}
                scheduledDate={scheduledDate}
                scheduledTime={scheduledTime}
              />

              {/* Right — Publish panel */}
              <div className="space-y-4">
                <PublishPanel
                  status={status}
                  onStatusChange={setStatus}
                  scheduledDate={scheduledDate}
                  onScheduledDate={setScheduledDate}
                  scheduledTime={scheduledTime}
                  onScheduledTime={setScheduledTime}
                  timezone={timezone}
                  onTimezone={setTimezone}
                  visibility={visibility}
                  onVisibility={setVisibility}
                  playlist={playlist}
                  onPlaylist={setPlaylist}
                  audience={audience}
                  onAudience={setAudience}
                  notify={notify}
                  onNotify={setNotify}
                  autoTranslate={autoTranslate}
                  onAutoTranslate={setAutoTranslate}
                  madeForKids={madeForKids}
                  onMadeForKids={setMadeForKids}
                  comments={comments}
                  onComments={setComments}
                />

                <ChecklistCard items={CHECKLIST} doneCount={doneCount} />

                <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface))]/60 p-4">
                  {status === "published" ? (
                    <div className="text-xs text-muted-foreground">
                      Este projeto já foi publicado. Use os atalhos no topo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {!readyToPublish && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-200">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            Resolva os itens do checklist antes de publicar.
                          </span>
                        </div>
                      )}
                      <Button
                        className="w-full"
                        size="lg"
                        disabled={!readyToPublish || publishing}
                        onClick={simulatePublish}
                      >
                        {publishing ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Enviando para o YouTube...
                          </>
                        ) : status === "scheduled" ? (
                          <>
                            <Timer className="mr-2 h-4 w-4" />
                            Confirmar agendamento
                          </>
                        ) : (
                          <>
                            <Rocket className="mr-2 h-4 w-4" />
                            Publicar agora
                          </>
                        )}
                      </Button>
                      <Button variant="outline" className="w-full" size="sm">
                        <Send className="mr-2 h-4 w-4" />
                        Enviar para revisão
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      </TooltipProvider>
    </AppShell>
  );
}

// ---------------- YouTube preview ----------------

function YouTubePreview({
  title,
  channel,
  published,
  status,
  scheduledDate,
  scheduledTime,
}: {
  title: string;
  channel: string;
  published: {
    at: string;
    url: string;
    views: number;
    likes: number;
    comments: number;
    ctr: number;
  } | null;
  status: PublishStatus;
  scheduledDate: string;
  scheduledTime: string;
}) {
  const publishInfo = published
    ? `Publicado em ${published.at}`
    : status === "scheduled"
      ? `Agendado para ${scheduledDate} às ${scheduledTime}`
      : "Rascunho — não publicado";

  const views = published?.views ?? 0;
  const likes = published?.likes ?? 0;

  return (
    <div className="rounded-xl border border-white/5 bg-[#0a0a0a] shadow-2xl">
      {/* Fake YouTube chrome */}
      <div className="flex items-center gap-3 border-b border-white/5 bg-[#0f0f0f] px-4 py-2.5">
        <Youtube className="h-5 w-5 text-red-500" />
        <span className="text-sm font-medium text-white">YouTube</span>
        <div className="ml-auto flex h-8 w-72 items-center rounded-full border border-white/10 bg-[#1a1a1a] px-3 text-xs text-white/50">
          Pesquisar
        </div>
        <div className="h-8 w-8 rounded-full bg-red-500/80" />
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        {/* Player */}
        <div>
          <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
            <ThumbnailArt title={title} />
            <button className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/60 p-5 backdrop-blur transition hover:bg-black/80">
                <Play className="ml-0.5 h-7 w-7 text-white" />
              </span>
            </button>
            <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">
              13:32
            </div>
            {status === "scheduled" && !published && (
              <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[11px] text-white backdrop-blur">
                <Timer className="h-3 w-3" />
                Estreia em {scheduledDate} · {scheduledTime}
              </div>
            )}
          </div>

          {/* Title + row */}
          <div className="mt-3 space-y-2">
            <h1 className="text-lg font-bold leading-tight text-white">
              {title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-sm font-bold text-white">
                  {channel.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-white">
                    {channel}
                    <CheckCircle2 className="h-3 w-3 fill-white/70 text-black" />
                  </div>
                  <div className="text-[11px] text-white/60">
                    412 mil inscritos
                  </div>
                </div>
                <Button
                  size="sm"
                  className="ml-2 h-8 rounded-full bg-white text-black hover:bg-white/90"
                >
                  Inscrever-se
                </Button>
              </div>

              <div className="flex items-center gap-1">
                <div className="flex overflow-hidden rounded-full bg-white/10">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                    <ThumbsUp className="h-3.5 w-3.5" />
                    {published ? likes : "—"}
                  </button>
                  <div className="w-px bg-white/10" />
                  <button className="px-3 py-1.5 text-xs text-white hover:bg-white/5">
                    <ThumbsDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                  <Share2 className="h-3.5 w-3.5" />
                  Compartilhar
                </button>
                <button className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/5">
                  <Bookmark className="h-3.5 w-3.5" />
                  Salvar
                </button>
                <button className="rounded-full bg-white/10 p-1.5 text-white hover:bg-white/5">
                  <MoreHorizontal className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Description card */}
            <div className="rounded-xl bg-white/[0.04] p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white">
                <span className="font-semibold">
                  {published ? `${views.toLocaleString("pt-BR")} visualizações` : "0 visualizações"}
                </span>
                <span className="text-white/70">{publishInfo}</span>
                <div className="flex flex-wrap gap-1">
                  {HASHTAGS.map((h) => (
                    <span key={h} className="text-blue-400">
                      #{h}
                    </span>
                  ))}
                </div>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-white/90">
                {DESCRIPTION}
              </p>

              {/* Links */}
              <div className="mt-3 space-y-1">
                {LINKS.map((l) => (
                  <div key={l.url} className="flex items-center gap-2 text-xs">
                    <Link2 className="h-3 w-3 text-blue-400" />
                    <span className="text-white/80">{l.label}:</span>
                    <span className="text-blue-400">{l.url}</span>
                  </div>
                ))}
              </div>

              {/* Chapters */}
              <div className="mt-4 border-t border-white/10 pt-3">
                <div className="mb-2 text-xs font-medium text-white/80">
                  Capítulos
                </div>
                <div className="space-y-1">
                  {CHAPTERS.map((c) => (
                    <div
                      key={c.at}
                      className="flex items-center gap-3 rounded px-1 py-0.5 text-xs text-white/80 hover:bg-white/5"
                    >
                      <span className="font-mono text-blue-400">
                        {fmt(c.at)}
                      </span>
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Pinned comment */}
            <div className="mt-2 rounded-xl bg-white/[0.03] p-3">
              <div className="mb-2 flex items-center gap-2 text-[11px] text-white/60">
                <MessageSquare className="h-3 w-3" />
                {published ? `${published.comments} comentários` : "0 comentários"}
              </div>
              <div className="flex gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 text-[10px] font-bold text-white">
                  {channel.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-xs">
                    <Pin className="h-3 w-3 text-white/60" />
                    <span className="text-white/60">Fixado por {channel}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs">
                    <span className="font-medium text-white">@{channel.toLowerCase().replace(/\s+/g, "")}</span>
                    <span className="text-white/50">agora</span>
                  </div>
                  <p className="mt-1 whitespace-pre-line text-sm text-white/90">
                    {PINNED_COMMENT}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Suggestions column */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-white/70">A seguir</div>
          {[
            "A física impossível de Interstellar",
            "Por que o tempo passa devagar perto de um buraco negro",
            "James Webb encontra o quê no universo antigo?",
            "5 conceitos de cosmologia que ninguém te contou",
          ].map((t, i) => (
            <div key={i} className="flex gap-2">
              <div
                className="aspect-video w-24 shrink-0 rounded"
                style={{
                  background: `linear-gradient(135deg, hsl(${(i * 70 + 200) % 360} 55% 40%), hsl(${(i * 70 + 240) % 360} 55% 22%))`,
                }}
              />
              <div className="min-w-0 text-[11px] text-white/85">
                <p className="line-clamp-2 font-medium">{t}</p>
                <p className="mt-0.5 text-white/50">{channel}</p>
                <p className="text-white/50">
                  {(Math.random() * 300 + 20).toFixed(0)} mil visualizações
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ThumbnailArt({ title }: { title: string }) {
  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.35),transparent_60%),radial-gradient(circle_at_75%_65%,rgba(168,85,247,0.35),transparent_55%),#050914]" />
      <div className="absolute right-6 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full bg-black shadow-[inset_-20px_-20px_60px_rgba(59,130,246,0.35),0_0_60px_rgba(59,130,246,0.35)]" />
      <div className="absolute inset-x-0 bottom-0 p-5">
        <div className="line-clamp-2 max-w-[70%] text-2xl font-black uppercase leading-tight tracking-tight text-white drop-shadow-lg">
          {title}
        </div>
      </div>
    </div>
  );
}

// ---------------- publish panel ----------------

function PublishPanel(props: {
  status: PublishStatus;
  onStatusChange: (s: PublishStatus) => void;
  scheduledDate: string;
  onScheduledDate: (v: string) => void;
  scheduledTime: string;
  onScheduledTime: (v: string) => void;
  timezone: string;
  onTimezone: (v: string) => void;
  visibility: Visibility;
  onVisibility: (v: Visibility) => void;
  playlist: string;
  onPlaylist: (v: string) => void;
  audience: string;
  onAudience: (v: string) => void;
  notify: boolean;
  onNotify: (v: boolean) => void;
  autoTranslate: boolean;
  onAutoTranslate: (v: boolean) => void;
  madeForKids: boolean;
  onMadeForKids: (v: boolean) => void;
  comments: boolean;
  onComments: (v: boolean) => void;
}) {
  const meta = STATUS_META[props.status];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface))]/60 p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Publicação</h3>
        <Badge variant="outline" className={cn("gap-1.5", meta.color)}>
          <Icon className="h-3 w-3" />
          {meta.label}
        </Badge>
      </div>

      {/* Status */}
      <Field label="Status" icon={Sparkles}>
        <Select
          value={props.status}
          onValueChange={(v) => props.onStatusChange(v as PublishStatus)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["draft", "scheduled", "published", "error"] as PublishStatus[]).map(
              (s) => (
                <SelectItem key={s} value={s}>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        STATUS_META[s].dot,
                      )}
                    />
                    {STATUS_META[s].label}
                  </div>
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </Field>

      {/* Date/time */}
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Field label="Data programada" icon={Calendar}>
          <Input
            type="date"
            value={props.scheduledDate}
            onChange={(e) => props.onScheduledDate(e.target.value)}
            className="h-9"
          />
        </Field>
        <Field label="Horário" icon={Clock}>
          <Input
            type="time"
            value={props.scheduledTime}
            onChange={(e) => props.onScheduledTime(e.target.value)}
            className="h-9"
          />
        </Field>
      </div>

      <Field label="Fuso horário" icon={Globe} className="mt-3">
        <Select value={props.timezone} onValueChange={props.onTimezone}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TIMEZONES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Separator className="my-4 bg-white/5" />

      <Field label="Visibilidade" icon={Eye}>
        <Select
          value={props.visibility}
          onValueChange={(v) => props.onVisibility(v as Visibility)}
        >
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(["Público", "Não listado", "Privado"] as Visibility[]).map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Playlist" icon={ListVideo} className="mt-3">
        <Select value={props.playlist} onValueChange={props.onPlaylist}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PLAYLISTS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Público" icon={Users} className="mt-3">
        <Select value={props.audience} onValueChange={props.onAudience}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AUDIENCE.map((a) => (
              <SelectItem key={a} value={a}>
                {a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Separator className="my-4 bg-white/5" />

      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Palette className="h-3.5 w-3.5" />
        Configurações adicionais
      </div>
      <div className="space-y-2">
        <ToggleRow
          icon={Bell}
          label="Notificar inscritos"
          value={props.notify}
          onChange={props.onNotify}
        />
        <ToggleRow
          icon={Hash}
          label="Traduzir automaticamente"
          description="Título e descrição em EN e ES"
          value={props.autoTranslate}
          onChange={props.onAutoTranslate}
        />
        <ToggleRow
          icon={Users}
          label="Feito para crianças"
          value={props.madeForKids}
          onChange={props.onMadeForKids}
        />
        <ToggleRow
          icon={MessageSquare}
          label="Comentários habilitados"
          value={props.comments}
          onChange={props.onComments}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  icon: typeof Clock;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  value,
  onChange,
}: {
  icon: typeof Bell;
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.02] px-3 py-2">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {description && (
          <div className="text-[11px] text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <Switch checked={value} onCheckedChange={onChange} />
    </div>
  );
}

// ---------------- checklist ----------------

function ChecklistCard({
  items,
  doneCount,
}: {
  items: ChecklistItem[];
  doneCount: number;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-[hsl(var(--surface))]/60 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Checklist de validação</h3>
        <span className="text-xs text-muted-foreground">
          {doneCount} de {items.length} concluídos
        </span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full bg-emerald-400 transition-all"
          style={{ width: `${(doneCount / items.length) * 100}%` }}
        />
      </div>
      <div className="space-y-1.5">
        {items.map((item) => {
          const Icon = item.icon;
          const StatusIcon =
            item.status === "done"
              ? CheckCircle2
              : item.status === "warning"
                ? AlertTriangle
                : Circle;
          const color =
            item.status === "done"
              ? "text-emerald-400"
              : item.status === "warning"
                ? "text-amber-400"
                : "text-muted-foreground";
          return (
            <div
              key={item.id}
              className={cn(
                "flex items-start gap-2.5 rounded-md border px-3 py-2 text-sm",
                item.status === "done"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : item.status === "warning"
                    ? "border-amber-500/30 bg-amber-500/5"
                    : "border-white/5 bg-white/[0.02]",
              )}
            >
              <StatusIcon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 font-medium">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {item.label}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {item.description}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- published banner ----------------

function PublishedBanner({
  data,
  channel,
  title,
}: {
  data: {
    at: string;
    url: string;
    views: number;
    likes: number;
    comments: number;
    ctr: number;
  };
  channel: string;
  title: string;
}) {
  return (
    <div className="border-b border-emerald-500/20 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent px-6 py-4">
      <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
        <div className="flex items-start gap-3">
          <div className="relative aspect-video w-40 shrink-0 overflow-hidden rounded-lg border border-white/10">
            <ThumbnailArt title={title} />
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
              >
                <CheckCircle2 className="h-3 w-3" />
                Publicado
              </Badge>
              <span className="text-xs text-muted-foreground">{data.at}</span>
            </div>
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="text-xs text-muted-foreground">{channel}</div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]">
              <Link2 className="h-3 w-3 text-emerald-400" />
              <span className="truncate font-mono text-emerald-300">
                {data.url}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => navigator.clipboard?.writeText(data.url)}
                    className="rounded p-1 text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Copiar link</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <MiniMetric
            icon={Eye}
            label="Views"
            value={data.views.toLocaleString("pt-BR")}
          />
          <MiniMetric
            icon={ThumbsUp}
            label="Likes"
            value={data.likes.toLocaleString("pt-BR")}
          />
          <MiniMetric
            icon={MessageSquare}
            label="Comentários"
            value={data.comments.toString()}
          />
          <MiniMetric icon={BookMarked} label="CTR" value={`${data.ctr}%`} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm">
            <ExternalLink className="mr-1.5 h-4 w-4" />
            Abrir no YouTube
          </Button>
          <Button size="sm" variant="outline">
            <Copy className="mr-1.5 h-4 w-4" />
            Criar novo projeto a partir deste
          </Button>
        </div>
      </div>
    </div>
  );
}

function MiniMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
