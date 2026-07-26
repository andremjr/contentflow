import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Layout,
  Package,
  Search,
  Type as TypeIcon,
  Wand2,
  Upload,
  Link as LinkIcon,
  Star,
  Filter,
  Plus,
  X,
  Ban,
  
  Info,
  Sparkles,
  Play,
  Save,
  RotateCcw,
  Maximize2,
  Minimize2,
  Braces,
  GripVertical,
  AlignLeft,
  AlignCenter,
  AlignRight,
  User,
  Sticker,
  Frame,
  BadgeCheck,
  Bold,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
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

export const Route = createFileRoute("/channel/$channelId/thumbnail")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch
      ? `Thumbnail — ${ch.name} · ContentFlow OS`
      : "Thumbnail — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Referências, layouts, elementos e tipografia para as thumbnails do canal.",
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
  component: ThumbnailScreen,
});

// ---------- mocks ----------

type Reference = {
  id: string;
  title: string;
  channel: string;
  style: string;
  ctr: number;
  favorite: boolean;
  tags: string[];
  gradient: string;
};

const INITIAL_REFERENCES: Reference[] = [
  {
    id: "r1",
    title: "Como dominar IA em 30 dias",
    channel: "Nerdologia",
    style: "Face + texto",
    ctr: 12.4,
    favorite: true,
    tags: ["contraste", "expressão"],
    gradient: "from-blue-500 to-indigo-700",
  },
  {
    id: "r2",
    title: "O erro que TODO iniciante comete",
    channel: "Manual do Mundo",
    style: "Alerta",
    ctr: 9.8,
    favorite: false,
    tags: ["alerta", "vermelho"],
    gradient: "from-red-500 to-rose-700",
  },
  {
    id: "r3",
    title: "Antes vs Depois com Claude",
    channel: "Kurzgesagt",
    style: "Comparativo",
    ctr: 11.1,
    favorite: true,
    tags: ["split", "antes/depois"],
    gradient: "from-emerald-500 to-teal-700",
  },
  {
    id: "r4",
    title: "7 fluxos com IA que ninguém te contou",
    channel: "Foca na História",
    style: "Lista numerada",
    ctr: 8.7,
    favorite: false,
    tags: ["número gigante"],
    gradient: "from-amber-500 to-orange-700",
  },
  {
    id: "r5",
    title: "Claude vs ChatGPT",
    channel: "Nerdologia",
    style: "Comparativo",
    ctr: 10.3,
    favorite: false,
    tags: ["duelo"],
    gradient: "from-purple-500 to-fuchsia-700",
  },
  {
    id: "r6",
    title: "Método secreto revelado",
    channel: "Manual do Mundo",
    style: "Curiosidade",
    ctr: 7.4,
    favorite: false,
    tags: ["mistério"],
    gradient: "from-slate-600 to-slate-800",
  },
];

type LayoutTemplate = {
  id: string;
  name: string;
  character: string;
  text: string;
  focus: string;
  background: string;
};

const LAYOUTS: LayoutTemplate[] = [
  {
    id: "left-face",
    name: "Rosto à esquerda + texto grande",
    character: "esquerda",
    text: "direita",
    focus: "expressão do rosto",
    background: "sólido com blur",
  },
  {
    id: "right-face",
    name: "Rosto à direita + palavra-âncora",
    character: "direita",
    text: "esquerda",
    focus: "palavra em destaque",
    background: "cena real",
  },
  {
    id: "split",
    name: "Split antes/depois",
    character: "centro",
    text: "rodapé",
    focus: "contraste visual",
    background: "duas cenas divididas",
  },
  {
    id: "top-text",
    name: "Texto no topo, cena embaixo",
    character: "base",
    text: "topo",
    focus: "cena principal",
    background: "gradiente escuro",
  },
];

type LibraryItem = {
  id: string;
  label: string;
  kind: "character" | "logo" | "frame" | "lower_third" | "seal" | "identity";
  required: boolean;
  gradient: string;
};

