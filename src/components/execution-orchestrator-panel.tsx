import { useMemo, useState } from "react";
import { AlertCircle, RotateCcw, Sparkles, Square, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PROCESS_META } from "@/lib/domain";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  executionOrchestratorIsActive,
  STOPPABLE_ORCHESTRATOR_STATUSES,
  orchestratorProgress,
} from "@/lib/execution-orchestrator";
import {
  resumeExecutionOrchestrator,
  stopExecutionOrchestrator,
  useChannelExecutionOrchestrator,
  useProjects,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_LABELS = {
  running: "Em execução",
  awaiting_human: "Aguardando humano",
  blocked: "Bloqueado",
  failed: "Com erro",
  completed: "Concluído",
  cancelled: "Cancelado",
} as const;

export function ExecutionOrchestratorPanel({ channelId }: { channelId: string }) {
  const { t } = useAppPreferences();
  const orchestrator = useChannelExecutionOrchestrator(channelId);
  const projects = useProjects(channelId);
  const [isStopping, setIsStopping] = useState(false);
  const [isResuming, setIsResuming] = useState(false);
  const isActive = !!orchestrator && executionOrchestratorIsActive(orchestrator);
  const canStop = !!orchestrator && STOPPABLE_ORCHESTRATOR_STATUSES.has(orchestrator.status);
  const canResume = orchestrator?.status === "failed";
  const currentProject = useMemo(
    () => projects.find((project) => project.id === orchestrator?.currentProjectId),
    [orchestrator?.currentProjectId, projects],
  );

  async function stop() {
    if (!orchestrator) return;
    if (
      !window.confirm(
        "Parar esta fila? A execução atual será cancelada e os projetos serão preservados.",
      )
    ) {
      return;
    }
    setIsStopping(true);
    try {
      await stopExecutionOrchestrator(orchestrator.id);
      toast.success("Fila parada", {
        description: "Nenhuma nova etapa será iniciada. Os projetos criados foram preservados.",
      });
    } catch (error) {
      toast.error("Não foi possível parar a fila", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsStopping(false);
    }
  }

  async function resume() {
    if (!orchestrator) return;
    setIsResuming(true);
    try {
      await resumeExecutionOrchestrator(orchestrator.id);
      toast.success("Fila retomada", {
        description: "A execução continuará da última etapa preservada.",
      });
    } catch (error) {
      toast.error("Não foi possível retomar a fila", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsResuming(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand/25 bg-card">
      <div className="border-b border-border/60 bg-brand/5 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand/15 text-brand-soft">
              <Workflow className="size-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Orquestrador de execução</h3>
                <Badge variant="outline">Sequencial</Badge>
                {orchestrator && (
                  <Badge
                    variant={
                      orchestrator.status === "failed" || orchestrator.status === "blocked"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {STATUS_LABELS[orchestrator.status]}
                  </Badge>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                {t(
                  "Acompanhe, interrompa ou retome a fila deste canal. Novas filas são criadas na produção global acima, com um ou vários canais selecionados.",
                )}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canResume && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-white"
                onClick={resume}
                disabled={isResuming || isStopping}
              >
                <RotateCcw className="size-3.5" />
                {isResuming ? "Retomando…" : "Retomar fila"}
              </Button>
            )}
            {canStop && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={stop}
                disabled={isStopping || isResuming}
              >
                <Square className="size-3.5 fill-current" />
                {isStopping ? "Parando…" : isActive ? "Parar fila" : "Encerrar fila"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {canStop && orchestrator ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-medium">
                {orchestrator.mode === "end_to_end" ? "Projetos ponta a ponta" : t("Lote híbrido")}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {orchestrator.quantity} {orchestrator.quantity === 1 ? "projeto" : "projetos"} ·{" "}
                {orchestrator.currentStep} de {orchestrator.totalSteps} etapas concluídas
              </p>
            </div>
            <span className="font-mono text-sm font-semibold">
              {orchestratorProgress(orchestrator)}%
            </span>
          </div>
          <Progress value={orchestratorProgress(orchestrator)} className="h-1.5" />
          <div
            className={cn(
              "flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-3 py-3 text-xs",
              orchestrator.status === "awaiting_human"
                ? "border-amber-500/25 bg-amber-500/5"
                : orchestrator.status === "blocked" || orchestrator.status === "failed"
                  ? "border-destructive/25 bg-destructive/5"
                  : "border-border/60 bg-background/35",
            )}
          >
            {orchestrator.status === "awaiting_human" ||
            orchestrator.status === "blocked" ||
            orchestrator.status === "failed" ? (
              <AlertCircle className="size-4 shrink-0 text-amber-400" />
            ) : (
              <Sparkles className="size-4 shrink-0 text-brand-soft" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {currentProject?.title ?? "Projeto atual"}
                {orchestrator.currentProcessType
                  ? ` · ${PROCESS_META[orchestrator.currentProcessType].label}`
                  : ""}
              </p>
              <p className="mt-0.5 text-muted-foreground">{orchestrator.message}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-4 sm:p-5">
          {orchestrator?.status === "completed" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-300">
              A última orquestração foi concluída: {orchestrator.quantity} projetos processados.
            </div>
          )}
          {orchestrator?.status === "cancelled" && (
            <div className="rounded-xl border border-border/70 bg-background/35 px-3 py-2.5 text-xs text-muted-foreground">
              A última fila foi interrompida. Os projetos criados continuam disponíveis na lista.
            </div>
          )}
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {orchestrator
              ? t("Esta fila não está ativa no momento.")
              : t("Este canal ainda não possui histórico de orquestração.")}
          </p>
        </div>
      )}
    </section>
  );
}
