import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect, type KeyboardEvent } from "react";
import {
  CalendarClock,
  Link2,
  FileText,
  Youtube,
  Plus,
  Trash2,
  GripVertical,
  Check,
  AlertCircle,
  Globe,
  Clock,
  Send,
  Save,
  Info,
  Maximize2,
  Minimize2,
  ExternalLink,
  ThumbsUp,
  MessageSquare,
  Share2,
  Bookmark,
  Sparkles,
  Pin,
  ChevronDown,
  ChevronRight,
  Eye,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
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
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/publish")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    return {
      meta: [
        {
          title: ch
            ? `Publicação — ${ch.name} · ContentFlow OS`
            : "Publicação — ContentFlow OS",
        },
        {
          name: "description",
          content:
            "Agenda de publicação, links, metadados e instruções de descrição do canal.",
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
  component: PublishScreen,
});

// ---------- constants ----------

const WEEKDAYS = [
  { id: 0, short: "D", label: "Domingo" },
  { id: 1, short: "S", label: "Segunda" },
  { id: 2, short: "T", label: "Terça" },
  { id: 3, short: "Q", label: "Quarta" },
  { id: 4, short: "Q", label: "Quinta" },
  { id: 5, short: "S", label: "Sexta" },
  { id: 6, short: "S", label: "Sábado" },
];

const TIMEZONES = [
  { value: "America/Sao_Paulo", label: "São Paulo (GMT-3)" },
  { value: "America/New_York", label: "Nova York (GMT-5)" },
  { value: "Europe/Lisbon", label: "Lisboa (GMT+0)" },
  { value: "Europe/London", label: "Londres (GMT+0)" },
  { value: "Asia/Tokyo", label: "Tóquio (GMT+9)" },
];

const LINK_CATEGORIES = [
  { value: "social", label: "Rede social" },
  { value: "product", label: "Produto" },
  { value: "affiliate", label: "Afiliado" },
  { value: "community", label: "Comunidade" },
  { value: "download", label: "Download" },
  { value: "sponsor", label: "Patrocinador" },
  { value: "other", label: "Outro" },
];

type ChannelLink = {
  id: string;
  name: string;
  url: string;
  category: string;
  inDescription: boolean;
  inPinnedComment: boolean;
};

const INITIAL_LINKS: ChannelLink[] = [
  {
    id: "l1",
    name: "Instagram do canal",
    url: "https://instagram.com/canal",
    category: "social",
    inDescription: true,
    inPinnedComment: true,
  },
  {
    id: "l2",
    name: "Comunidade no Discord",
    url: "https://discord.gg/exemplo",
    category: "community",
    inDescription: true,
    inPinnedComment: false,
  },
  {
    id: "l3",
    name: "Newsletter semanal",
    url: "https://newsletter.exemplo.com",
    category: "product",
    inDescription: true,
    inPinnedComment: false,
  },
];

const PROMPT_VARIABLES = [
  { key: "{{titulo}}", desc: "Título final do vídeo" },
  { key: "{{canal}}", desc: "Nome do canal" },
  { key: "{{hashtags}}", desc: "Hashtags sugeridas" },
  { key: "{{capitulos}}", desc: "Lista de capítulos gerada" },
  { key: "{{links}}", desc: "Links marcados para descrição" },
  { key: "{{creditos}}", desc: "Créditos padrão do canal" },
  { key: "{{data_publicacao}}", desc: "Data prevista" },
];

const PROMPT_SECTIONS = [
  { id: "description", label: "Descrição", icon: FileText },
  { id: "pinned", label: "Comentário fixado", icon: Pin },
  { id: "hashtags", label: "Hashtags", icon: Sparkles },
  { id: "chapters", label: "Capítulos", icon: Clock },
  { id: "credits", label: "Créditos", icon: Info },
  { id: "links", label: "Links", icon: Link2 },
  { id: "warnings", label: "Avisos", icon: AlertCircle },
  { id: "formatting", label: "Formatação", icon: Eye },
];

const DEFAULT_PROMPT = `Escreva uma descrição envolvente para {{titulo}} do canal {{canal}}.

# Descrição
- Primeiras 2 linhas devem prender o espectador
- Contextualize o problema abordado

# Capítulos
{{capitulos}}

# Hashtags
{{hashtags}}

# Links
{{links}}

# Créditos
{{creditos}}

# Avisos
- Conteúdo educativo, não financeiro
`;

// ---------- component ----------

function PublishScreen() {
  const { channel } = Route.useLoaderData();

  // Schedule
  const [weekdays, setWeekdays] = useState<number[]>([2, 5]);
  const [time, setTime] = useState("18:00");
  const [altTimes, setAltTimes] = useState<string[]>(["12:00"]);
  const [timezone, setTimezone] = useState("America/Sao_Paulo");
  const [weeklyFreq, setWeeklyFreq] = useState("2");
  const [minInterval, setMinInterval] = useState("48");
  const [specificDates, setSpecificDates] = useState<Date[]>([]);

  // Links
  const [links, setLinks] = useState<ChannelLink[]>(INITIAL_LINKS);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  // Prompt
  const [activePromptSection, setActivePromptSection] = useState("description");
  const [promptValues, setPromptValues] = useState<Record<string, string>>({
    description: DEFAULT_PROMPT,
    pinned: "Escreva um comentário fixado curto reforçando a CTA principal do vídeo e convidando para o {{links}}.",
    hashtags: "Sugira 5 a 8 hashtags relevantes para {{titulo}}, misturando termos amplos e nicho.",
    chapters: "Extraia capítulos do roteiro com timestamps no formato 00:00 — Título curto.",
    credits: "Gere bloco de créditos padrão do canal {{canal}} com equipe, música e ferramentas.",
    links: "Priorize os links marcados como obrigatórios na descrição. Use o formato Nome → URL.",
    warnings: "Adicione avisos legais quando o tema envolver finanças, saúde ou opinião polêmica.",
    formatting: "Use quebras de linha para respirar. Emojis moderados. Sem caixa alta.",
  });
  const [promptExpanded, setPromptExpanded] = useState(false);

  const toggleWeekday = (id: number) =>
    setWeekdays((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort(),
    );

  const addAltTime = () => setAltTimes((prev) => [...prev, "12:00"]);
  const patchAltTime = (i: number, v: string) =>
    setAltTimes((prev) => prev.map((x, idx) => (idx === i ? v : x)));
  const removeAltTime = (i: number) =>
    setAltTimes((prev) => prev.filter((_, idx) => idx !== i));

  // Links helpers
  const addLink = () =>
    setLinks((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: "",
        url: "",
        category: "other",
        inDescription: true,
        inPinnedComment: false,
      },
    ]);
  const patchLink = (id: string, p: Partial<ChannelLink>) =>
    setLinks((prev) => prev.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const removeLink = (id: string) =>
    setLinks((prev) => prev.filter((l) => l.id !== id));

  const onDragStart = (id: string) => setDraggingId(id);
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDropOn = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    setLinks((prev) => {
      const from = prev.findIndex((l) => l.id === draggingId);
      const to = prev.findIndex((l) => l.id === targetId);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDraggingId(null);
  };

  // Summary sentence
  const summarySentence = useMemo(() => {
    if (weekdays.length === 0 && specificDates.length === 0)
      return "Nenhuma agenda configurada.";
    const dayNames = weekdays
      .map((d) => WEEKDAYS[d].label.toLowerCase())
      .join(", ");
    const base = weekdays.length
      ? `Publicar toda ${dayNames} às ${time}`
      : `Publicar em ${specificDates.length} data(s) específica(s) às ${time}`;
    return `${base} (${TIMEZONES.find((t) => t.value === timezone)?.label ?? timezone}).`;
  }, [weekdays, time, timezone, specificDates]);

  return (
    <AppShell>
      <TopBar
        title="Publicação"
        subtitle={`Configuração · ${channel.name}`}
        breadcrumbs={[
          { label: "ContentFlow OS" },
          { label: "Canais" },
          { label: channel.name, to: `/channel/${channel.id}` as never },
          { label: "Publicação" },
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1360px] p-6">
          {/* Header */}
          <div className="mb-6 flex items-start gap-4">
            <ChannelAvatar channel={channel} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                <Send className="h-3.5 w-3.5" />
                Publicação · Etapa 9 do pipeline
              </div>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                Agenda e metadados
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Como e quando os vídeos deste canal são publicados no YouTube.
              </p>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
            {/* Main column */}
            <div className="space-y-6">
              {/* Agenda */}
              <Section
                icon={<CalendarClock className="h-4 w-4" />}
                title="Agenda"
                description="Frequência, data e hora de publicação."
              >
                <div>
                  <Label className="mb-2 block text-sm font-medium">
                    Dias da semana
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {WEEKDAYS.map((d) => {
                      const active = weekdays.includes(d.id);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => toggleWeekday(d.id)}
                          className={cn(
                            "flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-semibold transition-colors",
                            active
                              ? "border-primary bg-primary text-primary-foreground shadow-sm"
                              : "border-border bg-secondary/40 text-muted-foreground hover:border-primary/60 hover:text-foreground",
                          )}
                          aria-label={d.label}
                          aria-pressed={active}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    {weekdays.length
                      ? weekdays.map((d) => WEEKDAYS[d].label).join(" · ")
                      : "Nenhum dia selecionado"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">
                      Horário principal
                    </Label>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">
                      Fuso horário
                    </Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger>
                        <Globe className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIMEZONES.map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">
                      Frequência semanal
                    </Label>
                    <Select value={weeklyFreq} onValueChange={setWeeklyFreq}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["1", "2", "3", "4", "5", "6", "7"].map((n) => (
                          <SelectItem key={n} value={n}>
                            {n} vídeo{n === "1" ? "" : "s"} por semana
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Horários alternativos
                      </Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={addAltTime}
                      >
                        <Plus className="h-3 w-3" />
                        Adicionar
                      </Button>
                    </div>
                    {altTimes.length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">
                        Nenhum horário alternativo.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {altTimes.map((t, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                              type="time"
                              value={t}
                              onChange={(e) => patchAltTime(i, e.target.value)}
                              className="h-8"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => removeAltTime(i)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-border bg-secondary/30 p-4">
                    <Label className="mb-1.5 block text-sm font-medium">
                      Intervalo mínimo entre vídeos
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={minInterval}
                        onChange={(e) => setMinInterval(e.target.value)}
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground">
                        horas
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Impede publicações muito próximas mesmo com múltiplos
                      horários ativos.
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="mb-2 block text-sm font-medium">
                    Datas específicas
                  </Label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Adicionar data
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-auto p-0"
                        align="start"
                      >
                        <Calendar
                          mode="multiple"
                          selected={specificDates}
                          onSelect={(v) => setSpecificDates(v ?? [])}
                          locale={ptBR}
                          className={cn("p-3 pointer-events-auto")}
                        />
                      </PopoverContent>
                    </Popover>
                    {specificDates.length === 0 ? (
                      <span className="text-xs text-muted-foreground">
                        Nenhuma data adicionada.
                      </span>
                    ) : (
                      specificDates.map((d) => (
                        <Badge
                          key={d.toISOString()}
                          variant="secondary"
                          className="gap-1 bg-primary/15 text-primary"
                        >
                          {format(d, "dd MMM", { locale: ptBR })}
                          <button
                            type="button"
                            onClick={() =>
                              setSpecificDates((prev) =>
                                prev.filter(
                                  (x) => x.toISOString() !== d.toISOString(),
                                ),
                              )
                            }
                            aria-label="Remover data"
                            className="rounded-full p-0.5 hover:bg-background/40"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                {/* Summary + mini calendar */}
                <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-primary">
                      <Sparkles className="h-3 w-3" /> Resumo
                    </div>
                    <p className="text-sm font-medium">{summarySentence}</p>
                    {altTimes.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Horários alternativos: {altTimes.join(", ")} · Intervalo
                        mínimo {minInterval}h.
                      </p>
                    )}
                  </div>
                  <MonthPreview
                    weekdays={weekdays}
                    specificDates={specificDates}
                  />
                </div>
              </Section>

              {/* Links */}
              <Section
                icon={<Link2 className="h-4 w-4" />}
                title="Links"
                description="Links que aparecem na descrição ou no comentário fixado."
              >
                <div className="space-y-2">
                  {links.map((l) => (
                    <LinkRow
                      key={l.id}
                      link={l}
                      onPatch={(p) => patchLink(l.id, p)}
                      onRemove={() => removeLink(l.id)}
                      onDragStart={() => onDragStart(l.id)}
                      onDragOver={onDragOver}
                      onDrop={() => onDropOn(l.id)}
                      isDragging={draggingId === l.id}
                    />
                  ))}
                  {links.length === 0 && (
                    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                      Nenhum link cadastrado.
                    </div>
                  )}
                </div>
                <Button variant="outline" size="sm" onClick={addLink}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  Novo link
                </Button>
              </Section>

              {/* Metadados */}
              <Section
                icon={<FileText className="h-4 w-4" />}
                title="Metadados"
                description="Configuração geral de metadados aplicada a cada publicação."
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">
                      Visibilidade padrão
                    </Label>
                    <Select defaultValue="public">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Público</SelectItem>
                        <SelectItem value="unlisted">Não listado</SelectItem>
                        <SelectItem value="private">Privado</SelectItem>
                        <SelectItem value="scheduled">Agendado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="mb-1.5 block text-sm font-medium">
                      Categoria do YouTube
                    </Label>
                    <Select defaultValue="education">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="education">Educação</SelectItem>
                        <SelectItem value="entertainment">
                          Entretenimento
                        </SelectItem>
                        <SelectItem value="tech">
                          Ciência e tecnologia
                        </SelectItem>
                        <SelectItem value="howto">
                          Instruções e estilo
                        </SelectItem>
                        <SelectItem value="gaming">Jogos</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                    <span>Conteúdo destinado a crianças</span>
                    <Switch />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                    <span>Notificar inscritos</span>
                    <Switch defaultChecked />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                    <span>Permitir comentários</span>
                    <Switch defaultChecked />
                  </label>
                  <label className="flex items-center justify-between rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm">
                    <span>Publicar Short automaticamente</span>
                    <Switch />
                  </label>
                </div>
              </Section>

              {/* Instruções de publicação */}
              <Section
                icon={<Sparkles className="h-4 w-4" />}
                title="Instruções de publicação"
                description="Prompt usado para gerar descrição, hashtags, capítulos e mais."
              >
                <PromptEditor
                  sections={PROMPT_SECTIONS}
                  activeId={activePromptSection}
                  onActiveChange={setActivePromptSection}
                  values={promptValues}
                  onChange={(id, v) =>
                    setPromptValues((prev) => ({ ...prev, [id]: v }))
                  }
                  expanded={promptExpanded}
                  onExpandedChange={setPromptExpanded}
                />
              </Section>

              <Separator />
              <div className="flex items-center justify-between gap-3 pb-6">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Alterações se aplicam à próxima publicação.
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

            {/* Preview column */}
            <aside className="lg:sticky lg:top-6 lg:h-fit">
              <YoutubePreview
                channel={channel}
                links={links.filter((l) => l.inDescription)}
                pinnedLinks={links.filter((l) => l.inPinnedComment)}
              />
            </aside>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ---------- Section ----------

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
      <div className="space-y-5">{children}</div>
    </section>
  );
}

// ---------- Month preview ----------

function MonthPreview({
  weekdays,
  specificDates,
}: {
  weekdays: number[];
  specificDates: Date[];
}) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = firstDay.getDay();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const specificDaySet = new Set(
    specificDates
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .map((d) => d.getDate()),
  );

  return (
    <div className="w-[260px] rounded-lg border border-border bg-secondary/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold capitalize">
          {format(firstDay, "MMMM yyyy", { locale: ptBR })}
        </span>
        <span className="text-[10px] text-muted-foreground">Prévia</span>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {WEEKDAYS.map((d) => (
          <div
            key={d.id}
            className="pb-1 text-[9px] uppercase text-muted-foreground"
          >
            {d.short}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const weekday = new Date(year, month, d).getDay();
          const isScheduled = weekdays.includes(weekday);
          const isSpecific = specificDaySet.has(d);
          const isToday = d === now.getDate();
          return (
            <div
              key={i}
              className={cn(
                "flex h-7 items-center justify-center rounded text-[10px] font-medium",
                isSpecific
                  ? "bg-warning/20 text-warning ring-1 ring-warning/50"
                  : isScheduled
                    ? "bg-primary/25 text-primary"
                    : "text-muted-foreground",
                isToday && "ring-2 ring-primary",
              )}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-primary/60" /> Recorrente
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded bg-warning/70" /> Específica
        </span>
      </div>
    </div>
  );
}

// ---------- Link row ----------

function LinkRow({
  link,
  onPatch,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
}: {
  link: ChannelLink;
  onPatch: (p: Partial<ChannelLink>) => void;
  onRemove: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  isDragging: boolean;
}) {
  const urlStatus = validateUrl(link.url);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-secondary/30 p-3 transition-all",
        isDragging
          ? "border-primary opacity-60 ring-2 ring-primary/40"
          : "border-border hover:border-border/80",
      )}
    >
      <button
        type="button"
        className="mt-1 cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Arrastar para reordenar"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="grid flex-1 gap-2 md:grid-cols-[1.2fr_1.6fr_auto]">
        <div>
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Nome
          </Label>
          <Input
            value={link.name}
            onChange={(e) => onPatch({ name: e.target.value })}
            placeholder="Ex.: Instagram do canal"
            className="h-9"
          />
        </div>
        <div>
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            URL
          </Label>
          <div className="relative">
            <Input
              value={link.url}
              onChange={(e) => onPatch({ url: e.target.value })}
              placeholder="https://..."
              className={cn(
                "h-9 pr-8",
                urlStatus === "invalid" &&
                  "border-destructive focus-visible:ring-destructive/40",
                urlStatus === "valid" && "border-emerald-500/60",
              )}
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              {urlStatus === "valid" && (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              )}
              {urlStatus === "invalid" && (
                <AlertCircle className="h-3.5 w-3.5 text-destructive" />
              )}
            </div>
          </div>
        </div>
        <div>
          <Label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
            Categoria
          </Label>
          <Select
            value={link.category}
            onValueChange={(v) => onPatch({ category: v })}
          >
            <SelectTrigger className="h-9 min-w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LINK_CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <LinkToggle
            label="Descrição"
            checked={link.inDescription}
            onChange={(v) => onPatch({ inDescription: v })}
          />
          <LinkToggle
            label="Fixado"
            checked={link.inPinnedComment}
            onChange={(v) => onPatch({ inPinnedComment: v })}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remover link"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function LinkToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors",
        checked
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border bg-secondary/40 text-muted-foreground",
      )}
    >
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        className="scale-75"
      />
      {label}
    </label>
  );
}

function validateUrl(url: string): "empty" | "valid" | "invalid" {
  if (!url.trim()) return "empty";
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:"
      ? "valid"
      : "invalid";
  } catch {
    return "invalid";
  }
}

// ---------- Prompt editor ----------

function PromptEditor({
  sections,
  activeId,
  onActiveChange,
  values,
  onChange,
  expanded,
  onExpandedChange,
}: {
  sections: { id: string; label: string; icon: typeof FileText }[];
  activeId: string;
  onActiveChange: (id: string) => void;
  values: Record<string, string>;
  onChange: (id: string, v: string) => void;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
}) {
  const value = values[activeId] ?? "";
  const [variablesOpen, setVariablesOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (expanded) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [expanded]);

  const insertVariable = (v: string) => {
    const ta = textareaRef.current;
    const current = values[activeId] ?? "";
    if (!ta) {
      onChange(activeId, current + v);
      return;
    }
    const start = ta.selectionStart ?? current.length;
    const end = ta.selectionEnd ?? current.length;
    const next = current.slice(0, start) + v + current.slice(end);
    onChange(activeId, next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + v.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  const activeSection = sections.find((s) => s.id === activeId) ?? sections[0];

  const containerClass = expanded
    ? "fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
    : "flex flex-col overflow-hidden rounded-lg border border-border bg-background";

  return (
    <div className={containerClass}>
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border bg-secondary/40 px-2 py-1.5">
        {sections.map((s) => {
          const active = s.id === activeId;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onActiveChange(s.id)}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
              )}
            >
              <Icon className="h-3 w-3" />
              {s.label}
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onExpandedChange(!expanded)}
            aria-label={expanded ? "Reduzir" : "Expandir"}
          >
            {expanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          "grid flex-1",
          expanded ? "min-h-0 grid-cols-[1fr_260px]" : "grid-cols-[1fr_240px]",
        )}
      >
        <div className="flex min-h-0 flex-col">
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(activeId, e.target.value)}
            spellCheck={false}
            className={cn(
              "flex-1 resize-none rounded-none border-0 border-r border-border bg-background font-mono text-[13px] leading-relaxed focus-visible:ring-0",
              expanded ? "min-h-0" : "min-h-[280px]",
            )}
          />
          <div className="flex items-center justify-between border-t border-border bg-secondary/30 px-3 py-1.5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <activeSection.icon className="h-3 w-3" />
              {activeSection.label}
            </span>
            <span>
              {value.length.toLocaleString("pt-BR")} caracteres ·{" "}
              {value.split(/\s+/).filter(Boolean).length} palavras
            </span>
          </div>
        </div>

        <div className="flex flex-col bg-secondary/20">
          <button
            type="button"
            onClick={() => setVariablesOpen((v) => !v)}
            className="flex items-center justify-between border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            <span>Variáveis</span>
            {variablesOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          {variablesOpen && (
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {PROMPT_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => insertVariable(v.key)}
                  className="w-full rounded-md border border-transparent bg-secondary/60 px-2 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/10"
                >
                  <div className="font-mono text-[11px] font-semibold text-primary">
                    {v.key}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {v.desc}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- YouTube preview ----------

function YoutubePreview({
  channel,
  links,
  pinnedLinks,
}: {
  channel: (typeof channels)[number];
  links: ChannelLink[];
  pinnedLinks: ChannelLink[];
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card/60 shadow-lg backdrop-blur">
      <div className="flex items-center justify-between border-b border-border bg-secondary/40 px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Youtube className="h-3.5 w-3.5 text-red-500" />
          Prévia no YouTube
        </div>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Simulação
        </span>
      </div>

      {/* Player */}
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-slate-800 via-slate-900 to-black">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full bg-white/10 p-3 backdrop-blur">
            <div className="h-0 w-0 border-y-[12px] border-l-[18px] border-y-transparent border-l-white" />
          </div>
        </div>
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          08:24
        </div>
      </div>

      {/* Title */}
      <div className="p-3">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">
          Como estruturamos o processo de produção em 9 etapas para publicar
          semanalmente sem travar
        </h3>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>124 mil visualizações</span>
          <span>·</span>
          <span>há 2 horas</span>
          <span className="ml-auto flex items-center gap-2">
            <ThumbsUp className="h-3 w-3" />
            <Share2 className="h-3 w-3" />
            <Bookmark className="h-3 w-3" />
          </span>
        </div>
      </div>

      <Separator />

      {/* Channel row */}
      <div className="flex items-center gap-2 p-3">
        <ChannelAvatar channel={channel} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{channel.name}</div>
          <div className="text-[10px] text-muted-foreground">
            {channel.subscribers} inscritos
          </div>
        </div>
        <Button size="sm" className="h-7 rounded-full bg-red-600 px-3 text-xs hover:bg-red-700">
          Inscrever-se
        </Button>
      </div>

      {/* Description */}
      <div className="border-t border-border bg-secondary/20 p-3">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Descrição
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Neste vídeo mostramos como o ContentFlow OS organiza a produção do
          canal, das ideias iniciais até a publicação. Assine para acompanhar
          os próximos episódios.
        </p>
        {links.length > 0 && (
          <div className="mt-2 space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Links
            </div>
            {links.map((l) => (
              <a
                key={l.id}
                href={l.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                {l.name || l.url || "Link sem nome"}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Pinned comment */}
      <div className="border-t border-border p-3">
        <div className="mb-2 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <MessageSquare className="h-3 w-3" /> Comentário fixado
          <Pin className="ml-1 h-2.5 w-2.5" />
        </div>
        <div className="flex gap-2">
          <ChannelAvatar channel={channel} size="sm" />
          <div className="min-w-0 flex-1 rounded-lg bg-secondary/40 p-2">
            <div className="text-[11px] font-semibold">{channel.name}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Obrigado por assistir! Se curtiu, deixe seu like e conheça os
              links abaixo 👇
            </p>
            {pinnedLinks.length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {pinnedLinks.map((l) => (
                  <div
                    key={l.id}
                    className="flex items-center gap-1 text-[10px] text-primary"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    {l.name || l.url}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
