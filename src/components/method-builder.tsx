import { useNavigate } from "@tanstack/react-router";
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  Code2,
  Copy,
  GripVertical,
  Library,
  ListChecks,
  LoaderCircle,
  History,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { ChannelAvatar } from "@/components/channel-avatar";
import { RuntimeValueViewer } from "@/components/runtime-value-viewer";
import { LineListTextarea } from "@/components/line-list-textarea";
import {
  PRESENTATION_RENDERERS,
  PRESENTATION_RENDERER_REGISTRY,
} from "@/components/runtime-value-renderers";
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
  type BlockType,
  type FieldPresentation,
  type HumanFieldType,
  type PresentationRendererId,
  type ProcessMethod,
  type RecordFieldDefinition,
  type RecordFieldType,
  type StrategicCollection,
  type UniversalProcess,
  type ValidationMode,
} from "@/lib/domain";
import {
  createProcessOutputFields,
  createSuggestedHumanFields,
  createValidationFields,
  normalizeActionBlock,
} from "@/lib/human-workflow";
import {
  copyImportedBlocks,
  parseMethodFile,
  serializeMethodFile,
  type SharedMethodFile,
} from "@/lib/method-file";
import { getCompatiblePresentationRenderers, normalizeFieldPresentation } from "@/lib/presentation";
import { createChannelHistoryRecordFields, isChannelHistoryValueType } from "@/lib/channel-history";
import type { JsonSchema, PluginManifest, PluginProfileSetup } from "@/lib/plugin-contract";
import { setChannelMethod, useChannel, useChannels, useLibraryCollections } from "@/lib/store";
import { cn } from "@/lib/utils";

type DiscoveredPlugin = {
  id: string;
  source: "bundled" | "installed" | "local";
  directory: string;
  manifest: PluginManifest;
  enabled?: boolean;
  executable?: boolean;
};

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
    className: "border-border bg-secondary text-foreground",
  },
  ESCOLHER: {
    label: "Escolher",
    description: "Selecionar itens preexistentes da Biblioteca Estratégica.",
    icon: ListChecks,
    className: "border-border bg-secondary text-foreground",
  },
  CRIAR: {
    label: "Criar",
    description: "Gerar conteúdo, arquivos ou executar código.",
    icon: Sparkles,
    className: "border-border bg-secondary text-foreground",
  },
  VALIDAR: {
    label: "Validar",
    description: "Testar qualidade, regras ou pedir aprovação.",
    icon: CheckCircle2,
    className: "border-border bg-secondary text-foreground",
  },
};

const OPERATOR_META: Record<BlockOperator, { label: string; icon: typeof Bot }> = {
  IA: { label: "IA", icon: Bot },
  Humano: { label: "Humano", icon: CircleUserRound },
  Código: { label: "Código", icon: Code2 },
};

const FIELD_TYPES: { value: HumanFieldType; label: string }[] = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Sim ou não" },
  { value: "list", label: "Lista de textos" },
  { value: "records", label: "Lista de registros" },
  { value: "select", label: "Seleção" },
  { value: "multiselect", label: "Seleção múltipla" },
  { value: "datetime", label: "Data e hora" },
  { value: "url", label: "URL" },
  { value: "file", label: "Arquivo" },
  { value: "files", label: "Vários arquivos" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "video", label: "Vídeo" },
  { value: "thumbnail_layout", label: "Layout de thumbnail" },
  { value: "approval", label: "Decisão" },
];

const RECORD_FIELD_TYPES: { value: RecordFieldType; label: string }[] = [
  { value: "text", label: "Texto curto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Sim ou não" },
  { value: "select", label: "Seleção" },
  { value: "datetime", label: "Data e hora" },
  { value: "url", label: "URL" },
  { value: "file", label: "Arquivo" },
  { value: "image", label: "Imagem" },
  { value: "audio", label: "Áudio" },
  { value: "video", label: "Vídeo" },
];

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function newRecordField(index: number): RecordFieldDefinition {
  return {
    id: uid("record-field"),
    label: index === 0 ? "Nome" : "Novo campo",
    key: index === 0 ? "name" : `field_${index + 1}`,
    type: index === 0 ? "text" : "textarea",
    required: true,
  };
}

type ChannelHistorySource = {
  id: string;
  processType: UniversalProcess;
  blockId: string;
  blockLabel: string;
  output: BlockFieldDefinition;
};

function collectChannelHistorySources(
  processType: UniversalProcess,
  methodBlocks: ActionBlock[],
  channelMethods: Record<UniversalProcess, ProcessMethod>,
) {
  return PROCESS_ORDER.flatMap<ChannelHistorySource>((sourceProcessType) => {
    const blocks =
      sourceProcessType === processType
        ? methodBlocks
        : (channelMethods[sourceProcessType]?.blocks ?? []);
    const blockOutputs = blocks.flatMap((sourceBlock) => {
      const outputs =
        sourceBlock.type === "ESCOLHER"
          ? [
              {
                id: `${sourceBlock.id}-selected-item`,
                label: "Item estratégico escolhido",
                key: "selectedItemId",
                type: "text" as const,
                required: true,
              },
            ]
          : (sourceBlock.outputs ?? []);
      return outputs
        .filter((output) => isChannelHistoryValueType(output.type))
        .map((output) => ({
          id: `${sourceProcessType}::${sourceBlock.id}::${output.key}`,
          processType: sourceProcessType,
          blockId: sourceBlock.id,
          blockLabel: sourceBlock.name ?? sourceBlock.type,
          output,
        }));
    });
    const officialOutput = createProcessOutputFields(sourceProcessType)[0];
    return [
      ...(isChannelHistoryValueType(officialOutput.type)
        ? [
            {
              id: `${sourceProcessType}::__process_output__::${officialOutput.key}`,
              processType: sourceProcessType,
              blockId: "__process_output__",
              blockLabel: "Resultado oficial",
              output: officialOutput,
            },
          ]
        : []),
      ...blockOutputs,
    ];
  });
}

