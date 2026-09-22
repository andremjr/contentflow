import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  CirclePause,
  Layers3,
  Play,
  RadioTower,
  Rows3,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ExecutionOrchestratorPanel } from "@/components/execution-orchestrator-panel";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  type ExecutionOrchestratorMode,
  type ExecutionOrchestrator,
} from "@/lib/execution-orchestrator";
import {
  startGlobalExecutionOrchestration,
  useChannels,
  useExecutionOrchestrators,
  useProjects,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/orchestrator")({
  head: () => ({
    meta: [
      { title: "Orquestrador — ContentFlow" },
      {
        name: "description",
        content: "Central de orquestração das filas de produção dos canais.",
      },
    ],
  }),
  component: OrchestratorPage,
});

const STATUS_LABELS: Record<ExecutionOrchestrator["status"], string> = {
  running: "Em execução",
  awaiting_human: "Aguardando humano",
  blocked: "Bloqueado",
  failed: "Com erro",
  completed: "Concluído",
  cancelled: "Cancelado",
};

function OrchestratorPage() {
  const { t } = useAppPreferences();
  const channels = useChannels();
  const projects = useProjects();
  const orchestrators = useExecutionOrchestrators();
  const latestByChannel = useMemo(() => {
    const result = new Map<string, ExecutionOrchestrator>();
    for (const channel of channels) {
      const candidates = orchestrators.filter((item) => item.channelId === channel.id);
      result.set(
        channel.id,
        candidates.find((item) => ACTIVE_ORCHESTRATOR_STATUSES.has(item.status)) ?? candidates[0],
      );
    }
    return result;
  }, [channels, orchestrators]);
  const activeChannelIds = useMemo(
    () =>
      new Set(
        orchestrators
          .filter((item) => ACTIVE_ORCHESTRATOR_STATUSES.has(item.status))
          .map((item) => item.channelId),
      ),
    [orchestrators],
  );
  const attentionChannelIds = useMemo(
    () =>
      new Set(
        orchestrators
          .filter((item) => ["awaiting_human", "blocked", "failed"].includes(item.status))
          .map((item) => item.channelId),
      ),
    [orchestrators],
  );
  const [selectedChannelId, setSelectedChannelId] = useState("");
  const [globalChannelIds, setGlobalChannelIds] = useState<string[]>([]);
  const [globalQuantity, setGlobalQuantity] = useState(5);
  const [globalMode, setGlobalMode] = useState<ExecutionOrchestratorMode>("end_to_end");
  const [globalPrefix, setGlobalPrefix] = useState("Projeto");
  const [isStartingGlobal, setIsStartingGlobal] = useState(false);
  const [isGlobalProductionExpanded, setIsGlobalProductionExpanded] = useState(false);

  useEffect(() => {
    if (channels.some((channel) => channel.id === selectedChannelId)) return;
    const preferred = channels.find((channel) => activeChannelIds.has(channel.id)) ?? channels[0];
    setSelectedChannelId(preferred?.id ?? "");
  }, [activeChannelIds, channels, selectedChannelId]);

  const selectedChannel = channels.find((channel) => channel.id === selectedChannelId);

  function toggleGlobalChannel(channelId: string) {
    setGlobalChannelIds((current) =>
      current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId],
    );
  }

  async function startGlobalProduction() {
    if (!globalChannelIds.length) return;
    setIsStartingGlobal(true);
    try {
      await startGlobalExecutionOrchestration({
        channelIds: globalChannelIds,
        mode: globalMode,
        quantity: globalQuantity,
        projectPrefix: globalPrefix,
      });
      toast.success(t("Produção global iniciada"), {
        description: t(
          "Os projetos foram criados e as filas dos canais selecionados foram iniciadas.",
        ),
      });
    } catch (error) {
      toast.error(t("Não foi possível iniciar a produção global"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsStartingGlobal(false);
    }
  }

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow" }, { label: t("Orquestrador") }]}
        title={t("Orquestrador")}
        subtitle={t("Centralize as filas de produção dos seus canais em um só lugar.")}
        showNewProject={false}
      />

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-[1600px] space-y-5">
          <section className="grid gap-3 sm:grid-cols-3">
            <MetricCard icon={RadioTower} label={t("Canais monitorados")} value={channels.length} />
            <MetricCard icon={Workflow} label={t("Filas ativas")} value={activeChannelIds.size} />
            <MetricCard
              icon={CirclePause}
              label={t("Aguardando ação")}
              value={attentionChannelIds.size}
            />
          </section>

          {channels.length > 0 && (
            <section className="overflow-hidden rounded-2xl border border-brand/25 bg-card">
              <button
                type="button"
                aria-expanded={isGlobalProductionExpanded}
                onClick={() => setIsGlobalProductionExpanded((current) => !current)}
                className={cn(
                  "flex w-full items-center justify-between gap-4 bg-brand/5 px-4 py-4 text-left transition hover:bg-brand/10 sm:px-5",
                  isGlobalProductionExpanded && "border-b border-border/60",
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-soft">
                    <Layers3 className="size-5" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold">{t("Nova produção global")}</h2>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {t("Escolha os canais e quantos vídeos deseja gerar em cada um deles.")}
                    </p>
                  </div>
                </div>
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                    isGlobalProductionExpanded && "rotate-180",
                  )}
                />
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  isGlobalProductionExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="overflow-hidden">
                  <div className="space-y-5 p-4 sm:p-5">
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {channels.map((channel) => {
                        const checked = globalChannelIds.includes(channel.id);
                        const busy = activeChannelIds.has(channel.id);
                        return (
                          <label
                            key={channel.id}
                            className={cn(
                              "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 transition",
                              checked
                                ? "border-brand/45 bg-brand/10"
                                : "border-border/60 bg-background/30 hover:border-border",
                              busy && "cursor-not-allowed opacity-55",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={busy}
                              onChange={() => toggleGlobalChannel(channel.id)}
                              className="size-4 accent-current"
                            />
                            <ChannelAvatar channel={channel} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-xs font-semibold">
                                {channel.name}
                              </span>
                              <span className="mt-0.5 block text-[10px] text-muted-foreground">
                                {busy ? t("Fila em andamento") : t("Disponível")}
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_10rem_12rem_auto] lg:items-end">
                      <div className="space-y-1.5">
                        <Label htmlFor="global-prefix">{t("Nome base dos projetos")}</Label>
                        <Input
                          id="global-prefix"
                          value={globalPrefix}
                          onChange={(event) => setGlobalPrefix(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="global-quantity">{t("Vídeos por canal")}</Label>
                        <NumberInput
                          id="global-quantity"
                          min={1}
                          max={50}
                          integer
                          value={globalQuantity}
                          onValueChange={(value) => setGlobalQuantity(value ?? globalQuantity)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="global-mode">{t("Modo de execução")}</Label>
                        <select
                          id="global-mode"
                          value={globalMode}
                          onChange={(event) =>
                            setGlobalMode(event.target.value as ExecutionOrchestratorMode)
                          }
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <option value="end_to_end">{t("Ponta a ponta")}</option>
                          <option value="batch">{t("Lote híbrido")}</option>
                        </select>
                      </div>
                      <Button
                        type="button"
                        onClick={startGlobalProduction}
                        disabled={
                          isStartingGlobal || !globalChannelIds.length || !globalPrefix.trim()
                        }
                        className="gap-1.5 text-white"
                      >
                        <Play className="size-4" />
                        {isStartingGlobal ? t("Iniciando…") : t("Iniciar produção global")}
                      </Button>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      {globalChannelIds.length} {t("canais selecionados")} · {globalQuantity}{" "}
                      {t("vídeos por canal")} · {globalChannelIds.length * globalQuantity}{" "}
                      {t("projetos no total")}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {channels.length ? (
            <section className="grid items-start gap-5 xl:grid-cols-[20rem_minmax(0,1fr)]">
              <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card">
                <div className="border-b border-border/60 px-4 py-3.5">
                  <h2 className="text-sm font-semibold">{t("Filas por canal")}</h2>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {t("Escolha um canal para acompanhar ou retomar sua fila.")}
                  </p>
                </div>
                <div className="space-y-1 p-2">
                  {channels.map((channel) => {
                    const orchestrator = latestByChannel.get(channel.id);
                    const channelProjects = projects.filter(
                      (project) => project.channelId === channel.id,
                    ).length;
                    const selected = channel.id === selectedChannelId;
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setSelectedChannelId(channel.id)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                          selected
                            ? "border-brand/35 bg-brand/10"
                            : "border-transparent hover:border-border/60 hover:bg-secondary/45",
                        )}
                      >
                        <ChannelAvatar channel={channel} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-semibold">
                            {channel.name}
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">
                            {channelProjects} {t("projetos")}
                          </span>
                        </span>
                        <Badge
                          variant={
                            orchestrator?.status === "failed" || orchestrator?.status === "blocked"
                              ? "destructive"
                              : "secondary"
                          }
                          className="shrink-0 text-[9px]"
                        >
                          {orchestrator ? t(STATUS_LABELS[orchestrator.status]) : t("Sem fila")}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <div className="min-w-0 space-y-4">
                {selectedChannel && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <ChannelAvatar channel={selectedChannel} size="md" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{selectedChannel.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {t("Produção e fila deste canal")}
                          </p>
                        </div>
                      </div>
                      <Button asChild size="sm" variant="outline" className="gap-1.5">
                        <Link to="/channel/$channelId" params={{ channelId: selectedChannel.id }}>
                          {t("Abrir canal")}
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </Button>
                    </div>
                    <ExecutionOrchestratorPanel channelId={selectedChannel.id} />
                  </>
                )}
              </div>
            </section>
          ) : (
            <section className="grid min-h-80 place-items-center rounded-2xl border border-dashed border-border/70 bg-card/40 px-6 text-center">
              <div className="max-w-sm">
                <div className="mx-auto grid size-12 place-items-center rounded-xl bg-brand/10 text-brand-soft">
                  <Layers3 className="size-5" />
                </div>
                <h2 className="mt-4 text-sm font-semibold">{t("Nenhum canal disponível")}</h2>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t("Crie um canal para começar a organizar filas de produção.")}
                </p>
              </div>
            </section>
          )}
        </div>
      </main>
    </AppShell>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Rows3;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3.5">
      <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-soft">
        <Icon className="size-4" />
      </div>
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="mt-0.5 font-mono text-xl font-semibold">{value}</p>
      </div>
    </div>
  );
}
