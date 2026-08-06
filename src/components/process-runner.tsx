import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  FileUp,
  LoaderCircle,
  Play,
  RotateCcw,
  Save,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  PROCESS_META,
  PROCESS_ORDER,
  type ActionBlock,
  type BlockExecution,
  type BlockFieldDefinition,
  type ProcessExecution,
  type ProcessId,
  type Project,
  type RuntimeValue,
  type StoredFile,
} from "@/lib/domain";
import { formatRuntimeValue, PROCESS_ROUTE_SEGMENT } from "@/lib/human-workflow";
import {
  completeHumanBlock,
  resetStage,
  saveHumanBlockDraft,
  startProcessExecution,
  uploadLocalFile,
  useChannel,
  useLibraryItems,
  useProcessExecution,
} from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<BlockExecution["status"], string> = {
  pending: "Bloqueado pela etapa anterior",
  awaiting_human: "Aguardando humano",
  in_progress: "Rascunho salvo",
  completed: "Concluído",
  blocked_executor: "Executor indisponível",
  cancelled: "Cancelado",
};

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
  const execution = useProcessExecution(project?.id ?? "", processId);
  const libraryItems = useLibraryItems(project?.channelId);
  const method = channel?.methods[processId];
  const meta = PROCESS_META[processId];
  const completed = execution?.status === "completed";
  const nextProcess = PROCESS_ORDER[PROCESS_ORDER.indexOf(processId) + 1];
  const activeExecution = execution?.blocks.find((item) =>
    ["awaiting_human", "in_progress", "blocked_executor"].includes(item.status),
  );
  const activeBlock = activeExecution
    ? execution?.methodSnapshot.blocks.find((item) => item.id === activeExecution.blockId)
    : undefined;

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
    if (started.status === "blocked_executor") {
      toast.warning("O primeiro bloco depende de um executor ainda não configurado.");
    } else {
      toast.success(`Processo de ${meta.label} iniciado`, {
        description: "A primeira entrega humana já aparece na sua central de pendências.",
      });
    }
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
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => resetStage(project.id, processId)}>
                <RotateCcw className="mr-1.5 size-3.5" /> Reabrir
              </Button>
              {nextProcess && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate({ to: `/project/${project.id}/${PROCESS_ROUTE_SEGMENT[nextProcess]}` })
                  }
                >
                  Próximo processo <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
              )}
            </div>
          ) : !method?.blocks.length ? (
            <Button size="sm" variant="destructive" onClick={openMethodBuilder}>
              <AlertTriangle className="mr-1.5 size-3.5" /> Método necessário
            </Button>
          ) : !execution ? (
            <Button size="sm" onClick={start} className="gradient-brand text-white">
              <Play className="mr-1.5 size-3.5 fill-current" /> Iniciar processo
            </Button>
          ) : null}
        </div>
      </section>

      {!method?.blocks.length ? (
        <section className="rounded-xl border border-destructive/35 bg-destructive/5 px-5 py-12 text-center">
          <AlertTriangle className="mx-auto size-7 text-destructive" />
          <p className="mt-3 text-sm font-medium">Nenhum método salvo para este processo.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Crie ou importe um método de {meta.label} para liberar a execução.
          </p>
          <Button className="mt-4" variant="destructive" size="sm" onClick={openMethodBuilder}>
            Criar ou importar método
          </Button>
        </section>
      ) : execution ? (
        <>
          <ExecutionTimeline execution={execution} />
          {activeBlock && activeExecution?.status === "blocked_executor" ? (
            <ExecutorUnavailable block={activeBlock} onEdit={openMethodBuilder} />
          ) : activeBlock && activeExecution ? (
            <HumanTaskWorkspace
              key={`${execution.id}-${activeBlock.id}-${activeExecution.status}`}
              project={project}
              execution={execution}
              block={activeBlock}
              blockExecution={activeExecution}
              libraryItems={libraryItems}
            />
          ) : completed ? (
            <section className="rounded-xl border border-success/40 bg-success/5 p-10 text-center">
              <CheckCircle2 className="mx-auto size-8 text-success" />
              <h3 className="mt-3 text-base font-semibold">Processo concluído</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Todas as entregas do método foram realizadas e salvas neste projeto.
              </p>
            </section>
          ) : null}
        </>
      ) : (
        <MethodPreview method={method.blocks} />
      )}
    </main>
  );
}

