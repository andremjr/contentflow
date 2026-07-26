import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useState, useRef, type KeyboardEvent } from "react";
import {
  Lightbulb,
  Users,
  History,
  Wand2,
  X,
  Plus,
  Info,
  Sparkles,
  Save,
  Search,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";
import { channels } from "@/lib/mock-data";
import { ChannelAvatar } from "@/components/channel-avatar";

export const Route = createFileRoute("/channel/$channelId/ideas")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch
      ? `Ideias — ${ch.name} · ContentFlow OS`
      : "Ideias — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Configure descoberta de tendências, conexão com o público e uso do histórico para gerar ideias.",
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
  component: IdeasScreen,
});

// ---------- mocks ----------

type EmotionId =
  | "pain"
  | "desire"
  | "fear"
  | "curiosity"
  | "aspiration"
  | "identification"
  | "urgency"
  | "transformation";

const EMOTIONS: {
  id: EmotionId;
  label: string;
  hint: string;
}[] = [
  { id: "pain", label: "Dor", hint: "Que problema resolve?" },
  { id: "desire", label: "Desejo", hint: "O que a pessoa quer ter ou ser?" },
  { id: "fear", label: "Medo", hint: "O que ela quer evitar?" },
  { id: "curiosity", label: "Curiosidade", hint: "Que enigma desperta?" },
  { id: "aspiration", label: "Aspiração", hint: "Que ideal ela busca?" },
  { id: "identification", label: "Identificação", hint: "Com quem ela se identifica?" },
  { id: "urgency", label: "Urgência", hint: "Por que agir agora?" },
  { id: "transformation", label: "Transformação", hint: "Que mudança promete?" },
];




const PROMPT_VARIABLES = [
  { key: "channel_name", label: "Nome do canal", desc: "Nome público do canal" },
  { key: "channel_niche", label: "Nicho", desc: "Nicho principal do canal" },
  { key: "target_audience", label: "Público", desc: "Perfil da audiência" },
  { key: "channel_history", label: "Histórico", desc: "Últimos vídeos publicados" },
  { key: "top_titles", label: "Top títulos", desc: "Títulos com maior CTR" },
  { key: "language", label: "Idioma", desc: "Idioma principal" },
  { key: "date", label: "Data atual", desc: "Data de execução" },
];

const DEFAULT_PROMPT = `Você é um estrategista de conteúdo para o canal {{channel_name}}, especializado em {{channel_niche}}.

Gere 10 ideias de vídeo que:
- Conversem com o público {{target_audience}}
- Considerem o histórico recente: {{channel_history}}
- Sejam alinhadas às tendências ativas do nicho

Para cada ideia, retorne:
1. Ângulo principal
2. Gancho de abertura
3. Emoção dominante
4. Justificativa (1 frase)`;

// ---------- component ----------

