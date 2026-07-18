import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import {
  Package,
  Clock,
  Images,
  Wand2,
  Palette,
  ListChecks,
  Layers,
  Upload,
  Link as LinkIcon,
  Search,
  Filter,
  Star,
  Plus,
  Trash2,
  Copy,
  X,
  Info,
  Save,
  Play,
  Sparkles,
  Braces,
  RotateCcw,
  Maximize2,
  Minimize2,
  Image as ImageIcon,
  Video,
  FileText,
  Paintbrush,
  Camera,
  Film,
  BadgeCheck,
  Frame,
  Layout,
  Droplets,
  BellRing,
  MousePointerClick,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/assets")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    return {
      meta: [
        {
          title: ch
            ? `Assets — ${ch.name} · ContentFlow OS`
            : "Assets — ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Sincronização, referências, regras e elementos permanentes para os assets do canal.",
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
  component: AssetsScreen,
});

// ---------- mocks ----------

type SyncMode = "phrase" | "sentence" | "word" | "block" | "custom";
const SYNC_MODES: { id: SyncMode; label: string; description: string }[] = [
  { id: "phrase", label: "Por frase", description: "Corte a cada trecho curto" },
  { id: "sentence", label: "Por sentença", description: "Alinha à pontuação" },
  { id: "word", label: "Por palavra", description: "Alta densidade visual" },
  { id: "block", label: "Por bloco", description: "Segue o outline" },
  { id: "custom", label: "Personalizado", description: "Timing manual" },
];

type RefKind = "image" | "video" | "frame" | "illustration" | "screenshot" | "document";

type Reference = {
  id: string;
  title: string;
  kind: RefKind;
  tags: string[];
  favorite: boolean;
  gradient: string;
};

const KIND_META: Record<
  RefKind,
  { label: string; Icon: typeof ImageIcon }
> = {
  image: { label: "Imagem", Icon: ImageIcon },
  video: { label: "Vídeo", Icon: Video },
  frame: { label: "Frame", Icon: Film },
  illustration: { label: "Ilustração", Icon: Paintbrush },
  screenshot: { label: "Captura", Icon: Camera },
  document: { label: "Documento", Icon: FileText },
};

const INITIAL_REFERENCES: Reference[] = [
  { id: "r1", title: "Setup produtivo", kind: "image", tags: ["setup", "workspace"], favorite: true, gradient: "from-blue-500 to-indigo-700" },
  { id: "r2", title: "Timelapse edição", kind: "video", tags: ["timelapse"], favorite: false, gradient: "from-emerald-500 to-teal-700" },
  { id: "r3", title: "Frame — cena aberta", kind: "frame", tags: ["cena"], favorite: false, gradient: "from-purple-500 to-fuchsia-700" },
  { id: "r4", title: "Ilustração diagrama", kind: "illustration", tags: ["diagrama"], favorite: true, gradient: "from-amber-500 to-orange-700" },
  { id: "r5", title: "Print dashboard", kind: "screenshot", tags: ["ui"], favorite: false, gradient: "from-rose-500 to-red-700" },
  { id: "r6", title: "Guia de identidade v3", kind: "document", tags: ["brand"], favorite: false, gradient: "from-slate-500 to-slate-800" },
  { id: "r7", title: "B-roll cidade", kind: "video", tags: ["b-roll"], favorite: false, gradient: "from-sky-500 to-blue-700" },
  { id: "r8", title: "Wireframe app", kind: "illustration", tags: ["wireframe"], favorite: false, gradient: "from-lime-500 to-green-700" },
];

const ASSET_TYPE_OPTIONS = [
  { value: "image", label: "Imagem" },
  { value: "video", label: "Vídeo" },
  { value: "b-roll", label: "B-roll" },
  { value: "illustration", label: "Ilustração" },
  { value: "screenshot", label: "Captura de tela" },
  { value: "text-overlay", label: "Overlay de texto" },
  { value: "chart", label: "Gráfico / dado" },
];

const CONDITION_OPTIONS = [
  { value: "always", label: "Sempre aplicar" },
  { value: "keyword", label: "Quando há palavra-chave" },
  { value: "topic-change", label: "Em cada mudança de tópico" },
  { value: "citation", label: "Quando há citação de dado" },
  { value: "list", label: "Quando há lista ou enumeração" },
  { value: "hook", label: "Apenas no gancho" },
  { value: "closing", label: "Apenas no encerramento" },
];

const POSITION_OPTIONS = [
  { id: "opening", label: "Abertura" },
  { id: "intro", label: "Introdução" },
  { id: "body", label: "Corpo do vídeo" },
  { id: "peak", label: "Momento de auge" },
  { id: "closing", label: "Encerramento" },
  { id: "endscreen", label: "Endscreen" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];

type Rule = {
  id: string;
  assetType: string;
  condition: string;
  minFreq: number;
  maxFreq: number;
  minDuration: string;
  maxDuration: string;
  positions: string[];
  required: boolean;
  priority: string;
};

const INITIAL_RULES: Rule[] = [
  {
    id: "rule-1",
    assetType: "image",
    condition: "topic-change",
    minFreq: 20,
    maxFreq: 40,
    minDuration: "00:03",
    maxDuration: "00:06",
    positions: ["body", "peak"],
    required: true,
    priority: "high",
  },
  {
    id: "rule-2",
    assetType: "b-roll",
    condition: "keyword",
    minFreq: 30,
    maxFreq: 60,
    minDuration: "00:04",
    maxDuration: "00:08",
    positions: ["body"],
    required: false,
    priority: "medium",
  },
];

type PermanentKind =
  | "logo"
  | "lower_third"
  | "frame"
  | "template"
  | "watermark"
  | "subscribe"
  | "cta";

const PERMANENT_META: Record<
  PermanentKind,
  { label: string; Icon: typeof BadgeCheck; gradient: string }
> = {
  logo: { label: "Logo", Icon: BadgeCheck, gradient: "from-slate-500 to-slate-800" },
  lower_third: { label: "Lower third", Icon: Layout, gradient: "from-primary to-blue-800" },
  frame: { label: "Moldura", Icon: Frame, gradient: "from-red-500 to-rose-700" },
  template: { label: "Template", Icon: Layers, gradient: "from-purple-500 to-fuchsia-700" },
  watermark: { label: "Marca d'água", Icon: Droplets, gradient: "from-cyan-500 to-blue-700" },
  subscribe: { label: "Tela de inscrição", Icon: BellRing, gradient: "from-amber-500 to-orange-700" },
  cta: { label: "CTA visual", Icon: MousePointerClick, gradient: "from-emerald-500 to-teal-700" },
};

type PermanentElement = {
  id: string;
  kind: PermanentKind;
  name: string;
  entry: string;
  duration: string;
  position: string;
  required: boolean;
};

const ENTRY_OPTIONS = [
  { value: "start", label: "Início do vídeo" },
  { value: "after-hook", label: "Após o gancho" },
  { value: "custom", label: "Momento customizado" },
  { value: "always", label: "Persistente (sempre visível)" },
  { value: "end", label: "Final do vídeo" },
];

const POSITION_ELEMENT_OPTIONS = [
  { value: "top-left", label: "Superior esquerdo" },
  { value: "top-right", label: "Superior direito" },
  { value: "bottom-left", label: "Inferior esquerdo" },
  { value: "bottom-right", label: "Inferior direito" },
  { value: "center", label: "Centralizado" },
  { value: "fullscreen", label: "Tela cheia" },
  { value: "lower-third", label: "Terço inferior" },
];

const INITIAL_ELEMENTS: PermanentElement[] = [
  { id: "pe1", kind: "logo", name: "Logo do canal", entry: "always", duration: "todo o vídeo", position: "top-right", required: true },
  { id: "pe2", kind: "watermark", name: "Marca d'água @canal", entry: "always", duration: "todo o vídeo", position: "bottom-right", required: true },
  { id: "pe3", kind: "lower_third", name: "Lower third padrão", entry: "after-hook", duration: "00:05", position: "lower-third", required: false },
  { id: "pe4", kind: "subscribe", name: "Botão de inscrição animado", entry: "custom", duration: "00:04", position: "bottom-left", required: true },
  { id: "pe5", kind: "cta", name: "Card de próximo vídeo", entry: "end", duration: "00:10", position: "fullscreen", required: false },
];

const PLANNING_VARIABLES = [
  { key: "video_length", label: "Duração-alvo do vídeo" },
  { key: "block_count", label: "Quantidade de blocos" },
  { key: "sync_mode", label: "Modo de sincronização" },
  { key: "outline", label: "Outline aprovado" },
  { key: "keywords", label: "Palavras-chave" },
];

const STYLE_VARIABLES = [
  { key: "channel_name", label: "Nome do canal" },
  { key: "channel_niche", label: "Nicho" },
  { key: "primary_color", label: "Cor principal" },
  { key: "reference_pack", label: "Pacote de referências" },
  { key: "mood", label: "Clima visual" },
];

const DEFAULT_PLANNING = `Distribua os assets ao longo do vídeo de {{video_length}} minutos.

Regras:
- Respeite o modo {{sync_mode}}
- Cubra os {{block_count}} blocos do {{outline}}
- Priorize assets que reforcem as palavras-chave {{keywords}}
- Nunca deixe mais de 8 segundos sem estímulo visual
- Alterne entre estáticos e em movimento para manter o ritmo`;

const DEFAULT_STYLE = `Direção de arte visual para {{channel_name}} — nicho {{channel_niche}}.

Estética:
- Realismo moderado, evitando estilo genérico de banco de imagens
- Paleta puxando para {{primary_color}} e neutros escuros
- Enquadramento cinematográfico, respiração nas margens
- Ritmo visual médio: cortes limpos entre 4-8 segundos

Consistência:
- Todos os assets devem parecer parte do mesmo universo do {{reference_pack}}
- Clima geral: {{mood}}`;

// ---------- component ----------

function AssetsScreen() {
  const { channel } = Route.useLoaderData();

  // Sync
  const [syncMode, setSyncMode] = useState<SyncMode>("sentence");
  const [autoSync, setAutoSync] = useState(true);
  const [tolerance, setTolerance] = useState(150);

  // References
  const [references, setReferences] = useState<Reference[]>(INITIAL_REFERENCES);
  const [selectedRefs, setSelectedRefs] = useState<string[]>(["r1", "r4"]);
  const [refSearch, setRefSearch] = useState("");
  const [refKindFilter, setRefKindFilter] = useState<"all" | RefKind>("all");
  const [refFavOnly, setRefFavOnly] = useState(false);

  const filteredRefs = useMemo(
    () =>
      references.filter((r) => {
        if (refKindFilter !== "all" && r.kind !== refKindFilter) return false;
        if (refFavOnly && !r.favorite) return false;
        if (refSearch) {
          const q = refSearch.toLowerCase();
          const hay = `${r.title} ${r.tags.join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }),
    [references, refKindFilter, refFavOnly, refSearch],
  );

  const toggleRef = (id: string) =>
    setSelectedRefs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleFav = (id: string) =>
    setReferences((prev) =>
      prev.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)),
    );

  // Prompts
  const [planningPrompt, setPlanningPrompt] = useState(DEFAULT_PLANNING);
  const [stylePrompt, setStylePrompt] = useState(DEFAULT_STYLE);
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const [styleExpanded, setStyleExpanded] = useState(false);
  const planRef = useRef<HTMLTextAreaElement>(null);
  const styleRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (
    target: "planning" | "style",
    key: string,
  ) => {
    const token = `{{${key}}}`;
    const setter = target === "planning" ? setPlanningPrompt : setStylePrompt;
    const value = target === "planning" ? planningPrompt : stylePrompt;
    const el = (target === "planning" ? planRef : styleRef).current;
    if (!el) return setter(`${value}${token}`);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setter(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  // Rules
  const [rules, setRules] = useState<Rule[]>(INITIAL_RULES);
  const addRule = () =>
    setRules((prev) => [
      ...prev,
      {
        id: `rule-${Date.now()}`,
        assetType: "image",
        condition: "topic-change",
        minFreq: 20,
        maxFreq: 40,
        minDuration: "00:03",
        maxDuration: "00:06",
        positions: ["body"],
        required: false,
        priority: "medium",
      },
    ]);
  const patchRule = (id: string, patch: Partial<Rule>) =>
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeRule = (id: string) =>
    setRules((prev) => prev.filter((r) => r.id !== id));
  const duplicateRule = (id: string) =>
    setRules((prev) => {
      const idx = prev.findIndex((r) => r.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: `rule-${Date.now()}` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });

  // Permanent elements
  const [elements, setElements] = useState<PermanentElement[]>(INITIAL_ELEMENTS);
  const patchElement = (id: string, patch: Partial<PermanentElement>) =>
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeElement = (id: string) =>
    setElements((prev) => prev.filter((e) => e.id !== id));
  const addElement = (kind: PermanentKind) =>
    setElements((prev) => [
      ...prev,
      {
        id: `pe-${Date.now()}`,
        kind,
        name: PERMANENT_META[kind].label,
        entry: "custom",
        duration: "00:05",
        position: "bottom-right",
        required: false,
      },
    ]);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Assets"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Assets" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1240px] space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <ChannelAvatar channel={channel} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Package className="h-3.5 w-3.5" />
                  Assets · Etapa 7 do pipeline
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Planejamento visual e regras de assets
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Sincronização, referências, estilo e elementos que compõem o
                  vídeo final.
                </p>
              </div>
              <Button size="sm">
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Gerar plano de assets
              </Button>
            </div>

            {/* Sincronização */}
            <Section
              icon={<Clock className="h-4 w-4" />}
              title="Sincronização"
              description="Como os assets se alinham à narração."
            >
              <FieldWrap label="Modo de sincronização">
                <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-secondary/30 p-1 sm:grid-cols-5">
                  {SYNC_MODES.map((m) => {
                    const active = syncMode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setSyncMode(m.id)}
                        className={cn(
                          "flex flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                        )}
                      >
                        <span className="text-xs font-semibold">{m.label}</span>
                        <span
                          className={cn(
                            "text-[10px] leading-tight",
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
              </FieldWrap>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-secondary/30 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">
                      Sincronização automática
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Alinha assets à timeline de forma dinâmica.
                    </p>
                  </div>
                  <Switch checked={autoSync} onCheckedChange={setAutoSync} />
                </label>

                <div className="rounded-md border border-border bg-secondary/30 px-4 py-3">
                  <Label className="text-sm font-medium">
                    Tolerância (ms)
                  </Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Margem aceita entre asset e trecho de fala.
                  </p>
                  <div className="flex overflow-hidden rounded-md border border-border bg-input/40">
                    <input
                      type="number"
                      min={0}
                      max={2000}
                      step={10}
                      value={tolerance}
                      onChange={(e) => setTolerance(Number(e.target.value))}
                      disabled={!autoSync}
                      className="w-full bg-transparent px-3 py-2 text-sm outline-none disabled:opacity-50"
                    />
                    <span className="flex items-center bg-secondary/50 px-3 text-[11px] text-muted-foreground">
                      ms
                    </span>
                  </div>
                </div>
              </div>
            </Section>

            {/* Referências */}
            <Section
              icon={<Images className="h-4 w-4" />}
              title="Referências"
              description="Biblioteca visual usada como inspiração e material bruto."
              action={
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm">
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Upload
                  </Button>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <LinkIcon className="mr-1.5 h-3.5 w-3.5" />
                        Por URL
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-80">
                      <Label className="text-xs">URL do recurso</Label>
                      <div className="mt-2 flex gap-2">
                        <Input placeholder="https://..." />
                        <Button size="sm">Adicionar</Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[220px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={refSearch}
                    onChange={(e) => setRefSearch(e.target.value)}
                    placeholder="Buscar por título ou tag..."
                    className="pl-8"
                  />
                </div>
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <Select
                  value={refKindFilter}
                  onValueChange={(v) => setRefKindFilter(v as never)}
                >
                  <SelectTrigger className="h-9 w-auto min-w-[150px]">
                    <span className="text-xs text-muted-foreground">Tipo:</span>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(Object.keys(KIND_META) as RefKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {KIND_META[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-xs">
                  <Switch checked={refFavOnly} onCheckedChange={setRefFavOnly} />
                  Favoritas
                </label>
                <span className="ml-auto text-xs text-muted-foreground">
                  {selectedRefs.length} selecionadas
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {filteredRefs.map((r) => {
                  const selected = selectedRefs.includes(r.id);
                  const meta = KIND_META[r.kind];
                  return (
                    <div
                      key={r.id}
                      onClick={() => toggleRef(r.id)}
                      className={cn(
                        "group relative cursor-pointer overflow-hidden rounded-lg border transition-all",
                        selected
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border hover:border-border/80",
                      )}
                    >
                      <div
                        className={cn(
                          "relative aspect-video w-full bg-gradient-to-br",
                          r.gradient,
                        )}
                      >
                        <div className="absolute inset-0 flex items-center justify-center opacity-50">
                          <meta.Icon className="h-10 w-10 text-white" />
                        </div>
                        <div className="absolute left-1.5 top-1.5 rounded bg-black/50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white backdrop-blur">
                          {meta.label}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFav(r.id);
                          }}
                          aria-label="Favoritar"
                          className={cn(
                            "absolute right-1.5 top-1.5 rounded-full bg-black/40 p-1 backdrop-blur transition",
                            r.favorite
                              ? "text-amber-300"
                              : "text-white/70 hover:text-white",
                          )}
                        >
                          <Star
                            className="h-3.5 w-3.5"
                            fill={r.favorite ? "currentColor" : "none"}
                          />
                        </button>
                        {selected && (
                          <div className="absolute right-1.5 bottom-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M2 6l3 3 5-6" strokeLinecap="round" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="p-2">
                        <div className="truncate text-xs font-medium">
                          {r.title}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <Badge
                              key={t}
                              variant="secondary"
                              className="bg-secondary/60 text-[9px] text-muted-foreground"
                            >
                              {t}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredRefs.length === 0 && (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhuma referência encontrada.
                  </div>
                )}
              </div>
            </Section>

            {/* Planejamento */}
            <Section
              icon={<ListChecks className="h-4 w-4" />}
              title="Planejamento"
              description="Como os assets se distribuem ao longo do vídeo."
              badge={{ label: "Etapa 1 — Distribuição", tone: "primary" }}
            >
              <PromptEditor
                filename="prompt.assets-planning.md"
                accent="primary"
                value={planningPrompt}
                onChange={setPlanningPrompt}
                refEl={planRef}
                expanded={planningExpanded}
                onToggleExpanded={() => setPlanningExpanded((v) => !v)}
                onInsertVariable={(k) => insertVariable("planning", k)}
                onRestore={() => setPlanningPrompt(DEFAULT_PLANNING)}
                variables={PLANNING_VARIABLES}
              />
            </Section>

            {/* Estilo */}
            <Section
              icon={<Palette className="h-4 w-4" />}
              title="Estilo"
              description="Estética, cores, ritmo visual e consistência."
              badge={{ label: "Etapa 2 — Direção de arte", tone: "accent" }}
            >
              <PromptEditor
                filename="prompt.assets-style.md"
                accent="accent"
                value={stylePrompt}
                onChange={setStylePrompt}
                refEl={styleRef}
                expanded={styleExpanded}
                onToggleExpanded={() => setStyleExpanded((v) => !v)}
                onInsertVariable={(k) => insertVariable("style", k)}
                onRestore={() => setStylePrompt(DEFAULT_STYLE)}
                variables={STYLE_VARIABLES}
              />
            </Section>

            {/* Regras de distribuição */}
            <Section
              icon={<Wand2 className="h-4 w-4" />}
              title="Regras de distribuição"
              description="Construtor visual de regras para inserção automática."
              action={
                <Button variant="outline" size="sm" onClick={addRule}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Nova regra
                </Button>
              }
            >
              <div className="space-y-3">
                {rules.map((r, i) => (
                  <RuleCard
                    key={r.id}
                    rule={r}
                    index={i}
                    onPatch={(p) => patchRule(r.id, p)}
                    onRemove={() => removeRule(r.id)}
                    onDuplicate={() => duplicateRule(r.id)}
                  />
                ))}
                {rules.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhuma regra configurada.
                  </div>
                )}
              </div>
            </Section>

            {/* Elementos permanentes */}
            <Section
              icon={<Layers className="h-4 w-4" />}
              title="Elementos permanentes"
              description="Componentes visuais recorrentes em todos os vídeos do canal."
              action={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Novo elemento
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Tipo de elemento</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(Object.keys(PERMANENT_META) as PermanentKind[]).map((k) => {
                      const meta = PERMANENT_META[k];
                      return (
                        <DropdownMenuItem key={k} onSelect={() => addElement(k)}>
                          <meta.Icon className="mr-2 h-3.5 w-3.5" />
                          {meta.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <div className="grid gap-3 md:grid-cols-2">
                {elements.map((el) => (
                  <PermanentElementCard
                    key={el.id}
                    element={el}
                    onPatch={(p) => patchElement(el.id, p)}
                    onRemove={() => removeElement(el.id)}
                  />
                ))}
                {elements.length === 0 && (
                  <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhum elemento permanente configurado.
                  </div>
                )}
              </div>
            </Section>

            <Separator />
            <div className="flex items-center justify-between gap-3 pb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                As alterações se aplicam ao próximo plano de assets.
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
  action,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: { label: string; tone?: "primary" | "accent" };
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/60 p-6 backdrop-blur">
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">{title}</h2>
              {badge && (
                <Badge
                  variant="secondary"
                  className={cn(
                    "text-[10px]",
                    badge.tone === "accent"
                      ? "bg-warning/15 text-warning"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {badge.label}
                </Badge>
              )}
            </div>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {action}
      </header>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function FieldWrap({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

function RuleCard({
  rule,
  index,
  onPatch,
  onRemove,
  onDuplicate,
}: {
  rule: Rule;
  index: number;
  onPatch: (p: Partial<Rule>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  const assetLabel =
    ASSET_TYPE_OPTIONS.find((o) => o.value === rule.assetType)?.label ??
    rule.assetType;
  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-secondary text-[10px]">
            {index + 1}
          </span>
          <span>Regra</span>
        </div>
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-1 text-[11px] italic text-muted-foreground">
          Ex.: Inserir <span className="font-semibold text-foreground">{assetLabel.toLowerCase()}</span> a cada{" "}
          <span className="font-semibold text-foreground">
            {rule.minFreq}–{rule.maxFreq}s
          </span>
          , durando {rule.minDuration}–{rule.maxDuration}.
        </div>
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onDuplicate}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Duplicar</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={onRemove}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Excluir</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Tipo de asset
          </Label>
          <Select
            value={rule.assetType}
            onValueChange={(v) => onPatch({ assetType: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ASSET_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Condição
          </Label>
          <Select
            value={rule.condition}
            onValueChange={(v) => onPatch({ condition: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONDITION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Prioridade
          </Label>
          <Select
            value={rule.priority}
            onValueChange={(v) => onPatch({ priority: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Frequência mín. (s)
          </Label>
          <Input
            type="number"
            min={0}
            value={rule.minFreq}
            onChange={(e) => onPatch({ minFreq: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Frequência máx. (s)
          </Label>
          <Input
            type="number"
            min={0}
            value={rule.maxFreq}
            onChange={(e) => onPatch({ maxFreq: Number(e.target.value) })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Dur. mín.
            </Label>
            <Input
              type="text"
              value={rule.minDuration}
              onChange={(e) => onPatch({ minDuration: e.target.value })}
              placeholder="mm:ss"
              className="font-mono"
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Dur. máx.
            </Label>
            <Input
              type="text"
              value={rule.maxDuration}
              onChange={(e) => onPatch({ maxDuration: e.target.value })}
              placeholder="mm:ss"
              className="font-mono"
            />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Posições permitidas
          </Label>
          <PositionMultiSelect
            selected={rule.positions}
            onChange={(v) => onPatch({ positions: v })}
          />
        </div>
        <div>
          <Label className="mb-1.5 block text-xs text-muted-foreground">
            Obrigatório
          </Label>
          <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3">
            <Switch
              checked={rule.required}
              onCheckedChange={(v) => onPatch({ required: v })}
            />
            <span className="text-xs text-muted-foreground">
              Sempre aplicar
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PositionMultiSelect({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = POSITION_OPTIONS.filter((o) => selected.includes(o.id));
  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal">
          <span className="flex flex-wrap items-center gap-1">
            {active.length === 0 ? (
              <span className="text-muted-foreground">Selecione posições</span>
            ) : (
              active.map((p) => (
                <Badge
                  key={p.id}
                  variant="secondary"
                  className="bg-primary/15 text-primary"
                >
                  {p.label}
                </Badge>
              ))
            )}
          </span>
          <Plus className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] p-1">
        {POSITION_OPTIONS.map((o) => {
          const isActive = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => toggle(o.id)}
              className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-secondary"
            >
              <span>{o.label}</span>
              {isActive && (
                <svg viewBox="0 0 12 12" className="h-3 w-3 text-primary" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 6l3 3 5-6" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

function PermanentElementCard({
  element,
  onPatch,
  onRemove,
}: {
  element: PermanentElement;
  onPatch: (p: Partial<PermanentElement>) => void;
  onRemove: () => void;
}) {
  const meta = PERMANENT_META[element.kind];
  const persistent = element.entry === "always";
  return (
    <div
      className={cn(
        "rounded-lg border p-3 transition-colors",
        element.required
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-secondary/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-inner",
            meta.gradient,
          )}
        >
          <meta.Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {meta.label}
              </div>
              <Input
                value={element.name}
                onChange={(e) => onPatch({ name: e.target.value })}
                className="h-8 border-transparent bg-transparent px-1 text-sm font-semibold shadow-none focus-visible:border-border focus-visible:bg-input/40"
              />
            </div>
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

          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Momento de entrada
              </Label>
              <Select
                value={element.entry}
                onValueChange={(v) => onPatch({ entry: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTRY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Duração
              </Label>
              <Input
                value={persistent ? "Persistente" : element.duration}
                onChange={(e) => onPatch({ duration: e.target.value })}
                disabled={persistent}
                className="h-8 font-mono text-xs"
              />
            </div>
            <div>
              <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Posição
              </Label>
              <Select
                value={element.position}
                onValueChange={(v) => onPatch({ position: v })}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITION_ELEMENT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Obrigatório
              </Label>
              <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-secondary/40 px-2">
                <Switch
                  checked={element.required}
                  onCheckedChange={(v) => onPatch({ required: v })}
                />
                <span className="text-[11px] text-muted-foreground">
                  {element.required ? "Sim" : "Não"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PromptEditor({
  filename,
  accent,
  value,
  onChange,
  refEl,
  expanded,
  onToggleExpanded,
  onInsertVariable,
  onRestore,
  variables,
}: {
  filename: string;
  accent: "primary" | "accent";
  value: string;
  onChange: (v: string) => void;
  refEl: React.RefObject<HTMLTextAreaElement | null>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onInsertVariable: (key: string) => void;
  onRestore: () => void;
  variables: { key: string; label: string }[];
}) {
  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border bg-[#0A1220] font-mono text-sm shadow-inner",
          expanded ? "fixed inset-6 z-50 flex flex-col" : "relative",
          accent === "accent" ? "border-warning/40" : "border-primary/30",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between border-b bg-secondary/20 px-3 py-2",
            accent === "accent" ? "border-warning/30" : "border-border/60",
          )}
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "flex h-2 w-2 rounded-full",
                accent === "accent" ? "bg-warning" : "bg-primary",
              )}
            />
            <span className="font-sans">{filename}</span>
          </div>
          <div className="flex items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2">
                  <Braces className="mr-1 h-3.5 w-3.5" />
                  Inserir variável
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel>Variáveis disponíveis</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {variables.map((v) => (
                  <DropdownMenuItem
                    key={v.key}
                    onSelect={() => onInsertVariable(v.key)}
                    className="flex-col items-start gap-0.5"
                  >
                    <span className="font-mono text-xs text-primary">
                      {`{{${v.key}}}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {v.label}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRestore}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restaurar prompt padrão</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleExpanded}>
                  {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{expanded ? "Reduzir" : "Expandir"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        <Textarea
          ref={refEl}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            "resize-none rounded-none border-0 bg-transparent font-mono text-sm leading-relaxed text-foreground focus-visible:ring-0",
            expanded ? "flex-1" : "min-h-[240px]",
          )}
          spellCheck={false}
        />

        <div className="flex items-center justify-between border-t border-border/60 bg-secondary/20 px-3 py-1.5 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>{value.length} caracteres</span>
            <span>·</span>
            <span>{value.split(/\s+/).filter(Boolean).length} palavras</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Info className="h-3 w-3" />
            Suporta variáveis {`{{ nome }}`}
          </div>
        </div>
      </div>
      {expanded && (
        <div
          className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
          onClick={onToggleExpanded}
        />
      )}
    </>
  );
}

// keep unused-icon reference guards satisfied by referencing types
void ({} as KeyboardEvent<HTMLInputElement>);
void X;