function ExecutionTimeline({ execution }: { execution: ProcessExecution }) {
  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Progresso do método
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
          const waiting = item.status === "awaiting_human" || item.status === "in_progress";
          return (
            <div
              key={item.blockId}
              className={cn(
                "rounded-lg border p-3",
                done
                  ? "border-success/35 bg-success/5"
                  : waiting
                    ? "border-warning/40 bg-warning/5"
                    : "border-border/60 bg-background/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "grid size-6 place-items-center rounded-full",
                    done
                      ? "bg-success text-white"
                      : waiting
                        ? "bg-warning/20 text-warning"
                        : "bg-secondary text-muted-foreground",
                  )}
                >
                  {done ? (
                    <Check className="size-3.5" />
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
      <h3 className="text-sm font-semibold">Método pronto para iniciar</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Confira a sequência antes de começar a produção.
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

function OperatorBadge({ block }: { block: ActionBlock }) {
  const Icon = block.operator === "Humano" ? UserRound : block.operator === "IA" ? Bot : Code2;
  return (
    <Badge variant="secondary" className="gap-1">
      <Icon className="size-3" />
      {block.operator}
    </Badge>
  );
}

function ExecutorUnavailable({ block, onEdit }: { block: ActionBlock; onEdit: () => void }) {
  return (
    <section className="rounded-xl border border-warning/40 bg-warning/5 p-8 text-center">
      <AlertTriangle className="mx-auto size-7 text-warning" />
      <h3 className="mt-3 text-sm font-semibold">
        Executor {block.operator} ainda não configurado
      </h3>
      <p className="mx-auto mt-1 max-w-lg text-xs text-muted-foreground">
        Este bloco foi preservado no método, mas depende de um plugin futuro. Atribua-o ao operador
        Humano para executar agora.
      </p>
      <Button className="mt-4" size="sm" variant="outline" onClick={onEdit}>
        Editar método
      </Button>
    </section>
  );
}

function HumanTaskWorkspace({
  project,
  execution,
  block,
  blockExecution,
  libraryItems,
}: {
  project: Project;
  execution: ProcessExecution;
  block: ActionBlock;
  blockExecution: BlockExecution;
  libraryItems: ReturnType<typeof useLibraryItems>;
}) {
  const [values, setValues] = useState<Record<string, RuntimeValue>>(blockExecution.values);
  const outputs = block.outputs ?? [];
  const completedBefore = execution.blocks.filter((item) => item.status === "completed");

  useEffect(() => setValues(blockExecution.values), [blockExecution]);

  const context = useMemo(() => {
    const entries: { label: string; value: string }[] = [];
    for (const input of block.inputs ?? []) {
      if (input.source === "project") {
        entries.push({
          label: input.label,
          value: String(project[input.sourceKey === "deadline" ? "deadline" : "title"]),
        });
      } else if (input.source === "static") {
        entries.push({ label: input.label, value: input.staticValue || "Não informado" });
      } else if (input.source === "channel_library") {
        entries.push({
          label: input.label,
          value:
            libraryItems
              .filter((item) => item.collection === input.collection)
              .map((item) => item.name)
              .join(", ") || "Coleção vazia",
        });
      } else {
        const sourceExecution = completedBefore.find(
          (item) => !input.blockId || item.blockId === input.blockId,
        );
        const selectedValues = sourceExecution
          ? input.sourceKey
            ? [sourceExecution.values[input.sourceKey]]
            : Object.values(sourceExecution.values)
          : [];
        entries.push({
          label: input.label,
          value: selectedValues.map(formatRuntimeValue).join(" · ") || "Ainda sem saída",
        });
      }
    }
    for (const completed of completedBefore) {
      const sourceBlock = execution.methodSnapshot.blocks.find(
        (item) => item.id === completed.blockId,
      );
      for (const [key, value] of Object.entries(completed.values)) {
        if (!entries.some((entry) => entry.label === `${sourceBlock?.name}: ${key}`)) {
          entries.push({
            label: `${sourceBlock?.name ?? sourceBlock?.type}: ${key}`,
            value: formatRuntimeValue(value),
          });
        }
      }
    }
    return entries;
  }, [block.inputs, completedBefore, execution.methodSnapshot.blocks, libraryItems, project]);

  function setValue(key: string, value: RuntimeValue) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function saveDraft() {
    saveHumanBlockDraft(execution.id, block.id, values);
    toast.success("Rascunho salvo localmente.");
  }

  function complete() {
    const result = completeHumanBlock(execution.id, block.id, values);
    if (!result.ok) {
      toast.error("Preencha as entregas obrigatórias", { description: result.missing.join(", ") });
      return;
    }
    toast.success(result.completedProcess ? "Processo concluído" : "Bloco concluído", {
      description: result.completedProcess
        ? "Todas as entregas foram finalizadas."
        : "A próxima ação já está disponível.",
    });
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.8fr)]">
      <div className="rounded-xl border border-warning/40 bg-card">
        <header className="border-b border-border/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-warning" />
                <Badge variant="outline" className="border-warning/40 text-warning">
                  Aguardando humano
                </Badge>
              </div>
              <h3 className="mt-3 text-lg font-semibold">{block.name ?? block.type}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
                {block.instructions || "Realize a ação e preencha as entregas abaixo."}
              </p>
            </div>
            <OperatorBadge block={block} />
          </div>
        </header>
        <div className="space-y-5 p-5">
          {outputs.map((field) => (
            <HumanRuntimeField
              key={field.id}
              field={field}
              value={values[field.key]}
              onChange={(value) => setValue(field.key, value)}
              libraryItems={libraryItems}
            />
          ))}
          {!outputs.length && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-xs text-destructive">
              Este bloco não possui entregas configuradas. Edite o método antes de continuar.
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
            <Button variant="outline" size="sm" onClick={saveDraft}>
              <Save className="mr-1.5 size-3.5" /> Salvar rascunho
            </Button>
            <Button
              size="sm"
              onClick={complete}
              disabled={!outputs.length}
              className="gradient-brand text-white"
            >
              <CheckCircle2 className="mr-1.5 size-3.5" /> Concluir bloco
            </Button>
          </div>
        </div>
      </div>
      <aside className="rounded-xl border border-border/70 bg-card p-5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Contexto disponível
        </h3>
        {context.length ? (
          <dl className="mt-4 space-y-3">
            {context.map((item, index) => (
              <div
                key={`${item.label}-${index}`}
                className="rounded-lg border border-border/60 bg-background/30 p-3"
              >
                <dt className="text-[10px] font-semibold uppercase tracking-wide text-brand-soft">
                  {item.label}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-xs text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            Este é o primeiro contexto do método. Use as instruções e os dados do projeto.
          </div>
        )}
      </aside>
    </section>
  );
}

function HumanRuntimeField({
  field,
  value,
  onChange,
  libraryItems,
}: {
  field: BlockFieldDefinition;
  value: RuntimeValue | undefined;
  onChange: (value: RuntimeValue) => void;
  libraryItems: ReturnType<typeof useLibraryItems>;
}) {
  const [uploading, setUploading] = useState(false);
  const options = [
    ...new Set([
      ...(field.options ?? []),
      ...libraryItems
        .filter((item) => item.collection === field.libraryCollection)
        .map((item) => item.value || item.name),
    ]),
  ];
  const selectedStrings = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
  const file =
    value && typeof value === "object" && !Array.isArray(value) ? (value as StoredFile) : undefined;

  async function upload(selected?: File) {
    if (!selected) return;
    setUploading(true);
    try {
      onChange(await uploadLocalFile(selected));
      toast.success(`${selected.name} salvo localmente.`);
    } catch (error) {
      toast.error("Não foi possível salvar o arquivo", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-1.5">
      <Label>
        {field.label}
        {field.required && <span className="ml-1 text-destructive">*</span>}
      </Label>
      {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
      {field.type === "textarea" ? (
        <Textarea
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={6}
        />
      ) : field.type === "list" ? (
        <Textarea
          value={
            Array.isArray(value)
              ? value.filter((item): item is string => typeof item === "string").join("\n")
              : ""
          }
          onChange={(event) =>
            onChange(
              event.target.value
                .split("\n")
                .map((item) => item.trim())
                .filter(Boolean),
            )
          }
          placeholder={field.placeholder ?? "Um item por linha"}
          rows={6}
        />
      ) : field.type === "select" ? (
        <Select value={typeof value === "string" ? value : undefined} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={field.placeholder ?? "Selecione"} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "multiselect" ? (
        <div className="space-y-2 rounded-lg border border-input p-3">
          {options.map((option) => {
            const selected = selectedStrings.includes(option);
            return (
              <label key={option} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => {
                    onChange(
                      checked
                        ? [...selectedStrings, option]
                        : selectedStrings.filter((item) => item !== option),
                    );
                  }}
                />
                {option}
              </label>
            );
          })}
        </div>
      ) : field.type === "boolean" ? (
        <label className="flex items-center gap-2 rounded-lg border border-input p-3 text-sm">
          <Checkbox
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
          />
          {value === true ? "Sim" : "Não"}
        </label>
      ) : field.type === "approval" ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={value === "approved" ? "default" : "outline"}
            onClick={() => onChange("approved")}
          >
            <Check className="mr-1.5 size-4" /> Aprovar
          </Button>
          <Button
            type="button"
            variant={value === "rejected" ? "destructive" : "outline"}
            onClick={() => onChange("rejected")}
          >
            <AlertTriangle className="mr-1.5 size-4" /> Reprovar
          </Button>
        </div>
      ) : ["file", "image", "audio", "video"].includes(field.type) ? (
        <div className="rounded-lg border border-dashed border-input p-4">
          <label className="flex cursor-pointer items-center justify-center gap-2 text-sm text-muted-foreground">
            {uploading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <FileUp className="size-4" />
            )}
            <span>{file ? "Substituir arquivo" : "Selecionar arquivo local"}</span>
            <input
              type="file"
              className="hidden"
              accept={field.type === "file" ? undefined : `${field.type}/*`}
              onChange={(event) => void upload(event.target.files?.[0])}
            />
          </label>
          {file && (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block truncate text-center text-xs text-brand-soft"
            >
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
            </a>
          )}
        </div>
      ) : (
        <Input
          type={field.type === "number" ? "number" : field.type === "url" ? "url" : "text"}
          value={typeof value === "string" || typeof value === "number" ? value : ""}
          onChange={(event) =>
            onChange(field.type === "number" ? Number(event.target.value) : event.target.value)
          }
          placeholder={field.placeholder}
        />
      )}
    </div>
  );
}
