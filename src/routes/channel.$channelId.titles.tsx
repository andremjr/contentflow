import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import {
  Type,
  BookMarked,
  Ruler,
  Wand2,
  X,
  Plus,
  Maximize2,
  Minimize2,
  RotateCcw,
  Info,
  Sparkles,
  Ban,
  Tag,
  Play,
  Save,
  Braces,
  Check,
  Flame,
  ArrowRight,
  Star,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/titles")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch
      ? `Títulos — ${ch.name} · ContentFlow OS`
      : "Títulos — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Configure estruturas, vocabulário e comprimento dos títulos gerados para o canal.",
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
  component: TitlesScreen,
});

// ---------- mocks ----------

type Structure = {
  id: string;
  name: string;
  formula: string;
  example: string;
  categories: string[];
  usage: number; // 0-100
  notes?: string;
};

const INITIAL_STRUCTURES: Structure[] = [
  {
    id: "how-to",
    name: "Como fazer",
    formula: "Como [ação] em [tempo] sem [obstáculo]",
    example: "Como aprender IA em 30 dias sem saber programar",
    categories: ["Educacional", "Tutorial"],
    usage: 87,
  },
  {
    id: "list",
    name: "Lista numerada",
    formula: "[N] [temas] que [benefício/consequência]",
    example: "7 hábitos que mudaram a rotina de quem trabalha com IA",
    categories: ["Listicle", "Retenção"],
    usage: 72,
  },
  {
    id: "curiosity",
    name: "Gap de curiosidade",
    formula: "A verdade sobre [assunto] que ninguém te contou",
    example: "A verdade sobre o ChatGPT que ninguém te contou",
    categories: ["Curiosidade"],
    usage: 64,
  },
  {
    id: "contrast",
    name: "Contraste antes/depois",
    formula: "Eu era [antes] até descobrir [gatilho]",
    example: "Eu perdia 4h por dia até descobrir esse fluxo com IA",
    categories: ["Storytelling", "Aspiração"],
    usage: 55,
  },
  {
    id: "warning",
    name: "Alerta / erro",
    formula: "Pare de [erro comum] agora — faça isso no lugar",
    example: "Pare de escrever prompts assim — faça isso no lugar",
    categories: ["Alerta", "Curiosidade"],
    usage: 41,
  },
  {
    id: "vs",
    name: "Confronto direto",
    formula: "[A] vs [B]: qual realmente vale a pena?",
    example: "Claude vs ChatGPT: qual realmente vale a pena em 2026?",
    categories: ["Comparativo"],
    usage: 38,
  },
];

const KEYWORD_SUGGESTIONS = [
  "IA",
  "inteligência artificial",
  "automação",
  "produtividade",
  "tutorial",
  "guia",
  "revelado",
  "segredo",
  "erro",
  "método",
  "passo a passo",
  "definitivo",
];

const PROMPT_VARIABLES = [
  { key: "channel_name", label: "Nome do canal" },
  { key: "channel_niche", label: "Nicho" },
  { key: "target_audience", label: "Público" },
  { key: "keyword_focus", label: "Palavra-chave principal" },
  { key: "structure", label: "Estrutura escolhida" },
  { key: "length_min", label: "Mín. caracteres" },
  { key: "length_max", label: "Máx. caracteres" },
];

const DEFAULT_PROMPT = `Você é um copywriter especializado em títulos de YouTube para {{channel_name}}, nicho {{channel_niche}}.

Gere 10 títulos que:
- Sigam a estrutura {{structure}}
- Incluam a palavra-chave {{keyword_focus}}
- Tenham entre {{length_min}} e {{length_max}} caracteres
- Conversem com {{target_audience}}

Regras:
1. Nada de clickbait vazio
2. Priorize clareza + gatilho emocional
3. Evite CAPS abusivo e emojis excessivos`;

const EXAMPLE_POOL = [
  "Como dominar IA em 30 dias sem saber programar",
  "7 fluxos com IA que economizam 10h por semana",
  "A verdade sobre o ChatGPT que quase ninguém te contou",
  "Pare de escrever prompts assim — faça isso no lugar",
  "Eu perdia horas todo dia até descobrir esse método",
  "Claude vs ChatGPT: qual vale a pena em 2026?",
  "O único fluxo de trabalho com IA que realmente funciona",
];

// ---------- component ----------

