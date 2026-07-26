import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Layout,
  Package,
  Search,
  Type as TypeIcon,
  Wand2,
  Upload,
  Star,
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
  User,
  Sticker,
  Frame,
  BadgeCheck,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  name: string;
  url: string;
};

type Composition = {
  id: string;
  name: string;
  boxes: CompositionBox[];
};



type LibraryKind =
  | "character"
  | "logo"
  | "frame"
  | "lower_third"
  | "seal"
  | "identity";

type LibraryItem = {
  id: string;
  label: string;
  kind: LibraryKind;
  required: boolean;
  gradient: string;
  url?: string;
};

const KIND_GRADIENT: Record<LibraryKind, string> = {
  character: "from-blue-500 to-cyan-600",
  logo: "from-slate-500 to-slate-700",
  frame: "from-red-500 to-rose-700",
  lower_third: "from-primary to-blue-800",
  seal: "from-amber-500 to-orange-600",
  identity: "from-primary to-indigo-700",
};

const LIBRARY: LibraryItem[] = [];


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

type TextStyle = {
  id: string;
  name: string;
  color: string;
  size: number;
  weight: string;
  uppercase: boolean;
  stroke: number;
  strokeColor: string;
  shadow: number;
};


const FONT_WEIGHTS = [
  { value: "400", label: "Regular" },
  { value: "600", label: "Semibold" },
  { value: "700", label: "Bold" },
  { value: "900", label: "Black" },
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
  const [references, setReferences] = useState<Reference[]>([]);
  const refInputRef = useRef<HTMLInputElement>(null);

  // Compositions
  const [compositions, setCompositions] = useState<Composition[]>([
    { id: "comp-1", name: "Composição 1", boxes: [] },
  ]);
  const [activeCompId, setActiveCompId] = useState("comp-1");



  // Library
  const [library, setLibrary] = useState<LibraryItem[]>(LIBRARY);

  // Unique elements
  const [specificEnabled, setSpecificEnabled] = useState(true);
  const [compositionEnabled, setCompositionEnabled] = useState(true);

  // Typography
  const [fontFile, setFontFile] = useState<string | null>(null);
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [textStyles, setTextStyles] = useState<TextStyle[]>([
    {
      id: "text-1",
      name: "Texto 1",
      color: "#FACC15",
      size: 64,
      weight: "700",
      uppercase: true,
      stroke: 3,
      strokeColor: "#08111F",
      shadow: 8,
    },
  ]);

  const addTextStyle = () =>
    setTextStyles((prev) => [
      ...prev,
      {
        id: `text-${Date.now()}`,
        name: `Texto ${prev.length + 1}`,
        color: "#FFFFFF",
        size: 48,
        weight: "700",
        uppercase: false,
        stroke: 0,
        strokeColor: "#08111F",
        shadow: 0,
      },
    ]);

  const updateTextStyle = (id: string, patch: Partial<TextStyle>) =>
    setTextStyles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );

  const removeTextStyle = (id: string) =>
    setTextStyles((prev) => prev.filter((t) => t.id !== id));

  // Prompt
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const activeComposition = compositions.find((c) => c.id === activeCompId);


  const addReferenceFiles = (files: FileList | null) => {
    if (!files) return;
    const added: Reference[] = Array.from(files)
      .filter((f) => f.type.startsWith("image/"))
      .map((f) => ({
        id: `${Date.now()}-${f.name}-${Math.random().toString(36).slice(2, 7)}`,
        name: f.name,
        url: URL.createObjectURL(f),
      }));
    if (added.length) setReferences((prev) => [...prev, ...added]);
  };

  const removeReference = (id: string) =>
    setReferences((prev) => prev.filter((r) => r.id !== id));




  const toggleRequired = (id: string) =>
    setLibrary((prev) =>
      prev.map((l) => (l.id === id ? { ...l, required: !l.required } : l)),
    );

  const addLibraryItem = (item: {
    kind: LibraryKind;
    label: string;
    url?: string;
  }) =>
    setLibrary((prev) => [
      ...prev,
      {
        id: `lib-${Date.now()}`,
        label: item.label,
        kind: item.kind,
        url: item.url,
        required: false,
        gradient: KIND_GRADIENT[item.kind],
      },
    ]);

  const removeLibraryItem = (id: string) =>
    setLibrary((prev) => prev.filter((l) => l.id !== id));



  const updateActiveComposition = (patch: (c: Composition) => Composition) =>
    setCompositions((prev) =>
      prev.map((c) => (c.id === activeCompId ? patch(c) : c)),
    );

  const addComposition = () => {
    const id = `comp-${Date.now()}`;
    setCompositions((prev) => [
      ...prev,
      { id, name: `Composição ${prev.length + 1}`, boxes: [] },
    ]);
    setActiveCompId(id);
  };

  const renameComposition = (id: string, name: string) =>
    setCompositions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );

  const removeComposition = (id: string) =>
    setCompositions((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (id === activeCompId && next[0]) setActiveCompId(next[0].id);
      return next;
    });

  const setActiveBoxes = (boxes: CompositionBox[]) =>
    updateActiveComposition((c) => ({ ...c, boxes }));



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
                description="Biblioteca própria de thumbnails usadas como referência nas gerações."
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refInputRef.current?.click()}
                  >
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Enviar imagens
                  </Button>
                }
              >
                <input
                  ref={refInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addReferenceFiles(e.target.files);
                    e.target.value = "";
                  }}
                />

                {references.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => refInputRef.current?.click()}
                    className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-secondary/20 px-6 py-12 text-center transition hover:border-primary/50 hover:bg-secondary/30"
                  >
                    <Upload className="h-5 w-5 text-muted-foreground" />
                    <span className="text-sm font-medium">
                      Nenhuma referência ainda
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Envie imagens para montar a biblioteca de referências deste canal.
                    </span>
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {references.map((r) => (
                      <div
                        key={r.id}
                        className="group relative overflow-hidden rounded-lg border border-border"
                      >
                        <img
                          src={r.url}
                          alt={r.name}
                          className="aspect-video w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(r.id)}
                          aria-label="Remover referência"
                          className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1 text-white/80 opacity-0 backdrop-blur transition hover:text-white group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="truncate p-2 text-xs text-muted-foreground">
                          {r.name}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>


              {/* Elementos consistentes */}
              <Section
                icon={<Package className="h-4 w-4" />}
                title="Elementos permanentes"
                description="Biblioteca de assets reutilizáveis do canal."
                action={<NewElementDialog onAdd={addLibraryItem} />}
              >
                {library.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-secondary/20 px-6 py-10 text-center">
                    <p className="text-sm font-medium">Nenhum elemento ainda</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Use “Novo elemento” para montar a biblioteca de assets
                      permanentes deste canal.
                    </p>
                  </div>
                ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {library.map((item) => {
                    const meta = KIND_LABEL[item.kind];
                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "group relative flex items-start gap-3 rounded-lg border p-3 transition-colors",
                          item.required
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-secondary/30",
                        )}
                      >
                        {item.url ? (
                          <img
                            src={item.url}
                            alt={item.label}
                            className="h-14 w-14 shrink-0 rounded-md object-cover"
                          />
                        ) : (
                          <div
                            className={cn(
                              "flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-inner",
                              item.gradient,
                            )}
                          >
                            <meta.Icon className="h-5 w-5" />
                          </div>
                        )}
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
                        <button
                          type="button"
                          aria-label="Remover elemento"
                          onClick={() => removeLibraryItem(item.id)}
                          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
                )}
              </Section>


              {/* Elementos únicos */}
              <Section
                icon={<Search className="h-4 w-4" />}
                title="Elementos específicos"
                description="Como buscar imagens únicas para cada thumbnail."
              >
                <ToggleRow
                  label="Usar elementos específicos por thumbnail"
                  checked={specificEnabled}
                  onChange={setSpecificEnabled}
                />

              </Section>

              {/* Composição */}
              <Section
                icon={<Layout className="h-4 w-4" />}
                title="Composição"
                description="Layout base, hierarquia de camadas e tipografia."
                action={
                  <Switch
                    checked={compositionEnabled}
                    onCheckedChange={setCompositionEnabled}
                  />
                }
              >
                <div
                  className={cn(
                    "space-y-6 transition-opacity",
                    !compositionEnabled && "pointer-events-none opacity-50",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {compositions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setActiveCompId(c.id)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs transition-colors",
                          c.id === activeCompId
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-secondary/30 hover:border-border/80",
                        )}
                      >
                        {c.name}
                      </button>
                    ))}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={addComposition}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Nova composição
                    </Button>
                  </div>

                  {activeComposition && (
                    <div className="space-y-4 rounded-xl border border-border bg-secondary/20 p-4">
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={activeComposition.name}
                          onChange={(e) =>
                            renameComposition(activeComposition.id, e.target.value)
                          }
                          className="h-9 max-w-[240px] text-sm font-medium"
                        />
                        {compositions.length > 1 && (
                          <button
                            type="button"
                            aria-label="Remover composição"
                            onClick={() => removeComposition(activeComposition.id)}
                            className="rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <CompositionCanvas
                        boxes={activeComposition.boxes}
                        onChange={setActiveBoxes}
                      />

                    </div>
                  )}


                  {/* Tipografia (subcampo) */}
                  <div className="space-y-6 rounded-xl border border-border bg-secondary/10 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <TypeIcon className="h-4 w-4 text-primary" />
                        <div>
                          <div className="text-sm font-medium">Tipografia</div>
                          <div className="text-xs text-muted-foreground">
                            Fonte do canal e estilos de texto da thumbnail.
                          </div>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addTextStyle}
                      >
                        <Plus className="mr-1.5 h-3.5 w-3.5" />
                        Adicionar texto
                      </Button>
                    </div>

                    <FieldWrap label="Fonte (arquivo)">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={fontInputRef}
                          type="file"
                          accept=".ttf,.otf,.woff,.woff2,font/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) setFontFile(f.name);
                            e.target.value = "";
                          }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fontInputRef.current?.click()}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Enviar fonte
                        </Button>
                        {fontFile ? (
                          <span className="flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-xs">
                            {fontFile}
                            <button
                              type="button"
                              aria-label="Remover fonte"
                              onClick={() => setFontFile(null)}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            .ttf, .otf, .woff ou .woff2
                          </span>
                        )}
                      </div>
                    </FieldWrap>

                    <div className="space-y-3">
                      {textStyles.map((t, i) => (
                        <div
                          key={t.id}
                          className="rounded-lg border border-border bg-card/60 p-3"
                        >
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <Input
                              value={t.name}
                              onChange={(e) =>
                                updateTextStyle(t.id, { name: e.target.value })
                              }
                              className="h-8 max-w-[200px] text-sm font-medium"
                            />
                            {textStyles.length > 1 && (
                              <button
                                type="button"
                                aria-label={`Remover ${t.name}`}
                                onClick={() => removeTextStyle(t.id)}
                                className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <FieldWrap label="Cor">
                              <ColorField
                                value={t.color}
                                onChange={(v) => updateTextStyle(t.id, { color: v })}
                              />
                            </FieldWrap>
                            <FieldWrap label="Tamanho (px)">
                              <Input
                                type="number"
                                min={8}
                                value={t.size}
                                onChange={(e) =>
                                  updateTextStyle(t.id, {
                                    size: Number(e.target.value),
                                  })
                                }
                              />
                            </FieldWrap>
                            <FieldWrap label="Peso">
                              <Select
                                value={t.weight}
                                onValueChange={(v) =>
                                  updateTextStyle(t.id, { weight: v })
                                }
                              >
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
                            <FieldWrap label="Contorno (px)">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  min={0}
                                  value={t.stroke}
                                  onChange={(e) =>
                                    updateTextStyle(t.id, {
                                      stroke: Number(e.target.value),
                                    })
                                  }
                                />
                                <ColorField
                                  value={t.strokeColor}
                                  onChange={(v) =>
                                    updateTextStyle(t.id, { strokeColor: v })
                                  }
                                  compact
                                />
                              </div>
                            </FieldWrap>
                            <FieldWrap label="Sombra (px)">
                              <Input
                                type="number"
                                min={0}
                                value={t.shadow}
                                onChange={(e) =>
                                  updateTextStyle(t.id, {
                                    shadow: Number(e.target.value),
                                  })
                                }
                              />
                            </FieldWrap>
                            <FieldWrap label="Caixa alta">
                              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/30 px-3">
                                <Switch
                                  checked={t.uppercase}
                                  onCheckedChange={(v) =>
                                    updateTextStyle(t.id, { uppercase: v })
                                  }
                                />
                                <span className="text-xs">MAIÚSCULAS</span>
                              </div>
                            </FieldWrap>
                          </div>
                          <div className="sr-only">Estilo {i + 1}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </Section>


              {/* Prompt */}
              <Section
                icon={<Wand2 className="h-4 w-4" />}
                title="Instruções avançadas"
                description="Prompt-mestre para o gerador de descrições de thumbnails."
              >
                <Textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="min-h-[220px] font-mono text-xs leading-relaxed"
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

function NewElementDialog({
  onAdd,
}: {
  onAdd: (item: { kind: LibraryKind; label: string; url?: string }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<LibraryKind>("character");
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setKind("character");
    setLabel("");
    setFile(null);
  };

  const submit = () => {
    if (!label.trim()) return;
    onAdd({ kind, label: label.trim(), url: file?.url });
    reset();
    setOpen(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Novo elemento
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo elemento permanente</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Tipo</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as LibraryKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as LibraryKind[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Nome</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex.: Logo do canal"
            />
          </div>

          <div className="grid gap-2">
            <Label>Arquivo</Label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setFile({ name: f.name, url: URL.createObjectURL(f) });
                e.target.value = "";
              }}
            />
            {file ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-2">
                <img
                  src={file.url}
                  alt={file.name}
                  className="h-12 w-12 rounded-md object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {file.name}
                </span>
                <button
                  type="button"
                  aria-label="Remover arquivo"
                  onClick={() => setFile(null)}
                  className="rounded-md p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border bg-secondary/20 px-4 py-6 text-center transition hover:border-primary/50"
              >
                <Upload className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Enviar imagem (opcional)
                </span>
              </button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!label.trim()}>
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