const LIBRARY: LibraryItem[] = [
  { id: "l1", label: "Apresentador", kind: "character", required: true, gradient: "from-blue-500 to-cyan-600" },
  { id: "l2", label: "Logo do canal", kind: "logo", required: true, gradient: "from-slate-500 to-slate-700" },
  { id: "l3", label: "Moldura vermelha", kind: "frame", required: false, gradient: "from-red-500 to-rose-700" },
  { id: "l4", label: "Lower third padrão", kind: "lower_third", required: false, gradient: "from-primary to-blue-800" },
  { id: "l5", label: "Selo 'Novo'", kind: "seal", required: false, gradient: "from-amber-500 to-orange-600" },
  { id: "l6", label: "Cor da identidade", kind: "identity", required: true, gradient: "from-primary to-indigo-700" },
];

const KIND_LABEL: Record<LibraryItem["kind"], { label: string; Icon: typeof User }> = {
  character: { label: "Personagem", Icon: User },
  logo: { label: "Logo", Icon: BadgeCheck },
  frame: { label: "Moldura", Icon: Frame },
  lower_third: { label: "Lower third", Icon: Layout },
  seal: { label: "Selo", Icon: Sticker },
  identity: { label: "Identidade", Icon: Sparkles },
};

const IMAGE_SOURCES = [
  { id: "unsplash", label: "Unsplash" },
  { id: "pexels", label: "Pexels" },
  { id: "getty", label: "Getty" },
  { id: "gen-ai", label: "Gerado por IA" },
  { id: "channel-assets", label: "Assets do canal" },
];

const FONTS = [
  { id: "inter", label: "Inter", css: "Inter, sans-serif", sample: "Aa Bb Cc" },
  { id: "anton", label: "Anton", css: "Anton, sans-serif", sample: "Aa Bb Cc" },
  { id: "bebas", label: "Bebas Neue", css: "'Bebas Neue', sans-serif", sample: "Aa Bb Cc" },
  { id: "montserrat", label: "Montserrat", css: "Montserrat, sans-serif", sample: "Aa Bb Cc" },
  { id: "poppins", label: "Poppins", css: "Poppins, sans-serif", sample: "Aa Bb Cc" },
];

