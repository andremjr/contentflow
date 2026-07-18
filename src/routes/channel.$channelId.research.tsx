import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState, useRef, useEffect, type KeyboardEvent } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  Check,
  ChevronsUpDown,
  Search as SearchIcon,
  Ban,
  CalendarIcon,
  Eye,
  MessageSquare,
  Users,
  Link as LinkIcon,
  Play,
  Save,
  RotateCcw,
  Info,
  Sparkles,
  Tag,
  Timer,
  BarChart3,
  Youtube,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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

export const Route = createFileRoute("/channel/$channelId/research")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch
      ? `Pesquisa — ${ch.name} · ContentFlow OS`
      : "Pesquisa — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Configure filtros de pesquisa de vídeos e canais de referência para alimentar o pipeline.",
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
  component: ResearchScreen,
});

// ---------- mocks ----------

const LANGUAGES = [
  { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
  { code: "en-US", name: "Inglês (EUA)", flag: "🇺🇸" },
  { code: "es-ES", name: "Espanhol (Espanha)", flag: "🇪🇸" },
  { code: "es-MX", name: "Espanhol (México)", flag: "🇲🇽" },
  { code: "fr-FR", name: "Francês", flag: "🇫🇷" },
  { code: "de-DE", name: "Alemão", flag: "🇩🇪" },
  { code: "it-IT", name: "Italiano", flag: "🇮🇹" },
  { code: "ja-JP", name: "Japonês", flag: "🇯🇵" },
];

const KEYWORD_SUGGESTIONS = [
  "inteligência artificial",
  "produtividade",
  "história do brasil",
  "curiosidades",
  "documentário",
  "top 10",
  "análise",
  "tutorial",
  "reação",
  "explicado",
];

const DATE_PRESETS = [
  { id: "24h", label: "Últimas 24 horas", days: 1 },
  { id: "7d", label: "7 dias", days: 7 },
  { id: "30d", label: "30 dias", days: 30 },
  { id: "90d", label: "90 dias", days: 90 },
  { id: "1y", label: "Último ano", days: 365 },
  { id: "any", label: "Qualquer data", days: null as number | null },
];

const VIEW_PRESETS = [
  { label: "10 mil+", min: 10_000, max: null as number | null },
  { label: "100 mil+", min: 100_000, max: null },
  { label: "500 mil+", min: 500_000, max: null },
  { label: "1 mi+", min: 1_000_000, max: null },
  { label: "10 mi+", min: 10_000_000, max: null },
];

const CHANNEL_SIZE_PRESETS = [
  { id: "small", label: "Pequeno", min: 1_000, max: 100_000 },
  { id: "medium", label: "Médio", min: 100_000, max: 1_000_000 },
  { id: "large", label: "Grande", min: 1_000_000, max: 100_000_000 },
  { id: "custom", label: "Personalizado", min: 0, max: 100_000_000 },
];

const CHANNEL_SUGGESTIONS = [
  {
    id: "ch-nerdo",
    name: "Nerdologia",
    handle: "@nerdologia",
    subs: 3_400_000,
    color: "from-blue-500 to-indigo-600",
  },
  {
    id: "ch-kurzg",
    name: "Kurzgesagt",
    handle: "@kurzgesagt",
    subs: 22_500_000,
    color: "from-teal-500 to-cyan-600",
  },
  {
    id: "ch-mrwhy",
    name: "Manual do Mundo",
    handle: "@manualdomundo",
    subs: 18_700_000,
    color: "from-amber-500 to-orange-600",
  },
  {
    id: "ch-hist",
    name: "Foca na História",
    handle: "@focanahistoria",
    subs: 620_000,
    color: "from-rose-500 to-pink-600",
  },
];

// ---------- helpers ----------

function formatCompact(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} mi`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)} mil`;
  return String(n);
}

// ---------- component ----------

type SelectedChannel = (typeof CHANNEL_SUGGESTIONS)[number];

