import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, useMemo, type KeyboardEvent } from "react";
import {
  FileText,
  Layers,
  Mic,
  Languages,
  Megaphone,
  Sparkles,
  Wand2,
  ListChecks,
  Plus,
  X,
  Ban,
  Info,
  Play,
  Save,
  RotateCcw,
  Maximize2,
  Minimize2,
  Braces,
  GripVertical,
  Copy,
  Trash2,
  Check,
  ChevronsUpDown,
  Star,
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

export const Route = createFileRoute("/channel/$channelId/script")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    return {
      meta: [
        {
          title: ch
            ? `Roteiro — ${ch.name} · ContentFlow OS`
            : "Roteiro — ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Estrutura, narrador, CTAs e prompts para os roteiros do canal.",
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
  component: ScriptScreen,
});

// ---------- mocks ----------

const POV_OPTIONS = [
  { value: "first", label: "Primeira pessoa (eu / nós)" },
  { value: "second", label: "Segunda pessoa (você)" },
  { value: "third", label: "Terceira pessoa (ele / ela / eles)" },
  { value: "narrator", label: "Narrador onisciente" },
];

const TONE_OPTIONS = [
  { id: "didatico", label: "Didático" },
  { id: "descontraido", label: "Descontraído" },
  { id: "urgente", label: "Urgente" },
  { id: "provocativo", label: "Provocativo" },
  { id: "inspirador", label: "Inspirador" },
  { id: "tecnico", label: "Técnico" },
  { id: "acolhedor", label: "Acolhedor" },
];

const VOCAB_OPTIONS = [
  { value: "simples", label: "Simples e acessível" },
  { value: "coloquial", label: "Coloquial" },
  { value: "neutro", label: "Neutro" },
  { value: "tecnico", label: "Técnico especializado" },
  { value: "formal", label: "Formal e sofisticado" },
];

const LANGUAGES = [
  { value: "pt-BR", label: "Português", region: "Brasil", flag: "🇧🇷" },
  { value: "pt-PT", label: "Português", region: "Portugal", flag: "🇵🇹" },
  { value: "en-US", label: "Inglês", region: "Estados Unidos", flag: "🇺🇸" },
  { value: "en-GB", label: "Inglês", region: "Reino Unido", flag: "🇬🇧" },
  { value: "es-ES", label: "Espanhol", region: "Espanha", flag: "🇪🇸" },
  { value: "es-MX", label: "Espanhol", region: "México", flag: "🇲🇽" },
  { value: "fr-FR", label: "Francês", region: "França", flag: "🇫🇷" },
  { value: "de-DE", label: "Alemão", region: "Alemanha", flag: "🇩🇪" },
];

const CTA_TYPES = [
  { value: "subscribe", label: "Inscrição" },
  { value: "like", label: "Like" },
  { value: "comment", label: "Comentário" },
  { value: "share", label: "Compartilhamento" },
  { value: "external", label: "Link externo" },
  { value: "product", label: "Produto / oferta" },
  { value: "newsletter", label: "Newsletter" },
];

const CTA_MOMENTS = [
  { value: "opening", label: "Abertura (0-10%)" },
  { value: "hook", label: "Após o gancho (10-20%)" },
  { value: "middle", label: "Meio (40-60%)" },
  { value: "late", label: "Reta final (70-85%)" },
  { value: "closing", label: "Encerramento (95-100%)" },
  { value: "custom", label: "Percentual customizado" },
];

type Cta = {
  id: string;
  type: string;
  name: string;
  moment: string;
  customPercent: number;
  template: string;
  required: boolean;
};

const INITIAL_CTAS: Cta[] = [
  {
    id: "c1",
    type: "subscribe",
    name: "Inscrição principal",
    moment: "hook",
    customPercent: 15,
    template:
      "Se você curte esse tipo de conteúdo, não esquece de se inscrever no canal.",
    required: true,
  },
  {
    id: "c2",
    type: "external",
    name: "Newsletter semanal",
    moment: "middle",
    customPercent: 50,
    template:
      "Link da nossa newsletter na descrição — recebe um resumo toda sexta.",
    required: false,
  },
  {
    id: "c3",
    type: "comment",
    name: "Engajamento final",
    moment: "closing",
    customPercent: 95,
    template: "Conta nos comentários qual dessas ideias você vai testar.",
    required: true,
  },
];

type Opening = {
  id: string;
  name: string;
  type: string;
  description: string;
  example: string;
  duration: string;
  tags: string[];
};

const OPENINGS: Opening[] = [
  {
    id: "o1",
    name: "Gancho em pergunta",
    type: "Curiosidade",
    description: "Abre com uma pergunta provocativa direcionada ao público.",
    example: "E se tudo o que você aprendeu sobre X estivesse errado?",
    duration: "6-10s",
    tags: ["pergunta", "curiosidade"],
  },
  {
    id: "o2",
    name: "Cena de resultado",
    type: "Prova",
    description: "Mostra o resultado final antes de explicar o caminho.",
    example: "Este projeto foi criado em 4 horas — veja como.",
    duration: "8-12s",
    tags: ["resultado", "prova"],
  },
  {
    id: "o3",
    name: "Contradição direta",
    type: "Provocação",
    description: "Contraria uma crença comum do nicho.",
    example: "Parar de fazer isso vai acelerar o seu canal.",
    duration: "5-8s",
    tags: ["polêmico", "provocação"],
  },
  {
    id: "o4",
    name: "História rápida",
    type: "Narrativa",
    description: "Micro-narrativa de 15 segundos que introduz o tema.",
    example: "Semana passada, um assinante mandou um print que...",
    duration: "12-18s",
    tags: ["storytelling"],
  },
  {
    id: "o5",
    name: "Dado surpreendente",
    type: "Autoridade",
    description: "Abre com uma estatística ou dado forte.",
    example: "87% dos criadores abandonam o canal antes de 100 vídeos.",
    duration: "6-9s",
    tags: ["dado", "estatística"],
  },
  {
    id: "o6",
    name: "Promessa concreta",
    type: "Benefício",
    description: "Declara o que o espectador vai levar até o final.",
    example: "Nos próximos 8 minutos, você vai sair sabendo como...",
    duration: "5-8s",
    tags: ["benefício", "clareza"],
  },
];

const OUTLINE_VARIABLES = [
  { key: "channel_name", label: "Nome do canal" },
  { key: "video_title", label: "Título do vídeo" },
  { key: "target_audience", label: "Público-alvo" },
  { key: "main_keyword", label: "Palavra-chave principal" },
  { key: "chosen_hook", label: "Abertura escolhida" },
  { key: "block_count", label: "Quantidade de blocos" },
];

const DEV_VARIABLES = [
  ...OUTLINE_VARIABLES,
  { key: "outline", label: "Outline gerado" },
  { key: "narrator_persona", label: "Persona do narrador" },
  { key: "target_length", label: "Duração-alvo em minutos" },
  { key: "ctas", label: "Lista de CTAs" },
];

const DEFAULT_OUTLINE_PROMPT = `Você é um roteirista sênior do canal {{channel_name}}.

Crie o outline do vídeo "{{video_title}}" pensando em {{target_audience}}.

Regras:
- Divida em {{block_count}} blocos numerados
- Cada bloco deve ter título, objetivo e principais pontos
- Aplique a abertura escolhida: {{chosen_hook}}
- Reforce a palavra-chave: {{main_keyword}}`;

const DEFAULT_DEV_PROMPT = `A partir do {{outline}}, desenvolva o roteiro completo do vídeo.

Persona do narrador: {{narrator_persona}}
Duração-alvo: {{target_length}} minutos

Regras:
- Mantenha o ritmo e o tom definidos
- Insira os CTAs {{ctas}} nos momentos indicados
- Escreva em linguagem falada, pronta para narração
- Nunca invente dados; marque com [VERIFICAR] quando necessário`;

// approximations
const CHARS_PER_WORD = 5.5;
const WORDS_PER_MINUTE = 155;

// ---------- component ----------

function ScriptScreen() {
  const { channel } = Route.useLoaderData();

  // Length
  const [lenMin, setLenMin] = useState(6000);
  const [lenMax, setLenMax] = useState(9000);

  // Blocks
  const [blocksMin, setBlocksMin] = useState(5);
  const [blocksMax, setBlocksMax] = useState(8);

  // Narrator
  const [narratorName, setNarratorName] = useState("Voz do canal");
  const [persona, setPersona] = useState(
    "Especialista curioso que traduz temas complexos com clareza, mistura rigor técnico com humor moderado e respeita o tempo do espectador.",
  );
  const [pov, setPov] = useState("second");
  const [tones, setTones] = useState<string[]>(["didatico", "acolhedor"]);
  const [formality, setFormality] = useState<[number]>([40]);
  const [vocab, setVocab] = useState("coloquial");
  const [mustHave, setMustHave] = useState<string[]>([
    "exemplos concretos",
    "analogias visuais",
  ]);
  const [forbidden, setForbidden] = useState<string[]>([
    "gírias regionais",
    "termos ofensivos",
  ]);
  const [sample, setSample] = useState(
    "Olha só, esse é o tipo de coisa que parece complicado, mas quando você entende a lógica por trás, faz total sentido — vem comigo que eu te mostro.",
  );

  // Language
  const [language, setLanguage] = useState("pt-BR");

  // CTAs
  const [ctas, setCtas] = useState<Cta[]>(INITIAL_CTAS);
  const [dragCta, setDragCta] = useState<number | null>(null);

  // Openings
  const [openings, setOpenings] = useState<
    { id: string; priority: number }[]
  >([
    { id: "o1", priority: 1 },
    { id: "o5", priority: 2 },
  ]);

  // Prompts
  const [outlinePrompt, setOutlinePrompt] = useState(DEFAULT_OUTLINE_PROMPT);
  const [devPrompt, setDevPrompt] = useState(DEFAULT_DEV_PROMPT);
  const [outlineExpanded, setOutlineExpanded] = useState(false);
  const [devExpanded, setDevExpanded] = useState(false);
  const outlineRef = useRef<HTMLTextAreaElement>(null);
  const devRef = useRef<HTMLTextAreaElement>(null);

  // Derived
  const wordsMin = Math.round(lenMin / CHARS_PER_WORD);
  const wordsMax = Math.round(lenMax / CHARS_PER_WORD);
  const minutesMin = (wordsMin / WORDS_PER_MINUTE).toFixed(1);
  const minutesMax = (wordsMax / WORDS_PER_MINUTE).toFixed(1);

  const toneToggle = (id: string) =>
    setTones((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );

  const addCta = () =>
    setCtas((prev) => [
      ...prev,
      {
        id: `c${Date.now()}`,
        type: "subscribe",
        name: "Novo CTA",
        moment: "middle",
        customPercent: 50,
        template: "",
        required: false,
      },
    ]);
  const patchCta = (id: string, patch: Partial<Cta>) =>
    setCtas((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  const removeCta = (id: string) =>
    setCtas((prev) => prev.filter((c) => c.id !== id));
  const duplicateCta = (id: string) =>
    setCtas((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev[idx], id: `c${Date.now()}`, name: `${prev[idx].name} (cópia)` };
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
  const onCtaDragStart = (i: number) => setDragCta(i);
  const onCtaDragOver = (e: React.DragEvent, i: number) => {
    e.preventDefault();
    if (dragCta === null || dragCta === i) return;
    setCtas((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragCta, 1);
      next.splice(i, 0, moved);
      return next;
    });
    setDragCta(i);
  };

  const toggleOpening = (id: string) =>
    setOpenings((prev) => {
      const has = prev.find((o) => o.id === id);
      if (has) return prev.filter((o) => o.id !== id);
      return [...prev, { id, priority: prev.length + 1 }];
    });
  const setOpeningPriority = (id: string, priority: number) =>
    setOpenings((prev) =>
      prev.map((o) => (o.id === id ? { ...o, priority } : o)),
    );

  const insertVariable = (
    target: "outline" | "dev",
    key: string,
  ) => {
    const token = `{{${key}}}`;
    const setter = target === "outline" ? setOutlinePrompt : setDevPrompt;
    const value = target === "outline" ? outlinePrompt : devPrompt;
    const el = (target === "outline" ? outlineRef : devRef).current;
    if (!el) return setter(`${value}${token}`);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    setter(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + token.length;
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Roteiro"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Roteiro" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1200px] space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <ChannelAvatar channel={channel} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" />
                  Roteiro · Etapa 5 do pipeline
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Direção de roteiro
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Defina a estrutura, o narrador e as instruções que orientam o
                  outline e o roteiro final.
                </p>
              </div>
            </div>

            {/* Estrutura */}
            <Section
              icon={<Layers className="h-4 w-4" />}
              title="Estrutura"
              description="Tamanho do roteiro e quantidade de blocos."
            >
              <FieldWrap
                label="Tamanho em caracteres"
                description="Estimativas usam ~5,5 caracteres por palavra e 155 palavras por minuto."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberInput
                    label="Mínimo"
                    value={lenMin}
                    onChange={(v) => setLenMin(Math.min(v, lenMax))}
                    step={500}
                    suffix="caract."
                  />
                  <NumberInput
                    label="Máximo"
                    value={lenMax}
                    onChange={(v) => setLenMax(Math.max(v, lenMin))}
                    step={500}
                    suffix="caract."
                  />
                </div>
                <div className="mt-3 space-y-2">
                  <Slider
                    value={[lenMin, lenMax]}
                    min={1000}
                    max={25000}
                    step={500}
                    onValueChange={([a, b]) => {
                      setLenMin(a);
                      setLenMax(b);
                    }}
                  />
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>1 mil</span>
                    <span>25 mil</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <ConversionCard
                    icon="Ab"
                    title="Aprox. em palavras"
                    value={`${formatCompact(wordsMin)} – ${formatCompact(wordsMax)}`}
                  />
                  <ConversionCard
                    icon="⏱"
                    title="Aprox. em minutos"
                    value={`${minutesMin} – ${minutesMax} min`}
                  />
                </div>
              </FieldWrap>

              <Separator />

              <FieldWrap
                label="Blocos do roteiro"
                description="Cada bloco corresponde a uma seção com objetivo próprio."
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberInput
                    label="Mínimo"
                    value={blocksMin}
                    onChange={(v) => setBlocksMin(Math.min(v, blocksMax))}
                    min={2}
                    max={20}
                  />
                  <NumberInput
                    label="Máximo"
                    value={blocksMax}
                    onChange={(v) => setBlocksMax(Math.max(v, blocksMin))}
                    min={2}
                    max={20}
                  />
                </div>
                <BlocksPreview count={blocksMax} minCount={blocksMin} />
              </FieldWrap>
            </Section>

            {/* Narrador */}
            <Section
              icon={<Mic className="h-4 w-4" />}
              title="Narrador"
              description="Voz, persona e regras estilísticas."
            >
              <div className="grid gap-6 md:grid-cols-2">
                <FieldWrap label="Nome do narrador">
                  <Input
                    value={narratorName}
                    onChange={(e) => setNarratorName(e.target.value)}
                  />
                </FieldWrap>
                <FieldWrap label="Ponto de vista">
                  <Select value={pov} onValueChange={setPov}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {POV_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
              </div>

              <FieldWrap
                label="Persona"
                description="Como a voz do canal se comporta em qualquer roteiro."
              >
                <Textarea
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  className="min-h-[100px]"
                />
              </FieldWrap>

              <FieldWrap
                label="Tom"
                description="Selecione um ou mais tons combináveis."
              >
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTIONS.map((t) => {
                    const active = tones.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toneToggle(t.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </FieldWrap>

              <div className="grid gap-6 md:grid-cols-2">
                <FieldWrap label="Nível de formalidade">
                  <div className="space-y-2">
                    <Slider
                      value={formality}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={(v) => setFormality([v[0]] as [number])}
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Muito informal</span>
                      <span className="font-medium text-foreground">
                        {formality[0]}
                      </span>
                      <span>Muito formal</span>
                    </div>
                  </div>
                </FieldWrap>
                <FieldWrap label="Vocabulário">
                  <Select value={vocab} onValueChange={setVocab}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VOCAB_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrap>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <TagField
                  label="Características obrigatórias"
                  description="Sempre presentes na narração."
                  values={mustHave}
                  onChange={setMustHave}
                  tone="primary"
                />
                <TagField
                  label="Expressões proibidas"
                  description="Nunca podem aparecer no roteiro."
                  values={forbidden}
                  onChange={setForbidden}
                  tone="destructive"
                  icon={<Ban className="h-3 w-3" />}
                />
              </div>

              <FieldWrap
                label="Exemplo de fala"
                description="Frase típica que representa a voz do canal."
              >
                <Textarea
                  value={sample}
                  onChange={(e) => setSample(e.target.value)}
                  className="min-h-[80px] italic"
                />
              </FieldWrap>
            </Section>

            {/* Idioma */}
            <Section
              icon={<Languages className="h-4 w-4" />}
              title="Idioma e estilo"
              description="Idioma principal e variante regional do roteiro."
            >
              <FieldWrap label="Idioma">
                <LanguageCombobox value={language} onChange={setLanguage} />
              </FieldWrap>
            </Section>

            {/* CTAs */}
            <Section
              icon={<Megaphone className="h-4 w-4" />}
              title="Chamadas para ação"
              description="Os CTAs entram nos momentos configurados durante o desenvolvimento do roteiro."
              action={
                <Button variant="outline" size="sm" onClick={addCta}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo CTA
                </Button>
              }
            >
              <div className="space-y-3">
                {ctas.map((cta, i) => (
                  <CtaRow
                    key={cta.id}
                    cta={cta}
                    index={i}
                    dragging={dragCta === i}
                    onDragStart={() => onCtaDragStart(i)}
                    onDragOver={(e) => onCtaDragOver(e, i)}
                    onDragEnd={() => setDragCta(null)}
                    onPatch={(p) => patchCta(cta.id, p)}
                    onRemove={() => removeCta(cta.id)}
                    onDuplicate={() => duplicateCta(cta.id)}
                  />
                ))}
                {ctas.length === 0 && (
                  <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                    Nenhum CTA configurado.
                  </div>
                )}
              </div>
            </Section>

            {/* Aberturas */}
            <Section
              icon={<Sparkles className="h-4 w-4" />}
              title="Intros e aberturas"
              description="Modelos de abertura disponíveis. Selecione várias e defina prioridade."
            >
              <div className="grid gap-3 md:grid-cols-2">
                {OPENINGS.map((o) => {
                  const chosen = openings.find((x) => x.id === o.id);
                  return (
                    <div
                      key={o.id}
                      className={cn(
                        "rounded-lg border p-4 transition-colors",
                        chosen
                          ? "border-primary bg-primary/5"
                          : "border-border bg-secondary/30 hover:border-border/80",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                            {o.type} · {o.duration}
                          </div>
                          <div className="text-sm font-semibold">{o.name}</div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {o.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleOpening(o.id)}
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                            chosen
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-transparent text-transparent hover:border-primary/50",
                          )}
                          aria-label="Selecionar"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-3 rounded-md border border-border/60 bg-background/60 p-2 text-xs italic text-muted-foreground">
                        “{o.example}”
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {o.tags.map((t) => (
                          <Badge
                            key={t}
                            variant="secondary"
                            className="bg-secondary/70 text-[10px] text-muted-foreground"
                          >
                            {t}
                          </Badge>
                        ))}
                        {chosen && (
                          <div className="ml-auto flex items-center gap-1.5 text-[10px] text-primary">
                            <Star className="h-3 w-3" fill="currentColor" />
                            Prioridade
                            <Select
                              value={String(chosen.priority)}
                              onValueChange={(v) =>
                                setOpeningPriority(o.id, Number(v))
                              }
                            >
                              <SelectTrigger className="h-6 w-14 text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <SelectItem key={n} value={String(n)}>
                                    {n}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* Prompt outline */}
            <Section
              icon={<ListChecks className="h-4 w-4" />}
              title="Prompt do outline"
              description="Instruções que geram a estrutura de blocos do vídeo."
              badge={{ label: "Etapa 1 — Estrutura", tone: "primary" }}
            >
              <PromptEditor
                filename="prompt.outline.md"
                accent="primary"
                value={outlinePrompt}
                onChange={setOutlinePrompt}
                refEl={outlineRef}
                expanded={outlineExpanded}
                onToggleExpanded={() => setOutlineExpanded((v) => !v)}
                onInsertVariable={(k) => insertVariable("outline", k)}
                onRestore={() => setOutlinePrompt(DEFAULT_OUTLINE_PROMPT)}
                variables={OUTLINE_VARIABLES}
              />
            </Section>

            {/* Prompt dev */}
            <Section
              icon={<Wand2 className="h-4 w-4" />}
              title="Prompt de desenvolvimento"
              description="Transforma o outline aprovado no roteiro final."
              badge={{ label: "Etapa 2 — Desenvolvimento", tone: "accent" }}
            >
              <PromptEditor
                filename="prompt.development.md"
                accent="accent"
                value={devPrompt}
                onChange={setDevPrompt}
                refEl={devRef}
                expanded={devExpanded}
                onToggleExpanded={() => setDevExpanded((v) => !v)}
                onInsertVariable={(k) => insertVariable("dev", k)}
                onRestore={() => setDevPrompt(DEFAULT_DEV_PROMPT)}
                variables={DEV_VARIABLES}
              />
            </Section>

            <Separator />
            <div className="flex items-center justify-between gap-3 pb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                As alterações se aplicam ao próximo roteiro gerado.
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

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div>
      <Label className="mb-1.5 block text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="flex overflow-hidden rounded-md border border-border bg-input/40 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full bg-transparent px-3 py-2 text-sm outline-none"
        />
        {suffix && (
          <span className="flex items-center bg-secondary/50 px-3 text-[11px] text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function ConversionCard({
  icon,
  title,
  value,
}: {
  icon: string;
  title: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 p-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
        {icon}
      </div>
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {title}
        </div>
        <div className="text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function BlocksPreview({
  count,
  minCount,
}: {
  count: number;
  minCount: number;
}) {
  const capped = Math.min(count, 20);
  return (
    <div className="rounded-lg border border-border bg-secondary/20 p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Estrutura visual (até {capped} blocos)</span>
        <span>Mínimo: {minCount}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: capped }).map((_, i) => {
          const optional = i + 1 > minCount;
          return (
            <div
              key={i}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-md border py-2 text-[10px]",
                optional
                  ? "border-dashed border-border/60 bg-transparent text-muted-foreground/70"
                  : "border-primary/40 bg-primary/10 text-primary",
              )}
            >
              <span className="text-[9px] uppercase tracking-wider">Bloco</span>
              <span className="text-xs font-bold">{i + 1}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LanguageCombobox({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = LANGUAGES.find((l) => l.value === value);
  const filtered = useMemo(
    () =>
      LANGUAGES.filter((l) =>
        `${l.label} ${l.region} ${l.value}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [query],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between font-normal"
        >
          <span className="flex items-center gap-2">
            {selected ? (
              <>
                <span className="text-lg">{selected.flag}</span>
                <span>{selected.label}</span>
                <span className="text-xs text-muted-foreground">
                  · {selected.region}
                </span>
                <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                  {selected.value}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Selecione um idioma</span>
            )}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[--radix-popover-trigger-width] p-0"
      >
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar idioma..."
            className="h-8"
          />
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {filtered.map((l) => (
            <button
              key={l.value}
              type="button"
              onClick={() => {
                onChange(l.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-secondary",
                l.value === value && "bg-secondary/70",
              )}
            >
              <span className="text-lg">{l.flag}</span>
              <span className="flex-1">
                {l.label}{" "}
                <span className="text-xs text-muted-foreground">
                  · {l.region}
                </span>
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {l.value}
              </span>
              {l.value === value && (
                <Check className="h-3.5 w-3.5 text-primary" />
              )}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-3 text-center text-xs text-muted-foreground">
              Nenhum idioma encontrado.
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CtaRow({
  cta,
  index,
  dragging,
  onDragStart,
  onDragOver,
  onDragEnd,
  onPatch,
  onRemove,
  onDuplicate,
}: {
  cta: Cta;
  index: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onPatch: (p: Partial<Cta>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className={cn(
        "rounded-lg border p-4 transition-colors",
        dragging
          ? "border-primary bg-primary/5"
          : "border-border bg-secondary/30",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center gap-1 pt-1">
          <GripVertical className="h-4 w-4 cursor-move text-muted-foreground" />
          <span className="flex h-5 w-5 items-center justify-center rounded bg-secondary text-[10px] text-muted-foreground">
            {index + 1}
          </span>
        </div>

        <div className="grid flex-1 gap-3 md:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Tipo
            </Label>
            <Select
              value={cta.type}
              onValueChange={(v) => onPatch({ type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CTA_TYPES.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Nome interno
            </Label>
            <Input
              value={cta.name}
              onChange={(e) => onPatch({ name: e.target.value })}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Momento
            </Label>
            <Select
              value={cta.moment}
              onValueChange={(v) => onPatch({ moment: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CTA_MOMENTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {cta.moment === "custom" ? (
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                Percentual
              </Label>
              <div className="flex overflow-hidden rounded-md border border-border bg-input/40">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={cta.customPercent}
                  onChange={(e) =>
                    onPatch({ customPercent: Number(e.target.value) })
                  }
                  className="w-full bg-transparent px-3 py-2 text-sm outline-none"
                />
                <span className="flex items-center bg-secondary/50 px-3 text-xs text-muted-foreground">
                  %
                </span>
              </div>
            </div>
          ) : (
            <div>
              <Label className="mb-1.5 block text-xs text-muted-foreground">
                Obrigatório
              </Label>
              <div className="flex h-10 items-center gap-2 rounded-md border border-border bg-secondary/40 px-3">
                <Switch
                  checked={cta.required}
                  onCheckedChange={(v) => onPatch({ required: v })}
                />
                <span className="text-xs text-muted-foreground">
                  Sempre incluir no roteiro
                </span>
              </div>
            </div>
          )}
          <div className="md:col-span-2">
            <Label className="mb-1.5 block text-xs text-muted-foreground">
              Modelo (template)
            </Label>
            <Textarea
              value={cta.template}
              onChange={(e) => onPatch({ template: e.target.value })}
              className="min-h-[70px]"
              placeholder="Ex.: Se você gostou, se inscreve no canal..."
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
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
          accent === "accent"
            ? "border-warning/40"
            : "border-primary/30",
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
    </FieldWrap>
  );
}

function formatCompact(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")} mil`;
  return String(n);
}
