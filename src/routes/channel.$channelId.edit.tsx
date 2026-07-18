import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, type KeyboardEvent } from "react";
import {
  Music,
  Sparkles,
  Layers,
  Sliders,
  Play,
  Pause,
  Star,
  Search,
  Filter,
  Plus,
  X,
  Ban,
  Info,
  Save,
  Volume2,
  Waves,
  ArrowRightLeft,
  Wand2,
  Zap,
  Palette,
  Type as TypeIcon,
  MonitorSmartphone,
  Camera,
  Sparkle,
  Highlighter,
  Trash2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/edit")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    return {
      meta: [
        {
          title: ch
            ? `Edição — ${ch.name} · ContentFlow OS`
            : "Edição — ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Trilha musical, transições, efeitos e overlays da identidade de edição do canal.",
        },
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
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: EditScreen,
});

// ---------- mocks ----------

type Track = {
  id: string;
  name: string;
  category: string;
  mood: string;
  duration: string;
  bpm: number;
  favorite: boolean;
  gradient: string;
};

const INITIAL_TRACKS: Track[] = [
  { id: "t1", name: "Signal Rise", category: "Cinematic", mood: "Inspirador", duration: "3:24", bpm: 92, favorite: true, gradient: "from-primary to-blue-800" },
  { id: "t2", name: "Neon Pulse", category: "Electronic", mood: "Energético", duration: "2:48", bpm: 128, favorite: false, gradient: "from-fuchsia-500 to-purple-800" },
  { id: "t3", name: "Slow Focus", category: "Lo-Fi", mood: "Concentração", duration: "4:12", bpm: 78, favorite: true, gradient: "from-emerald-500 to-teal-700" },
  { id: "t4", name: "Deep Dive", category: "Ambient", mood: "Contemplativo", duration: "5:02", bpm: 65, favorite: false, gradient: "from-slate-500 to-slate-800" },
  { id: "t5", name: "Hook & Roll", category: "Pop", mood: "Divertido", duration: "2:36", bpm: 118, favorite: false, gradient: "from-amber-500 to-orange-700" },
  { id: "t6", name: "Circuits", category: "Electronic", mood: "Tech", duration: "3:08", bpm: 110, favorite: false, gradient: "from-cyan-500 to-blue-700" },
];

type Transition = {
  id: string;
  name: string;
  kind: string;
  description: string;
};

const TRANSITIONS: Transition[] = [
  { id: "tr1", name: "Corte seco", kind: "cut", description: "Sem transição, ritmo direto" },
  { id: "tr2", name: "Cross fade", kind: "fade", description: "Fusão suave entre planos" },
  { id: "tr3", name: "Whip pan", kind: "whip", description: "Movimento rápido lateral" },
  { id: "tr4", name: "Zoom in", kind: "zoom-in", description: "Aproxima o próximo plano" },
  { id: "tr5", name: "Zoom out", kind: "zoom-out", description: "Afasta antes do próximo plano" },
  { id: "tr6", name: "Glitch", kind: "glitch", description: "Interferência digital" },
  { id: "tr7", name: "Slide horizontal", kind: "slide", description: "Empurra o plano lateralmente" },
  { id: "tr8", name: "Flash", kind: "flash", description: "Estouro de luz entre cortes" },
];

const APPLICATION_MODES = [
  { value: "random", label: "Aplicação aleatória" },
  { value: "rule", label: "Baseada em regra" },
  { value: "manual", label: "Somente manual" },
];

type EffectCategory =
  | "textura"
  | "luz"
  | "particulas"
  | "camera"
  | "ruido"
  | "interface"
  | "legenda"
  | "destaque";

const EFFECT_CATEGORY_META: Record<
  EffectCategory,
  { label: string; Icon: typeof Sparkle; gradient: string }
> = {
  textura: { label: "Textura", Icon: Palette, gradient: "from-amber-500 to-orange-700" },
  luz: { label: "Luz", Icon: Sparkle, gradient: "from-yellow-400 to-amber-600" },
  particulas: { label: "Partículas", Icon: Sparkles, gradient: "from-fuchsia-500 to-purple-700" },
  camera: { label: "Câmera", Icon: Camera, gradient: "from-primary to-blue-800" },
  ruido: { label: "Ruído", Icon: Waves, gradient: "from-slate-500 to-slate-800" },
  interface: { label: "Interface", Icon: MonitorSmartphone, gradient: "from-cyan-500 to-blue-700" },
  legenda: { label: "Legenda", Icon: TypeIcon, gradient: "from-emerald-500 to-teal-700" },
  destaque: { label: "Destaque", Icon: Highlighter, gradient: "from-rose-500 to-red-700" },
};