export function MethodBuilder({
  channelId,
  initialProcess,
}: {
  channelId: string;
  initialProcess?: UniversalProcess;
}) {
  const channel = useChannel(channelId);
  const navigate = useNavigate();
  const channels = useChannels();
  const collections = useLibraryCollections(channelId);
  const [processType, setProcessType] = useState<UniversalProcess>(initialProcess ?? "theme");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<ActionBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pendingFileImport, setPendingFileImport] = useState<SharedMethodFile | null>(null);
  const [availablePlugins, setAvailablePlugins] = useState<DiscoveredPlugin[]>([]);
  const [openAIModels, setOpenAIModels] = useState<Array<{ id: string; name: string }>>([]);
  const [anthropicModels, setAnthropicModels] = useState<Array<{ id: string; name: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedProcessRef = useRef<UniversalProcess | null>(null);
  const editVersionRef = useRef(0);
  const currentProcessRef = useRef(processType);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const method = channel?.methods[processType];
  const blocks = useMemo(() => [...draftBlocks].sort((a, b) => a.order - b.order), [draftBlocks]);
  const selectedBlock = blocks.find((block) => block.id === selectedBlockId);
  const activeBlock = blocks.find((block) => block.id === activeBlockId);
  const blockIds = blocks.map((block) => block.id);
  const activeBlockIndex = activeBlockId ? blockIds.indexOf(activeBlockId) : -1;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const reusableMethods = channels
    .filter((candidate) => candidate.id !== channelId)
    .map((candidate) => ({
      channel: candidate,
      blocks: candidate.methods?.[processType]?.blocks ?? [],
    }))
    .filter((candidate) => candidate.blocks.length > 0);

  currentProcessRef.current = processType;

  useEffect(() => {
    if (selectedBlockId && !blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [blocks, selectedBlockId]);

  useEffect(() => {
    let active = true;
    void fetch("/api/plugins")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar plugins.");
        return response.json() as Promise<{ plugins: DiscoveredPlugin[] }>;
      })
      .then((result) => {
        if (active) {
          setAvailablePlugins(
            result.plugins.filter(
              (plugin) => plugin.source === "bundled" || (plugin.enabled && plugin.executable),
            ),
          );
        }
      })
      .catch(() => {
        if (active) setAvailablePlugins([]);
      });
    void fetch("/api/plugins/official-openai-gpt/connection")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar a conexão OpenAI.");
        return response.json() as Promise<{ models: Array<{ id: string; name: string }> }>;
      })
      .then((result) => {
        if (active) setOpenAIModels(result.models);
      })
      .catch(() => {
        if (active) setOpenAIModels([]);
      });
    void fetch("/api/plugins/official-anthropic-claude/connection")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar a conexão Anthropic.");
        return response.json() as Promise<{ models: Array<{ id: string; name: string }> }>;
      })
      .then((result) => {
        if (active) setAnthropicModels(result.models);
      })
      .catch(() => {
        if (active) setAnthropicModels([]);
      });
    return () => {
      active = false;
    };
  }, []);

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
          toast.success(`Método de ${PROCESS_META[savingProcess].label} salvo.`);
        }
      } catch (error) {
        if (currentProcessRef.current === savingProcess) {
          setSaveStatus("error");
          setIsDirty(true);
        }
        toast.error("Não foi possível salvar o método", {
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [blocks, channel, processType],
  );

  useEffect(() => {
    const requestedProcess = initialProcess ?? "theme";
    if (requestedProcess === processType) return;
    if (isDirty) void persistMethod();
    loadedProcessRef.current = null;
    setSelectedBlockId(null);
    setProcessType(requestedProcess);
  }, [initialProcess, isDirty, persistMethod, processType]);

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
    setSelectedBlockId(null);
    setProcessType(nextProcess);
    void navigate({
      to: "/channel/$channelId/methods",
      params: { channelId },
      search: { process: nextProcess },
      replace: true,
    });
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
      selectProcess(sharedMethod.method.processType);
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : "O arquivo é inválido.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addBlock = (type: BlockType) => {
    const validationTarget =
      type === "VALIDAR"
        ? [...blocks].reverse().find((block) => block.type !== "VALIDAR")
        : undefined;
    const newBlock: ActionBlock = {
      id: uid(`${processType}-${type.toLowerCase()}`),
      type,
      operator: "Humano",
      name: BLOCK_META[type].label,
      instructions: "",
      inputs: [],
      outputs:
        type === "VALIDAR"
          ? createValidationFields("approval", validationTarget?.id)
          : createSuggestedHumanFields(processType, type),
      validation:
        type === "VALIDAR"
          ? {
              targetBlockId: validationTarget?.id,
              mode: "approval",
              onReject: "retry_target",
              maxAttempts: 3,
            }
          : undefined,
      parameters: [],
      order: blocks.length,
    };
    saveBlocks([...blocks, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const updateBlock = (blockId: string, patch: Partial<ActionBlock>) => {
    saveBlocks(blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)));
  };

  const removeBlock = (blockId: string) => {
    saveBlocks(blocks.filter((block) => block.id !== blockId));
    setSelectedBlockId(null);
  };

  const clearDrag = () => setActiveBlockId(null);

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveBlockId(String(active.id));
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) {
      const oldIndex = blockIds.indexOf(String(active.id));
      const newIndex = blockIds.indexOf(String(over.id));
      if (oldIndex >= 0 && newIndex >= 0) saveBlocks(arrayMove(blocks, oldIndex, newIndex));
    }
    clearDrag();
  };

  return (
    <div className="min-h-0 flex-1">
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6 lg:px-8 lg:pb-10">
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
                  "flex items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium transition hover:border-foreground/25 hover:bg-surface-3",
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
          <div className="grid min-h-64 place-items-center rounded-lg border border-dashed border-border bg-card/25 p-8 text-center">
            <div>
              <div className="mx-auto grid size-12 place-items-center rounded-md bg-brand/10 text-brand-soft">
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
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={clearDrag}
          >
            <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
              <div
                className={cn(
                  "space-y-2",
                  activeBlockId && "!cursor-grabbing [&_*]:!cursor-grabbing",
                )}
              >
                {blocks.map((block, index) => (
                  <SortableMethodBlockCard
                    key={block.id}
                    block={block}
                    index={index}
                    activeIndex={activeBlockIndex}
                    collectionName={
                      block.collectionId
                        ? collections.find((item) => item.id === block.collectionId)?.name
                        : undefined
                    }
                    selected={block.id === selectedBlockId}
                    onOpen={() => setSelectedBlockId(block.id)}
                  />
                ))}
              </div>
            </SortableContext>
            <DragOverlay
              adjustScale={false}
              dropAnimation={{ duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" }}
            >
              {activeBlock ? (
                <MethodBlockPreview
                  block={activeBlock}
                  index={blocks.indexOf(activeBlock)}
                  collectionName={
                    activeBlock.collectionId
                      ? collections.find((item) => item.id === activeBlock.collectionId)?.name
                      : undefined
                  }
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </section>

      <Dialog
        open={Boolean(selectedBlock)}
        onOpenChange={(open) => {
          if (!open) setSelectedBlockId(null);
        }}
      >
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Configurar bloco de ação</DialogTitle>
            <DialogDescription>
              Edite operador, instruções, entradas, saídas e execução deste bloco.
            </DialogDescription>
          </DialogHeader>
          {selectedBlock && (
            <BlockEditor
              block={selectedBlock}
              methodBlocks={blocks}
              channelId={channelId}
              collections={collections}
              processType={processType}
              channelMethods={channel.methods}
              plugins={availablePlugins}
              openAIModels={openAIModels}
              anthropicModels={anthropicModels}
              index={blocks.indexOf(selectedBlock)}
              total={blocks.length}
              onChange={(patch) => updateBlock(selectedBlock.id, patch)}
              onRemove={() => removeBlock(selectedBlock.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

type InsertionSide = "before" | "after";

function SortableMethodBlockCard({
  block,
  index,
  activeIndex,
  collectionName,
  selected,
  onOpen,
}: {
  block: ActionBlock;
  index: number;
  activeIndex: number;
  collectionName?: string;
  selected: boolean;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    isDragging,
    isOver,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: block.id,
    transition: { duration: 220, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
  });
  const insertionSide: InsertionSide | undefined =
    isOver && activeIndex >= 0 && activeIndex !== index
      ? activeIndex < index
        ? "after"
        : "before"
      : undefined;
  const title = block.name?.trim() || BLOCK_META[block.type].label;

  return (
    <div
      ref={setNodeRef}
      className="relative"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : undefined,
      }}
    >
      {insertionSide && !isDragging && (
        <span
          className={cn(
            "pointer-events-none absolute left-2 right-2 z-40 h-0.5 bg-brand",
            insertionSide === "before" ? "-top-[5px]" : "-bottom-[5px]",
          )}
        >
          <span className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-brand" />
        </span>
      )}

      <article
        className={cn(
          "flex min-h-28 overflow-hidden rounded-lg border bg-card transition-colors",
          selected ? "border-brand" : "border-border hover:border-foreground/20",
          isDragging && "opacity-20",
        )}
      >
        <button
          ref={setActivatorNodeRef}
          type="button"
          className="grid w-11 touch-none cursor-grab place-items-center border-r border-border text-muted-foreground transition hover:bg-secondary hover:text-foreground active:cursor-grabbing [&_svg]:pointer-events-none"
          title="Clique, segure e arraste para reordenar"
          aria-label={`Reorganizar ${title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="group flex min-w-0 flex-1 items-center gap-4 p-4 text-left transition hover:bg-secondary/35 sm:p-5"
        >
          <MethodBlockCardContent block={block} index={index} collectionName={collectionName} />
          <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </button>
      </article>
    </div>
  );
}

function MethodBlockCardContent({
  block,
  index,
  collectionName,
}: {
  block: ActionBlock;
  index: number;
  collectionName?: string;
}) {
  const meta = BLOCK_META[block.type];
  const operator = OPERATOR_META[block.operator];
  const Icon = meta.icon;
  const OperatorIcon = operator.icon;
  const title = block.name?.trim() || meta.label;
  const summary =
    block.type === "ESCOLHER" && collectionName
      ? `Coleção: ${collectionName}`
      : block.instructions?.trim() || "Sem instruções";
  const outputCount = block.outputs?.length ?? 0;

  return (
    <>
      <span className="w-6 shrink-0 self-start pt-1 font-mono text-[10px] text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span
        className={cn("grid size-9 shrink-0 place-items-center rounded-md border", meta.className)}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-[10px] font-medium uppercase text-muted-foreground">
            {meta.label}
          </span>
        </span>
        <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {summary}
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <OperatorIcon className="size-3" />
            {operator.label}
          </span>
          <span>
            {outputCount} {outputCount === 1 ? "saída" : "saídas"}
          </span>
          {block.plugin && <span>{block.plugin.pluginId}</span>}
        </span>
      </span>
    </>
  );
}

function MethodBlockPreview({
  block,
  index,
  collectionName,
}: {
  block: ActionBlock;
  index: number;
  collectionName?: string;
}) {
  return (
    <div className="pointer-events-none flex w-[min(760px,calc(100vw-3rem))] overflow-hidden rounded-lg border border-brand bg-card">
      <div className="grid w-11 place-items-center border-r border-brand/40 text-brand">
        <GripVertical className="size-4" />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-4 p-5">
        <MethodBlockCardContent block={block} index={index} collectionName={collectionName} />
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  methodBlocks,
  channelId,
  collections,
  processType,
  channelMethods,
  plugins,
  openAIModels,
  anthropicModels,
  index,
  total,
  onChange,
  onRemove,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  channelId: string;
  collections: StrategicCollection[];
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  plugins: DiscoveredPlugin[];
  openAIModels: Array<{ id: string; name: string }>;
  anthropicModels: Array<{ id: string; name: string }>;
  index: number;
  total: number;
  onChange: (patch: Partial<ActionBlock>) => void;
  onRemove: () => void;
}) {
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;
  const compatibleCapabilities = plugins.flatMap((plugin) =>
    plugin.manifest.capabilities
      .filter(
        (capability) =>
          capability.operator === block.operator &&
          capability.blockTypes.includes(block.type) &&
          (!capability.processTypes || capability.processTypes.includes(processType)) &&
          (block.inputs ?? []).every((field) =>
            capability.inputPorts.some((port) => port.acceptedTypes.includes(field.type)),
          ) &&
          (block.outputs ?? []).every((field) =>
            capability.outputPorts.some((port) => port.producedTypes.includes(field.type)),
          ),
      )
      .map((capability) => ({ plugin, capability })),
  );
  const selectedPlugin = plugins.find((plugin) => plugin.id === block.plugin?.pluginId);
  const selectedCapability = selectedPlugin?.manifest.capabilities.find(
    (capability) => capability.id === block.plugin?.capabilityId,
  );
  const configProperties = selectedCapability?.blockConfigSchema.properties ?? {};

  return (
    <div>
      <div className="flex items-start justify-between gap-3 pr-8">
        <div className="flex items-center gap-3">
          <span className={cn("grid size-10 place-items-center rounded-md border", meta.className)}>
            <Icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase text-muted-foreground">{meta.label}</p>
            <h2 className="truncate text-xl font-semibold">{block.name?.trim() || meta.label}</h2>
            <p className="text-[11px] text-muted-foreground">
              Bloco {index + 1} de {total}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
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
          onValueChange={(value) =>
            onChange({ operator: value as BlockOperator, plugin: undefined })
          }
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

      {block.type === "ESCOLHER" && (
        <div className="mt-5 space-y-1.5">
          <Label>Coleção estratégica</Label>
          {collections.length ? (
            <Select
              value={block.collectionId}
              onValueChange={(collectionId) => onChange({ collectionId })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a coleção deste bloco" />
              </SelectTrigger>
              <SelectContent>
                {collections.map((collection) => (
                  <SelectItem key={collection.id} value={collection.id}>
                    {collection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              Nenhuma coleção criada. Acesse a{" "}
              <a
                href={`/channel/${channelId}/library`}
                className="font-medium text-brand-soft hover:underline"
              >
                Biblioteca Estratégica
              </a>{" "}
              para criar a primeira.
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Obrigatório: Escolher sempre seleciona entre itens preexistentes desta coleção. Para
            decidir entre resultados produzidos durante o método, use um bloco Validar.
          </p>
        </div>
      )}

      {block.type === "VALIDAR" && (
        <ValidationEditor
          block={block}
          methodBlocks={methodBlocks}
          index={index}
          onChange={onChange}
        />
      )}

      {block.type === "ESCOLHER" && (
        <ContextInputsEditor
          block={block}
          methodBlocks={methodBlocks}
          blockIndex={index}
          processType={processType}
          channelMethods={channelMethods}
          onChange={onChange}
        />
      )}

      {block.type !== "ESCOLHER" && block.type !== "VALIDAR" && (
        <DataContractEditor
          block={block}
          methodBlocks={methodBlocks}
          blockIndex={index}
          processType={processType}
          channelMethods={channelMethods}
          onChange={onChange}
        />
      )}

      {block.operator !== "Humano" && (
        <div className="mt-5 space-y-4 rounded-xl border border-brand/30 bg-brand/5 p-4">
          <div className="space-y-1.5">
            <Label>Plugin executor</Label>
            {compatibleCapabilities.length ? (
              <Select
                value={block.plugin ? `${block.plugin.pluginId}::${block.plugin.capabilityId}` : ""}
                onValueChange={(value) => {
                  const [pluginId, capabilityId] = value.split("::");
                  const selection = compatibleCapabilities.find(
                    (item) => item.plugin.id === pluginId && item.capability.id === capabilityId,
                  );
                  const properties = selection?.capability.blockConfigSchema.properties ?? {};
                  const configuration = Object.fromEntries(
                    Object.entries(properties)
                      .filter(([, schema]) => schema.default !== undefined)
                      .map(([key, schema]) => [key, schema.default as string | number | boolean]),
                  );
                  const requestedInputs = block.inputs?.map((input) => {
                    const port = selection?.capability.inputPorts.find((candidate) =>
                      candidate.acceptedTypes.includes(input.type),
                    );
                    const current = normalizeFieldPresentation(input.type, input.presentation);
                    return {
                      ...input,
                      presentation: normalizeFieldPresentation(
                        input.type,
                        current.renderer === "auto" ? (port?.presentation ?? current) : current,
                      ),
                    };
                  });
                  const requestedOutputs = block.outputs?.map((output) => {
                    const port = selection?.capability.outputPorts.find((candidate) =>
                      candidate.producedTypes.includes(output.type),
                    );
                    const current = normalizeFieldPresentation(output.type, output.presentation);
                    return {
                      ...output,
                      presentation: normalizeFieldPresentation(
                        output.type,
                        current.renderer === "auto" ? (port?.presentation ?? current) : current,
                      ),
                    };
                  });
                  onChange({
                    plugin: { pluginId, capabilityId, configuration },
                    inputs: requestedInputs,
                    outputs: requestedOutputs,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um plugin compatível" />
                </SelectTrigger>
                <SelectContent>
                  {compatibleCapabilities.map(({ plugin, capability }) => (
                    <SelectItem
                      key={`${plugin.id}::${capability.id}`}
                      value={`${plugin.id}::${capability.id}`}
                    >
                      {plugin.manifest.name} · {capability.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Nenhum plugin instalado é compatível com este bloco, processo e contrato de saída.
              </p>
            )}
          </div>

          {selectedCapability && (
            <div className="space-y-3">
              {Object.entries(configProperties).map(([key, schema]) => {
                const profileSetup =
                  selectedPlugin?.manifest.profileSetup?.configurationKey === key
                    ? selectedPlugin.manifest.profileSetup
                    : undefined;
                return (
                  <div
                    key={key}
                    className={cn(profileSetup && "grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]")}
                  >
                    <PluginConfigurationField
                      propertyKey={key}
                      schema={schema}
                      value={block.plugin?.configuration[key]}
                      options={
                        selectedPlugin?.id === "official-openai-gpt" &&
                        key === "model" &&
                        openAIModels.length
                          ? openAIModels.map((model) => ({ value: model.id, label: model.name }))
                          : selectedPlugin?.id === "official-anthropic-claude" &&
                              key === "model" &&
                              anthropicModels.length
                            ? anthropicModels.map((model) => ({
                                value: model.id,
                                label: model.name,
                              }))
                            : undefined
                      }
                      onChange={(value) =>
                        onChange({
                          plugin: {
                            pluginId: block.plugin!.pluginId,
                            capabilityId: block.plugin!.capabilityId,
                            configuration: { ...block.plugin!.configuration, [key]: value },
                          },
                        })
                      }
                    />
                    {profileSetup && block.plugin && (
                      <ProfileSetupControl
                        pluginId={block.plugin.pluginId}
                        profileSetup={profileSetup}
                        configuration={block.plugin.configuration}
                      />
                    )}
                  </div>
                );
              })}
              {selectedPlugin?.id === "official-openai-gpt" && (
                <p className="text-[11px] text-muted-foreground">
                  {openAIModels.length
                    ? `${openAIModels.length} modelos disponíveis foram consultados na sua conta OpenAI.`
                    : "Conecte sua chave em Plugins para atualizar os modelos disponíveis. A chave não é salva no Método."}
                </p>
              )}
              {selectedPlugin?.id === "official-anthropic-claude" && (
                <p className="text-[11px] text-muted-foreground">
                  {anthropicModels.length
                    ? `${anthropicModels.length} modelos disponíveis foram consultados na sua conta Anthropic.`
                    : "Conecte sua chave em Plugins para atualizar os modelos disponíveis. A chave não é salva no Método."}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProfileSetupControl({
  pluginId,
  profileSetup,
  configuration,
}: {
  pluginId: string;
  profileSetup: PluginProfileSetup;
  configuration: Record<string, string | number | boolean>;
}) {
  type ProfileStatus = "checking" | "ready" | "missing" | "preparing";
  const primaryProfile = String(configuration[profileSetup.configurationKey] ?? "").trim();
  const fallbackProfilesValue = profileSetup.fallbackConfigurationKey
    ? String(configuration[profileSetup.fallbackConfigurationKey] ?? "")
    : "";
  const profileNames = useMemo(
    () =>
      [
        primaryProfile,
        ...fallbackProfilesValue
          .split(/[\n,;]+/)
          .map((value) => value.trim())
          .filter(Boolean),
      ].filter((value, index, values) => value && values.indexOf(value) === index),
    [fallbackProfilesValue, primaryProfile],
  );
  const [statuses, setStatuses] = useState<Record<string, ProfileStatus>>({});

  useEffect(() => {
    if (!profileNames.length) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatuses(Object.fromEntries(profileNames.map((name) => [name, "checking"])));
      void Promise.all(
        profileNames.map(async (profileName) => {
          try {
            const response = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/profile`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "status",
                configuration: {
                  ...configuration,
                  [profileSetup.configurationKey]: profileName,
                },
              }),
              signal: controller.signal,
            });
            const payload = (await response.json()) as { ready?: boolean };
            if (!response.ok) throw new Error();
            return [profileName, payload.ready ? "ready" : "missing"] as const;
          } catch {
            return [profileName, "missing"] as const;
          }
        }),
      ).then((entries) => {
        if (!controller.signal.aborted) setStatuses(Object.fromEntries(entries));
      });
    }, 500);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [configuration, pluginId, profileNames, profileSetup.configurationKey]);

  const prepare = async (profileName: string) => {
    if (!profileName || statuses[profileName] === "preparing") return;
    setStatuses((current) => ({ ...current, [profileName]: "preparing" }));
    toast.info("Conclua o login na janela do navegador", {
      description: `O perfil ${profileName} será guardado quando a área do provedor estiver pronta.`,
    });
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "prepare",
          configuration: { ...configuration, [profileSetup.configurationKey]: profileName },
        }),
      });
      const payload = (await response.json()) as {
        ready?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !payload.ready) {
        throw new Error(payload.error ?? "O login não foi confirmado pelo plugin.");
      }
      setStatuses((current) => ({ ...current, [profileName]: "ready" }));
      toast.success("Perfil salvo e validado", {
        description: payload.message ?? `${profileName} está pronto para futuras execuções.`,
      });
    } catch (error) {
      setStatuses((current) => ({ ...current, [profileName]: "missing" }));
      toast.error("Não foi possível salvar o perfil", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  return (
    <div className="flex min-w-44 flex-col justify-end gap-1.5 sm:pt-5">
      {profileNames.map((profileName, index) => {
        const status = statuses[profileName] ?? "checking";
        return (
          <Button
            key={profileName}
            type="button"
            variant={status === "ready" ? "outline" : "default"}
            className="justify-start gap-1.5"
            disabled={status === "preparing" || status === "checking"}
            onClick={() => void prepare(profileName)}
          >
            {status === "preparing" || status === "checking" ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : status === "ready" ? (
              <CheckCircle2 className="size-3.5" />
            ) : (
              <CircleUserRound className="size-3.5" />
            )}
            {status === "ready" ? `${profileName} salvo` : `${profileSetup.label}: ${profileName}`}
            {index > 0 && <span className="ml-auto text-[10px] opacity-70">fallback {index}</span>}
          </Button>
        );
      })}
      <p className="text-[10px] text-muted-foreground">
        {profileNames.length
          ? "Cada alias mantém login separado. O fallback ocorre somente em falhas técnicas permitidas."
          : (profileSetup.description ?? "Informe pelo menos um perfil de conta.")}
      </p>
    </div>
  );
}

function PluginConfigurationField({
  propertyKey,
  schema,
  value,
  options,
  onChange,
}: {
  propertyKey: string;
  schema: JsonSchema;
  value: string | number | boolean | undefined;
  options?: Array<{ value: string; label: string }>;
  onChange: (value: string | number | boolean) => void;
}) {
  const label = schema.title ?? propertyKey;
  const choices =
    options ??
    (schema.oneOf ?? []).flatMap((option) =>
      typeof option.const === "string" || typeof option.const === "number"
        ? [{ value: String(option.const), label: option.title ?? String(option.const) }]
        : [],
    );
  if (schema.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-xs">
        <Checkbox
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        {label}
      </label>
    );
  }
  if (choices.length) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Selecione ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {choices.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {schema.description && (
          <p className="text-[11px] text-muted-foreground">{schema.description}</p>
        )}
      </div>
    );
  }
  if (schema.enum?.length) {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Select value={String(value ?? "")} onValueChange={onChange}>
          <SelectTrigger>
            <SelectValue placeholder={`Selecione ${label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {schema.enum.map((option) => (
              <SelectItem key={String(option)} value={String(option)}>
                {String(option)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
  if (schema.format === "textarea") {
    return (
      <div className="space-y-1.5">
        <Label>{label}</Label>
        <Textarea
          value={String(value ?? "")}
          rows={4}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={schema.type === "number" || schema.type === "integer" ? "number" : "text"}
        min={schema.minimum}
        max={schema.maximum}
        step={schema.type === "number" ? "0.1" : undefined}
        value={String(value ?? "")}
        onChange={(event) =>
          onChange(
            schema.type === "number" || schema.type === "integer"
              ? Number(event.target.value)
              : event.target.value,
          )
        }
      />
      {schema.description && (
        <p className="text-[11px] text-muted-foreground">{schema.description}</p>
      )}
    </div>
  );
}

function ValidationEditor({
  block,
  methodBlocks,
  index,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  index: number;
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const previousBlocks = methodBlocks.slice(0, index).filter((item) => item.type !== "VALIDAR");
  const validation = block.validation ?? {
    targetBlockId: previousBlocks.at(-1)?.id,
    mode: "approval" as ValidationMode,
    onReject: "retry_target" as const,
    maxAttempts: 3,
  };
  const target = previousBlocks.find((item) => item.id === validation.targetBlockId);
  const targetOutputs = target?.outputs ?? [];

  function sourceOutputFor(targetBlock: ActionBlock | undefined, key?: string) {
    return (
      targetBlock?.outputs?.find((output) => output.key === key) ??
      targetBlock?.outputs?.find((output) =>
        ["list", "files", "multiselect"].includes(output.type),
      ) ??
      targetBlock?.outputs?.[0]
    );
  }

  function applyValidation(
    patch: Partial<NonNullable<ActionBlock["validation"]>>,
    nextMode = patch.mode ?? validation.mode,
    nextTarget = previousBlocks.find(
      (item) => item.id === (patch.targetBlockId ?? validation.targetBlockId),
    ),
  ) {
    const nextValidation = { ...validation, ...patch };
    const sourceOutput =
      nextMode === "approval"
        ? undefined
        : sourceOutputFor(nextTarget, patch.targetOutputKey ?? nextValidation.targetOutputKey);
    if (nextMode !== "approval") nextValidation.targetOutputKey = sourceOutput?.key;
    else nextValidation.targetOutputKey = undefined;
    onChange({
      validation: nextValidation,
      outputs: createValidationFields(
        nextMode,
        nextValidation.targetBlockId,
        nextValidation.targetOutputKey,
        sourceOutput?.type,
      ),
    });
  }

  return (
    <div className="mt-6 space-y-4 border-t border-border pt-5">
      <div>
        <h3 className="text-sm font-semibold">Regra de validação</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Relacione esta validação a uma ação anterior e defina o que acontece com o resultado.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Bloco validado</Label>
        <Select
          value={validation.targetBlockId}
          onValueChange={(targetBlockId) =>
            applyValidation({ targetBlockId, targetOutputKey: undefined })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma ação anterior" />
          </SelectTrigger>
          <SelectContent>
            {previousBlocks.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.order + 1}. {candidate.name ?? candidate.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Modo</Label>
        <Select
          value={validation.mode}
          onValueChange={(mode) => applyValidation({ mode: mode as ValidationMode })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="approval">Aprovar ou reprovar</SelectItem>
            <SelectItem value="select_one" disabled={!targetOutputs.length}>
              Escolher uma opção
            </SelectItem>
            <SelectItem value="select_many" disabled={!targetOutputs.length}>
              Escolher várias opções
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {validation.mode !== "approval" && (
        <div className="space-y-1.5">
          <Label>Saída apresentada para escolha</Label>
          {targetOutputs.length ? (
            <Select
              value={validation.targetOutputKey}
              onValueChange={(targetOutputKey) => applyValidation({ targetOutputKey })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a saída com as opções" />
              </SelectTrigger>
              <SelectContent>
                {targetOutputs.map((output) => (
                  <SelectItem key={output.id} value={output.key}>
                    {output.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              O bloco selecionado precisa declarar uma saída para oferecer opções.
            </p>
          )}
        </div>
      )}

      {validation.mode === "approval" && (
        <>
          <div className="space-y-1.5">
            <Label>Quando reprovar</Label>
            <Select
              value={validation.onReject}
              onValueChange={(onReject) =>
                applyValidation({ onReject: onReject as "retry_target" | "pause" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retry_target">Refazer o bloco validado</SelectItem>
                <SelectItem value="pause">Pausar para revisão manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {validation.onReject === "retry_target" && (
            <div className="space-y-1.5">
              <Label>Máximo de tentativas</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={validation.maxAttempts}
                onChange={(event) =>
                  applyValidation({
                    maxAttempts: Math.min(20, Math.max(1, Number(event.target.value) || 1)),
                  })
                }
              />
              <p className="text-[10px] text-muted-foreground">
                Ao atingir o limite, a validação permanece pausada para decisão humana.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ContextInputsEditor({
  block,
  methodBlocks,
  blockIndex,
  processType,
  channelMethods,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const addInput = () => {
    const input: BlockInputBinding = {
      id: uid(`${block.id}-context`),
      label: "Histórico relevante",
      type: "records",
      source: "channel_history",
      historyLimit: 10,
      historyEligibility: "completed",
      recordFields: createChannelHistoryRecordFields("text"),
      presentation: { renderer: "table", itemType: "record" },
    };
    onChange({ inputs: [...inputs, input] });
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-3.5 text-brand-soft" /> Contexto para a decisão
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Opcional. Consulte entregas de projetos anteriores sem dar acesso direto à Biblioteca.
          </p>
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
            availableBlocks={methodBlocks.slice(0, blockIndex)}
            methodBlocks={methodBlocks}
            currentBlockId={block.id}
            processType={processType}
            channelMethods={channelMethods}
            allowChannelHistory
            onChange={(patch) =>
              onChange({
                inputs: inputs.map((item) => (item.id === input.id ? { ...item, ...patch } : item)),
              })
            }
            onRemove={() => onChange({ inputs: inputs.filter((item) => item.id !== input.id) })}
          />
        ))}
        {!inputs.length && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Sem contexto adicional. A coleção vinculada e os resultados do projeto continuam
            disponíveis normalmente.
          </div>
        )}
      </div>
    </div>
  );
}

function DataContractEditor({
  block,
  methodBlocks,
  blockIndex,
  processType,
  channelMethods,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const outputs = block.outputs ?? [];
  const addInput = () => {
    const input: BlockInputBinding = {
      id: uid(`${block.id}-input`),
      label: "Nova entrada",
      type: "text",
      source: "previous_block",
      presentation: { renderer: "auto" },
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
      presentation: { renderer: "auto" },
    };
    onChange({ outputs: [...outputs, output] });
  };
  return (
    <>
      <div className="mt-6 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Dados de entrada</h3>
          <p className="text-[11px] text-muted-foreground">
            O que esta ação recebe. A saída compatível mais recente é conectada automaticamente.
          </p>
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
            availableBlocks={methodBlocks.slice(0, blockIndex)}
            methodBlocks={methodBlocks}
            currentBlockId={block.id}
            processType={processType}
            channelMethods={channelMethods}
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
            Nenhuma entrada específica. Os resultados anteriores continuam disponíveis como contexto
            durante a produção.
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Dados de saída</h3>
          <p className="text-[11px] text-muted-foreground">
            O que esta ação deve entregar para o método continuar.
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
          <OutputFieldEditor
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
            Adicione ao menos uma saída para concluir esta ação.
          </div>
        )}
      </div>
    </>
  );
}

function InputBindingEditor({
  input,
  availableBlocks,
  methodBlocks,
  currentBlockId,
  processType,
  channelMethods,
  allowChannelHistory = false,
  onChange,
  onRemove,
}: {
  input: BlockInputBinding;
  availableBlocks: ActionBlock[];
  methodBlocks: ActionBlock[];
  currentBlockId: string;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  allowChannelHistory?: boolean;
  onChange: (patch: Partial<BlockInputBinding>) => void;
  onRemove: () => void;
}) {
  const sourceBlock = availableBlocks.find((block) => block.id === input.blockId);
  const previousProcesses = PROCESS_ORDER.slice(0, PROCESS_ORDER.indexOf(processType));
  const previousDeliverySources = previousProcesses.flatMap((sourceProcessType) => {
    const method = channelMethods[sourceProcessType];
    const blockOutputs = (method?.blocks ?? []).flatMap((sourceBlock) =>
      (sourceBlock.outputs ?? []).map((output) => ({
        id: `${sourceProcessType}::${sourceBlock.id}::${output.key}`,
        processType: sourceProcessType,
        blockId: sourceBlock.id,
        blockLabel: sourceBlock.name ?? sourceBlock.type,
        output,
      })),
    );
    const officialOutput = createProcessOutputFields(sourceProcessType)[0];
    return [
      {
        id: `${sourceProcessType}::process::${officialOutput.key}`,
        processType: sourceProcessType,
        blockId: "__process_output__",
        blockLabel: "Resultado oficial",
        output: officialOutput,
      },
      ...blockOutputs,
    ];
  });
  const selectedPreviousDelivery =
    previousDeliverySources.find(
      (source) =>
        source.processType === input.sourceProcessType &&
        source.blockId === input.blockId &&
        source.output.key === input.sourceKey,
    ) ??
    previousDeliverySources.find(
      (source) => !input.sourceProcessType && source.output.key === input.sourceKey,
    );
  const channelHistorySources = allowChannelHistory
    ? collectChannelHistorySources(processType, methodBlocks, channelMethods)
    : [];
  const selectedChannelHistory = channelHistorySources.find(
    (source) =>
      source.processType === input.sourceProcessType &&
      source.blockId === input.blockId &&
      source.output.key === input.sourceKey,
  );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)_32px] items-center gap-2">
        <Input
          value={input.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Nome da entrada"
          className="h-8 text-xs"
        />
        <PresentationSelector
          type={input.type}
          value={input.presentation}
          onChange={(presentation) => onChange({ presentation })}
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

      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Tipo técnico do dado</Label>
        <Select
          value={input.type ?? "text"}
          disabled={input.source === "channel_history"}
          onValueChange={(type) => {
            const nextType = type as HumanFieldType;
            onChange({
              type: nextType,
              presentation: normalizeFieldPresentation(nextType, input.presentation),
              recordFields:
                type === "records" ? (input.recordFields ?? [newRecordField(0)]) : undefined,
            });
          }}
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
        {input.source === "channel_history" && (
          <p className="text-[10px] text-muted-foreground">
            O histórico sempre chega como lista de registros com valor, projeto e data.
          </p>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Origem</Label>
          <Select
            value={input.source}
            onValueChange={(source) => {
              if (source === "channel_history") {
                const selected =
                  channelHistorySources.find(
                    (candidate) =>
                      candidate.processType === processType && candidate.blockId === currentBlockId,
                  ) ?? channelHistorySources[0];
                onChange({
                  source: "channel_history",
                  sourceKey: selected?.output.key,
                  sourceProcessType: selected?.processType,
                  blockId: selected?.blockId,
                  staticValue: undefined,
                  historyLimit: 10,
                  historyEligibility: "completed",
                  type: "records",
                  presentation: { renderer: "table", itemType: "record" },
                  recordFields: createChannelHistoryRecordFields(selected?.output.type ?? "text"),
                });
                return;
              }
              if (source === "previous_process") {
                const selected = previousDeliverySources.at(-1);
                const output = selected?.output;
                onChange({
                  source: "previous_process",
                  sourceKey: output?.key,
                  sourceProcessType: selected?.processType,
                  blockId: selected?.blockId,
                  staticValue: undefined,
                  historyLimit: undefined,
                  historyEligibility: undefined,
                  type: output?.type ?? input.type,
                  presentation: output?.presentation ?? input.presentation,
                  recordFields: output?.recordFields,
                });
                return;
              }
              onChange({
                source: source as BlockInputBinding["source"],
                sourceKey: source === "project" ? "title" : undefined,
                sourceProcessType: undefined,
                blockId: undefined,
                staticValue: undefined,
                historyLimit: undefined,
                historyEligibility: undefined,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="previous_block">Bloco anterior</SelectItem>
              <SelectItem value="previous_process" disabled={!previousDeliverySources.length}>
                Entrega anterior
              </SelectItem>
              {allowChannelHistory && (
                <SelectItem value="channel_history" disabled={!channelHistorySources.length}>
                  Histórico do canal
                </SelectItem>
              )}
              <SelectItem value="project">Dados do projeto</SelectItem>
              <SelectItem value="static">Valor fixo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {input.source === "previous_block" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Bloco</Label>
            <Select
              value={input.blockId ?? "automatic"}
              onValueChange={(blockId) =>
                onChange({
                  blockId: blockId === "automatic" ? undefined : blockId,
                  sourceKey: undefined,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="automatic">Compatível mais recente</SelectItem>
                {availableBlocks.map((candidate) => (
                  <SelectItem key={candidate.id} value={candidate.id}>
                    {candidate.order + 1}. {candidate.name ?? candidate.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {input.source === "previous_process" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Processo, bloco e entrega</Label>
            <Select
              value={selectedPreviousDelivery?.id}
              onValueChange={(sourceId) => {
                const selected = previousDeliverySources.find(
                  (candidate) => candidate.id === sourceId,
                );
                const output = selected?.output;
                onChange({
                  sourceProcessType: selected?.processType,
                  blockId: selected?.blockId,
                  sourceKey: output?.key,
                  type: output?.type ?? input.type,
                  presentation: output?.presentation ?? input.presentation,
                  recordFields: output?.recordFields,
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione o resultado" />
              </SelectTrigger>
              <SelectContent>
                {previousDeliverySources.map((source) => (
                  <SelectItem key={source.id} value={source.id}>
                    {PROCESS_META[source.processType].label} / {source.blockLabel} /{" "}
                    {source.output.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {input.source === "channel_history" && (
          <div className="space-y-2 sm:col-span-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">
                Processo, bloco e decisão anteriores
              </Label>
              <Select
                value={selectedChannelHistory?.id}
                onValueChange={(sourceId) => {
                  const selected = channelHistorySources.find(
                    (candidate) => candidate.id === sourceId,
                  );
                  onChange({
                    sourceProcessType: selected?.processType,
                    blockId: selected?.blockId,
                    sourceKey: selected?.output.key,
                    type: "records",
                    presentation: { renderer: "table", itemType: "record" },
                    recordFields: createChannelHistoryRecordFields(selected?.output.type ?? "text"),
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Selecione o histórico consultado" />
                </SelectTrigger>
                <SelectContent>
                  {channelHistorySources.map((source) => (
                    <SelectItem key={source.id} value={source.id}>
                      {PROCESS_META[source.processType].label} / {source.blockLabel} /{" "}
                      {source.output.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Últimos registros</Label>
                <Input
                  className="h-8 text-xs"
                  type="number"
                  min={1}
                  max={100}
                  value={input.historyLimit ?? 10}
                  onChange={(event) =>
                    onChange({
                      historyLimit: Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                    })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Considerar</Label>
                <Select
                  value={input.historyEligibility ?? "completed"}
                  onValueChange={(historyEligibility) =>
                    onChange({
                      historyEligibility: historyEligibility as "completed" | "published",
                    })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Decisões concluídas</SelectItem>
                    <SelectItem value="published">Somente projetos publicados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {input.source === "project" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Dado</Label>
            <Select
              value={input.sourceKey ?? "title"}
              onValueChange={(sourceKey) => onChange({ sourceKey })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="title">Nome do projeto</SelectItem>
                <SelectItem value="deadline">Prazo</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {input.source === "static" && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Valor</Label>
            <Input
              className="h-8 text-xs"
              value={input.staticValue ?? ""}
              onChange={(event) => onChange({ staticValue: event.target.value })}
              placeholder="Valor usado nesta entrada"
            />
          </div>
        )}
      </div>

      {input.source === "previous_block" && input.blockId && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Saída do bloco</Label>
          <Select
            value={input.sourceKey ?? "automatic"}
            onValueChange={(sourceKey) => {
              const output = sourceBlock?.outputs?.find((candidate) => candidate.key === sourceKey);
              onChange({
                sourceKey: sourceKey === "automatic" ? undefined : sourceKey,
                type: output?.type ?? input.type,
                presentation: output?.presentation ?? input.presentation,
                recordFields: output?.recordFields,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="automatic">Saída compatível</SelectItem>
              {(sourceBlock?.outputs ?? []).map((output) => (
                <SelectItem key={output.id} value={output.key}>
                  {output.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {input.type === "records" && (
        <RecordFieldsEditor
          fields={input.recordFields ?? []}
          onChange={(recordFields) => onChange({ recordFields })}
        />
      )}
    </div>
  );
}

function OutputFieldEditor({
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)_32px] items-center gap-2">
        <Input
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Nome da saída"
          className="h-8 text-xs"
        />
        <PresentationSelector
          type={field.type}
          value={field.presentation}
          onChange={(presentation) => onChange({ presentation })}
        />
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      <div className="space-y-1">
        <Label className="text-[10px] text-muted-foreground">Tipo técnico do dado</Label>
        <Select
          value={field.type}
          onValueChange={(type) => {
            const nextType = type as HumanFieldType;
            onChange({
              type: nextType,
              presentation: normalizeFieldPresentation(nextType, field.presentation),
              recordFields:
                type === "records" ? (field.recordFields ?? [newRecordField(0)]) : undefined,
            });
          }}
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
      </div>
      {usesOptions && (
        <div>
          <LineListTextarea
            value={field.options ?? []}
            onChange={(options) => onChange({ options })}
            placeholder="Opções fixas, uma por linha (opcional)"
            rows={3}
            className="text-xs"
          />
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            Se ficar vazio, o sistema usa automaticamente a lista mais recente produzida pelo
            método.
          </p>
        </div>
      )}
      {field.type === "records" && (
        <RecordFieldsEditor
          fields={field.recordFields ?? []}
          onChange={(recordFields) => onChange({ recordFields })}
        />
      )}
    </div>
  );
}

function PresentationSelector({
  type,
  value,
  onChange,
}: {
  type: HumanFieldType;
  value?: FieldPresentation;
  onChange: (presentation: FieldPresentation) => void;
}) {
  const normalized = normalizeFieldPresentation(type, value);
  const compatible = getCompatiblePresentationRenderers(type);
  const selected = compatible.includes(normalized.renderer) ? normalized.renderer : "auto";
  const [previewId, setPreviewId] = useState<PresentationRendererId>(selected);
  const [mimeDraft, setMimeDraft] = useState((normalized.acceptedMimeTypes ?? []).join(", "));
  const groups = PRESENTATION_RENDERERS.filter((renderer) =>
    compatible.includes(renderer.id),
  ).reduce((result, renderer) => {
    const group = result.get(renderer.group) ?? [];
    group.push(renderer);
    result.set(renderer.group, group);
    return result;
  }, new Map<string, typeof PRESENTATION_RENDERERS>());
  const preview = PRESENTATION_RENDERER_REGISTRY[previewId] ?? PRESENTATION_RENDERER_REGISTRY.auto;
  const selectedDefinition = PRESENTATION_RENDERER_REGISTRY[selected];
  const SelectedIcon = selectedDefinition.icon;
  const supportsRestrictions = [
    "file",
    "files",
    "image",
    "audio",
    "video",
    "list",
    "records",
  ].includes(type);
  const itemTypeOptions =
    type === "list" || type === "multiselect"
      ? (["text"] as const)
      : type === "records"
        ? (["record"] as const)
        : type === "image"
          ? (["image"] as const)
          : type === "audio"
            ? (["audio"] as const)
            : type === "video"
              ? (["video"] as const)
              : (["file", "image", "audio", "video"] as const);
  const itemTypeLabels = {
    text: "Texto",
    record: "Registro",
    file: "Arquivo",
    image: "Imagem",
    audio: "Áudio",
    video: "Vídeo",
  } as const;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) return;
        setPreviewId(selected);
        setMimeDraft((normalized.acceptedMimeTypes ?? []).join(", "));
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-8 justify-start gap-2 overflow-hidden px-2 text-xs">
          <SelectedIcon className="size-3.5 shrink-0 text-brand-soft" />
          <span className="truncate">{selectedDefinition.label}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Forma de apresentação</DialogTitle>
          <DialogDescription>
            O tipo técnico continua definindo validação e compatibilidade. A apresentação muda
            apenas o layout.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="space-y-4">
            {[...groups.entries()].map(([group, renderers]) => (
              <fieldset key={group}>
                <legend className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {group}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {renderers.map((renderer) => {
                    const Icon = renderer.icon;
                    const isSelected = selected === renderer.id;
                    return (
                      <button
                        key={renderer.id}
                        type="button"
                        aria-pressed={isSelected}
                        onMouseEnter={() => setPreviewId(renderer.id)}
                        onFocus={() => setPreviewId(renderer.id)}
                        onClick={() => {
                          setPreviewId(renderer.id);
                          onChange({ ...normalized, renderer: renderer.id });
                        }}
                        className={cn(
                          "rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          isSelected
                            ? "border-brand/60 bg-brand/10"
                            : "border-border/70 bg-background/30 hover:border-brand/35",
                        )}
                      >
                        <span className="flex items-center gap-2 text-xs font-semibold">
                          <Icon className="size-4 text-brand-soft" />
                          {renderer.label}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-muted-foreground">
                          {renderer.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {supportsRestrictions && (
              <div className="grid gap-3 rounded-xl border border-border/70 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">
                    Tipo de item esperado (opcional)
                  </Label>
                  <Select
                    value={normalized.itemType ?? "any"}
                    onValueChange={(itemType) =>
                      onChange(
                        normalizeFieldPresentation(type, {
                          ...normalized,
                          itemType:
                            itemType === "any"
                              ? undefined
                              : (itemType as FieldPresentation["itemType"]),
                        }),
                      )
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Qualquer item compatível</SelectItem>
                      {itemTypeOptions.map((itemType) => (
                        <SelectItem key={itemType} value={itemType}>
                          {itemTypeLabels[itemType]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {["file", "files", "image", "audio", "video"].includes(type) && (
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">
                      MIME aceitos (opcional)
                    </Label>
                    <Input
                      className="h-8 text-xs"
                      value={mimeDraft}
                      onChange={(event) => setMimeDraft(event.target.value)}
                      onBlur={() =>
                        onChange(
                          normalizeFieldPresentation(type, {
                            ...normalized,
                            acceptedMimeTypes: mimeDraft.split(","),
                          }),
                        )
                      }
                      placeholder="image/*, image/png"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          <aside className="md:sticky md:top-0 md:self-start">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia real
            </p>
            <div className="min-h-56 rounded-xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold">{preview.label}</p>
              <RuntimeValueViewer
                type={preview.preview.type}
                value={preview.preview.value}
                presentation={{ renderer: preview.id }}
                compact
              />
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">
              Passe o mouse ou use Tab para comparar. Em telas sem hover, toque em uma opção.
            </p>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RecordFieldsEditor({
  fields,
  onChange,
}: {
  fields: RecordFieldDefinition[];
  onChange: (fields: RecordFieldDefinition[]) => void;
}) {
  function update(id: string, patch: Partial<RecordFieldDefinition>) {
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  }

  return (
    <div className="rounded-lg border border-border/70 bg-background/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Campos de cada registro</p>
          <p className="text-[10px] text-muted-foreground">
            Ex.: cena, narração, descrição visual e duração.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1 text-[10px]"
          onClick={() => onChange([...fields, newRecordField(fields.length)])}
        >
          <Plus className="size-3" /> Campo
        </Button>
      </div>
      <div className="mt-3 space-y-2">
        {fields.map((recordField, index) => (
          <div
            key={recordField.id}
            className="grid gap-2 rounded-lg border border-border/60 p-2 sm:grid-cols-[minmax(0,1fr)_120px_32px]"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                className="h-8 text-xs"
                value={recordField.label}
                onChange={(event) => update(recordField.id, { label: event.target.value })}
                placeholder={`Campo ${index + 1}`}
              />
              <Input
                className="h-8 font-mono text-xs"
                value={recordField.key}
                onChange={(event) => update(recordField.id, { key: event.target.value })}
                placeholder="chave_tecnica"
              />
            </div>
            <Select
              value={recordField.type}
              onValueChange={(type) => update(recordField.id, { type: type as RecordFieldType })}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECORD_FIELD_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 text-muted-foreground hover:text-destructive"
              disabled={fields.length === 1}
              onClick={() => onChange(fields.filter((field) => field.id !== recordField.id))}
              aria-label="Remover campo do registro"
            >
              <Trash2 className="size-3" />
            </Button>
            <label className="flex items-center gap-2 text-[10px] text-muted-foreground sm:col-span-3">
              <Checkbox
                checked={recordField.required}
                onCheckedChange={(checked) =>
                  update(recordField.id, { required: checked === true })
                }
              />
              Obrigatório
            </label>
            {recordField.type === "select" && (
              <LineListTextarea
                className="min-h-20 text-xs sm:col-span-3"
                value={recordField.options ?? []}
                onChange={(options) => update(recordField.id, { options })}
                placeholder="Uma opção por linha"
              />
            )}
          </div>
        ))}
        {!fields.length && (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => onChange([newRecordField(0)])}
          >
            Definir primeiro campo
          </Button>
        )}
      </div>
    </div>
  );
}
