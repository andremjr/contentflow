import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Code2,
  Copy,
  Database,
  Library,
  ListChecks,
  LoaderCircle,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelAvatar } from "@/components/channel-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  type BlockFieldDefinition,
  type BlockInputBinding,
  type BlockOperator,
  type BlockParameter,
  type BlockParameterType,
  type BlockType,
  type HumanFieldType,
  type UniversalProcess,
} from "@/lib/domain";
import { createSuggestedHumanFields, normalizeActionBlock } from "@/lib/human-workflow";
import {
  copyImportedBlocks,
  parseMethodFile,
  serializeMethodFile,
  type SharedMethodFile,
} from "@/lib/method-file";
import { setChannelMethod, useChannel, useChannels } from "@/lib/store";
import { cn } from "@/lib/utils";

const BLOCK_META: Record<
  BlockType,
  {
    label: string;
    description: string;
    icon: typeof Search;
    className: string;
  }
> = {
  BUSCAR: {
    label: "Buscar",
    description: "Coletar informações ou mídias externas.",
    icon: Search,
    className: "border-blue-500/35 bg-blue-500/10 text-blue-300",
  },
  ESCOLHER: {
    label: "Escolher",
    description: "Tomar decisões, aplicar regras e diretrizes.",
    icon: ListChecks,
    className: "border-violet-500/35 bg-violet-500/10 text-violet-300",
  },
  CRIAR: {
    label: "Criar",
    description: "Gerar conteúdo, arquivos ou executar código.",
    icon: Sparkles,
    className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-300",
  },
  VALIDAR: {
    label: "Validar",
    description: "Testar qualidade, regras ou pedir aprovação.",
    icon: CheckCircle2,
    className: "border-amber-500/35 bg-amber-500/10 text-amber-300",
  },
};

const OPERATOR_META: Record<BlockOperator, { label: string; icon: typeof Bot }> = {
  IA: { label: "IA", icon: Bot },
  Humano: { label: "Humano", icon: CircleUserRound },
  Código: { label: "Código", icon: Code2 },
};

const FIELD_TYPES: { value: HumanFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "select", label: "Seleção" },
  { value: "multiselect", label: "Seleção múltipla" },
  { value: "boolean", label: "Booleano" },
  { value: "textarea", label: "Área de texto" },
  { value: "list", label: "Lista de itens" },
  { value: "url", label: "URL" },
  { value: "file", label: "Arquivo" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "video", label: "Vídeo" },
  { value: "approval", label: "Aprovar ou reprovar" },
];

const PARAMETER_TYPES: { value: BlockParameterType; label: string }[] = FIELD_TYPES.filter(
  (item): item is { value: BlockParameterType; label: string } =>
    ["text", "number", "select", "boolean", "textarea"].includes(item.value),
);

