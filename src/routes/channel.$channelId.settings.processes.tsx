import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ChevronRight,
  Info,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Play,
  Save,
  FileDown,
  X,
  Circle,
  Sparkles,
  KeyRound,
  Settings2,
  Sliders,
  Wand2,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  channels,
  PROCESS_META,
  PROCESS_ORDER,
  type ProcessId,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/channel/$channelId/settings/processes")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch
      ? `Processos — ${ch.name} · ContentFlow OS`
      : "Configuração de processos — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content:
            "Configure cada uma das nove etapas do pipeline: modelos, prompts, aprovadores e SLA.",
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
  component: ProcessSettings,
});

// ---------- meta ----------

type ProcessConfigState = "configured" | "partial" | "empty" | "error";

const STATE_META: Record<
  ProcessConfigState,
  { label: string; cls: string; dot: string }
> = {
  configured: {
    label: "Configurado",
    cls: "text-success",
    dot: "bg-success",
  },
  partial: {
    label: "Parcial",
    cls: "text-warning",
    dot: "bg-warning",
  },
  empty: {
    label: "Não configurado",
    cls: "text-muted-foreground",
    dot: "bg-muted-foreground",
  },
  error: {
    label: "Com erros",
    cls: "text-destructive",
    dot: "bg-destructive",
  },
};

const PROCESS_STATE: Record<ProcessId, ProcessConfigState> = {
  research: "configured",
  ideas: "configured",
  titles: "partial",
  thumbnail: "configured",
  script: "error",
  narration: "partial",
  assets: "empty",
  editing: "configured",
  publishing: "empty",
};

// ---------- component ----------

function ProcessSettings() {
  const { channel } = Route.useLoaderData();
  const [selected, setSelected] = useState<ProcessId>("research");
  const [dirtyByProcess, setDirtyByProcess] = useState<Record<ProcessId, number>>(
    Object.fromEntries(PROCESS_ORDER.map((p) => [p, 0])) as Record<ProcessId, number>,
  );

  const totalDirty = useMemo(
    () => Object.values(dirtyByProcess).reduce((a, b) => a + b, 0),
    [dirtyByProcess],
  );

  const currentMeta = PROCESS_META[selected];
  const CurrentIcon = currentMeta.icon;

  const bumpDirty = () =>
    setDirtyByProcess((prev) => ({ ...prev, [selected]: prev[selected] + 1 }));

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[
          { label: "ContentFlow OS" },
          { label: "Canais" },
          { label: channel.name, to: `/channel/${channel.id}` as never },
          { label: "Processos" },
        ]}
        title="Configuração de processos"
        subtitle={`${channel.name} · defina modelos, prompts e regras para cada etapa`}
      />

      <div className="flex flex-1 flex-col">
        <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[240px_minmax(0,1fr)_320px]">
          {/* Left nav */}
          <aside className="border-b border-border/60 bg-sidebar/40 lg:border-b-0 lg:border-r">
            <div className="sticky top-[89px] p-3">
              <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Processos do pipeline
              </p>
              <nav className="space-y-0.5">
                {PROCESS_ORDER.map((id, i) => {
                  const meta = PROCESS_META[id];
                  const Icon = meta.icon;
                  const active = selected === id;
                  const state = PROCESS_STATE[id];
                  const dirty = dirtyByProcess[id];
                  return (
                    <button
                      key={id}
                      onClick={() => setSelected(id)}
                      className={cn(
                        "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition",
                        active
                          ? "bg-brand/15 text-foreground shadow-[inset_2px_0_0_0_var(--brand)]"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                      )}
                    >
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-brand-soft" : "text-muted-foreground group-hover:text-foreground",
                        )}
                      />
                      <span className="flex-1 truncate text-left text-xs font-medium">
                        {meta.label}
                      </span>
                      {dirty > 0 && (
                        <span className="rounded-full bg-brand/25 px-1.5 py-0.5 font-mono text-[9px] text-brand-soft">
                          {dirty}
                        </span>
                      )}
                      <span
                        className={cn("size-1.5 shrink-0 rounded-full", STATE_META[state].dot)}
                        aria-label={STATE_META[state].label}
                      />
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Center */}
          <section className="min-w-0 px-6 py-6 pb-24">
            <div className="mb-5 flex items-center gap-3">
              <div className="grid size-10 place-items-center rounded-lg bg-brand/15 text-brand-soft ring-1 ring-brand/30">
                <CurrentIcon className="size-5" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  Pipeline
                  <ChevronRight className="size-3" />
                  Etapa {PROCESS_ORDER.indexOf(selected) + 1}
                </div>
                <h2 className="text-lg font-semibold tracking-tight">
                  {currentMeta.label}
                </h2>
              </div>
            </div>

            <ProcessForm processId={selected} onChange={bumpDirty} />
          </section>

          {/* Right */}
          <aside className="border-t border-border/60 bg-sidebar/40 lg:border-l lg:border-t-0">
            <div className="sticky top-[89px] p-4">
              <SummaryPanel
                processId={selected}
                dirtyCount={dirtyByProcess[selected]}
              />
            </div>
          </aside>
        </div>

        {/* Sticky footer */}
        <footer className="sticky bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-2 text-xs">
              {totalDirty > 0 ? (
                <>
                  <span className="size-2 rounded-full bg-warning shadow-[0_0_0_3px_oklch(0.78_0.16_75/0.25)]" />
                  <span className="font-medium text-warning">
                    {totalDirty} alteração{totalDirty > 1 ? "ões" : ""} não salva
                    {totalDirty > 1 ? "s" : ""}
                  </span>
                  <span className="text-muted-foreground">
                    · lembre-se de salvar antes de sair
                  </span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span className="text-muted-foreground">
                    Todas as alterações foram salvas
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-9 gap-1.5 text-xs text-muted-foreground"
              >
                <X className="size-3.5" />
                Cancelar
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 border-border/60 bg-background/40 text-xs"
              >
                <FileDown className="size-3.5" />
                Salvar como modelo
              </Button>
              <Button
                size="sm"
                disabled={totalDirty === 0}
                className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)] disabled:opacity-60"
              >
                <Save className="size-3.5" />
                Salvar alterações
              </Button>
            </div>
          </div>
        </footer>
      </div>
    </AppShell>
  );
}