const FONT_WEIGHTS = [
  { value: "400", label: "Regular" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" },
];

const PROMPT_VARIABLES = [
  { key: "channel_name", label: "Nome do canal" },
  { key: "channel_niche", label: "Nicho" },
  { key: "video_title", label: "Título do vídeo" },
  { key: "keyword_focus", label: "Palavra-chave principal" },
  { key: "layout_choice", label: "Layout escolhido" },
  { key: "primary_color", label: "Cor principal" },
];

const DEFAULT_PROMPT = `Você é um diretor de arte criando thumbnails para YouTube — canal {{channel_name}}, nicho {{channel_niche}}.

Gere descrições de thumbnails que:
- Sigam o layout {{layout_choice}}
- Destaquem a palavra-chave {{keyword_focus}}
- Reforcem a cor {{primary_color}} da identidade

Cada descrição deve incluir:
1. Ambiente e cena principal
2. Expressão e pose do personagem
3. Elemento em maior destaque
4. Paleta e clima geral`;

// ---------- component ----------

function ThumbnailScreen() {
  const { channel } = Route.useLoaderData();

  const [useResearch, setUseResearch] = useState(true);

  // References
  const [references, setReferences] = useState<Reference[]>(INITIAL_REFERENCES);
  const [selectedRefs, setSelectedRefs] = useState<string[]>(["r1", "r3"]);
  const [refFilterStyle, setRefFilterStyle] = useState("all");
  const [refFilterChannel, setRefFilterChannel] = useState("all");
  const [refFilterPerf, setRefFilterPerf] = useState("all");

  // Layouts
  const [layoutId, setLayoutId] = useState("left-face");
  const [layers, setLayers] = useState([
    { id: "bg", label: "Fundo" },
    { id: "char", label: "Personagem" },
    { id: "highlight", label: "Destaque" },
    { id: "text", label: "Texto principal" },
    { id: "seal", label: "Selo" },
  ]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // Library
  const [library, setLibrary] = useState<LibraryItem[]>(LIBRARY);

  // Unique elements
  const [imageDescription, setImageDescription] = useState(
    "Cenas reais e humanas relacionadas a produtividade e tecnologia.",
  );
  const [imageSources, setImageSources] = useState<string[]>([
    "unsplash",
    "channel-assets",
  ]);
  const [searchTerms, setSearchTerms] = useState<string[]>([
    "workspace",
    "notebook",
  ]);
  const [excludeTerms, setExcludeTerms] = useState<string[]>(["stock", "meme"]);
  const [allowPeople, setAllowPeople] = useState(true);
  const [allowFaces, setAllowFaces] = useState(true);
  const [allowText, setAllowText] = useState(false);
  const [allowLogos, setAllowLogos] = useState(false);

  // Typography
  const [fontId, setFontId] = useState("anton");
  const [color, setColor] = useState("#FACC15");
  const [size, setSize] = useState<[number]>([64]);
  const [align, setAlign] = useState<"left" | "center" | "right">("left");
  const [weight, setWeight] = useState("700");
  const [uppercase, setUppercase] = useState(true);
  const [stroke, setStroke] = useState<[number]>([3]);
  const [shadow, setShadow] = useState<[number]>([8]);
  const [strokeColor, setStrokeColor] = useState("#08111F");

  // Prompt
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [expanded, setExpanded] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = promptRef.current;
    if (!el) return setPrompt((p) => `${p}${token}`);
    const start = el.selectionStart ?? prompt.length;
    const end = el.selectionEnd ?? prompt.length;
    setPrompt(prompt.slice(0, start) + token + prompt.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const activeLayout = LAYOUTS.find((l) => l.id === layoutId)!;
  const activeFont = FONTS.find((f) => f.id === fontId)!;

  const filteredRefs = useMemo(() => {
    return references.filter((r) => {
      if (refFilterStyle !== "all" && r.style !== refFilterStyle) return false;
      if (refFilterChannel !== "all" && r.channel !== refFilterChannel)
        return false;
      if (refFilterPerf === "top" && r.ctr < 10) return false;
      if (refFilterPerf === "low" && r.ctr >= 10) return false;
      return true;
    });
  }, [references, refFilterStyle, refFilterChannel, refFilterPerf]);

  const uniqueStyles = ["all", ...new Set(references.map((r) => r.style))];
  const uniqueChannels = ["all", ...new Set(references.map((r) => r.channel))];

  const toggleRef = (id: string) =>
    setSelectedRefs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleFav = (id: string) =>
    setReferences((prev) =>
      prev.map((r) => (r.id === id ? { ...r, favorite: !r.favorite } : r)),
    );

  const toggleSource = (id: string) =>
    setImageSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  const toggleRequired = (id: string) =>
    setLibrary((prev) =>
      prev.map((l) => (l.id === id ? { ...l, required: !l.required } : l)),
    );

  const onLayerDragStart = (i: number) => setDragIndex(i);
  const onLayerDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === i) return;
    setLayers((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIndex, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragIndex(i);
  };
  const onLayerDragEnd = () => setDragIndex(null);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Thumbnail"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Thumbnail" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] p-6">
            {/* MAIN */}
            <div className="space-y-6">

              {/* Header */}
              <div className="flex items-start gap-4">
                <ChannelAvatar channel={channel} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Thumbnail · Etapa 4 do pipeline
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Direção de arte de thumbnails
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Configure referências, composição, elementos e tipografia.
                  </p>
                </div>
              </div>

              {/* Pesquisa */}
              <Section
                icon={<Search className="h-4 w-4" />}
                title="Pesquisa"
                description="Usar os resultados da etapa de Pesquisa como base."
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {useResearch ? "Ativada" : "Desativada"}
                    </span>
                    <Switch checked={useResearch} onCheckedChange={setUseResearch} />
                  </div>
                }
              >
                <p className="text-sm text-muted-foreground">
                  Quando ativada, os dados coletados na etapa de Pesquisa alimentam a geração de thumbnails.
                </p>
              </Section>

              {/* Referências */}
              <Section
                icon={<Star className="h-4 w-4" />}
                title="Referências validadas"
                description="Thumbnails de alto desempenho usadas como inspiração."
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
                        <Label className="text-xs">URL da thumbnail</Label>
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
                  <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                  <FilterSelect
                    value={refFilterStyle}
                    onChange={setRefFilterStyle}
                    label="Estilo"
                    options={uniqueStyles}
                  />
                  <FilterSelect
                    value={refFilterChannel}
                    onChange={setRefFilterChannel}
                    label="Canal"
                    options={uniqueChannels}
                  />
                  <FilterSelect
                    value={refFilterPerf}
                    onChange={setRefFilterPerf}
                    label="Desempenho"
                    options={["all", "top", "low"]}
                    display={{ all: "Todos", top: "CTR alto", low: "CTR baixo" }}
                  />
                  <span className="ml-auto text-xs text-muted-foreground">
                    {selectedRefs.length} selecionadas
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {filteredRefs.map((r) => {
                    const selected = selectedRefs.includes(r.id);
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
                          <div className="absolute inset-0 flex items-end p-2">
                            <div className="rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white backdrop-blur">
                              CTR {r.ctr}%
                            </div>
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
                            <div className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
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
                          <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span className="truncate">{r.channel}</span>
                            <span>{r.style}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1">
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
                </div>
              </Section>

              {/* Layouts */}
              <Section
                icon={<Layout className="h-4 w-4" />}
                title="Composição"
                description="Layout base e hierarquia de camadas."
              >
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {LAYOUTS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => setLayoutId(l.id)}
                      className={cn(
                        "group overflow-hidden rounded-lg border text-left transition-all",
                        layoutId === l.id
                          ? "border-primary ring-2 ring-primary/40"
                          : "border-border hover:border-border/80",
                      )}
                    >
                      <LayoutPreview layout={l} />
                      <div className="p-2">
                        <div className="text-xs font-medium">{l.name}</div>
                      </div>
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 rounded-xl border border-border bg-secondary/20 p-4 md:grid-cols-[1.2fr_1fr]">
                  <div>
                    <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
                      Prévia do layout
                    </div>
                    <div className="overflow-hidden rounded-lg border border-border">
                      <LayoutPreview layout={activeLayout} large />
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <MetaRow label="Personagem" value={activeLayout.character} />
                      <MetaRow label="Texto" value={activeLayout.text} />
                      <MetaRow label="Destaque" value={activeLayout.focus} />
                      <MetaRow label="Fundo" value={activeLayout.background} />
                    </dl>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
                      <span>Camadas (topo → base visual)</span>
                      <Info className="h-3 w-3" />
                    </div>
                    <ul className="space-y-1.5">
                      {layers.map((l, i) => (
                        <li
                          key={l.id}
                          draggable
                          onDragStart={() => onLayerDragStart(i)}
                          onDragOver={(e) => onLayerDragOver(e, i)}
                          onDragEnd={onLayerDragEnd}
                          className={cn(
                            "flex cursor-move items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 text-sm transition-colors",
                            dragIndex === i && "border-primary bg-primary/10",
                          )}
                        >
                          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="flex h-5 w-5 items-center justify-center rounded bg-secondary text-[10px] text-muted-foreground">
                            {i + 1}
                          </span>
                          {l.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Section>

              {/* Elementos consistentes */}
              <Section
                icon={<Package className="h-4 w-4" />}
                title="Elementos permanentes"
                description="Biblioteca de assets reutilizáveis do canal."
                action={
                  <Button variant="outline" size="sm">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    Novo elemento
                  </Button>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {library.map((item) => {
                    const meta = KIND_LABEL[item.kind];
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                          item.required
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-secondary/30",
                        )}
                      >
                        <div
                          className={cn(
                            "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-inner",
                            item.gradient,
                          )}
                        >
                          <meta.Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {meta.label}
                          </div>
                          <div className="truncate text-sm font-medium">
                            {item.label}
                          </div>
                          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                            <Switch
                              checked={item.required}
                              onCheckedChange={() => toggleRequired(item.id)}
                            />
                            Obrigatório em todas as thumbnails
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Section>

              {/* Elementos únicos */}
              <Section
                icon={<Search className="h-4 w-4" />}
                title="Elementos específicos"
                description="Como buscar imagens únicas para cada thumbnail."
              >
                <FieldWrap
                  label="Descrição do tipo de imagem"
                  description="Guia para o motor de busca ou geração."
                >
                  <Textarea
                    value={imageDescription}
                    onChange={(e) => setImageDescription(e.target.value)}
                    className="min-h-[88px]"
                  />
                </FieldWrap>

                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap
                    label="Fontes de imagens"
                    description="Uma ou mais fontes podem ser combinadas."
                  >
                    <MultiSelect
                      selected={imageSources}
                      onToggle={toggleSource}
                      options={IMAGE_SOURCES}
                    />
                  </FieldWrap>
                  <div className="grid gap-3">
                    <ToggleRow
                      label="Permitir pessoas"
                      checked={allowPeople}
                      onChange={setAllowPeople}
                    />
                    <ToggleRow
                      label="Permitir rostos reconhecíveis"
                      checked={allowFaces}
                      onChange={setAllowFaces}
                    />
                    <ToggleRow
                      label="Permitir texto externo na imagem"
                      checked={allowText}
                      onChange={setAllowText}
                    />
                    <ToggleRow
                      label="Permitir logotipos externos"
                      checked={allowLogos}
                      onChange={setAllowLogos}
                    />
                  </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <TagField
                    label="Termos de busca"
                    description="Palavras-chave usadas na busca."
                    values={searchTerms}
                    onChange={setSearchTerms}
                    tone="primary"
                  />
                  <TagField
                    label="Exclusões"
                    description="Termos que nunca devem retornar."
                    values={excludeTerms}
                    onChange={setExcludeTerms}
                    tone="destructive"
                    icon={<Ban className="h-3 w-3" />}
                  />
                </div>
              </Section>

              {/* Tipografia */}
              <Section
                icon={<TypeIcon className="h-4 w-4" />}
                title="Tipografia"
                description="Aparência do texto sobre a thumbnail."
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap label="Fonte">
                    <FontSelect
                      value={fontId}
                      onChange={setFontId}
                      options={FONTS}
                    />
                  </FieldWrap>
                  <FieldWrap label="Cor do texto">
                    <ColorField value={color} onChange={setColor} />
                  </FieldWrap>
                </div>

                <FieldWrap label="Tamanho">
                  <div className="space-y-2">
                    <Slider
                      value={size}
                      min={24}
                      max={140}
                      step={2}
                      onValueChange={(v) => setSize([v[0]] as [number])}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>24 px</span>
                      <span className="font-medium text-foreground">
                        {size[0]} px
                      </span>
                      <span>140 px</span>
                    </div>
                  </div>
                </FieldWrap>

                <div className="grid gap-6 md:grid-cols-3">
                  <FieldWrap label="Alinhamento">
                    <AlignPicker value={align} onChange={setAlign} />
                  </FieldWrap>
                  <FieldWrap label="Peso">
                    <Select value={weight} onValueChange={setWeight}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_WEIGHTS.map((w) => (
                          <SelectItem key={w.value} value={w.value}>
                            {w.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FieldWrap>
                  <FieldWrap label="Caixa alta">
                    <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/30 px-3">
                      <Switch
                        checked={uppercase}
                        onCheckedChange={setUppercase}
                      />
                      <span className="text-sm">TODO EM MAIÚSCULAS</span>
                    </div>
                  </FieldWrap>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap label="Contorno">
                    <div className="space-y-2">
                      <Slider
                        value={stroke}
                        min={0}
                        max={12}
                        step={1}
                        onValueChange={(v) => setStroke([v[0]] as [number])}
                      />
                      <div className="flex items-center gap-2">
                        <ColorField
                          value={strokeColor}
                          onChange={setStrokeColor}
                          compact
                        />
                        <span className="text-[11px] text-muted-foreground">
                          {stroke[0]} px
                        </span>
                      </div>
                    </div>
                  </FieldWrap>
                  <FieldWrap label="Sombra">
                    <Slider
                      value={shadow}
                      min={0}
                      max={40}
                      step={1}
                      onValueChange={(v) => setShadow([v[0]] as [number])}
                    />
                    <div className="text-right text-[11px] text-muted-foreground">
                      Offset: {shadow[0]} px
                    </div>
                  </FieldWrap>
                </div>

                <ContrastPreview
                  color={color}
                  strokeColor={strokeColor}
                  font={activeFont.css}
                  weight={weight}
                  uppercase={uppercase}
                />
              </Section>

              {/* Prompt */}
              <Section
                icon={<Wand2 className="h-4 w-4" />}
                title="Instruções avançadas"
                description="Prompt-mestre para o gerador de descrições de thumbnails."
              >
                <PromptEditor
                  value={prompt}
                  onChange={setPrompt}
                  refEl={promptRef}
                  expanded={expanded}
                  onToggleExpanded={() => setExpanded((v) => !v)}
                  onInsertVariable={insertVariable}
                  onRestore={() => setPrompt(DEFAULT_PROMPT)}
                />
              </Section>

              <Separator />
              <div className="flex items-center justify-between gap-3 pb-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  As alterações se aplicam ao próximo lote de thumbnails.
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
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
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
            <h2 className="text-base font-semibold">{title}</h2>
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

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-secondary/40 px-2 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="text-xs font-medium">{value}</dd>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
      <span>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
  display,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: string[];
  display?: Record<string, string>;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[140px] text-xs">
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {display?.[o] ?? (o === "all" ? "Todos" : o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LayoutPreview({
  layout,
  large,
}: {
  layout: LayoutTemplate;
  large?: boolean;
}) {
  // Simplified geometric preview per id
  const char = layout.character;
  const text = layout.text;
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-black",
        large && "min-h-[220px]",
      )}
    >
      {/* Character silhouette */}
      <div
        className={cn(
          "absolute bottom-0 flex h-3/4 w-1/3 items-end justify-center bg-gradient-to-t from-primary/70 to-primary/30",
          char === "esquerda" && "left-2",
          char === "direita" && "right-2",
          char === "centro" && "left-1/3",
          char === "base" && "left-1/2 h-1/2 w-1/2 -translate-x-1/2",
        )}
        style={{
          clipPath:
            "polygon(50% 0, 80% 25%, 100% 100%, 0 100%, 20% 25%)",
        }}
      />
      {/* Highlight blob */}
      <div className="absolute right-4 top-4 h-8 w-8 rounded-full bg-warning/70 blur-[2px]" />
      {/* Text block */}
      <div
        className={cn(
          "absolute rounded bg-warning/90 px-1.5 py-0.5 text-[8px] font-black uppercase text-black",
          text === "direita" && "right-2 top-1/3",
          text === "esquerda" && "left-2 top-1/3",
          text === "rodapé" && "bottom-2 left-1/2 -translate-x-1/2",
          text === "topo" && "left-2 top-2",
        )}
      >
        TEXTO
      </div>
    </div>
  );
}

function MultiSelect({
  selected,
  onToggle,
  options,
}: {
  selected: string[];
  onToggle: (id: string) => void;
  options: { id: string; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const active = options.filter((o) => selected.includes(o.id));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span className="flex flex-wrap items-center gap-1">
            {active.length === 0 ? (
              <span className="text-muted-foreground">Selecione as fontes</span>
            ) : (
              active.map((s) => (
                <Badge
                  key={s.id}
                  variant="secondary"
                  className="bg-primary/15 text-primary"
                >
                  {s.label}
                </Badge>
              ))
            )}
          </span>
          <Plus className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-1"
      >
        {options.map((s) => {
          const active = selected.includes(s.id);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className="flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm hover:bg-secondary"
            >
              <span>{s.label}</span>
              {active && (
                <svg
                  viewBox="0 0 12 12"
                  className="h-3 w-3 text-primary"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
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

function FontSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: typeof FONTS;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
      {options.map((f) => (
        <button
          key={f.id}
          type="button"
          onClick={() => onChange(f.id)}
          className={cn(
            "rounded-lg border p-3 text-left transition-colors",
            value === f.id
              ? "border-primary bg-primary/10"
              : "border-border bg-secondary/30 hover:border-border/80",
          )}
        >
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {f.label}
          </div>
          <div
            className="mt-1 text-lg font-bold"
            style={{ fontFamily: f.css }}
          >
            {f.sample}
          </div>
        </button>
      ))}
    </div>
  );
}

function ColorField({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2", compact && "w-auto")}>
      <div className="relative">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 cursor-pointer rounded-md border border-border bg-transparent"
          aria-label="Cor"
        />
      </div>
      {!compact && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-32 font-mono"
          maxLength={7}
        />
      )}
    </div>
  );
}

function AlignPicker({
  value,
  onChange,
}: {
  value: "left" | "center" | "right";
  onChange: (v: "left" | "center" | "right") => void;
}) {
  const opts: { id: "left" | "center" | "right"; Icon: typeof AlignLeft }[] = [
    { id: "left", Icon: AlignLeft },
    { id: "center", Icon: AlignCenter },
    { id: "right", Icon: AlignRight },
  ];
  return (
    <div className="flex overflow-hidden rounded-md border border-border">
      {opts.map(({ id, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "flex-1 py-2.5 text-muted-foreground transition-colors",
            value === id
              ? "bg-primary/15 text-primary"
              : "hover:bg-secondary",
          )}
          aria-label={id}
        >
          <Icon className="mx-auto h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function ContrastPreview({
  color,
  strokeColor,
  font,
  weight,
  uppercase,
}: {
  color: string;
  strokeColor: string;
  font: string;
  weight: string;
  uppercase: boolean;
}) {
  const bgs = ["#0F172A", "#FFFFFF", "#DC2626", "#16A34A"];
  return (
    <div className="rounded-xl border border-border bg-secondary/20 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs">
        <Bold className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">
          Prévia de contraste em diferentes fundos
        </span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {bgs.map((bg) => (
          <div
            key={bg}
            className="flex aspect-video items-center justify-center overflow-hidden rounded-md"
            style={{ backgroundColor: bg }}
          >
            <span
              style={{
                fontFamily: font,
                fontWeight: weight,
                color,
                WebkitTextStroke: `1px ${strokeColor}`,
                textTransform: uppercase ? "uppercase" : "none",
              }}
              className="text-2xl leading-none"
            >
              Aa
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbnailPreview({
  layout,
  color,
  strokeColor,
  stroke,
  shadow,
  size,
  align,
  weight,
  font,
  uppercase,
  library,
}: {
  layout: LayoutTemplate;
  color: string;
  strokeColor: string;
  stroke: number;
  shadow: number;
  size: number;
  align: "left" | "center" | "right";
  weight: string;
  font: string;
  uppercase: boolean;
  library: LibraryItem[];
}) {
  const hasSeal = library.some((l) => l.kind === "seal" && l.required);
  const hasFrame = library.some((l) => l.kind === "frame" && l.required);
  const hasLogo = library.some((l) => l.kind === "logo" && l.required);

  const textAlignClass =
    align === "left"
      ? "text-left items-start"
      : align === "right"
        ? "text-right items-end"
        : "text-center items-center";

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-lg border shadow-xl",
        hasFrame ? "border-4 border-red-500" : "border-border",
      )}
    >
      {/* BG */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-black" />
      {/* Character */}
      <div
        className={cn(
          "absolute bottom-0 h-4/5 w-1/2 bg-gradient-to-t from-primary/80 to-primary/20",
          layout.character === "esquerda" && "left-0",
          layout.character === "direita" && "right-0",
          layout.character === "centro" && "left-1/4",
          layout.character === "base" && "left-1/4 w-1/2 h-1/2",
        )}
        style={{
          clipPath:
            "polygon(50% 0, 80% 25%, 100% 100%, 0 100%, 20% 25%)",
        }}
      />
      {/* Highlight */}
      <div className="absolute right-6 top-6 h-16 w-16 rounded-full bg-warning/50 blur-2xl" />
      {/* Text */}
      <div
        className={cn(
          "absolute inset-4 flex flex-col justify-center gap-2",
          textAlignClass,
        )}
      >
        <span
          style={{
            fontFamily: font,
            fontWeight: weight,
            color,
            WebkitTextStroke: `${stroke}px ${strokeColor}`,
            textShadow: `0 ${shadow / 3}px ${shadow}px rgba(0,0,0,0.7)`,
            fontSize: `${Math.max(18, size / 3.2)}px`,
            lineHeight: 1.05,
            textTransform: uppercase ? "uppercase" : "none",
          }}
          className="max-w-[70%]"
        >
          Título de exemplo
        </span>
      </div>
      {/* Seal */}
      {hasSeal && (
        <div className="absolute left-3 top-3 rounded-full bg-amber-400 px-2 py-1 text-[10px] font-black uppercase text-black shadow-md">
          Novo
        </div>
      )}
      {/* Logo */}
      {hasLogo && (
        <div className="absolute bottom-3 right-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
          @{"{canal}"}
        </div>
      )}
    </div>
  );
}

function PromptEditor({
  value,
  onChange,
  refEl,
  expanded,
  onToggleExpanded,
  onInsertVariable,
  onRestore,
}: {
  value: string;
  onChange: (v: string) => void;
  refEl: React.RefObject<HTMLTextAreaElement | null>;
  expanded: boolean;
  onToggleExpanded: () => void;
  onInsertVariable: (key: string) => void;
  onRestore: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "overflow-hidden rounded-xl border border-border bg-[#0A1220] font-mono text-sm shadow-inner",
          expanded ? "fixed inset-6 z-50 flex flex-col" : "relative",
        )}
      >
        <div className="flex items-center justify-between border-b border-border/60 bg-secondary/20 px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex h-2 w-2 rounded-full bg-destructive/70" />
            <span className="flex h-2 w-2 rounded-full bg-warning/70" />
            <span className="flex h-2 w-2 rounded-full bg-success/70" />
            <span className="ml-2 font-sans">prompt.thumbnail.md</span>
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
                {PROMPT_VARIABLES.map((v) => (
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onRestore}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restaurar prompt padrão</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onToggleExpanded}
                >
                  {expanded ? (
                    <Minimize2 className="h-3.5 w-3.5" />
                  ) : (
                    <Maximize2 className="h-3.5 w-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {expanded ? "Reduzir" : "Expandir"}
              </TooltipContent>
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
            <span>
              {value.split(/\s+/).filter(Boolean).length} palavras
            </span>
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
    <FieldWrap label={label} description={description}>
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
              "gap-1 pl-2 pr-1 py-0.5 text-xs",
              tone === "destructive" &&
                "bg-destructive/15 text-destructive hover:bg-destructive/20",
              tone === "primary" &&
                "bg-primary/15 text-primary hover:bg-primary/20",
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
    </FieldWrap>
  );
}