// Mantemos os dados avançados no modelo para não destruir configurações já salvas.
// A interface será reativada somente quando o formato definitivo dos plugins for definido.
const ADVANCED_METHOD_CONFIGURATION_ENABLED = false;

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function MethodBuilder({
  channelId,
  initialProcess,
}: {
  channelId: string;
  initialProcess?: UniversalProcess;
}) {
  const channel = useChannel(channelId);
  const channels = useChannels();
  const [processType, setProcessType] = useState<UniversalProcess>(initialProcess ?? "title");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<ActionBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pendingFileImport, setPendingFileImport] = useState<SharedMethodFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedProcessRef = useRef<UniversalProcess | null>(null);
  const editVersionRef = useRef(0);
  const currentProcessRef = useRef(processType);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const method = channel?.methods[processType];
  const blocks = useMemo(() => [...draftBlocks].sort((a, b) => a.order - b.order), [draftBlocks]);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);
  const reusableMethods = channels
    .filter((candidate) => candidate.id !== channelId)
    .map((candidate) => ({
      channel: candidate,
      blocks: candidate.methods?.[processType]?.blocks ?? [],
    }))
    .filter((candidate) => candidate.blocks.length > 0);

  currentProcessRef.current = processType;

  useEffect(() => {
    if (!blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(blocks[0]?.id ?? null);
    }
  }, [blocks, selectedBlockId]);

  useEffect(() => {
    const changedProcess = loadedProcessRef.current !== processType;
    if (!changedProcess && isDirty) return;

    setDraftBlocks(
      structuredClone(method?.blocks ?? []).map((block) =>
        normalizeActionBlock(block, processType),
      ),
    );
    loadedProcessRef.current = processType;
    setIsDirty(false);
    setSaveStatus(method?.blocks.length ? "saved" : "idle");
  }, [isDirty, processType, method]);

  const persistMethod = useCallback(
    async (showConfirmation = false) => {
      if (!channel) return;
      const savingProcess = processType;
      const savingBlocks = blocks;
      const savingVersion = editVersionRef.current;
      setSaveStatus("saving");

      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(() =>
          setChannelMethod(channel.id, savingProcess, {
            processType: savingProcess,
            blocks: savingBlocks,
          }),
        );
      saveQueueRef.current = queuedSave;

      try {
        await queuedSave;
        if (
          currentProcessRef.current === savingProcess &&
          editVersionRef.current === savingVersion
        ) {
          setIsDirty(false);
          setSaveStatus("saved");
        }
        if (showConfirmation) {
          toast.success(`MÃ©todo de ${PROCESS_META[savingProcess].label} salvo.`);
        }
      } catch (error) {
        if (currentProcessRef.current === savingProcess) {
          setSaveStatus("error");
          setIsDirty(true);
        }
        toast.error("NÃ£o foi possÃ­vel salvar o mÃ©todo", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [blocks, channel, processType],
  );

  useEffect(() => {
    if (!isDirty) return;
    setSaveStatus("pending");
    const timer = window.setTimeout(() => void persistMethod(), 700);
    return () => window.clearTimeout(timer);
  }, [isDirty, persistMethod]);

  useEffect(() => {
    if (!pendingFileImport || pendingFileImport.method.processType !== processType) return;
    const importedBlocks = copyImportedBlocks(
      processType,
      pendingFileImport.method.blocks,
      uid,
    ).map((block) => normalizeActionBlock(block, processType));
    setDraftBlocks(importedBlocks);
    setSelectedBlockId(importedBlocks[0]?.id ?? null);
    setIsDirty(true);
    setPendingFileImport(null);
    toast.success(`${pendingFileImport.name} importado`, {
      description: "Revise a cópia. As alterações serão salvas automaticamente.",
    });
  }, [pendingFileImport, processType]);

  if (!channel || !method) return null;

  const saveBlocks = (nextBlocks: ActionBlock[]) => {
    editVersionRef.current += 1;
    setDraftBlocks(nextBlocks.map((block, order) => ({ ...block, order })));
    setIsDirty(true);
    setSaveStatus("pending");
  };

  const selectProcess = (nextProcess: UniversalProcess) => {
    if (nextProcess === processType) return;
    if (isDirty) void persistMethod();
    loadedProcessRef.current = null;
    setProcessType(nextProcess);
  };

  const importMethod = (sourceChannelName: string, sourceBlocks: ActionBlock[]) => {
    const importedBlocks = copyImportedBlocks(processType, sourceBlocks, uid).map((block) =>
      normalizeActionBlock(block, processType),
    );
    saveBlocks(importedBlocks);
    setSelectedBlockId(importedBlocks[0]?.id ?? null);
    setLibraryOpen(false);
    toast.info(`Base importada de ${sourceChannelName}`, {
      description: "Revise as configurações. A cópia será salva automaticamente.",
    });
  };

  const shareMethod = async () => {
    if (!blocks.length) return;
    const processLabel = PROCESS_META[processType].label;
    const fileName = `metodo-${processType}.contentflow-method.json`;
    const contents = serializeMethodFile(`Método de ${processLabel}`, { processType, blocks });
    const file = new File([contents], fileName, { type: "application/json" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: `Método de ${processLabel} — ContentFlow OS`,
          text: `Método de ${processLabel} criado no ContentFlow OS.`,
          files: [file],
        });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo do método criado", {
      description: "Envie o arquivo baixado para quem quiser usar esta base.",
    });
  };

  const importSharedMethod = async (file: File) => {
    try {
      const sharedMethod = parseMethodFile(await file.text());
      if (
        isDirty &&
        !window.confirm("Importar substituirá as alterações ainda não salvas. Continuar?")
      ) {
        return;
      }
      setPendingFileImport(sharedMethod);
      setProcessType(sharedMethod.method.processType);
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : "O arquivo é inválido.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addBlock = (type: BlockType) => {
    const newBlock: ActionBlock = {
      id: uid(`${processType}-${type.toLowerCase()}`),
      type,
      operator: "Humano",
      name: BLOCK_META[type].label,
      instructions: "",
      inputs: [],
      outputs: createSuggestedHumanFields(processType, type),
      parameters: [],
      order: blocks.length,
    };
    saveBlocks([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const updateBlock = (blockId: string, patch: Partial<ActionBlock>) => {
    saveBlocks(blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)));
  };

  const moveBlock = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    saveBlocks(next);
  };

  const removeBlock = (blockId: string) => {
    saveBlocks(blocks.filter((block) => block.id !== blockId));
  };

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[240px_minmax(360px,1fr)_minmax(320px,420px)]">
      <aside className="border-b border-border/70 bg-card/35 p-4 lg:border-b-0 lg:border-r">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Processos universais
        </p>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">
          {PROCESS_ORDER.map((process, index) => {
            const meta = PROCESS_META[process];
            const Icon = meta.icon;
            const active = process === processType;
            const count =
              process === processType ? blocks.length : channel.methods[process].blocks.length;
            return (
              <button
                key={process}
                type="button"
                onClick={() => selectProcess(process)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition",
                  active
                    ? "border-brand/40 bg-brand/15 text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border/70 hover:bg-secondary/50 hover:text-foreground",
                )}
              >
                <span className="font-mono text-[10px] opacity-60">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Icon className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{meta.label}</span>
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-[9px]">
                  {count}
                </Badge>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="border-b border-border/70 p-4 sm:p-6 lg:border-b-0 lg:border-r">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Método de {PROCESS_META[processType].label}</h2>
              <Badge variant="outline" className="border-brand/30 text-brand-soft">
                {blocks.length} {blocks.length === 1 ? "bloco" : "blocos"}
              </Badge>
            </div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Organize as ações na ordem em que devem acontecer em todos os vídeos deste canal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.contentflow-method.json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importSharedMethod(file);
              }}
            />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              Importar
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!blocks.length}
              onClick={() => void shareMethod()}
            >
              <Share2 className="size-3.5" />
              Compartilhar
            </Button>
            <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1.5">
                  <Library className="size-3.5" />
                  Usar da biblioteca
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                  <DialogTitle>
                    Biblioteca de métodos de {PROCESS_META[processType].label}
                  </DialogTitle>
                  <DialogDescription>
                    Escolha uma base salva em outro canal. Uma cópia será criada neste canal para
                    você reconfigurar livremente.
                  </DialogDescription>
                </DialogHeader>
                {reusableMethods.length ? (
                  <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
                    {reusableMethods.map(({ channel: sourceChannel, blocks: sourceBlocks }) => (
                      <button
                        key={sourceChannel.id}
                        type="button"
                        onClick={() => importMethod(sourceChannel.name, sourceBlocks)}
                        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition hover:border-brand/50 hover:bg-brand/5"
                      >
                        <ChannelAvatar channel={sourceChannel} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {sourceChannel.name}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {sourceBlocks.map((block, index) => (
                              <Badge key={block.id} variant="secondary" className="text-[9px]">
                                {index + 1}. {BLOCK_META[block.type].label}
                              </Badge>
                            ))}
                          </span>
                        </span>
                        <span className="inline-flex items-center gap-1 text-xs text-brand-soft">
                          <Copy className="size-3.5" /> Copiar
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <Library className="mx-auto size-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Nenhuma base disponível ainda</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Quando outro canal tiver um método de {PROCESS_META[processType].label} salvo,
                      ele aparecerá aqui.
                    </p>
                  </div>
                )}
              </DialogContent>
            </Dialog>
            <div
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs",
                saveStatus === "error"
                  ? "border-destructive/40 text-destructive"
                  : "border-border text-muted-foreground",
              )}
              role="status"
              aria-live="polite"
            >
              {saveStatus === "saving" ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {saveStatus === "pending"
                ? "Alterações pendentes"
                : saveStatus === "saving"
                  ? "Salvando..."
                  : saveStatus === "error"
                    ? "Erro ao salvar"
                    : saveStatus === "saved"
                      ? "Salvo automaticamente"
                      : "Salvamento automático"}
            </div>
            <Button
              size="sm"
              onClick={() => void persistMethod(true)}
              disabled={!isDirty || saveStatus === "saving"}
              className="gradient-brand text-white"
            >
              Salvar agora
            </Button>
          </div>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-2 xl:grid-cols-4">
          {(Object.keys(BLOCK_META) as BlockType[]).map((type) => {
            const item = BLOCK_META[type];
            const Icon = item.icon;
            return (
              <button
                key={type}
                type="button"
                onClick={() => addBlock(type)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition hover:brightness-125",
                  item.className,
                )}
              >
                <Plus className="size-3" />
                <Icon className="size-3.5" />
                {item.label}
              </button>
            );
          })}
        </div>

        {blocks.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-full bg-brand/10 text-brand-soft">
                <Braces className="size-5" />
              </div>
              <h3 className="mt-3 text-sm font-medium">Este método está vazio</h3>
              <p className="mt-1 max-w-sm text-xs text-muted-foreground">
                Adicione a primeira ação. Um método pode ser simples ou combinar quantos blocos
                forem necessários.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {blocks.map((block, index) => {
              const meta = BLOCK_META[block.type];
              const operator = OPERATOR_META[block.operator];
              const Icon = meta.icon;
              const OperatorIcon = operator.icon;
              const active = block.id === selectedBlockId;
              return (
                <div key={block.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedBlockId(block.id)}
                    className={cn(
                      "group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition",
                      active
                        ? "border-brand/50 shadow-[0_0_0_1px_oklch(0.62_0.2_260/0.18)]"
                        : "border-border/70 hover:border-border",
                    )}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary font-mono text-[10px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg border",
                        meta.className,
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold uppercase tracking-wide">
                        {meta.label}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {block.outputs?.length ?? 0} entregas configuradas
                      </span>
                    </span>
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <OperatorIcon className="size-3" />
                      {operator.label}
                    </Badge>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </button>
                  {index < blocks.length - 1 && (
                    <div className="ml-6 h-2 border-l border-dashed border-border" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <aside className="bg-card/25 p-4 sm:p-6">
        {selectedBlock ? (
          <BlockEditor
            block={selectedBlock}
            processType={processType}
            previousBlocks={blocks.slice(0, blocks.indexOf(selectedBlock))}
            index={blocks.indexOf(selectedBlock)}
            total={blocks.length}
            onChange={(patch) => updateBlock(selectedBlock.id, patch)}
            onMove={(direction) => moveBlock(blocks.indexOf(selectedBlock), direction)}
            onRemove={() => removeBlock(selectedBlock.id)}
          />
        ) : (
          <div className="grid min-h-64 place-items-center text-center text-xs text-muted-foreground">
            <div>
              <Database className="mx-auto mb-2 size-5" />
              Selecione um bloco para configurar a ação.
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

function BlockEditor({
  block,
  processType,
  previousBlocks,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  block: ActionBlock;
  processType: UniversalProcess;
  previousBlocks: ActionBlock[];
  index: number;
  total: number;
  onChange: (patch: Partial<ActionBlock>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;

  const addParameter = () => {
    const parameter: BlockParameter = {
      id: uid(`${block.id}-parameter`),
      label: "Novo parâmetro",
      key: `parameter_${block.parameters.length + 1}`,
      type: "text",
      value: "",
      placeholder: "Digite um valor",
    };
    onChange({ parameters: [...block.parameters, parameter] });
  };

  const updateParameter = (parameterId: string, patch: Partial<BlockParameter>) => {
    onChange({
      parameters: block.parameters.map((parameter) =>
        parameter.id === parameterId ? { ...parameter, ...patch } : parameter,
      ),
    });
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 place-items-center rounded-xl border", meta.className)}>
            <Icon className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide">{meta.label}</p>
            <p className="text-[11px] text-muted-foreground">
              Bloco {index + 1} de {total}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label="Mover para cima"
          >
            <ArrowUp className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label="Mover para baixo"
          >
            <ArrowDown className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Remover bloco"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="mt-5 space-y-1.5">
        <Label>Nome da ação</Label>
        <Input
          value={block.name ?? meta.label}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={`Ex: ${meta.label} referências`}
        />
      </div>

      <div className="mt-4 space-y-1.5">
        <Label>Instruções para o operador</Label>
        <Textarea
          value={block.instructions ?? ""}
          onChange={(event) => onChange({ instructions: event.target.value })}
          placeholder="Explique o que deve ser feito e qual resultado é esperado."
          rows={4}
        />
      </div>

      <div className="mt-5 space-y-1.5">
        <Label>Operador responsável</Label>
        <Select
          value={block.operator}
          onValueChange={(value) => onChange({ operator: value as BlockOperator })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(OPERATOR_META) as BlockOperator[]).map((operator) => {
              const item = OPERATOR_META[operator];
              const OperatorIcon = item.icon;
              return (
                <SelectItem key={operator} value={operator}>
                  <span className="flex items-center gap-2">
                    <OperatorIcon className="size-3.5" /> {item.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {ADVANCED_METHOD_CONFIGURATION_ENABLED && (
        <>
          {block.operator === "Humano" ? (
            <HumanTaskDefinitionEditor
              block={block}
              processType={processType}
              previousBlocks={previousBlocks}
              onChange={onChange}
            />
          ) : (
            <div className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-4 text-xs text-muted-foreground">
              <p className="font-semibold text-warning">Executor ainda não configurado</p>
              <p className="mt-1">
                A opção {block.operator} foi preservada, mas dependerá de um plugin. Nesta versão,
                somente blocos atribuídos ao operador Humano podem ser executados.
              </p>
            </div>
          )}

          {block.operator !== "Humano" && (
            <div className="mt-6 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Parâmetros</h3>
                <p className="text-[11px] text-muted-foreground">
                  Informações específicas desta ação.
                </p>
              </div>
              <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addParameter}>
                <Plus className="size-3" /> Adicionar
              </Button>
            </div>
          )}

          {block.operator !== "Humano" && (
            <div className="mt-3 space-y-3">
              {block.parameters.map((parameter) => (
                <ParameterEditor
                  key={parameter.id}
                  parameter={parameter}
                  onChange={(patch) => updateParameter(parameter.id, patch)}
                  onRemove={() =>
                    onChange({
                      parameters: block.parameters.filter((item) => item.id !== parameter.id),
                    })
                  }
                />
              ))}
              {block.parameters.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
                  Nenhum parâmetro. O bloco pode funcionar assim ou receber campos personalizados.
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function HumanTaskDefinitionEditor({
  block,
  processType,
  previousBlocks,
  onChange,
}: {
  block: ActionBlock;
  processType: UniversalProcess;
  previousBlocks: ActionBlock[];
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const outputs = block.outputs ?? [];
  const addInput = () => {
    const input: BlockInputBinding = {
      id: uid(`${block.id}-input`),
      label: "Contexto do projeto",
      source: "project",
      sourceKey: "title",
    };
    onChange({ inputs: [...inputs, input] });
  };
  const addOutput = () => {
    const output: BlockFieldDefinition = {
      id: uid(`${block.id}-output`),
      label: "Nova entrega",
      key: `output_${outputs.length + 1}`,
      type: "text",
      required: true,
      placeholder: "Preencha a entrega",
    };
    onChange({ outputs: [...outputs, output] });
  };
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Entradas e contexto</h3>
          <p className="text-[11px] text-muted-foreground">O que o humano verá para trabalhar.</p>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addInput}>
          <Plus className="size-3" /> Adicionar
        </Button>
      </div>
      <div className="mt-3 space-y-3">
        {inputs.map((input) => (
          <InputBindingEditor
            key={input.id}
            input={input}
            previousBlocks={previousBlocks}
            onChange={(patch) =>
              onChange({
                inputs: inputs.map((item) => (item.id === input.id ? { ...item, ...patch } : item)),
              })
            }
            onRemove={() => onChange({ inputs: inputs.filter((item) => item.id !== input.id) })}
          />
        ))}
        {inputs.length === 0 && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Saídas dos blocos anteriores aparecem automaticamente. Adicione aqui dados do projeto,
            biblioteca ou orientações fixas que mereçam destaque.
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Entrega esperada</h3>
          <p className="text-[11px] text-muted-foreground">
            Campos preenchidos durante a produção do vídeo.
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 px-2 text-[10px]"
            onClick={() =>
              onChange({ outputs: createSuggestedHumanFields(processType, block.type) })
            }
          >
            Usar sugestão
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addOutput}>
            <Plus className="size-3" /> Adicionar
          </Button>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        {outputs.map((output) => (
          <HumanFieldEditor
            key={output.id}
            field={output}
            onChange={(patch) =>
              onChange({
                outputs: outputs.map((item) =>
                  item.id === output.id ? { ...item, ...patch } : item,
                ),
              })
            }
            onRemove={() => onChange({ outputs: outputs.filter((item) => item.id !== output.id) })}
          />
        ))}
        {outputs.length === 0 && (
          <div className="rounded-lg border border-dashed border-destructive/50 p-4 text-center text-[11px] text-destructive">
            Adicione ao menos uma entrega para concluir este bloco humano.
          </div>
        )}
      </div>
    </>
  );
}

function InputBindingEditor({
  input,
  previousBlocks,
  onChange,
  onRemove,
}: {
  input: BlockInputBinding;
  previousBlocks: ActionBlock[];
  onChange: (patch: Partial<BlockInputBinding>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center gap-2">
        <Input
          value={input.label}
          onChange={(event) => onChange({ label: event.target.value })}
          className="h-8 text-xs"
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <Select
        value={input.source}
        onValueChange={(source) => onChange({ source: source as BlockInputBinding["source"] })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="project">Dado do projeto</SelectItem>
          <SelectItem value="previous_block">Saída de bloco anterior</SelectItem>
          <SelectItem value="channel_library">Biblioteca do canal</SelectItem>
          <SelectItem value="static">Texto fixo</SelectItem>
        </SelectContent>
      </Select>
      {input.source === "project" && (
        <Select
          value={input.sourceKey ?? "title"}
          onValueChange={(sourceKey) => onChange({ sourceKey })}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="title">Nome do projeto/vídeo</SelectItem>
            <SelectItem value="deadline">Prazo</SelectItem>
          </SelectContent>
        </Select>
      )}
      {input.source === "previous_block" && (
        <div className="grid grid-cols-2 gap-2">
          <Select value={input.blockId} onValueChange={(blockId) => onChange({ blockId })}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Bloco" />
            </SelectTrigger>
            <SelectContent>
              {previousBlocks.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name ?? item.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={input.sourceKey ?? ""}
            onChange={(event) => onChange({ sourceKey: event.target.value })}
            placeholder="Chave (opcional)"
            className="h-8 text-xs"
          />
        </div>
      )}
      {input.source === "channel_library" && (
        <Input
          value={input.collection ?? ""}
          onChange={(event) => onChange({ collection: event.target.value })}
          placeholder="Coleção da biblioteca"
          className="h-8 text-xs"
        />
      )}
      {input.source === "static" && (
        <Textarea
          value={input.staticValue ?? ""}
          onChange={(event) => onChange({ staticValue: event.target.value })}
          placeholder="Texto exibido em todas as execuções"
          rows={2}
          className="text-xs"
        />
      )}
    </div>
  );
}

function HumanFieldEditor({
  field,
  onChange,
  onRemove,
}: {
  field: BlockFieldDefinition;
  onChange: (patch: Partial<BlockFieldDefinition>) => void;
  onRemove: () => void;
}) {
  const usesOptions = field.type === "select" || field.type === "multiselect";
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {field.key}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Nome"
          className="h-8 text-xs"
        />
        <Input
          value={field.key}
          onChange={(event) => onChange({ key: event.target.value })}
          placeholder="chave"
          className="h-8 font-mono text-xs"
        />
      </div>
      <Select
        value={field.type}
        onValueChange={(type) => onChange({ type: type as HumanFieldType })}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FIELD_TYPES.map((type) => (
            <SelectItem key={type.value} value={type.value}>
              {type.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {usesOptions && (
        <>
          <Input
            value={(field.options ?? []).join(", ")}
            onChange={(event) =>
              onChange({
                options: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Opções fixas separadas por vírgula"
            className="h-8 text-xs"
          />
          <Input
            value={field.libraryCollection ?? ""}
            onChange={(event) => onChange({ libraryCollection: event.target.value })}
            placeholder="Ou coleção da biblioteca"
            className="h-8 text-xs"
          />
        </>
      )}
      <Input
        value={field.placeholder ?? ""}
        onChange={(event) => onChange({ placeholder: event.target.value })}
        placeholder="Placeholder"
        className="h-8 text-xs"
      />
      <Input
        value={field.helpText ?? ""}
        onChange={(event) => onChange({ helpText: event.target.value })}
        placeholder="Orientação adicional"
        className="h-8 text-xs"
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <Checkbox
          checked={field.required}
          onCheckedChange={(checked) => onChange({ required: checked === true })}
        />{" "}
        Entrega obrigatória
      </label>
    </div>
  );
}

function ParameterEditor({
  parameter,
  onChange,
  onRemove,
}: {
  parameter: BlockParameter;
  onChange: (patch: Partial<BlockParameter>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          {parameter.key}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remover parâmetro"
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[11px]">Nome</Label>
          <Input
            value={parameter.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className="h-8 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px]">Chave</Label>
          <Input
            value={parameter.key}
            onChange={(event) => onChange({ key: event.target.value })}
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Tipo</Label>
        <Select
          value={parameter.type}
          onValueChange={(value) => {
            const type = value as BlockParameterType;
            onChange({
              type,
              value: type === "boolean" ? false : type === "number" ? 0 : "",
            });
          }}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PARAMETER_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Valor</Label>
        {parameter.type === "textarea" ? (
          <Textarea
            value={String(parameter.value)}
            placeholder={parameter.placeholder}
            onChange={(event) => onChange({ value: event.target.value })}
            rows={3}
            className="text-xs"
          />
        ) : parameter.type === "boolean" ? (
          <label className="flex h-9 items-center gap-2 rounded-md border border-input px-3 text-xs">
            <Checkbox
              checked={Boolean(parameter.value)}
              onCheckedChange={(checked) => onChange({ value: checked === true })}
            />
            {parameter.value ? "Ativado" : "Desativado"}
          </label>
        ) : parameter.type === "select" ? (
          <div className="space-y-2">
            <Select value={String(parameter.value)} onValueChange={(value) => onChange({ value })}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={parameter.placeholder} />
              </SelectTrigger>
              <SelectContent>
                {(parameter.options ?? []).map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={(parameter.options ?? []).join(", ")}
              onChange={(event) =>
                onChange({
                  options: event.target.value
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="Opções separadas por vírgula"
              className="h-8 text-xs"
            />
          </div>
        ) : (
          <Input
            type={parameter.type === "number" ? "number" : "text"}
            value={String(parameter.value)}
            placeholder={parameter.placeholder}
            onChange={(event) =>
              onChange({
                value:
                  parameter.type === "number" ? Number(event.target.value) : event.target.value,
              })
            }
            className="h-8 text-xs"
          />
        )}
      </div>
      <div className="space-y-1">
        <Label className="text-[11px]">Placeholder</Label>
        <Input
          value={parameter.placeholder ?? ""}
          onChange={(event) => onChange({ placeholder: event.target.value })}
          className="h-8 text-xs"
        />
      </div>
    </div>
  );
}