type Effect = {
  id: string;
  name: string;
  category: EffectCategory;
  intensity: number;
  position: string;
  frequency: string;
  active: boolean;
  required: boolean;
};

const INITIAL_EFFECTS: Effect[] = [
  { id: "e1", name: "Grão de filme", category: "textura", intensity: 25, position: "full", frequency: "always", active: true, required: false },
  { id: "e2", name: "Light leak", category: "luz", intensity: 40, position: "peak", frequency: "sparse", active: true, required: false },
  { id: "e3", name: "Poeira animada", category: "particulas", intensity: 30, position: "opening", frequency: "sparse", active: false, required: false },
  { id: "e4", name: "Shake sutil", category: "camera", intensity: 15, position: "peak", frequency: "medium", active: true, required: false },
  { id: "e5", name: "Vinheta escura", category: "ruido", intensity: 35, position: "full", frequency: "always", active: true, required: true },
  { id: "e6", name: "HUD tecnológico", category: "interface", intensity: 50, position: "body", frequency: "medium", active: false, required: false },
  { id: "e7", name: "Legenda destaque", category: "legenda", intensity: 60, position: "body", frequency: "frequent", active: true, required: true },
  { id: "e8", name: "Zoom highlight", category: "destaque", intensity: 45, position: "peak", frequency: "sparse", active: true, required: false },
];

const POSITION_OPTIONS = [
  { value: "full", label: "Vídeo inteiro" },
  { value: "opening", label: "Abertura" },
  { value: "body", label: "Corpo do vídeo" },
  { value: "peak", label: "Momento de auge" },
  { value: "closing", label: "Encerramento" },
];

const FREQUENCY_OPTIONS = [
  { value: "always", label: "Sempre" },
  { value: "frequent", label: "Frequente" },
  { value: "medium", label: "Médio" },
  { value: "sparse", label: "Escasso" },
  { value: "once", label: "Uma vez" },
];

// ---------- component ----------

