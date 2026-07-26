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
  ArrowRight,
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
  formula: string;
  examples: string[];
};

const INITIAL_STRUCTURES: Structure[] = [];

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
  const [selectedStructures, setSelectedStructures] = useState<string[]>([]);

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
  const [bulkStructOpen, setBulkStructOpen] = useState(false);

  const toggleStructure = (id: string) =>
    setSelectedStructures((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const addStructure = (s: Omit<Structure, "id">) => {
    const id = "struct-" + Date.now();
    setStructures((prev) => [...prev, { ...s, id }]);
    setSelectedStructures((prev) => [...prev, id]);
  };

  const addStructuresBulk = (formulas: string[]) => {
    const created = formulas.map((formula, i) => ({
      id: `struct-${Date.now()}-${i}`,
      formula,
      examples: [] as string[],
    }));
    setStructures((prev) => [...prev, ...created]);
    setSelectedStructures((prev) => [...prev, ...created.map((c) => c.id)]);
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
      chosen.length > 0 ? chosen.map((c) => c.formula) : ["—"];
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
          <div className="mx-auto max-w-[1100px] p-6">
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
                    <BulkStructuresButton
                      open={bulkStructOpen}
                      onOpenChange={setBulkStructOpen}
                      onCreate={addStructuresBulk}
                    />
                    <NewStructureButton
                      open={newStructOpen}
                      onOpenChange={setNewStructOpen}
                      onCreate={addStructure}
                    />
                  </div>
                }
              >
                {structures.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border bg-secondary/20 p-6 text-center text-sm text-muted-foreground">
                    Nenhuma estrutura cadastrada. Adicione modelos de título
                    para este canal.
                  </p>
                ) : (
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
                )}
              </Section>

              {/* Palavras-chave */}
              <Section
                icon={<Tag className="h-4 w-4" />}
                title="Palavras-chave"
                description="Palavras que devem, podem ou não podem aparecer."
                action={
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {keywordsEnabled ? "Ativado" : "Desativado"}
                    </span>
                    <Switch
                      checked={keywordsEnabled}
                      onCheckedChange={setKeywordsEnabled}
                    />
                  </div>
                }
              >
                <div
                  className={cn(
                    "grid gap-4 transition-opacity md:grid-cols-3",
                    !keywordsEnabled && "pointer-events-none opacity-40",
                  )}
                >
                  <KeywordGroup
                    enabled={requiredKwEnabled}
                    onEnabledChange={setRequiredKwEnabled}
                  >
                    <TagField
                      label="Obrigatórias"
                      description="Aparecem em todos os títulos."
                      values={requiredKw}
                      onChange={setRequiredKw}
                      suggestions={KEYWORD_SUGGESTIONS}
                      tone="required"
                    />
                  </KeywordGroup>
                  <KeywordGroup
                    enabled={recommendedKwEnabled}
                    onEnabledChange={setRecommendedKwEnabled}
                  >
                    <TagField
                      label="Recomendadas"
                      description="Priorizadas quando fizerem sentido."
                      values={recommendedKw}
                      onChange={setRecommendedKw}
                      suggestions={KEYWORD_SUGGESTIONS}
                      tone="recommended"
                    />
                  </KeywordGroup>
                  <KeywordGroup
                    enabled={forbiddenKwEnabled}
                    onEnabledChange={setForbiddenKwEnabled}
                  >
                    <TagField
                      label="Proibidas"
                      description="Nunca devem aparecer."
                      values={forbiddenKw}
                      onChange={setForbiddenKw}
                      tone="forbidden"
                      icon={<Ban className="h-3 w-3" />}
                    />
                  </KeywordGroup>
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
        <p className="font-mono text-sm text-foreground/90">
          {structure.formula}
        </p>
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          className="mt-0.5"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {structure.examples.length > 0 && (
        <div className="space-y-1.5">
          {structure.examples.map((ex, i) => (
            <div
              key={i}
              className="rounded-md border border-border/60 bg-background/40 p-2.5 text-xs italic text-foreground/90"
            >
              <ArrowRight className="mr-1 inline h-3 w-3 text-primary" />
              {ex}
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function BulkStructuresButton({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (formulas: string[]) => void;
}) {
  const [text, setText] = useState("");
  const formulas = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const submit = () => {
    if (formulas.length === 0) return;
    onCreate(formulas);
    setText("");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar em lote
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar fórmulas em lote</DialogTitle>
          <DialogDescription>
            Cole uma fórmula por linha. Você pode adicionar exemplos depois.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"[Número] formas de [resultado]\nComo [ação] sem [obstáculo]\nPor que [crença comum] está errada"}
            className="min-h-[200px] resize-y font-mono text-sm"
            spellCheck={false}
          />
          <p className="text-xs text-muted-foreground">
            {formulas.length} fórmula{formulas.length === 1 ? "" : "s"} detectada
            {formulas.length === 1 ? "" : "s"}
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={formulas.length === 0}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Adicionar {formulas.length > 0 ? formulas.length : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewStructureButton({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (s: Omit<Structure, "id">) => void;
}) {
  const [formula, setFormula] = useState("");
  const [examples, setExamples] = useState<string[]>([""]);

  const setExampleAt = (i: number, v: string) =>
    setExamples((prev) => prev.map((e, idx) => (idx === i ? v : e)));

  const reset = () => {
    setFormula("");
    setExamples([""]);
  };

  const submit = () => {
    if (!formula.trim()) return;
    onCreate({
      formula: formula.trim(),
      examples: examples.map((e) => e.trim()).filter(Boolean).slice(0, 5),
    });
    reset();
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
            <Label>Fórmula</Label>
            <Input
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              placeholder="Ex.: [Pergunta] que muda como você vê [assunto]"
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Exemplos (opcional)</Label>
              <span className="text-xs text-muted-foreground">
                {examples.length}/5
              </span>
            </div>
            <div className="space-y-2">
              {examples.map((ex, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={ex}
                    onChange={(e) => setExampleAt(i, e.target.value)}
                    placeholder={`Exemplo ${i + 1}`}
                  />
                  {examples.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setExamples((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      aria-label={`Remover exemplo ${i + 1}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            {examples.length < 5 && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={() => setExamples((prev) => [...prev, ""])}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Adicionar exemplo
              </Button>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!formula.trim()}>
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