function TitlesScreen() {
  const { channel } = Route.useLoaderData();

  const [structures, setStructures] = useState<Structure[]>(INITIAL_STRUCTURES);
  const [selectedStructures, setSelectedStructures] = useState<string[]>([
    "how-to",
    "list",
    "curiosity",
  ]);

  const [requiredKw, setRequiredKw] = useState<string[]>(["IA"]);
  const [recommendedKw, setRecommendedKw] = useState<string[]>([
    "produtividade",
    "método",
  ]);
  const [forbiddenKw, setForbiddenKw] = useState<string[]>([
    "URGENTE",
    "click aqui",
  ]);

  const [lengthRange, setLengthRange] = useState<[number, number]>([45, 70]);

  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [expanded, setExpanded] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [newStructOpen, setNewStructOpen] = useState(false);

  const toggleStructure = (id: string) =>
    setSelectedStructures((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const addStructure = (s: Omit<Structure, "id" | "usage">) => {
    const id = s.name.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();
    setStructures((prev) => [...prev, { ...s, id, usage: 0 }]);
    setSelectedStructures((prev) => [...prev, id]);
  };

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    const el = promptRef.current;
    if (!el) {
      setPrompt((p) => `${p}${token}`);
      return;
    }
    const start = el.selectionStart ?? prompt.length;
    const end = el.selectionEnd ?? prompt.length;
    setPrompt(prompt.slice(0, start) + token + prompt.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  const previewTitles = useMemo(() => {
    // Deterministic filtered examples using selected structures
    const chosen = structures.filter((s) => selectedStructures.includes(s.id));
    const chosenNames =
      chosen.length > 0 ? chosen.map((c) => c.name) : ["—"];
    return EXAMPLE_POOL.slice(0, 5).map((raw, i) => {
      const trimmed =
        raw.length > lengthRange[1]
          ? raw.slice(0, lengthRange[1] - 1) + "…"
          : raw;
      return {
        title: trimmed,
        length: trimmed.length,
        structure: chosenNames[i % chosenNames.length],
      };
    });
  }, [structures, selectedStructures, lengthRange]);

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Títulos"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Títulos" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            {/* MAIN */}
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start gap-4">
                <ChannelAvatar channel={channel} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Type className="h-3.5 w-3.5" />
                    Títulos · Etapa 3 do pipeline
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Fábrica de títulos
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Modelos, vocabulário e comprimento aplicados a cada geração.
                  </p>
                </div>
                <Button size="sm">
                  <Play className="mr-1.5 h-3.5 w-3.5" />
                  Gerar títulos
                </Button>
              </div>

              {/* Estruturas */}
              <Section
                icon={<BookMarked className="h-4 w-4" />}
                title="Modelos de títulos"
                description="Biblioteca de estruturas que o gerador deve considerar."
                action={
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {selectedStructures.length}/{structures.length} ativas
                    </span>
                    <NewStructureButton
                      open={newStructOpen}
                      onOpenChange={setNewStructOpen}
                      onCreate={addStructure}
                    />
                  </div>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {structures.map((s) => (
                    <StructureCard
                      key={s.id}
                      structure={s}
                      selected={selectedStructures.includes(s.id)}
                      onToggle={() => toggleStructure(s.id)}
                    />
                  ))}
                </div>
              </Section>

              {/* Vocabulário */}
              <Section
                icon={<Tag className="h-4 w-4" />}
                title="Vocabulário"
                description="Palavras-chave que devem, podem ou não podem aparecer."
              >
                <div className="grid gap-4 md:grid-cols-3">
                  <TagField
                    label="Obrigatórias"
                    description="Aparecem em todos os títulos."
                    values={requiredKw}
                    onChange={setRequiredKw}
                    suggestions={KEYWORD_SUGGESTIONS}
                    tone="required"
                  />
                  <TagField
                    label="Recomendadas"
                    description="Priorizadas quando fizerem sentido."
                    values={recommendedKw}
                    onChange={setRecommendedKw}
                    suggestions={KEYWORD_SUGGESTIONS}
                    tone="recommended"
                  />
                  <TagField
                    label="Proibidas"
                    description="Nunca devem aparecer."
                    values={forbiddenKw}
                    onChange={setForbiddenKw}
                    tone="forbidden"
                    icon={<Ban className="h-3 w-3" />}
                  />
                </div>
              </Section>

              {/* Comprimento */}
              <Section
                icon={<Ruler className="h-4 w-4" />}
                title="Comprimento"
                description="Faixa de caracteres aceita para o título."
              >
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Mínimo
                      </Label>
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={lengthRange[0]}
                        onChange={(e) =>
                          setLengthRange([
                            Number(e.target.value),
                            Math.max(Number(e.target.value), lengthRange[1]),
                          ])
                        }
                        className="w-24"
                      />
                    </div>
                    <span className="mt-5 text-sm text-muted-foreground">
                      até
                    </span>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">
                        Máximo
                      </Label>
                      <Input
                        type="number"
                        min={10}
                        max={100}
                        value={lengthRange[1]}
                        onChange={(e) =>
                          setLengthRange([
                            Math.min(lengthRange[0], Number(e.target.value)),
                            Number(e.target.value),
                          ])
                        }
                        className="w-24"
                      />
                    </div>
                    <span className="mt-5 text-xs text-muted-foreground">
                      caracteres
                    </span>
                  </div>

                  <div>
                    <Slider
                      value={lengthRange}
                      min={10}
                      max={100}
                      step={1}
                      onValueChange={(v) =>
                        setLengthRange([v[0], v[1]] as [number, number])
                      }
                    />
                    <LengthRuler range={lengthRange} />
                  </div>
                </div>
              </Section>

              {/* Prompt */}
              <Section
                icon={<Wand2 className="h-4 w-4" />}
                title="Instruções avançadas"
                description="Prompt-mestre usado ao gerar títulos."
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
                  As alterações se aplicam ao próximo lote de títulos.
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

            {/* PREVIEW */}
            <aside className="lg:sticky lg:top-6 lg:h-fit">
              <div className="rounded-xl border border-border bg-card/60 p-5 backdrop-blur">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Prévia de títulos</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Exemplos simulados aplicando as configurações atuais.
                </p>

                <Separator className="my-4" />

                <ul className="space-y-2.5">
                  {previewTitles.map((t, i) => {
                    const ok =
                      t.length >= lengthRange[0] &&
                      t.length <= lengthRange[1];
                    return (
                      <li
                        key={i}
                        className="group rounded-lg border border-border bg-secondary/30 p-3 transition-colors hover:border-primary/40"
                      >
                        <div className="text-sm leading-snug text-foreground">
                          {t.title}
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <Badge
                            variant="secondary"
                            className="bg-primary/10 text-primary"
                          >
                            {t.structure}
                          </Badge>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1",
                              ok ? "text-success" : "text-warning",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full",
                                ok ? "bg-success" : "bg-warning",
                              )}
                            />
                            {t.length} car.
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <Separator className="my-4" />

                <div className="rounded-lg bg-secondary/40 p-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <Info className="h-3.5 w-3.5 text-primary" />
                    Regras ativas
                  </div>
                  <ul className="mt-2 space-y-1">
                    <li>{selectedStructures.length} estruturas selecionadas</li>
                    <li>{requiredKw.length} obrigatórias · {forbiddenKw.length} proibidas</li>
                    <li>Faixa: {lengthRange[0]}–{lengthRange[1]} caracteres</li>
                  </ul>
                </div>

                <Button className="mt-4 w-full">
                  <Play className="mr-2 h-4 w-4" />
                  Regenerar prévia
                </Button>
              </div>
            </aside>
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

function StructureCard({
  structure,
  selected,
  onToggle,
}: {
  structure: Structure;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "group relative flex flex-col gap-3 rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-primary/60 bg-primary/5 shadow-[0_0_0_1px_rgba(37,99,235,0.35)]"
          : "border-border bg-secondary/30 hover:border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">{structure.name}</h3>
            <UsagePill usage={structure.usage} />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {structure.formula}
          </p>
        </div>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-0.5"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      <div className="rounded-md border border-border/60 bg-background/40 p-2.5 text-xs italic text-foreground/90">
        <ArrowRight className="mr-1 inline h-3 w-3 text-primary" />
        {structure.example}
      </div>

      <div className="flex flex-wrap gap-1">
        {structure.categories.map((c) => (
          <Badge
            key={c}
            variant="secondary"
            className="bg-secondary/60 text-[10px] text-muted-foreground"
          >
            {c}
          </Badge>
        ))}
      </div>
    </button>
  );
}

function UsagePill({ usage }: { usage: number }) {
  const level = usage >= 70 ? "high" : usage >= 40 ? "med" : "low";
  const cls =
    level === "high"
      ? "text-success bg-success/10"
      : level === "med"
        ? "text-warning bg-warning/10"
        : "text-muted-foreground bg-secondary/60";
  const Icon = level === "high" ? Flame : level === "med" ? Star : Info;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        cls,
      )}
    >
      <Icon className="h-2.5 w-2.5" />
      {usage}%
    </span>
  );
}

function NewStructureButton({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (s: Omit<Structure, "id" | "usage">) => void;
}) {
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [example, setExample] = useState("");
  const [notes, setNotes] = useState("");
  const [categories, setCategories] = useState("");

  const submit = () => {
    if (!name.trim() || !formula.trim()) return;
    onCreate({
      name: name.trim(),
      formula: formula.trim(),
      example: example.trim(),
      notes: notes.trim() || undefined,
      categories: categories
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean),
    });
    setName("");
    setFormula("");
    setExample("");
    setNotes("");
    setCategories("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Nova estrutura
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova estrutura de título</DialogTitle>
          <DialogDescription>
            Descreva uma fórmula reutilizável para gerar títulos.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Pergunta provocativa"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Fórmula</Label>
            <Input
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Ex.: [Pergunta] que muda como você vê [assunto]"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Exemplo</Label>
            <Input
              value={example}
              onChange={(e) => setExample(e.target.value)}
              placeholder="Ex.: A pergunta que muda como você vê IA"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Categorias</Label>
            <Input
              value={categories}
              onChange={(e) => setCategories(e.target.value)}
              placeholder="separadas por vírgula"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Quando usar, quando evitar..."
              className="min-h-[80px]"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!name.trim() || !formula.trim()}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Criar estrutura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LengthRuler({ range }: { range: [number, number] }) {
  // Zones over 0-100 characters
  const zones = [
    { from: 0, to: 30, label: "Curto", cls: "bg-muted-foreground/30" },
    { from: 30, to: 60, label: "Recomendado", cls: "bg-primary/50" },
    { from: 60, to: 70, label: "Longo", cls: "bg-warning/60" },
    { from: 70, to: 100, label: "Corte no YouTube", cls: "bg-destructive/60" },
  ];
  const leftPct = range[0];
  const widthPct = Math.max(0, range[1] - range[0]);
  return (
    <div className="mt-4">
      <div className="relative h-2 overflow-hidden rounded-full bg-secondary/50">
        {zones.map((z) => (
          <div
            key={z.label}
            className={cn("absolute top-0 h-full", z.cls)}
            style={{
              left: `${z.from}%`,
              width: `${z.to - z.from}%`,
              opacity: 0.55,
            }}
          />
        ))}
        <div
          className="absolute top-0 h-full rounded-full ring-2 ring-primary/70 bg-primary/30"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
      </div>
      <div className="mt-2 grid grid-cols-4 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>Curto</span>
        <span>Recomendado</span>
        <span>Longo</span>
        <span className="text-destructive/80">Corte no YouTube</span>
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        <span>0</span>
        <span>30</span>
        <span>60</span>
        <span>70</span>
        <span>100</span>
      </div>
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
            <span className="ml-2 font-sans">prompt.titles.md</span>
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
            expanded ? "flex-1" : "min-h-[260px]",
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
  suggestions = [],
  tone = "recommended",
  icon,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  tone?: "required" | "recommended" | "forbidden";
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

  const toneCls =
    tone === "required"
      ? "bg-primary/15 text-primary"
      : tone === "recommended"
        ? "bg-warning/15 text-warning"
        : "bg-destructive/15 text-destructive";

  const accentBar =
    tone === "required"
      ? "bg-primary"
      : tone === "recommended"
        ? "bg-warning"
        : "bg-destructive";

  const filtered = suggestions.filter(
    (s) =>
      !values.includes(s) &&
      (!draft || s.toLowerCase().includes(draft.toLowerCase())),
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/20 p-4">
      <span
        className={cn("absolute inset-y-0 left-0 w-1", accentBar)}
        aria-hidden
      />
      <div className="pl-2">
        <Label className="text-sm font-medium">{label}</Label>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "mt-3 flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border bg-input/40 px-2 py-1.5 transition-colors",
            focused
              ? "border-primary ring-2 ring-primary/20"
              : "border-border",
          )}
        >
          {values.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className={cn("gap-1 pl-2 pr-1 py-0.5 text-xs", toneCls)}
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
            placeholder={
              values.length === 0 ? "Digite e pressione Enter" : ""
            }
            className="min-w-[6ch] flex-1 bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        {focused && filtered.length > 0 && (
          <div className="mt-1 max-h-40 overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
            {filtered.slice(0, 6).map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-secondary"
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
