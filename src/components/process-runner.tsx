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
  Square,
  UserRound,
} from "lucide-react";
import { RuntimeFieldsForm } from "@/components/runtime-fields-form";
import { RuntimeValueViewer } from "@/components/runtime-value-viewer";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockExecution,
  type ChannelLibraryItem,
  type HumanFieldType,
  type ProcessExecution,
  type ProcessId,
  type Project,
  type RuntimeValue,
  type StoredFile,
  type StrategicCollection,
  type StructuredRecord,
  type ThumbnailLayout,
} from "@/lib/domain";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  PROCESS_ROUTE_SEGMENT,
} from "@/lib/human-workflow";
import { resolveBlockInputs } from "@/lib/runtime-contract";
import {
  cancelProcessExecution,
  chooseCollectionItem,
  completeHumanBlock,
  completeProcessOutput,
  resetStage,
  retryBlockExecution,
  saveHumanBlockDraft,
  startProcessExecution,
  useChannel,
  useLibraryCollections,
  useLibraryItems,
  useProcessExecution,
  useProjectExecutions,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<BlockExecution["status"], string> = {
  pending: "Aguardando a etapa anterior",
  awaiting_human: "Aguardando ação humana",
  in_progress: "Em execução",
  completed: "Concluído",
  blocked_executor: "Preparando execução",
  failed: "Falhou",
  cancelled: "Cancelado",
};

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
  const projectExecutions = useProjectExecutions(project?.id ?? "");
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
  const blockedByMissingPlugin =
    activeExecution?.status === "blocked_executor" && activeBlock?.operator !== "Humano";
  const awaitingOutput = execution?.status === "awaiting_output";
  const methodIssue = getMethodConfigurationIssue(method);

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
      toast.error(methodIssue ?? `Crie um método de ${meta.label} antes de iniciar.`);
      return;
    }
    toast.success(`Processo de ${meta.label} iniciado`, {
      description: "Os blocos serão executados na ordem definida no método.",
    });
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

  function cancel() {
    if (!execution || !cancelProcessExecution(execution.id)) return;
    toast.info("Execução cancelada.");
  }

  function retry() {
    if (
      !execution ||
      !activeExecution ||
      !retryBlockExecution(execution.id, activeExecution.blockId)
    )
      return;
    toast.success("Bloco preparado para uma nova tentativa.");
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
          {completed || execution?.status === "cancelled" ? (
            <Button variant="outline" size="sm" onClick={() => resetStage(project.id, processId)}>
              <RotateCcw className="mr-1.5 size-3.5" /> Executar novamente
            </Button>
          ) : methodIssue ? (
            <Button size="sm" variant="destructive" onClick={openMethodBuilder}>
              <AlertTriangle className="mr-1.5 size-3.5" /> Configurar método
            </Button>
          ) : !execution ? (
            <Button size="sm" onClick={start} className="gradient-brand text-white">
              <Play className="mr-1.5 size-3.5 fill-current" /> Executar processo
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={cancel}>
              <Square className="mr-1.5 size-3.5 fill-current" /> Cancelar execução
            </Button>
          )}
        </div>
      </section>

      {methodIssue ? (
        <MissingMethod
          processLabel={meta.label}
          configurationIssue={methodIssue}
          onOpenMethodBuilder={openMethodBuilder}
        />
      ) : execution ? (
        <>
          <ExecutionTimeline execution={execution} />
          <ExecutionResults
            execution={execution}
            collections={collections}
            libraryItems={libraryItems}
          />
          {waitingForHumanChoice && activeBlock ? (
            <HumanChoiceGate
              block={activeBlock}
              collection={collections.find((item) => item.id === activeBlock.collectionId)}
              items={libraryItems.filter((item) => item.collectionId === activeBlock.collectionId)}
              libraryUrl={`/channel/${channelId}/library`}
              onChoose={chooseItem}
            />
          ) : waitingForHumanAction && activeBlock ? (
            <HumanBlockGate
              key={activeBlock.id}
              block={activeBlock}
              execution={execution}
              project={project}
              projectExecutions={projectExecutions}
              collections={collections}
              libraryItems={libraryItems}
              onProcessCompleted={scheduleNextProcess}
            />
          ) : awaitingOutput ? (
            <ProcessOutputGate execution={execution} onCompleted={scheduleNextProcess} />
          ) : blockedByMissingPlugin && activeBlock ? (
            <MissingPluginGate block={activeBlock} />
          ) : execution.status === "failed" && activeBlock && activeExecution ? (
            <FailedExecutionGate
              block={activeBlock}
              error={activeExecution.error ?? execution.error}
              onRetry={retry}
            />
          ) : execution.status === "cancelled" ? (
            <ExecutionCancelled />
          ) : completed ? (
            <ProcessCompleted
              processType={processId}
              processLabel={meta.label}
              advancesAutomatically={isAdvancing}
              isPublishing={!nextProcess}
              output={execution.output?.values}
            />
          ) : activeBlock ? (
            <ActiveExecutionBlock block={activeBlock} />
          ) : null}
        </>
      ) : (
        <MethodPreview method={method?.blocks ?? []} />
      )}
    </main>
  );
}