function ResearchScreen() {
  const { channel } = Route.useLoaderData();

  // Keywords
  const [keywords, setKeywords] = useState<string[]>(["inteligência artificial"]);
  const [negatives, setNegatives] = useState<string[]>(["shorts"]);

  // Language
  const [language, setLanguage] = useState("pt-BR");

  // Duration
  const [durationUnit, setDurationUnit] = useState<"min" | "sec">("min");
  const [durationRange, setDurationRange] = useState<[number, number]>([5, 20]);

  // Date
  const [datePreset, setDatePreset] = useState<string>("30d");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d;
  });
  const [dateTo, setDateTo] = useState<Date | undefined>(new Date());

  // Views
  const [viewMin, setViewMin] = useState<number | null>(100_000);
  const [viewMax, setViewMax] = useState<number | null>(null);

  // Comments
  const [commentMin, setCommentMin] = useState<number | null>(50);
  const [commentMax, setCommentMax] = useState<number | null>(null);

  // Channel size
  const [channelSizePreset, setChannelSizePreset] = useState<string>("medium");
  const [channelSizeRange, setChannelSizeRange] = useState<[number, number]>([
    100_000, 1_000_000,
  ]);

  // Reference channels
  const [refChannels, setRefChannels] = useState<SelectedChannel[]>([
    CHANNEL_SUGGESTIONS[0],
  ]);

  const activeLang = LANGUAGES.find((l) => l.code === language);

  const applyDatePreset = (id: string) => {
    setDatePreset(id);
    const p = DATE_PRESETS.find((d) => d.id === id);
    if (!p) return;
    if (p.days == null) {
      setDateFrom(undefined);
      setDateTo(undefined);
    } else {
      const to = new Date();
      const from = new Date();
      from.setDate(from.getDate() - p.days);
      setDateFrom(from);
      setDateTo(to);
    }
  };

  const applyChannelSize = (id: string) => {
    setChannelSizePreset(id);
    const p = CHANNEL_SIZE_PRESETS.find((x) => x.id === id);
    if (p && id !== "custom") setChannelSizeRange([p.min, p.max]);
  };

  const addRefChannel = (c: SelectedChannel) => {
    if (refChannels.some((r) => r.id === c.id)) return;
    setRefChannels((prev) => [...prev, c]);
  };

  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Pesquisa"
          subtitle={`Nova pesquisa · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Pesquisa" },
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
                    <SearchIcon className="h-3.5 w-3.5" />
                    Pesquisa · Etapa 1 do pipeline
                  </div>
                  <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                    Nova pesquisa de referências
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Defina critérios para descobrir vídeos e canais alinhados ao {channel.name}.
                  </p>
                </div>
              </div>

              {/* Termos da pesquisa */}
              <Section
                icon={<Tag className="h-4 w-4" />}
                title="Termos da pesquisa"
                description="Palavras-chave, exclusões e idioma alvo."
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <TagField
                    label="Palavras-chave"
                    description="Escreva um termo e pressione Enter para adicionar."
                    values={keywords}
                    onChange={setKeywords}
                    suggestions={KEYWORD_SUGGESTIONS}
                    tone="primary"
                  />
                  <TagField
                    label="Palavras negativas"
                    description="Termos que devem ser excluídos dos resultados."
                    values={negatives}
                    onChange={setNegatives}
                    tone="destructive"
                    icon={<Ban className="h-3 w-3" />}
                  />
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap
                    label="Idioma principal"
                    description="Apenas um idioma pode ser selecionado."
                    tooltip="A pesquisa usa este idioma para relevância semântica."
                  >
                    <LanguageSelect value={language} onChange={setLanguage} />
                  </FieldWrap>
                </div>
              </Section>

              {/* Características */}
              <Section
                icon={<Timer className="h-4 w-4" />}
                title="Características dos vídeos"
                description="Duração e janela de publicação."
              >
                <FieldWrap
                  label="Duração"
                  description="Intervalo entre mínima e máxima."
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <NumberBox
                        aria="Duração mínima"
                        value={durationRange[0]}
                        onChange={(v) =>
                          setDurationRange([v, Math.max(v, durationRange[1])])
                        }
                        min={0}
                        max={120}
                      />
                      <span className="text-sm text-muted-foreground">até</span>
                      <NumberBox
                        aria="Duração máxima"
                        value={durationRange[1]}
                        onChange={(v) =>
                          setDurationRange([Math.min(durationRange[0], v), v])
                        }
                        min={0}
                        max={120}
                      />
                      <Select
                        value={durationUnit}
                        onValueChange={(v) => setDurationUnit(v as "min" | "sec")}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="min">Minutos</SelectItem>
                          <SelectItem value="sec">Segundos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Slider
                      value={durationRange}
                      min={0}
                      max={120}
                      step={1}
                      onValueChange={(v) =>
                        setDurationRange([v[0], v[1]] as [number, number])
                      }
                      className="pt-1"
                    />
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>0 {durationUnit}</span>
                      <span>120 {durationUnit}</span>
                    </div>
                  </div>
                </FieldWrap>

                <FieldWrap
                  label="Data de postagem"
                  description="Selecione um preset ou informe um intervalo personalizado."
                >
                  <div className="flex flex-wrap gap-2">
                    {DATE_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyDatePreset(p.id)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs transition-colors",
                          datePreset === p.id
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-3 w-full justify-start text-left font-normal"
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateFrom && dateTo ? (
                          <>
                            {format(dateFrom, "d MMM yyyy", { locale: ptBR })} –{" "}
                            {format(dateTo, "d MMM yyyy", { locale: ptBR })}
                          </>
                        ) : (
                          <span className="text-muted-foreground">
                            Qualquer data
                          </span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0 pointer-events-auto"
                      align="start"
                    >
                      <Calendar
                        mode="range"
                        selected={{ from: dateFrom, to: dateTo }}
                        onSelect={(r) => {
                          setDateFrom(r?.from);
                          setDateTo(r?.to);
                          setDatePreset("custom");
                        }}
                        numberOfMonths={2}
                        locale={ptBR}
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </FieldWrap>
              </Section>

              {/* Métricas */}
              <Section
                icon={<BarChart3 className="h-4 w-4" />}
                title="Métricas de desempenho"
                description="Visualizações, comentários e tamanho do canal."
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap
                    label="Quantidade de visualizações"
                    description="Formato compacto: 10 mil, 100 mil, 1 mi."
                    icon={<Eye className="h-3.5 w-3.5" />}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <NumberBox
                        aria="Views mínimas"
                        value={viewMin ?? 0}
                        onChange={(v) => setViewMin(v || null)}
                        min={0}
                        max={1_000_000_000}
                        step={1000}
                        display={viewMin != null ? formatCompact(viewMin) : ""}
                      />
                      <span className="text-sm text-muted-foreground">até</span>
                      <NumberBox
                        aria="Views máximas"
                        value={viewMax ?? 0}
                        onChange={(v) => setViewMax(v || null)}
                        min={0}
                        max={1_000_000_000}
                        step={1000}
                        placeholder="Sem limite"
                        display={viewMax != null ? formatCompact(viewMax) : ""}
                      />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {VIEW_PRESETS.map((p) => (
                        <Chip
                          key={p.label}
                          active={viewMin === p.min && viewMax === p.max}
                          onClick={() => {
                            setViewMin(p.min);
                            setViewMax(p.max);
                          }}
                        >
                          {p.label}
                        </Chip>
                      ))}
                    </div>
                  </FieldWrap>

                  <FieldWrap
                    label="Quantidade de comentários"
                    description="Intervalo mínimo e máximo."
                    icon={<MessageSquare className="h-3.5 w-3.5" />}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <NumberBox
                        aria="Comentários mínimos"
                        value={commentMin ?? 0}
                        onChange={(v) => setCommentMin(v || null)}
                        min={0}
                        max={1_000_000}
                        step={10}
                      />
                      <span className="text-sm text-muted-foreground">até</span>
                      <NumberBox
                        aria="Comentários máximos"
                        value={commentMax ?? 0}
                        onChange={(v) => setCommentMax(v || null)}
                        min={0}
                        max={1_000_000}
                        step={10}
                        placeholder="Sem limite"
                      />
                    </div>
                  </FieldWrap>
                </div>

                <FieldWrap
                  label="Tamanho do canal"
                  description="Faixa de inscritos dos canais publicando os vídeos."
                  icon={<Users className="h-3.5 w-3.5" />}
                >
                  <div className="flex flex-wrap gap-2">
                    {CHANNEL_SIZE_PRESETS.map((p) => (
                      <Chip
                        key={p.id}
                        active={channelSizePreset === p.id}
                        onClick={() => applyChannelSize(p.id)}
                      >
                        {p.label}
                        {p.id !== "custom" && (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {formatCompact(p.min)}–{formatCompact(p.max)}
                          </span>
                        )}
                      </Chip>
                    ))}
                  </div>
                  <div className="mt-4">
                    <Slider
                      value={channelSizeRange}
                      min={0}
                      max={20_000_000}
                      step={1000}
                      onValueChange={(v) => {
                        setChannelSizeRange([v[0], v[1]] as [number, number]);
                        setChannelSizePreset("custom");
                      }}
                    />
                    <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                      <span>{formatCompact(channelSizeRange[0])} inscritos</span>
                      <span>{formatCompact(channelSizeRange[1])} inscritos</span>
                    </div>
                  </div>
                </FieldWrap>
              </Section>

              {/* Canais de referência */}
              <Section
                icon={<Youtube className="h-4 w-4" />}
                title="Canais de referência"
                description="Encontre vídeos com padrão semelhante a canais que você admira."
              >
                <ReferenceChannelPicker
                  onPick={addRefChannel}
                  excluded={refChannels.map((c) => c.id)}
                />
                {refChannels.length > 0 && (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {refChannels.map((c) => (
                      <ReferenceChannelCard
                        key={c.id}
                        channel={c}
                        onRemove={() =>
                          setRefChannels((prev) =>
                            prev.filter((x) => x.id !== c.id),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </Section>

              <div className="h-4" />
            </div>


          </div>
        </div>
      </AppShell>
    </TooltipProvider>
  );
}

// ---------- section helpers ----------

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

function FieldWrap({
  label,
  description,
  tooltip,
  icon,
  children,
}: {
  label: string;
  description?: string;
  tooltip?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <Label className="text-sm font-medium">{label}</Label>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground/70" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="max-w-[60%] text-right text-xs">{children}</dd>
    </div>
  );
}

function Empty() {
  return <span className="italic text-muted-foreground/70">nenhum</span>;
}

function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-primary bg-primary/15 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

// ---------- inputs ----------

function NumberBox({
  value,
  onChange,
  aria,
  min = 0,
  max = 999999999,
  step = 1,
  placeholder,
  display,
}: {
  value: number;
  onChange: (n: number) => void;
  aria: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  display?: string;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative">
      <Input
        aria-label={aria}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value === 0 && placeholder ? "" : value}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32"
      />
      {display && !focused && (
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-muted-foreground">
          {display}
        </div>
      )}
    </div>
  );
}

function TagField({
  label,
  description,
  values,
  onChange,
  suggestions = [],
  tone = "primary",
  icon,
}: {
  label: string;
  description?: string;
  values: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
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

  const filtered = suggestions.filter(
    (s) =>
      !values.includes(s) &&
      (!draft || s.toLowerCase().includes(draft.toLowerCase())),
  );

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
    </FieldWrap>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = LANGUAGES.find((l) => l.code === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {active ? (
            <span className="flex items-center gap-2">
              <span className="text-base leading-none">{active.flag}</span>
              <span>{active.name}</span>
              <span className="text-xs text-muted-foreground">
                {active.code}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Selecione um idioma</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder="Buscar idioma..." />
          <CommandList>
            <CommandEmpty>Nenhum idioma encontrado.</CommandEmpty>
            <CommandGroup>
              {LANGUAGES.map((l) => (
                <CommandItem
                  key={l.code}
                  value={`${l.name} ${l.code}`}
                  onSelect={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                >
                  <span className="mr-2 text-base leading-none">{l.flag}</span>
                  <span className="flex-1">{l.name}</span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    {l.code}
                  </span>
                  <Check
                    className={cn(
                      "h-4 w-4",
                      value === l.code ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ReferenceChannelPicker({
  onPick,
  excluded,
}: {
  onPick: (c: SelectedChannel) => void;
  excluded: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const results = CHANNEL_SUGGESTIONS.filter(
    (c) =>
      !excluded.includes(c.id) &&
      (!query ||
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.handle.toLowerCase().includes(query.toLowerCase())),
  );

  useEffect(() => {
    setOpen(query.length > 0);
  }, [query]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cole a URL ou busque um canal do YouTube"
            className="pl-9"
          />
        </div>
        <Button variant="secondary" disabled={!query}>
          Adicionar
        </Button>
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
          {results.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c);
                setQuery("");
              }}
              className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-secondary"
            >
              <div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white",
                  c.color,
                )}
              >
                {c.name.charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {c.handle} · {formatCompact(c.subs)} inscritos
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReferenceChannelCard({
  channel,
  onRemove,
}: {
  channel: SelectedChannel;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-secondary/30 p-3">
      <div
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white",
          channel.color,
        )}
      >
        {channel.name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{channel.name}</div>
        <div className="truncate text-xs text-muted-foreground">
          {channel.handle}
        </div>
        <div className="text-xs text-muted-foreground">
          {formatCompact(channel.subs)} inscritos
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={`Remover ${channel.name}`}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