// ---------- form ----------

function ProcessForm({
  processId,
  onChange,
}: {
  processId: ProcessId;
  onChange: () => void;
}) {
  // Reset form-local demo state when process changes
  return (
    <div key={processId} className="max-w-3xl">
      <Accordion type="multiple" defaultValue={["general", "model", "review"]} className="space-y-3">
        <FieldGroup value="general" title="Geral" icon={Settings2} description="Comportamento e ativação da etapa.">
          <FieldRow>
            <FieldLabel
              label="Ativar processo"
              description="Quando desligado, projetos ignoram esta etapa."
            />
            <Switch defaultChecked onCheckedChange={onChange} />
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Nome exibido"
              description="Aparece no pipeline e nos cards de projeto."
              tooltip="Alterar aqui não muda o identificador interno da etapa."
            />
            <div className="w-full max-w-sm">
              <Input
                defaultValue={PROCESS_META[processId].label}
                onChange={onChange}
                placeholder="Ex.: Roteirização"
              />
              <FieldFoot placeholder="Padrão: nome do processo" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Modo de execução"
              description="Como esta etapa é iniciada em cada projeto."
            />
            <div className="w-full max-w-sm">
              <Select defaultValue="automatic" onValueChange={onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automático ao concluir a anterior</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="scheduled">Agendado</SelectItem>
                </SelectContent>
              </Select>
              <FieldFoot placeholder="Padrão: Automático" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="SLA (horas)"
              description="Tempo máximo tolerado nesta etapa antes de sinalizar atraso."
            />
            <div className="w-full max-w-sm">
              <div className="flex items-center gap-3">
                <Slider defaultValue={[24]} min={1} max={120} step={1} onValueChange={onChange} className="flex-1" />
                <div className="w-16">
                  <Input
                    type="number"
                    defaultValue={24}
                    onChange={onChange}
                    className="text-center font-mono"
                  />
                </div>
              </div>
              <FieldFoot placeholder="Padrão: 24 h" />
            </div>
          </FieldRow>
        </FieldGroup>

        <FieldGroup value="model" title="Modelo & prompt" icon={Wand2} description="Modelo de IA e instruções aplicadas à etapa.">
          <FieldRow>
            <FieldLabel
              label="Provedor"
              description="Serviço utilizado para gerar o resultado."
            />
            <div className="w-full max-w-sm">
              <Select defaultValue="lovable" onValueChange={onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lovable">Lovable AI Gateway</SelectItem>
                  <SelectItem value="openai">OpenAI</SelectItem>
                  <SelectItem value="anthropic">Anthropic</SelectItem>
                  <SelectItem value="google">Google</SelectItem>
                </SelectContent>
              </Select>
              <FieldFoot placeholder="Padrão: Lovable AI Gateway" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Modelo"
              description="Balanceie qualidade e custo por chamada."
              tooltip="Modelos mais potentes aumentam custo por vídeo."
            />
            <div className="w-full max-w-sm">
              <Select defaultValue="gemini" onValueChange={onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini">google/gemini-2.5-pro</SelectItem>
                  <SelectItem value="gemini-flash">google/gemini-2.5-flash</SelectItem>
                  <SelectItem value="gpt5">openai/gpt-5</SelectItem>
                  <SelectItem value="claude">anthropic/claude-4-sonnet</SelectItem>
                </SelectContent>
              </Select>
              <FieldFoot placeholder="Padrão: google/gemini-2.5-pro" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Temperatura"
              description="Controla criatividade da geração."
            />
            <div className="w-full max-w-sm">
              <div className="flex items-center gap-3">
                <Slider defaultValue={[0.6]} min={0} max={1} step={0.05} onValueChange={onChange} className="flex-1" />
                <div className="w-16">
                  <Input defaultValue="0.6" onChange={onChange} className="text-center font-mono" />
                </div>
              </div>
              <FieldFoot placeholder="Padrão: 0.6" />
            </div>
          </FieldRow>

          <FieldRow align="start">
            <FieldLabel
              label="Prompt base"
              description="Instrução principal enviada ao modelo em cada projeto."
              tooltip="Use variáveis como {{titulo}}, {{nicho}} e {{idioma}}."
              required
            />
            <div className="w-full max-w-sm">
              <Textarea
                defaultValue={`Você é um roteirista sênior do canal {{canal}}.\nEscreva um roteiro no idioma {{idioma}} com tom envolvente…`}
                rows={5}
                onChange={onChange}
                className="font-mono text-xs"
              />
              <FieldFoot placeholder="Padrão do template do canal" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Chave de API"
              description="Sobrescreve a chave global apenas para esta etapa."
              tooltip="Deixe em branco para usar a chave padrão do workspace."
            />
            <div className="w-full max-w-sm">
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="sk-••••••••••••"
                  onChange={onChange}
                  className="pl-8 font-mono"
                />
              </div>
              <FieldFoot placeholder="Padrão: chave global do workspace" />
            </div>
          </FieldRow>
        </FieldGroup>

        <FieldGroup value="review" title="Revisão & aprovação" icon={Sliders} description="Quem aprova o resultado desta etapa antes de avançar.">
          <FieldRow>
            <FieldLabel
              label="Exigir revisão humana"
              description="Bloqueia avanço até um revisor aprovar o resultado."
            />
            <Switch defaultChecked onCheckedChange={onChange} />
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Aprovador padrão"
              description="Recebe a notificação de revisão ao concluir a etapa."
            />
            <div className="w-full max-w-sm">
              <Select defaultValue="lu" onValueChange={onChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lu">Lucas Andrade</SelectItem>
                  <SelectItem value="mc">Marina Costa</SelectItem>
                  <SelectItem value="rl">Rafael Lima</SelectItem>
                </SelectContent>
              </Select>
              <FieldFoot placeholder="Padrão: dono do canal" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Tentativas automáticas"
              description="Quantas vezes reprocessar em caso de erro antes de pausar."
              error="Valor deve estar entre 0 e 5."
            />
            <div className="w-full max-w-sm">
              <Input
                defaultValue="7"
                onChange={onChange}
                aria-invalid
                className="border-destructive/60 bg-destructive/5 focus-visible:ring-destructive"
              />
              <FieldFoot placeholder="Padrão: 2 tentativas" error />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Notas de handoff (opcional)"
              description="Recado enviado ao responsável pela próxima etapa."
            />
            <div className="w-full max-w-sm">
              <Textarea
                placeholder="Ex.: sempre validar CTA antes de aprovar…"
                onChange={onChange}
                rows={3}
                disabled
              />
              <FieldFoot placeholder="Desabilitado enquanto revisão humana estiver ativa" />
            </div>
          </FieldRow>
        </FieldGroup>

        <FieldGroup value="advanced" title="Avançado" icon={Sparkles} description="Parâmetros de execução detalhados.">
          <FieldRow>
            <FieldLabel
              label="Tempo máximo por execução"
              description="Interrompe a execução se ultrapassar o limite."
            />
            <div className="w-full max-w-sm">
              <Input defaultValue="180" onChange={onChange} className="font-mono" />
              <FieldFoot placeholder="Padrão: 180 s" />
            </div>
          </FieldRow>

          <FieldRow>
            <FieldLabel
              label="Registrar payloads"
              description="Grava entrada e saída de cada execução para auditoria."
            />
            <Switch onCheckedChange={onChange} />
          </FieldRow>
        </FieldGroup>
      </Accordion>
    </div>
  );
}

// ---------- field primitives ----------

function FieldGroup({
  value,
  title,
  description,
  icon: Icon,
  children,
}: {
  value: string;
  title: string;
  description: string;
  icon: typeof Settings2;
  children: React.ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className="glass overflow-hidden rounded-xl border border-border/60"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          <div className="grid size-8 place-items-center rounded-md bg-muted/40 text-muted-foreground">
            <Icon className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-[11px] font-normal text-muted-foreground">{description}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-0">
        <Separator className="mb-4" />
        <div className="space-y-5">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}

function FieldRow({
  children,
  align = "center",
}: {
  children: React.ReactNode;
  align?: "start" | "center";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:justify-between md:gap-8",
        align === "start" ? "md:items-start" : "md:items-center",
      )}
    >
      {children}
    </div>
  );
}

function FieldLabel({
  label,
  description,
  tooltip,
  required,
  error,
}: {
  label: string;
  description: string;
  tooltip?: string;
  required?: boolean;
  error?: string;
}) {
  return (
    <div className="min-w-0 md:w-64">
      <Label className="flex items-center gap-1.5 text-sm font-medium">
        {label}
        {required && <span className="text-destructive">*</span>}
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground">
                <Info className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </Label>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
      {error && (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-destructive">
          <AlertTriangle className="size-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function FieldFoot({ placeholder, error }: { placeholder: string; error?: boolean }) {
  return (
    <p
      className={cn(
        "mt-1 flex items-center gap-1 text-[10px]",
        error ? "text-destructive" : "text-muted-foreground",
      )}
    >
      <Circle className="size-1.5 fill-current" />
      {placeholder}
    </p>
  );
}

// ---------- summary ----------

function SummaryPanel({
  processId,
  dirtyCount,
}: {
  processId: ProcessId;
  dirtyCount: number;
}) {
  const state = PROCESS_STATE[processId];
  const meta = STATE_META[state];
  const warnings = [
    {
      tone: "warning" as const,
      text: "Tentativas automáticas fora do intervalo permitido.",
    },
    {
      tone: "info" as const,
      text: "Prompt usa variáveis que ainda não estão definidas no canal.",
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Resumo da configuração
        </p>
        <p className="mt-0.5 text-sm font-semibold">{PROCESS_META[processId].label}</p>
      </div>

      <div className="glass space-y-3 rounded-xl border border-border/60 p-4">
        <SummaryRow label="Estado">
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.cls)}>
            <span className={cn("size-1.5 rounded-full", meta.dot)} />
            {meta.label}
          </span>
        </SummaryRow>
        <SummaryRow label="Última atualização">
          <span className="text-xs">há 2 h · por Lucas Andrade</span>
        </SummaryRow>
        <SummaryRow label="Campos alterados">
          <span
            className={cn(
              "rounded-md px-2 py-0.5 font-mono text-xs",
              dirtyCount > 0
                ? "bg-warning/15 text-warning"
                : "bg-muted/40 text-muted-foreground",
            )}
          >
            {dirtyCount.toString().padStart(2, "0")}
          </span>
        </SummaryRow>
        <SummaryRow label="Versão">
          <span className="font-mono text-xs text-muted-foreground">v12</span>
        </SummaryRow>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Avisos de configuração
        </p>
        <ul className="space-y-2">
          {warnings.map((w, i) => (
            <li
              key={i}
              className={cn(
                "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[11px]",
                w.tone === "warning"
                  ? "border-warning/30 bg-warning/10 text-warning"
                  : "border-info/30 bg-info/10 text-info",
              )}
            >
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              <span className="text-foreground/90">{w.text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          className="h-9 w-full justify-start gap-2 border-border/60 bg-background/40 text-xs"
        >
          <Play className="size-3.5 text-brand-soft" />
          Testar configuração
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-full justify-start gap-2 text-xs text-muted-foreground"
        >
          <RotateCcw className="size-3.5" />
          Restaurar padrão
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