function MissingMethod({
  processLabel,
  configurationIssue,
  onOpenMethodBuilder,
}: {
  processLabel: string;
  configurationIssue?: string;
  onOpenMethodBuilder: () => void;
}) {
  return (
    <section className="rounded-xl border border-destructive/35 bg-destructive/5 px-5 py-12 text-center">
      <AlertTriangle className="mx-auto size-7 text-destructive" />
      <p className="mt-3 text-sm font-medium">{configurationIssue}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Revise o método de {processLabel} para liberar a execução.
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

function ExecutionResults({
  execution,
  collections,
  libraryItems,
}: {
  execution: ProcessExecution;
  collections: StrategicCollection[];
  libraryItems: ChannelLibraryItem[];
}) {
  const completed = execution.blocks.filter((item) => item.status === "completed");
  if (!completed.length) return null;

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Resultados produzidos
      </h3>
      <div className="mt-3 space-y-2">
        {completed.map((blockExecution, index) => {
          const block = execution.methodSnapshot.blocks.find(
            (candidate) => candidate.id === blockExecution.blockId,
          );
          if (!block) return null;
          const selectedItemId = blockExecution.values.selectedItemId;
          const selectedItem =
            block.type === "ESCOLHER" && typeof selectedItemId === "string"
              ? libraryItems.find((item) => item.id === selectedItemId)
              : undefined;
          const collection = collections.find(
            (candidate) => candidate.id === selectedItem?.collectionId,
          );
          const outputs = (block.outputs ?? []).filter(
            (output) => !isEmptyDisplayValue(blockExecution.values[output.key]),
          );

          return (
            <details
              key={blockExecution.blockId}
              className="group rounded-lg border border-border/60 bg-background/30"
              open={index === completed.length - 1}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
                <CheckCircle2 className="size-4 text-success" />
                <span className="min-w-0 flex-1 truncate">{block.name ?? block.type}</span>
                <Badge variant="outline" className="text-[9px] text-success">
                  Concluído
                </Badge>
              </summary>
              <div className="border-t border-border/60 p-3">
                {selectedItem && collection ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {collection.fields.map((field) => (
                      <ResultValue
                        key={field.id}
                        label={field.label}
                        type={field.type}
                        value={selectedItem.values[field.id]}
                      />
                    ))}
                  </div>
                ) : outputs.length ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {outputs.map((output) => (
                      <ResultValue
                        key={output.id}
                        label={output.label}
                        type={output.type}
                        value={blockExecution.values[output.key]}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Esta ação foi concluída sem uma entrega visual.
                  </p>
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function ResultValue({
  label,
  type,
  value,
  source,
}: {
  label: string;
  type: Parameters<typeof RuntimeValueViewer>[0]["type"];
  value: RuntimeValue | undefined;
  source?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/50 bg-card/60 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {source && (
          <Badge variant="secondary" className="text-[9px]">
            de {source}
          </Badge>
        )}
      </div>
      <RuntimeValueViewer type={type} value={value} compact />
    </div>
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
                      <dd className="mt-1 text-sm">
                        <RuntimeValueViewer type={field.type} value={value} compact />
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

function valuesAsOptions(value: RuntimeValue | undefined) {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      typeof item === "string" ? [item] : isStoredFileOption(item) ? [item.name] : [],
    );
  }
  if (typeof value === "string")
    return value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

type ValidationOption =
  string | number | boolean | StoredFile | StructuredRecord | ThumbnailLayout | null;

function isStoredFileOption(value: unknown): value is StoredFile {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && "url" in value);
}

function validationOptionKey(value: ValidationOption) {
  if (isStoredFileOption(value)) return value.id;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function validationOptions(value: RuntimeValue | undefined): ValidationOption[] {
  if (Array.isArray(value)) return value as ValidationOption[];
  if (typeof value === "string") {
    const lines = value
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    return lines.length ? lines : [value];
  }
  return value === undefined || value === null ? [] : [value];
}

function validationOptionType(value: ValidationOption, sourceType: HumanFieldType): HumanFieldType {
  if (!isStoredFileOption(value)) return typeof value === "string" ? "text" : sourceType;
  if (value.mimeType.startsWith("image/")) return "image";
  if (value.mimeType.startsWith("audio/")) return "audio";
  if (value.mimeType.startsWith("video/")) return "video";
  return "file";
}

function ValidationChoiceField({
  block,
  execution,
  values,
  onChange,
}: {
  block: ActionBlock;
  execution: ProcessExecution;
  values: Record<string, RuntimeValue>;
  onChange: (values: Record<string, RuntimeValue>) => void;
}) {
  const config = block.validation;
  const targetBlock = execution.methodSnapshot.blocks.find(
    (candidate) => candidate.id === config?.targetBlockId,
  );
  const targetOutput = targetBlock?.outputs?.find(
    (output) => output.key === config?.targetOutputKey,
  );
  const targetExecution = execution.blocks.find(
    (candidate) => candidate.blockId === config?.targetBlockId,
  );
  const options = validationOptions(targetExecution?.values[config?.targetOutputKey ?? ""]);
  const field = (block.outputs ?? []).find((output) =>
    ["selected_value", "selected_values"].includes(output.key),
  );
  if (!field || !targetOutput) {
    return (
      <div className="mb-4 rounded-lg border border-destructive/35 bg-destructive/5 p-3 text-xs text-destructive">
        A saída usada nesta escolha não está configurada.
      </div>
    );
  }

  const multiple = config?.mode === "select_many";
  const fieldKey = field.key;
  const fieldLabel = field.label;
  const fieldRequired = field.required;
  const targetOutputType = targetOutput.type;
  const storedValue = values[fieldKey];
  const current: ValidationOption[] = multiple
    ? Array.isArray(storedValue)
      ? (storedValue as ValidationOption[])
      : []
    : targetOutputType === "records" && Array.isArray(storedValue)
      ? (storedValue.slice(0, 1) as ValidationOption[])
      : storedValue === undefined || storedValue === null
        ? []
        : [storedValue as ValidationOption];
  const selectedKeys = new Set(current.map(validationOptionKey));

  function toggle(option: ValidationOption) {
    const key = validationOptionKey(option);
    if (!multiple) {
      onChange({
        ...values,
        [fieldKey]:
          targetOutputType === "records" ? ([option] as RuntimeValue) : (option as RuntimeValue),
      });
      return;
    }
    const next = selectedKeys.has(key)
      ? current.filter((item) => validationOptionKey(item) !== key)
      : [...current, option];
    onChange({ ...values, [fieldKey]: next as RuntimeValue });
  }

  return (
    <div className="mb-4 space-y-2">
      <Label>
        {fieldLabel}
        {fieldRequired && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {options.length ? (
        <div className="grid gap-2 md:grid-cols-2">
          {options.map((option) => {
            const key = validationOptionKey(option);
            const selected = selectedKeys.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggle(option)}
                className={cn(
                  "rounded-xl border p-3 text-left transition",
                  selected
                    ? "border-brand/60 bg-brand/10"
                    : "border-border/70 bg-background/30 hover:border-brand/35",
                )}
              >
                <div className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 grid size-4 shrink-0 place-items-center border",
                      multiple ? "rounded" : "rounded-full",
                      selected ? "border-brand bg-brand text-white" : "border-border",
                    )}
                  >
                    {selected && <Check className="size-3" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <RuntimeValueViewer
                      type={validationOptionType(option, targetOutputType)}
                      value={option}
                      compact
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
          O bloco validado não produziu opções nesta saída.
        </p>
      )}
    </div>
  );
}

function HumanBlockGate({
  block,
  execution,
  project,
  projectExecutions,
  collections,
  libraryItems,
  onProcessCompleted,
}: {
  block: ActionBlock;
  execution: ProcessExecution;
  project: Project;
  projectExecutions: ProcessExecution[];
  collections: StrategicCollection[];
  libraryItems: ChannelLibraryItem[];
  onProcessCompleted: () => void;
}) {
  const blockExecution = execution.blocks.find((item) => item.blockId === block.id);
  const retryFeedback = blockExecution?.retryFeedback;
  const [values, setValues] = useState<Record<string, RuntimeValue>>(
    structuredClone(blockExecution?.values ?? {}),
  );
  const blockIndex = execution.methodSnapshot.blocks.findIndex((item) => item.id === block.id);
  const previousExecutions = execution.blocks
    .slice(0, blockIndex)
    .filter((item) => item.status === "completed");
  const resolvedInputs = resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions,
    collections,
    libraryItems,
  });
  const missingInputs = resolvedInputs.filter((item) => !item.resolved);
  const context: Array<{
    label: string;
    type: Parameters<typeof RuntimeValueViewer>[0]["type"];
    value: RuntimeValue;
    source?: string;
  }> = [];

  for (const previousProcess of projectExecutions
    .filter(
      (item) => item.processType !== execution.processType && item.outputStatus === "completed",
    )
    .sort((a, b) => PROCESS_ORDER.indexOf(a.processType) - PROCESS_ORDER.indexOf(b.processType))) {
    for (const output of createProcessOutputFields(previousProcess.processType)) {
      const value = previousProcess.output?.values[output.key];
      if (!isEmptyDisplayValue(value)) {
        context.push({
          label: output.label,
          type: output.type,
          value: value!,
          source: `Processo ${PROCESS_META[previousProcess.processType].label}`,
        });
      }
    }
  }

  for (const previous of previousExecutions) {
    const previousBlock = execution.methodSnapshot.blocks.find(
      (item) => item.id === previous.blockId,
    );
    if (previousBlock?.type === "ESCOLHER" && typeof previous.values.selectedItemId === "string") {
      const selectedItem = libraryItems.find((item) => item.id === previous.values.selectedItemId);
      const collection = collections.find((item) => item.id === selectedItem?.collectionId);
      for (const field of collection?.fields ?? []) {
        const value = selectedItem?.values[field.id];
        if (value !== undefined) {
          context.push({
            label: field.label,
            type: field.type,
            value,
            source: previousBlock.name ?? "Escolher",
          });
        }
      }
      continue;
    }
    for (const output of previousBlock?.outputs ?? []) {
      const value = previous.values[output.key];
      if (!isEmptyDisplayValue(value)) {
        context.push({
          label: output.label,
          type: output.type,
          value: value!,
          source: previousBlock?.name ?? previousBlock?.type,
        });
      }
    }
  }

  const latestListOptions =
    [...previousExecutions]
      .reverse()
      .map((previous) => {
        const definition = execution.methodSnapshot.blocks.find(
          (item) => item.id === previous.blockId,
        );
        return (definition?.outputs ?? [])
          .filter((output) => output.type === "list")
          .flatMap((output) => valuesAsOptions(previous.values[output.key]));
      })
      .find((options) => options.length > 0) ?? [];
  const dynamicOptions = Object.fromEntries(
    (block.outputs ?? []).map((field) => {
      const source = execution.blocks.find((item) => item.blockId === field.optionsSourceBlockId);
      const configured = valuesAsOptions(source?.values[field.optionsSourceKey ?? ""]);
      return [field.id, configured.length ? configured : latestListOptions] as const;
    }),
  );

  function updateValues(nextValues: Record<string, RuntimeValue>) {
    setValues(nextValues);
    if (blockExecution) saveHumanBlockDraft(execution.id, block.id, nextValues);
  }

  function submit() {
    if (missingInputs.length) {
      toast.error("Existem entradas sem conexão", {
        description: missingInputs.map((item) => item.input.label).join(", "),
      });
      return;
    }
    const result = completeHumanBlock(execution.id, block.id, values);
    if (!result.ok) {
      toast.error("A ação ainda não pode ser concluída", {
        description: result.missing.join(", "),
      });
      return;
    }
    if (result.retriedBlock) {
      toast.info(`Nova tentativa iniciada em “${result.retriedBlock}”.`, {
        description: "Os blocos seguintes serão executados novamente com o novo resultado.",
      });
    } else if (result.pausedValidation) {
      toast.info("Resultado reprovado. A validação permanece pausada para revisão.");
    } else if (result.completedProcess) {
      toast.success("Processo concluído.");
      onProcessCompleted();
    } else if (execution.status === "awaiting_output") {
      toast.success("Ação concluída", {
        description: "Registre agora o resultado final do processo.",
      });
    } else {
      toast.success("Ação concluída. O próximo bloco está pronto.");
    }
  }

  return (
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Badge variant="outline" className="border-warning/40 text-warning">
            <UserRound className="mr-1 size-3" /> Aguardando operador humano
          </Badge>
          <h3 className="mt-3 text-base font-semibold">{block.name ?? block.type}</h3>
          <p className="mt-1 max-w-2xl whitespace-pre-wrap text-sm text-muted-foreground">
            {block.instructions || "Realize esta ação e registre as entregas para continuar."}
          </p>
        </div>
        <OperatorBadge block={block} />
      </header>

      {retryFeedback && (
        <div className="mt-5 rounded-xl border border-amber-500/35 bg-amber-500/5 p-4">
          <p className="text-xs font-semibold text-amber-300">
            Nova tentativa solicitada pela validação
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
            {typeof retryFeedback.feedback === "string" && retryFeedback.feedback.trim()
              ? retryFeedback.feedback
              : "O resultado anterior foi reprovado. Produza uma nova versão antes de continuar."}
          </p>
        </div>
      )}

      {resolvedInputs.length > 0 && (
        <div className="mt-5 rounded-xl border border-border/70 bg-background/30 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Entradas recebidas
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {resolvedInputs.map((item) =>
              item.resolved ? (
                <ResultValue
                  key={item.input.id}
                  label={item.input.label}
                  type={item.input.type}
                  value={item.value}
                  source={item.sourceLabel}
                />
              ) : (
                <div
                  key={item.input.id}
                  className="rounded-lg border border-destructive/35 bg-destructive/5 p-3"
                >
                  <p className="text-xs font-semibold text-destructive">{item.input.label}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Nenhuma saída anterior compatível com este formato foi encontrada.
                  </p>
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {resolvedInputs.length === 0 && context.length > 0 && (
        <div className="mt-5 rounded-xl border border-border/70 bg-background/30 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Contexto disponível
          </h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {context.map((item, index) => (
              <ResultValue key={`${item.label}-${index}`} {...item} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        <h4 className="mb-4 text-sm font-semibold">Entrega desta ação</h4>
        {block.type === "VALIDAR" && block.validation?.mode !== "approval" && (
          <ValidationChoiceField
            block={block}
            execution={execution}
            values={values}
            onChange={updateValues}
          />
        )}
        {(block.outputs ?? []).length ? (
          <RuntimeFieldsForm
            fields={(block.outputs ?? []).filter(
              (field) =>
                block.type !== "VALIDAR" ||
                block.validation?.mode === "approval" ||
                !["selected_value", "selected_values"].includes(field.key),
            )}
            values={values}
            dynamicOptions={dynamicOptions}
            onChange={updateValues}
          />
        ) : (
          <p className="text-xs text-muted-foreground">Esta ação não exige campos adicionais.</p>
        )}
        <Button className="mt-5" disabled={missingInputs.length > 0} onClick={submit}>
          <CheckCircle2 className="mr-1.5 size-4" /> Concluir ação humana
        </Button>
      </div>
    </section>
  );
}

function isEmptyDisplayValue(value: RuntimeValue | undefined) {
  return value == null || value === "" || (Array.isArray(value) && value.length === 0);
}

function ProcessOutputGate({
  execution,
  onCompleted,
}: {
  execution: ProcessExecution;
  onCompleted: () => void;
}) {
  const fields = createProcessOutputFields(execution.processType);
  const [values, setValues] = useState<Record<string, RuntimeValue>>(
    execution.output?.values ?? {},
  );

  function submit() {
    const result = completeProcessOutput(execution.id, values);
    if (!result.ok) {
      toast.error("Informe o resultado final", { description: result.missing.join(", ") });
      return;
    }
    toast.success("Resultado salvo. Processo concluído.");
    onCompleted();
  }

  return (
    <section className="rounded-xl border border-brand/40 bg-brand/5 p-5 sm:p-6">
      <Badge variant="outline" className="border-brand/40 text-brand-soft">
        Resultado universal
      </Badge>
      <h3 className="mt-3 text-base font-semibold">Entregue o resultado final deste processo</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Os blocos do método terminaram. Este resultado será salvo no projeto e poderá alimentar os
        próximos processos.
      </p>
      <div className="mt-5 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
        <RuntimeFieldsForm fields={fields} values={values} onChange={setValues} />
        <Button className="mt-5" onClick={submit}>
          <CheckCircle2 className="mr-1.5 size-4" /> Salvar resultado e concluir
        </Button>
      </div>
    </section>
  );
}

function MissingPluginGate({ block }: { block: ActionBlock }) {
  return (
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-8 text-center">
      <AlertTriangle className="mx-auto size-7 text-warning" />
      <h3 className="mt-3 text-base font-semibold">Plugin necessário para continuar</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        O bloco “{block.name ?? block.type}” está atribuído ao operador {block.operator}, mas ainda
        não existe um executor configurado. Para testar a produção humana, altere o operador para
        Humano.
      </p>
    </section>
  );
}

function ExecutionCancelled() {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-8 text-center">
      <Square className="mx-auto size-7 text-muted-foreground" />
      <h3 className="mt-3 text-base font-semibold">Execução cancelada</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Use “Executar novamente” para iniciar uma nova execução deste processo.
      </p>
    </section>
  );
}

function FailedExecutionGate({
  block,
  error,
  onRetry,
}: {
  block: ActionBlock;
  error?: string;
  onRetry: () => void;
}) {
  return (
    <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-8 text-center">
      <AlertTriangle className="mx-auto size-7 text-destructive" />
      <h3 className="mt-3 text-base font-semibold">O bloco “{block.name ?? block.type}” falhou</h3>
      <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
        {error ?? "A execução não pôde ser concluída."}
      </p>
      <Button className="mt-5" variant="destructive" onClick={onRetry}>
        <RotateCcw className="mr-1.5 size-4" /> Tentar novamente
      </Button>
    </section>
  );
}

function ProcessCompleted({
  processType,
  processLabel,
  advancesAutomatically,
  isPublishing,
  output,
}: {
  processType: ProcessId;
  processLabel: string;
  advancesAutomatically: boolean;
  isPublishing: boolean;
  output?: Record<string, RuntimeValue>;
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
      {output && Object.keys(output).length > 0 && (
        <div className="mx-auto mt-5 max-w-2xl rounded-xl border border-success/25 bg-background/30 p-4 text-left">
          {createProcessOutputFields(processType).map((field) => (
            <ResultValue
              key={field.id}
              label={field.label}
              type={field.type}
              value={output[field.key]}
            />
          ))}
        </div>
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
