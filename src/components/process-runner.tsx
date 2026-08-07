import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  LoaderCircle,
  Play,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockExecution,
  type ChannelLibraryItem,
  type ProcessExecution,
  type ProcessId,
  type Project,
  type StrategicCollection,
} from "@/lib/domain";
import { PROCESS_ROUTE_SEGMENT } from "@/lib/human-workflow";
import {
  advanceProcessExecution,
  chooseCollectionItem,
  confirmHumanAction,
  resetStage,
  startProcessExecution,
  useChannel,
  useLibraryCollections,
  useLibraryItems,
  useProcessExecution,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<BlockExecution["status"], string> = {
  pending: "Aguardando a etapa anterior",
  awaiting_human: "Aguardando ação humana",
  in_progress: "Em execução",
  completed: "Concluído",
  blocked_executor: "Preparando execução",
  cancelled: "Cancelado",
};

const EXECUTION_STEP_DELAY = 850;
const NEXT_PROCESS_DELAY = 1100;

export function ProcessRunner({
  project,
  processId,
  description,
}: {
  project?: Project;
  processId: ProcessId;
  description: string;
}) {
  const navigate = useNavigate();
  const channel = useChannel(project?.channelId ?? "");
  const collections = useLibraryCollections(project?.channelId);
  const libraryItems = useLibraryItems(project?.channelId);
  const execution = useProcessExecution(project?.id ?? "", processId);
  const method = channel?.methods[processId];
  const meta = PROCESS_META[processId];
  const completed = execution?.status === "completed";
  const nextProcess = PROCESS_ORDER[PROCESS_ORDER.indexOf(processId) + 1];
  const nextNavigationTimer = useRef<number | undefined>(undefined);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const activeExecution = execution?.blocks.find((item) => item.status !== "completed");
  const activeBlock = activeExecution
    ? execution?.methodSnapshot.blocks.find((item) => item.id === activeExecution.blockId)
    : undefined;
  const waitingForHumanAction =
    activeExecution?.status === "awaiting_human" && activeBlock?.operator === "Humano";
  const waitingForHumanChoice =
    waitingForHumanAction && activeBlock?.type === "ESCOLHER" && activeBlock.operator === "Humano";

  const scheduleNextProcess = useCallback(() => {
    if (!project || !channel || !nextProcess || nextNavigationTimer.current) return;
    setIsAdvancing(true);
    nextNavigationTimer.current = window.setTimeout(() => {
      if (channel.methods[nextProcess].blocks.length) {
        startProcessExecution(project.id, nextProcess);
      }
      navigate({ to: `/project/${project.id}/${PROCESS_ROUTE_SEGMENT[nextProcess]}` });
    }, NEXT_PROCESS_DELAY);
  }, [channel, navigate, nextProcess, project]);

  useEffect(
    () => () => {
      if (nextNavigationTimer.current) window.clearTimeout(nextNavigationTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!execution || completed || waitingForHumanAction) return;
    const timer = window.setTimeout(() => {
      const updatedExecution = advanceProcessExecution(execution.id);
      if (updatedExecution?.status === "completed") scheduleNextProcess();
    }, EXECUTION_STEP_DELAY);
    return () => window.clearTimeout(timer);
  }, [completed, execution, execution?.updatedAt, scheduleNextProcess, waitingForHumanAction]);

  if (!project || !channel) return null;
  const projectId = project.id;
  const channelId = channel.id;

  function openMethodBuilder() {
    navigate({
      to: `/channel/${channelId}/methods`,
      search: { process: processId } as never,
    });
  }

  function start() {
    const started = startProcessExecution(projectId, processId);
    if (!started) {
      toast.error(`Crie um método de ${meta.label} antes de iniciar.`);
      return;
    }
    toast.success(`Processo de ${meta.label} iniciado`, {
      description: "Os blocos serão executados na ordem definida no método.",
    });
  }

  function completeHumanAction() {
    if (!execution || !activeBlock) return;
    const updatedExecution = confirmHumanAction(execution.id, activeBlock.id);
    if (!updatedExecution) {
      toast.error("Não foi possível concluir esta ação humana.");
      return;
    }
    if (updatedExecution.status === "completed") {
      toast.success("Ação humana concluída. O processo foi finalizado.");
      scheduleNextProcess();
      return;
    }
    toast.success("Ação humana concluída. O processo continuará.");
  }

  function chooseItem(itemId: string) {
    if (!execution || !activeBlock) return;
    if (!chooseCollectionItem(execution.id, activeBlock.id, itemId)) {
      toast.error("Não foi possível registrar esta escolha.");
      return;
    }
    if (execution.status === "completed") {
      toast.success("Opção escolhida. O processo foi concluído.");
      scheduleNextProcess();
      return;
    }
    toast.success("Opção escolhida. O processo continuará.");
  }

  return (
    <main className="flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6">
      <section className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-brand/15 text-brand-soft">
              <meta.icon className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{meta.label}</h2>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {completed ? (
            <Button variant="outline" size="sm" onClick={() => resetStage(project.id, processId)}>
              <RotateCcw className="mr-1.5 size-3.5" /> Executar novamente
            </Button>
          ) : !method?.blocks.length ? (
            <Button size="sm" variant="destructive" onClick={openMethodBuilder}>
              <AlertTriangle className="mr-1.5 size-3.5" /> Método necessário
            </Button>
          ) : !execution ? (
            <Button size="sm" onClick={start} className="gradient-brand text-white">
              <Play className="mr-1.5 size-3.5 fill-current" /> Executar processo
            </Button>
          ) : null}
        </div>
      </section>

      {!method?.blocks.length ? (
        <MissingMethod processLabel={meta.label} onOpenMethodBuilder={openMethodBuilder} />
      ) : execution ? (
        <>
          <ExecutionTimeline execution={execution} />
          {waitingForHumanChoice && activeBlock ? (
            <HumanChoiceGate
              block={activeBlock}
              collection={collections.find((item) => item.id === activeBlock.collectionId)}
              items={libraryItems.filter((item) => item.collectionId === activeBlock.collectionId)}
              libraryUrl={`/channel/${channelId}/library`}
              onChoose={chooseItem}
            />
          ) : waitingForHumanAction && activeBlock ? (
            <HumanActionGate block={activeBlock} onConfirm={completeHumanAction} />
          ) : completed ? (
            <ProcessCompleted
              processLabel={meta.label}
              advancesAutomatically={isAdvancing}
              isPublishing={!nextProcess}
            />
          ) : activeBlock ? (
            <ActiveExecutionBlock block={activeBlock} />
          ) : null}
        </>
      ) : (
        <MethodPreview method={method.blocks} />
      )}
    </main>
  );
}

function MissingMethod({
  processLabel,
  onOpenMethodBuilder,
}: {
  processLabel: string;
  onOpenMethodBuilder: () => void;
}) {
  return (
    <section className="rounded-xl border border-destructive/35 bg-destructive/5 px-5 py-12 text-center">
      <AlertTriangle className="mx-auto size-7 text-destructive" />
      <p className="mt-3 text-sm font-medium">Nenhum método salvo para este processo.</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Crie ou importe um método de {processLabel} para liberar a execução.
      </p>
      <Button className="mt-4" variant="destructive" size="sm" onClick={onOpenMethodBuilder}>
        Criar ou importar método
      </Button>
    </section>
  );
}

function ExecutionTimeline({ execution }: { execution: ProcessExecution }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Execução do método
        </h3>
        <Badge variant="outline">
          {execution.blocks.filter((item) => item.status === "completed").length}/
          {execution.blocks.length}
        </Badge>
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {execution.blocks.map((item, index) => {
          const block = execution.methodSnapshot.blocks.find(
            (candidate) => candidate.id === item.blockId,
          );
          const done = item.status === "completed";
          const waiting = item.status === "awaiting_human";
          const running = ["in_progress", "blocked_executor"].includes(item.status);
          return (
            <div
              key={item.blockId}
              className={cn(
                "rounded-lg border p-3 transition-colors duration-500",
                done
                  ? "border-success/40 bg-success/10"
                  : waiting
                    ? "border-warning/45 bg-warning/10"
                    : running
                      ? "border-brand/40 bg-brand/10"
                      : "border-border/60 bg-background/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full transition-colors duration-500",
                    done
                      ? "bg-success text-white"
                      : waiting
                        ? "bg-warning/20 text-warning"
                        : running
                          ? "bg-brand/20 text-brand-soft"
                          : "bg-secondary text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : running ? (
                    <LoaderCircle className="size-3.5 animate-spin" />
                  ) : (
                    <span className="font-mono text-[10px]">{index + 1}</span>
                  )}
                </span>
                <span className="truncate text-xs font-semibold">{block?.name ?? block?.type}</span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{STATUS_LABEL[item.status]}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function MethodPreview({ method }: { method: ActionBlock[] }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-5">
      <h3 className="text-sm font-semibold">Método pronto para executar</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Os blocos serão executados na ordem abaixo. A execução pausará sempre que o operador for
        humano.
      </p>
      <ol className="mt-4 space-y-2">
        {method.map((block, index) => (
          <li
            key={block.id}
            className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/30 p-3"
          >
            <span className="grid size-7 place-items-center rounded-full bg-brand/15 font-mono text-xs text-brand-soft">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{block.name ?? block.type}</p>
              <p className="truncate text-xs text-muted-foreground">
                {block.instructions || "Sem instruções adicionais"}
              </p>
            </div>
            <OperatorBadge block={block} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ActiveExecutionBlock({ block }: { block: ActionBlock }) {
  return (
    <section className="rounded-xl border border-brand/35 bg-brand/5 p-8 text-center">
      <LoaderCircle className="mx-auto size-7 animate-spin text-brand-soft" />
      <Badge variant="outline" className="mt-3 border-brand/35 text-brand-soft">
        Em execução
      </Badge>
      <h3 className="mt-3 text-base font-semibold">{block.name ?? block.type}</h3>
      <p className="mx-auto mt-1 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
        {block.instructions || "Executando esta ação conforme a posição definida no método."}
      </p>
      <div className="mt-4 flex justify-center">
        <OperatorBadge block={block} />
      </div>
    </section>
  );
}

function HumanChoiceGate({
  block,
  collection,
  items,
  libraryUrl,
  onChoose,
}: {
  block: ActionBlock;
  collection?: StrategicCollection;
  items: ChannelLibraryItem[];
  libraryUrl: string;
  onChoose: (itemId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-violet-500/40 bg-violet-500/5 p-5 sm:p-6">
      <div className="text-center">
        <UserRound className="mx-auto size-7 text-violet-300" />
        <Badge variant="outline" className="mt-3 border-violet-500/40 text-violet-300">
          Escolha humana
        </Badge>
        <h3 className="mt-3 text-base font-semibold">{block.name ?? "Escolher opção"}</h3>
        <p className="mx-auto mt-1 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
          {block.instructions || "Escolha um dos itens da coleção para continuar o método."}
        </p>
      </div>

      {!collection ? (
        <div className="mx-auto mt-5 max-w-xl rounded-xl border border-destructive/35 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-medium text-destructive">Nenhuma coleção vinculada</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Volte ao método e selecione qual coleção pertence a este bloco Escolher.
          </p>
        </div>
      ) : items.length ? (
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onChoose(item.id)}
              className="rounded-xl border border-border/70 bg-card p-4 text-left transition hover:border-violet-500/50 hover:bg-violet-500/5"
            >
              <dl className="space-y-2.5">
                {collection.fields.map((field) => {
                  const value = item.values[field.id];
                  if (!value) return null;
                  return (
                    <div key={field.id}>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {field.label}
                      </dt>
                      <dd className="mt-0.5 text-sm">
                        {field.type === "image" && typeof value === "object" ? (
                          <img
                            src={value.url}
                            alt={value.name}
                            className="max-h-48 w-full rounded-lg border border-border/60 object-cover"
                          />
                        ) : (
                          <span className="whitespace-pre-wrap">{String(value)}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </button>
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-5 max-w-xl rounded-xl border border-warning/35 bg-warning/5 p-5 text-center">
          <p className="text-sm font-medium">A coleção “{collection.name}” está vazia</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Adicione ao menos um item antes de continuar esta escolha.
          </p>
        </div>
      )}

      {(!collection || !items.length) && (
        <div className="mt-4 text-center">
          <Button asChild size="sm" variant="outline">
            <a href={libraryUrl}>Abrir Biblioteca Estratégica</a>
          </Button>
        </div>
      )}
    </section>
  );
}

function HumanActionGate({ block, onConfirm }: { block: ActionBlock; onConfirm: () => void }) {
  const isValidation = block.type === "VALIDAR";
  return (
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-8 text-center">
      <UserRound className="mx-auto size-7 text-warning" />
      <Badge variant="outline" className="mt-3 border-warning/40 text-warning">
        Aguardando operador humano
      </Badge>
      <h3 className="mt-3 text-base font-semibold">{block.name ?? block.type}</h3>
      <p className="mx-auto mt-1 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
        {block.instructions ||
          "Realize esta ação conforme o método e confirme para permitir que o processo continue."}
      </p>
      <Button className="mt-5" onClick={onConfirm}>
        <CheckCircle2 className="mr-1.5 size-4" />
        {isValidation ? "Confirmar validação" : "Concluir ação humana"}
      </Button>
    </section>
  );
}

function ProcessCompleted({
  processLabel,
  advancesAutomatically,
  isPublishing,
}: {
  processLabel: string;
  advancesAutomatically: boolean;
  isPublishing: boolean;
}) {
  return (
    <section className="rounded-xl border border-success/40 bg-success/5 p-10 text-center">
      <CheckCircle2 className="mx-auto size-8 text-success" />
      <h3 className="mt-3 text-base font-semibold">{processLabel} concluído</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        {advancesAutomatically
          ? "Avançando automaticamente para o próximo processo..."
          : isPublishing
            ? "A execução chegou ao final do fluxo de publicação."
            : "Este processo já foi concluído e permanece disponível para consulta."}
      </p>
      {advancesAutomatically && (
        <LoaderCircle className="mx-auto mt-4 size-4 animate-spin text-success" />
      )}
    </section>
  );
}

function OperatorBadge({ block }: { block: ActionBlock }) {
  const Icon = block.operator === "Humano" ? UserRound : block.operator === "IA" ? Bot : Code2;
  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="size-3" />
      {block.operator}
    </Badge>
  );
}