function EditScreen() {
  const { channel } = Route.useLoaderData();

  // Music
  const [tracks, setTracks] = useState<Track[]>(INITIAL_TRACKS);
  const [selectedTracks, setSelectedTracks] = useState<string[]>(["t1", "t3"]);
  const [playingTrack, setPlayingTrack] = useState<string | null>(null);
  const [trackSearch, setTrackSearch] = useState("");
  const [trackCatFilter, setTrackCatFilter] = useState("all");
  const [trackMoodFilter, setTrackMoodFilter] = useState("all");

  const [volume, setVolume] = useState<[number]>([35]);
  const [ducking, setDucking] = useState(true);
  const [fadeIn, setFadeIn] = useState<[number]>([2]);
  const [fadeOut, setFadeOut] = useState<[number]>([3]);
  const [musicMode, setMusicMode] = useState<"continuous" | "blocks">("continuous");
  const [blocked, setBlocked] = useState<string[]>([
    "Trap comercial",
    "Vocais em inglês",
  ]);

  const filteredTracks = useMemo(
    () =>
      tracks.filter((t) => {
        if (trackCatFilter !== "all" && t.category !== trackCatFilter) return false;
        if (trackMoodFilter !== "all" && t.mood !== trackMoodFilter) return false;
        if (trackSearch) {
          const q = trackSearch.toLowerCase();
          if (!`${t.name} ${t.category} ${t.mood}`.toLowerCase().includes(q))
            return false;
        }
        return true;
      }),
    [tracks, trackCatFilter, trackMoodFilter, trackSearch],
  );

  const trackCategories = ["all", ...new Set(tracks.map((t) => t.category))];
  const trackMoods = ["all", ...new Set(tracks.map((t) => t.mood))];

  const toggleTrack = (id: string) =>
    setSelectedTracks((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleTrackFav = (id: string) =>
    setTracks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)),
    );

  // Transitions
  const [selectedTransitions, setSelectedTransitions] = useState<string[]>([
    "tr1",
    "tr2",
    "tr4",
  ]);
  const [defaultTransition, setDefaultTransition] = useState("tr1");
  const [transDuration, setTransDuration] = useState<[number]>([300]);
  const [transFrequency, setTransFrequency] = useState<[number]>([50]);
  const [transIntensity, setTransIntensity] = useState<[number]>([40]);
  const [transMode, setTransMode] = useState("random");

  const toggleTransition = (id: string) =>
    setSelectedTransitions((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (defaultTransition === id && !next.includes(id) && next.length) {
        setDefaultTransition(next[0]);
      }
      return next;
    });

  // Effects
  const [effects, setEffects] = useState<Effect[]>(INITIAL_EFFECTS);
  const [effectCategoryFilter, setEffectCategoryFilter] = useState<
    "all" | EffectCategory
  >("all");
  const [effectSearch, setEffectSearch] = useState("");

  const filteredEffects = useMemo(
    () =>
      effects.filter((e) => {
        if (
          effectCategoryFilter !== "all" &&
          e.category !== effectCategoryFilter
        )
          return false;
        if (
          effectSearch &&
          !e.name.toLowerCase().includes(effectSearch.toLowerCase())
        )
          return false;
        return true;
      }),
    [effects, effectCategoryFilter, effectSearch],
  );

  const patchEffect = (id: string, patch: Partial<Effect>) =>
    setEffects((prev) =>
      prev.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    );
  const removeEffect = (id: string) =>
    setEffects((prev) => prev.filter((e) => e.id !== id));

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Edição"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Edição" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1240px] space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <ChannelAvatar channel={channel} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Wand2 className="h-3.5 w-3.5" />
                  Edição · Etapa 8 do pipeline
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Identidade de edição
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Trilha musical, transições, efeitos e overlays que definem o
                  estilo do canal.
                </p>
              </div>
              <Button size="sm">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Simular edição
              </Button>
            </div>

            {/* Trilha musical */}
            <Section
              icon={<Music className="h-4 w-4" />}
              title="Trilha musical"
              description="Biblioteca de faixas e regras gerais de trilha."
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder="Buscar por nome, categoria ou humor..."
                    className="pl-8"
                  />
                </div>
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <FilterSelect
                  value={trackCatFilter}
                  onChange={setTrackCatFilter}
                  label="Categoria"
                  options={trackCategories}
                />
                <FilterSelect
                  value={trackMoodFilter}
                  onChange={setTrackMoodFilter}
                  label="Humor"
                  options={trackMoods}
                />
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedTracks.length} selecionadas
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {filteredTracks.map((t) => (
                  <TrackCard
                    key={t.id}
                    track={t}
                    selected={selectedTracks.includes(t.id)}
                    playing={playingTrack === t.id}
                    onSelect={() => toggleTrack(t.id)}
                    onPlay={() =>
                      setPlayingTrack((prev) => (prev === t.id ? null : t.id))
                    }
                    onFav={() => toggleTrackFav(t.id)}
                  />
                ))}
                {filteredTracks.length === 0 && (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhuma faixa encontrada.
                  </div>
                )}
              </div>

              {selectedTracks.length > 0 && (
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                  <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <Sliders className="h-4 w-4 text-primary" />
                    Ajustes da trilha selecionada
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <StackedSlider
                      icon={<Volume2 className="h-3.5 w-3.5" />}
                      label="Volume"
                      value={volume}
                      onChange={setVolume}
                      suffix="%"
                    />
                    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-secondary/40 px-4 py-3">
                      <div>
                        <div className="text-sm font-medium">
                          Ducking automático
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Abaixa a música durante a narração.
                        </p>
                      </div>
                      <Switch checked={ducking} onCheckedChange={setDucking} />
                    </label>
                    <StackedSlider
                      label="Fade-in"
                      value={fadeIn}
                      onChange={setFadeIn}
                      max={10}
                      step={0.5}
                      suffix="s"
                    />
                    <StackedSlider
                      label="Fade-out"
                      value={fadeOut}
                      onChange={setFadeOut}
                      max={10}
                      step={0.5}
                      suffix="s"
                    />
                    <div className="md:col-span-2">
                      <Label className="mb-2 block text-sm font-medium">
                        Uso da trilha
                      </Label>
                      <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/40 p-1">
                        {[
                          { id: "continuous", label: "Contínuo", description: "Durante todo o vídeo" },
                          { id: "blocks", label: "Por blocos", description: "Alterna com silêncio" },
                        ].map((m) => {
                          const active = musicMode === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() =>
                                setMusicMode(m.id as "continuous" | "blocks")
                              }
                              className={cn(
                                "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                                active
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                              )}
                            >
                              <span className="text-xs font-semibold">
                                {m.label}
                              </span>
                              <span
                                className={cn(
                                  "text-[10px]",
                                  active
                                    ? "text-primary-foreground/80"
                                    : "text-muted-foreground",
                                )}
                              >
                                {m.description}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <TagField
                label="Músicas proibidas"
                description="Estilos, artistas ou termos que nunca podem aparecer."
                values={blocked}
                onChange={setBlocked}
                tone="destructive"
                icon={<Ban className="h-3 w-3" />}
              />
            </Section>

            {/* Transições */}
            <Section
              icon={<ArrowRightLeft className="h-4 w-4" />}
              title="Transições"
              description="Cortes e passagens entre planos."
            >
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {TRANSITIONS.map((t) => {
                  const selected = selectedTransitions.includes(t.id);
                  const isDefault = defaultTransition === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => toggleTransition(t.id)}
                      className={cn(
                        "group relative cursor-pointer overflow-hidden rounded-lg border transition-all",
                        selected
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border hover:border-border/80",
                      )}
                    >
                      <TransitionPreview kind={t.kind} />
                      {selected && (
                        <div className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                          <svg
                            viewBox="0 0 12 12"
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M2 6l3 3 5-6" strokeLinecap="round" />
                          </svg>
                        </div>
                      )}
                      <div className="p-2.5">
                        <div className="flex items-center justify-between gap-1">
                          <div className="truncate text-sm font-semibold">
                            {t.name}
                          </div>
                          {selected && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDefaultTransition(t.id);
                              }}
                              className={cn(
                                "rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors",
                                isDefault
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-secondary text-muted-foreground hover:text-foreground",
                              )}
                            >
                              {isDefault ? "Padrão" : "Definir padrão"}
                            </button>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {t.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-5 md:grid-cols-2">
                <StackedSlider
                  label="Duração"
                  value={transDuration}
                  onChange={setTransDuration}
                  min={50}
                  max={1000}
                  step={25}
                  suffix="ms"
                />
                <StackedSlider
                  label="Frequência"
                  value={transFrequency}
                  onChange={setTransFrequency}
                  suffix="%"
                  hint="Chance de usar transição em cada corte"
                />
                <StackedSlider
                  label="Intensidade"
                  value={transIntensity}
                  onChange={setTransIntensity}
                  suffix="%"
                  hint="Impacto visual da transição"
                />
                <div>
                  <Label className="mb-2 block text-sm font-medium">
                    Aplicação
                  </Label>
                  <Select value={transMode} onValueChange={setTransMode}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {APPLICATION_MODES.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>

            {/* Efeitos e overlays */}
            <Section
              icon={<Sparkles className="h-4 w-4" />}
              title="Efeitos e overlays"
              description="Camadas visuais que reforçam a identidade do canal."
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={effectSearch}
                    onChange={(e) => setEffectSearch(e.target.value)}
                    placeholder="Buscar efeito..."
                    className="pl-8"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <CategoryChip
                  active={effectCategoryFilter === "all"}
                  onClick={() => setEffectCategoryFilter("all")}
                  label="Todos"
                />
                {(Object.keys(EFFECT_CATEGORY_META) as EffectCategory[]).map((k) => {
                  const meta = EFFECT_CATEGORY_META[k];
                  return (
                    <CategoryChip
                      key={k}
                      active={effectCategoryFilter === k}
                      onClick={() => setEffectCategoryFilter(k)}
                      label={meta.label}
                      icon={<meta.Icon className="h-3 w-3" />}
                    />
                  );
                })}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {filteredEffects.map((e) => (
                  <EffectCard
                    key={e.id}
                    effect={e}
                    onPatch={(p) => patchEffect(e.id, p)}
                    onRemove={() => removeEffect(e.id)}
                  />
                ))}
                {filteredEffects.length === 0 && (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhum efeito para os filtros atuais.
                  </div>
                )}
              </div>
            </Section>

            {/* Prévia */}
            <Section
              icon={<Zap className="h-4 w-4" />}
              title="Prévia simulada"
              description="Resumo visual da identidade de edição."
            >
              <EditIdentityPreview
                trackName={
                  tracks.find((t) => t.id === selectedTracks[0])?.name ??
                  "Sem trilha"
                }
                volume={volume[0]}
                ducking={ducking}
                musicMode={musicMode}
                transitionsCount={selectedTransitions.length}
                defaultTransition={
                  TRANSITIONS.find((t) => t.id === defaultTransition)?.name ??
                  "—"
                }
                effectsActive={effects.filter((e) => e.active).length}
                effectsRequired={effects.filter((e) => e.required).length}
              />
            </Section>

            <Separator />
            <div className="flex items-center justify-between gap-3 pb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                As alterações se aplicam à próxima edição gerada.
              </div>
              <div className="flex gap-2">
                <Button variant="ghost">Cancelar</Button>
                <Button variant="secondary">
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar como modelo
                </Button>
                <Button>Salvar alterações</Button>
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------- helpers ----------

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div>
          <h2 className="text-base font-semibold">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o === "all" ? "Todos" : o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TrackCard({
  track,
  selected,
  playing,
  onSelect,
  onPlay,
  onFav,
}: {
  track: Track;
  selected: boolean;
  playing: boolean;
  onSelect: () => void;
  onPlay: () => void;
  onFav: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-lg border transition-all",
        selected
          ? "border-primary bg-primary/5 ring-2 ring-primary/40"
          : "border-border bg-secondary/30 hover:border-border/80",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <div
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-inner",
            track.gradient,
          )}
        >
          <Music className="h-5 w-5" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFav();
            }}
            aria-label="Favoritar"
            className={cn(
              "absolute -right-1 -top-1 rounded-full bg-background p-1 shadow transition-colors",
              track.favorite
                ? "text-amber-400"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Star
              className="h-3 w-3"
              fill={track.favorite ? "currentColor" : "none"}
            />
          </button>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{track.name}</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            {track.category} · {track.mood}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge
              variant="secondary"
              className="bg-secondary/70 text-[9px] text-muted-foreground"
            >
              {track.duration}
            </Badge>
            <Badge
              variant="secondary"
              className="bg-secondary/70 text-[9px] text-muted-foreground"
            >
              {track.bpm} BPM
            </Badge>
            {selected && (
              <Badge
                variant="secondary"
                className="bg-primary/15 text-[9px] text-primary"
              >
                Selecionada
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div
        className="flex items-center gap-2 border-t border-border/60 bg-background/40 px-3 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onPlay}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            playing
              ? "bg-primary text-primary-foreground"
              : "bg-primary/15 text-primary hover:bg-primary/25",
          )}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? (
            <Pause className="h-3 w-3" fill="currentColor" />
          ) : (
            <Play className="ml-0.5 h-3 w-3" fill="currentColor" />
          )}
        </button>
        <MiniWave playing={playing} />
        <span className="text-[10px] text-muted-foreground">
          {track.duration}
        </span>
      </div>
    </div>
  );
}

function MiniWave({ playing }: { playing: boolean }) {
  const bars = 26;
  const heights = useMemo(
    () =>
      Array.from(
        { length: bars },
        (_, i) =>
          20 + Math.abs(Math.sin(i * 0.55) * 55) + Math.abs(Math.cos(i * 1.2) * 25),
      ),
    [],
  );
  return (
    <div className="flex h-5 flex-1 items-center gap-0.5">
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-full",
            playing ? "bg-primary" : "bg-primary/30",
          )}
          style={{
            height: `${Math.min(100, h)}%`,
            animation: playing
              ? `wave 1s ease-in-out ${(i % 6) * 0.09}s infinite alternate`
              : undefined,
          }}
        />
      ))}
      <style>{`@keyframes wave { from { transform: scaleY(0.4);} to { transform: scaleY(1);} }`}</style>
    </div>
  );
}

