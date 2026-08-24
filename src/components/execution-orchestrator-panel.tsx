import { useMemo, useState } from "react";
import { AlertCircle, Layers3, Play, Route, Sparkles, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { PROCESS_META } from "@/lib/domain";
import {
  ACTIVE_ORCHESTRATOR_STATUSES,
  orchestratorProgress,
  type ExecutionOrchestratorMode,
} from "@/lib/execution-orchestrator";
import {
  startExecutionOrchestrator,
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

export function ExecutionOrchestratorPanel({
  channelId,
  channelName,
}: {
  channelId: string;
  channelName: string;
}) {
  const orchestrator = useChannelExecutionOrchestrator(channelId);
  const projects = useProjects(channelId);
  const [mode, setMode] = useState<ExecutionOrchestratorMode>("end_to_end");
  const [quantity, setQuantity] = useState(10);
  const [projectPrefix, setProjectPrefix] = useState("Produção");
  const [isStarting, setIsStarting] = useState(false);
  const isActive = !!orchestrator && ACTIVE_ORCHESTRATOR_STATUSES.has(orchestrator.status);
  const currentProject = useMemo(
    () => projects.find((project) => project.id === orchestrator?.currentProjectId),
    [orchestrator?.currentProjectId, projects],
  );

  async function start() {
    setIsStarting(true);
    try {
      await startExecutionOrchestrator({
        channelId,
        mode,
        quantity,
        projectPrefix,
      });
      toast.success("Orquestração iniciada", {
        description: `${quantity} ${quantity === 1 ? "projeto criado" : "projetos criados"} em execução sequencial.`,
      });
    } catch (error) {
      toast.error("Não foi possível iniciar a orquestração", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-brand/25 bg-card">
      <div className="border-b border-border/60 bg-brand/5 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 gap-3">
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
                Crie vários projetos e conecte seus processos sem cliques intermediários. A fila
                pausa sempre que um bloco exigir validação ou entrega humana.
              </p>
            </div>
          </div>
        </div>
      </div>

      {isActive && orchestrator ? (
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-medium">
                {orchestrator.mode === "end_to_end"
                  ? "Projetos ponta a ponta"
                  : "Lote por processo"}
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
        <div className="space-y-5 p-4 sm:p-5">
          {orchestrator?.status === "completed" && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-xs text-emerald-300">
              A última orquestração foi concluída: {orchestrator.quantity} projetos processados.
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            <ModeButton
              active={mode === "end_to_end"}
              icon={Route}
              title="Ponta a ponta"
              description="Conclui os 8 processos de um projeto antes de iniciar o próximo."
              onClick={() => setMode("end_to_end")}
            />
            <ModeButton
              active={mode === "batch"}
              icon={Layers3}
              title="Em lote por processo"
              description="Executa todos os temas, depois todos os títulos, thumbnails e demais processos."
              onClick={() => setMode("batch")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="orchestrator-prefix">Nome base dos projetos</Label>
              <Input
                id="orchestrator-prefix"
                value={projectPrefix}
                onChange={(event) => setProjectPrefix(event.target.value)}
                placeholder={`${channelName} · Produção`}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="orchestrator-quantity">
                {mode === "batch" ? "Temas / projetos" : "Projetos"}
              </Label>
              <Input
                id="orchestrator-quantity"
                type="number"
                min={1}
                max={50}
                value={quantity}
                onChange={(event) =>
                  setQuantity(Math.min(50, Math.max(1, Number(event.target.value) || 1)))
                }
              />
            </div>
            <Button
              type="button"
              onClick={start}
              disabled={isStarting || !projectPrefix.trim()}
              className="gap-1.5 text-white"
            >
              <Play className="size-4" />
              {isStarting ? "Iniciando…" : "Iniciar fila"}
            </Button>
          </div>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            O orquestrador nunca executa dois itens desta fila ao mesmo tempo. Notificações humanas
            continuam aparecendo na central global e precisam ser resolvidas no projeto indicado.
          </p>
        </div>
      )}
    </section>
  );
}

function ModeButton({
  active,
  icon: Icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: typeof Route;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 text-left transition",
        active
          ? "border-brand/45 bg-brand/10"
          : "border-border/60 bg-background/30 hover:border-border hover:bg-background/50",
      )}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", active && "text-brand-soft")} />
      <span>
        <span className="block text-xs font-semibold">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}