function IdeasScreen() {
  const { channel } = Route.useLoaderData();

  const [useResearch, setUseResearch] = useState(true);

  // Audience
  const [audienceDescription, setAudienceDescription] = useState<string>(
    "Adultos entre 25 e 45 anos, curiosos, que buscam entender temas complexos de forma clara e aprofundada. Valorizam conteúdo autêntico e narrativas envolventes.",
  );

  // History
  const [useHistory, setUseHistory] = useState(true);
  const [historyMode, setHistoryMode] = useState<"days" | "videos" | "all">(
    "days",
  );
  const [historyAmount, setHistoryAmount] = useState<number>(90);

  const [avoidRepeats, setAvoidRepeats] = useState(true);

  // Prompt
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);



  return (
    <TooltipProvider delayDuration={200}>
      <AppShell>
        <TopBar
          title="Ideias"
          subtitle={`Configuração · ${channel.name}`}
          breadcrumbs={[
            { label: "ContentFlow OS" },
            { label: "Canais" },
            { label: channel.name, to: `/channel/${channel.id}` as never },
            { label: "Ideias" },
          ]}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] space-y-6 p-6">
            {/* Header */}
            <div className="flex items-start gap-4">
              <ChannelAvatar channel={channel} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <Lightbulb className="h-3.5 w-3.5" />
                  Ideias · Etapa 2 do pipeline
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                  Configurações de ideias
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Combine tendências, conexão emocional e histórico para gerar
                  pautas alinhadas ao {channel.name}.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm">
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  Salvar
                </Button>
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
                Quando ativada, os dados coletados na etapa de Pesquisa alimentam a geração de ideias. Desative para gerar ideias apenas a partir do público e do histórico do canal.
              </p>
            </Section>

            {/* Conexão */}
            <Section
              icon={<Users className="h-4 w-4" />}
              title="Conexão com o público"
              description="Descreva quem é o público-alvo e como as ideias devem se conectar com ele."
            >
              <Textarea
                value={audienceDescription}
                onChange={(e) => setAudienceDescription(e.target.value)}
                placeholder="Ex: profissionais de tecnologia entre 25 e 40 anos, curiosos sobre IA, que valorizam explicações profundas e exemplos práticos..."
                className="min-h-[180px] resize-y"
              />
            </Section>

            {/* Histórico */}
            <Section
              icon={<History className="h-4 w-4" />}
              title="Uso do histórico"
              description="Aproveite dados do próprio canal."
              action={
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Considerar histórico do canal
                  </span>
                  <Switch
                    checked={useHistory}
                    onCheckedChange={setUseHistory}
                  />
                </div>
              }
            >
              <div
                className={cn(
                  "space-y-6 transition-opacity",
                  !useHistory && "pointer-events-none opacity-40",
                )}
              >
                <div className="grid gap-6 md:grid-cols-2">
                  <FieldWrap
                    label="Período analisado"
                    description="Janela retroativa por tempo ou pela quantidade de vídeos."
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={historyMode}
                        onValueChange={(v) =>
                          setHistoryMode(v as "days" | "videos" | "all")
                        }
                      >
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="days">Últimos dias</SelectItem>
                          <SelectItem value="videos">Últimos vídeos</SelectItem>
                          <SelectItem value="all">Todo o histórico</SelectItem>
                        </SelectContent>
                      </Select>
                      {historyMode !== "all" && (
                        <>
                          <Input
                            type="number"
                            min={1}
                            max={historyMode === "days" ? 3650 : 10000}
                            value={historyAmount}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              if (Number.isNaN(raw)) return;
                              const max = historyMode === "days" ? 3650 : 10000;
                              setHistoryAmount(
                                Math.max(1, Math.min(max, Math.floor(raw))),
                              );
                            }}
                            className="w-24"
                            aria-label="Quantidade"
                          />
                          <span className="text-sm text-muted-foreground">
                            {historyMode === "days" ? "dias" : "vídeos"}
                          </span>
                        </>
                      )}
                    </div>
                  </FieldWrap>

                </div>



                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
                  <Checkbox
                    checked={avoidRepeats}
                    onCheckedChange={(v) => setAvoidRepeats(Boolean(v))}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">
                      Evitar repetir temas recentes
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ignora ideias que se sobrepõem a vídeos publicados nas
                      últimas semanas.
                    </div>
                  </div>
                </label>
              </div>
            </Section>

            {/* Prompt */}
            <Section
              icon={<Wand2 className="h-4 w-4" />}
              title="Instruções avançadas"
              description="Prompt-mestre usado ao gerar ideias."
            >
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Descreva as instruções que orientarão a geração das ideias..."
                className="min-h-[240px] resize-y font-mono text-sm leading-relaxed"
                spellCheck={false}
              />
            </Section>

            <Separator />

            <div className="flex items-center justify-between gap-3 pb-6">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                As alterações são aplicadas apenas ao próximo lote de geração.
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
  tooltip,
  children,
}: {
  label: string;
  description?: string;
  tooltip?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
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