function StackedSlider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix,
  hint,
  icon,
}: {
  label: string;
  value: [number];
  onChange: (v: [number]) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-secondary/40 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          {icon}
          {label}
        </Label>
        <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
          {value[0]}
          {suffix ?? ""}
        </span>
      </div>
      <Slider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange([v[0]] as [number])}
      />
      {hint && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EffectCard({
  effect,
  onPatch,
  onRemove,
}: {
  effect: Effect;
  onPatch: (p: Partial<Effect>) => void;
  onRemove: () => void;
}) {
  const meta = EFFECT_CATEGORY_META[effect.category];
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        effect.active
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-secondary/30 opacity-90",
      )}
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "relative flex h-20 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br shadow-inner",
            meta.gradient,
          )}
        >
          <meta.Icon className="h-6 w-6 text-white" />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 pb-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="h-1 w-1 rounded-full bg-white/70"
                style={{
                  opacity: 0.3 + Math.abs(Math.sin(i * 1.1)) * 0.7,
                }}
              />
            ))}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold">
                  {effect.name}
                </span>
                {effect.required && (
                  <Badge
                    variant="secondary"
                    className="bg-warning/15 text-[9px] text-warning"
                  >
                    Obrigatório
                  </Badge>
                )}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Switch
                checked={effect.active}
                onCheckedChange={(v) => onPatch({ active: v })}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={onRemove}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Remover</TooltipContent>
              </Tooltip>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>Intensidade</span>
                <span className="font-mono text-primary">
                  {effect.intensity}
                </span>
              </div>
              <Slider
                value={[effect.intensity]}
                onValueChange={(v) => onPatch({ intensity: v[0] })}
                disabled={!effect.active}
              />
            </div>
            <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-[11px]">
              <span>Obrigatório</span>
              <Switch
                checked={effect.required}
                onCheckedChange={(v) => onPatch({ required: v })}
              />
            </label>
            <div>
              <Label className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Posição
              </Label>
              <Select
                value={effect.position}
                onValueChange={(v) => onPatch({ position: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-0.5 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Frequência
              </Label>
              <Select
                value={effect.frequency}
                onValueChange={(v) => onPatch({ frequency: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TransitionPreview({ kind }: { kind: string }) {
  // Simple SVG micro-preview per transition kind
  return (
    <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-black">
      <div
        className={cn(
          "absolute inset-0 flex",
          (kind === "slide" || kind === "whip") && "gap-1",
        )}
      >
        <div className="flex-1 bg-gradient-to-br from-primary/50 to-primary/10" />
        <div className="flex-1 bg-gradient-to-br from-warning/40 to-amber-700/20" />
      </div>
      {kind === "fade" && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/50 to-transparent" />
      )}
      {kind === "zoom-in" && (
        <div className="absolute left-1/2 top-1/2 h-10 w-16 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-white/70" />
      )}
      {kind === "zoom-out" && (
        <div className="absolute left-1/2 top-1/2 h-16 w-24 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-white/70" />
      )}
      {kind === "whip" && (
        <div className="absolute left-1/2 top-0 h-full w-1 -translate-x-1/2 bg-white/70 blur-[2px]" />
      )}
      {kind === "glitch" && (
        <>
          <div className="absolute inset-y-0 left-2 w-full bg-cyan-500/30 mix-blend-screen" />
          <div className="absolute inset-y-0 right-2 w-full bg-fuchsia-500/30 mix-blend-screen" />
        </>
      )}
      {kind === "flash" && (
        <div className="absolute inset-0 bg-white/60 mix-blend-overlay" />
      )}
      {kind === "cut" && (
        <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/70" />
      )}
      {kind === "slide" && (
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-y-1/2 rotate-45 border-2 border-white/70" />
      )}
    </div>
  );
}

function EditIdentityPreview({
  trackName,
  volume,
  ducking,
  musicMode,
  transitionsCount,
  defaultTransition,
  effectsActive,
  effectsRequired,
}: {
  trackName: string;
  volume: number;
  ducking: boolean;
  musicMode: "continuous" | "blocks";
  transitionsCount: number;
  defaultTransition: string;
  effectsActive: number;
  effectsRequired: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background p-5">
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        {/* Fake timeline */}
        <div>
          <div className="mb-2 flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="uppercase tracking-wider">Timeline</span>
            <span>~ 08:00</span>
          </div>
          <div className="space-y-1.5">
            <TimelineLane label="Vídeo" segments={[35, 20, 15, 20, 10]} tone="primary" />
            <TimelineLane label="Trilha" segments={[100]} tone="accent" ducked={ducking} />
            <TimelineLane
              label="Efeitos"
              segments={[15, 25, 10, 20, 15, 15]}
              tone="warning"
              dashed
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
            <StatChip label="Trilha" value={trackName} />
            <StatChip label="Volume" value={`${volume}%`} />
            <StatChip
              label="Uso"
              value={musicMode === "continuous" ? "Contínuo" : "Por blocos"}
            />
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-3">
          <SummaryRow icon={<Music className="h-3.5 w-3.5" />} label="Ducking automático" value={ducking ? "Ativado" : "Desativado"} />
          <SummaryRow icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Transições ativas" value={String(transitionsCount)} />
          <SummaryRow icon={<Sparkles className="h-3.5 w-3.5" />} label="Transição padrão" value={defaultTransition} />
          <SummaryRow icon={<Layers className="h-3.5 w-3.5" />} label="Efeitos ativos" value={String(effectsActive)} />
          <SummaryRow icon={<Zap className="h-3.5 w-3.5" />} label="Efeitos obrigatórios" value={String(effectsRequired)} />
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 text-foreground">
              <Info className="h-3.5 w-3.5 text-primary" />
              Identidade resultante
            </div>
            Vídeo com ritmo{" "}
            <span className="font-semibold text-foreground">
              {transitionsCount > 4 ? "dinâmico" : "controlado"}
            </span>
            , trilha em{" "}
            <span className="font-semibold text-foreground">
              {musicMode === "continuous" ? "loop contínuo" : "blocos"}
            </span>{" "}
            e{" "}
            <span className="font-semibold text-foreground">
              {effectsActive}
            </span>{" "}
            camadas visuais ativas.
          </div>
        </div>
      </div>
    </div>
  );
}

function TimelineLane({
  label,
  segments,
  tone,
  dashed,
  ducked,
}: {
  label: string;
  segments: number[];
  tone: "primary" | "accent" | "warning";
  dashed?: boolean;
  ducked?: boolean;
}) {
  const toneClass =
    tone === "primary"
      ? "bg-primary/70"
      : tone === "accent"
        ? "bg-emerald-500/70"
        : "bg-amber-500/70";
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "flex flex-1 gap-0.5 overflow-hidden rounded-md bg-secondary/30 p-1",
          dashed && "outline outline-1 outline-dashed outline-border/60",
        )}
      >
        {segments.map((s, i) => (
          <div
            key={i}
            className={cn("h-4 rounded-sm", toneClass)}
            style={{
              width: `${s}%`,
              opacity: ducked && i % 2 === 1 ? 0.4 : 1,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary/50 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="truncate text-xs font-semibold">{value}</div>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        {label}
      </div>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function TagField({
  label,
  description,
  values,
  onChange,
  tone = "primary",
  icon,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  tone?: "primary" | "destructive";
  icon?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const add = (v: string) => {
    const t = v.trim();
    if (!t || values.includes(t)) return;
    onChange([...values, t]);
    setDraft("");
  };
  const remove = (v: string) => onChange(values.filter((x) => x !== v));
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(draft);
    } else if (e.key === "Backspace" && !draft && values.length) {
      remove(values[values.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div
        onClick={() => inputRef.current?.focus()}
        className={cn(
          "flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border bg-input/40 px-2 py-1.5 transition-colors",
          focused ? "border-primary ring-2 ring-primary/20" : "border-border",
        )}
      >
        {values.map((v) => (
          <Badge
            key={v}
            variant="secondary"
            className={cn(
              "gap-1 py-0.5 pl-2 pr-1 text-xs",
              tone === "destructive"
                ? "bg-destructive/15 text-destructive hover:bg-destructive/20"
                : "bg-primary/15 text-primary hover:bg-primary/20",
            )}
          >
            {icon}
            {v}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(v);
              }}
              className="ml-0.5 rounded-full p-0.5 hover:bg-background/40"
              aria-label={`Remover ${v}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={values.length === 0 ? "Digite e pressione Enter" : ""}
          className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
    </div>
  );
}
