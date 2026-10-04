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
  AlertTriangle,
  ArrowLeft,
  Bot,
  Braces,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
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
import { channelNeedsUpgrade, methodNeedsUpgrade } from "@/lib/user-data-upgrade";
import { useAppPreferences } from "@/lib/app-preferences";
import { effectiveProcessOrder } from "@/lib/process-order";
import { pluginRequirementReadiness } from "@/lib/method-transfer-readiness";
import { pluginCapabilityLabel } from "@/lib/plugin-capability-label";
import { addPluginOutput, bindPluginInput, pluginInputSources } from "@/lib/plugin-method-ports";
import {
  clonePluginConfigurationDraft,
  preparePluginConfigurationCommit,
} from "@/lib/plugin-configuration-draft";
import { localizePluginManifest } from "@/lib/plugin-localization";
import {
  areValueShapesCompatible,
  contentShape,
  controlShape,
  recordShape,
} from "@/lib/data-shape";
import { ChannelAvatar } from "@/components/channel-avatar";
import { PluginConfigurationRenderer } from "@/components/plugin-configuration-renderer";
import { RuntimeValueViewer } from "@/components/runtime-value-viewer";
import { isMethodContentField, replaceMethodContentFields } from "@/lib/method-content-fields";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
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
  type ActionBlock,
  type BlockPluginBinding,
  type BlockFieldDefinition,
  type BlockInputBinding,
  type BlockOperator,
  type BlockParameter,
  type BlockType,
  type Channel,
  type FieldPresentation,
  type ContentCardinality,
  type ContentShape,
  type ContentFamily,
  type ContentRepresentation,
  type PresentationRendererId,
  type ProfileExecutionPolicy,
  type ProcessMethod,
  type StrategicCollection,
  type UniversalProcess,
  type ValidationMode,
  type ValueShape,
} from "@/lib/domain";
import {
  createProcessOutputFields,
  createSuggestedHumanFields,
  createValidationFields,
  normalizeActionBlock,
} from "@/lib/human-workflow";
import {
  parseMethodImportFile,
  planPortableMethodTransfer,
  serializeMethodFile,
  type MethodRequirement,
  type PortableCollection,
  type PortableLibraryItem,
} from "@/lib/method-file";
import { getCompatiblePresentationRenderers, normalizeFieldPresentation } from "@/lib/presentation";
import { createChannelHistoryRecordFields } from "@/lib/channel-history";
import { getBlockSourceFields } from "@/lib/method-source-fields";
import { renderPluginPromptPreview } from "@/lib/plugin-prompt-preview";
import {
  addInstructionInputVariable,
  instructionCollectionKey,
  instructionInputKey,
  instructionInputLabel,
  instructionReferencesInput,
  nextManualInputLabel,
  removeInstructionInputVariables,
  replaceInstructionInputVariable,
} from "@/lib/instruction-template";
import type { PluginCapability, PluginManifest, PluginProfileSetup } from "@/lib/plugin-contract";
import { pluginConnectionRequired } from "@/lib/plugin-contract";
import {
  applyMethodTransfer,
  clearMethodDraft,
  readMethodDraft,
  rememberMethodDraft,
  setChannelMethod,
  removeChannelMethod,
  useChannel,
  useChannels,
  useLibraryCollections,
} from "@/lib/store";
import { cn } from "@/lib/utils";

type DiscoveredPlugin = {
  id: string;
  source: "installed" | "local";
  directory: string;
  manifest: PluginManifest;
  enabled?: boolean;
  executable?: boolean;
  profileCount?: number;
};

type LocalPluginConnection = {
  id: string;
  pluginId: string;
  name: string;
  connected: boolean;
  updatedAt: string;
  metadata: Record<string, unknown>;
  requiredSecretKeys: string[];
  connectedSecretKeys: string[];
};

type ManagedPluginProfile = {
  id: string;
  pluginId: string;
  name: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
  readinessState?: string;
  occupied?: boolean;
};

type MethodTransferPreview = {
  name: string;
  sourceChannelId?: string;
  methods: ProcessMethod[];
  collections: PortableCollection[];
  itemsIncluded: boolean;
  items: PortableLibraryItem[];
  requirements: MethodRequirement[];
  preferredOrder: UniversalProcess[];
  primaryProcess: UniversalProcess;
  preserveLocalConnections: boolean;
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

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function shapeSummary(shape: ValueShape) {
  const cardinality = shape.cardinality === "many" ? "vários" : "um";
  if (shape.kind === "content") {
    const representation = shape.representation === "artifact" ? "arquivo" : shape.representation;
    return `${shape.family} · ${cardinality} · ${representation}`;
  }
  if (shape.kind === "record") return `registro · ${cardinality}`;
  return `${shape.control} · ${cardinality}`;
}

export function MethodBuilder({
  channelId,
  initialProcess,
}: {
  channelId: string;
  initialProcess?: UniversalProcess;
}) {
  const channel = useChannel(channelId);
  const { t } = useAppPreferences();
  const navigate = useNavigate();
  const channels = useChannels();
  const allCollections = useLibraryCollections();
  const collections = useLibraryCollections(channelId);
  const [processType, setProcessType] = useState<UniversalProcess>(initialProcess ?? "theme");
  const [draftName, setDraftName] = useState("");
  const [draftImageUrl, setDraftImageUrl] = useState<string>();
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [pluginPanelBlockId, setPluginPanelBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<ActionBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [readinessPlugins, setReadinessPlugins] = useState<DiscoveredPlugin[]>([]);
  const [readinessConnections, setReadinessConnections] = useState<Record<string, string[]>>({});
  const [transferPreview, setTransferPreview] = useState<MethodTransferPreview>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadedProcessRef = useRef<UniversalProcess | null>(null);
  const editVersionRef = useRef(0);
  const definitionRevisionRef = useRef(0);
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
    .filter((candidate) => candidate.id !== channelId && !channelNeedsUpgrade(candidate))
    .map((candidate) => ({
      channel: candidate,
      method: candidate.methods?.[processType],
    }))
    .filter(
      (candidate) =>
        candidate.method && !methodNeedsUpgrade(candidate.method) && candidate.method.blocks.length,
    );

  currentProcessRef.current = processType;

  useEffect(() => {
    if (selectedBlockId && !blocks.some((block) => block.id === selectedBlockId)) {
      setSelectedBlockId(null);
    }
  }, [blocks, selectedBlockId]);

  useEffect(() => {
    if (pluginPanelBlockId && pluginPanelBlockId !== selectedBlockId) {
      setPluginPanelBlockId(null);
    }
  }, [pluginPanelBlockId, selectedBlockId]);

  useEffect(() => {
    let active = true;
    void fetch("/api/plugins", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar plugins.");
        return response.json() as Promise<{ plugins: DiscoveredPlugin[] }>;
      })
      .then((result) => {
        if (active) {
          setReadinessPlugins(result.plugins);
          void Promise.all(
            result.plugins.map(async (plugin) => {
              try {
                const response = await fetch(
                  `/api/plugins/${encodeURIComponent(plugin.id)}/connections`,
                  { cache: "no-store" },
                );
                if (!response.ok) return [plugin.id, false] as const;
                const payload = (await response.json()) as {
                  connections?: Array<{ id?: string; connected?: boolean }>;
                };
                return [
                  plugin.id,
                  (payload.connections ?? []).flatMap((connection) =>
                    connection.connected && connection.id ? [connection.id] : [],
                  ),
                ] as const;
              } catch {
                return [plugin.id, [] as string[]] as const;
              }
            }),
          ).then((entries) => {
            if (active) setReadinessConnections(Object.fromEntries(entries));
          });
        }
      })
      .catch(() => {
        if (active) {
          setReadinessPlugins([]);
          setReadinessConnections({});
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const changedProcess = loadedProcessRef.current !== processType;
    if (!changedProcess && isDirty) return;

    const recovered = changedProcess ? readMethodDraft(channelId, processType) : undefined;
    const loadedMethod = recovered ?? method;
    setDraftName(loadedMethod?.name ?? `Método de ${PROCESS_META[processType].label}`);
    setDraftImageUrl(loadedMethod?.imageUrl);
    setDraftBlocks(
      structuredClone(loadedMethod?.blocks ?? []).map((block) =>
        normalizeActionBlock(block, processType),
      ),
    );
    definitionRevisionRef.current = channel?.definitionRevision ?? 0;
    loadedProcessRef.current = processType;
    setIsDirty(!!recovered);
    setSaveStatus(method?.blocks.length ? "saved" : "idle");
  }, [channelId, channel?.definitionRevision, isDirty, processType, method]);

  const persistMethod = useCallback(
    async (showConfirmation = false) => {
      if (!channel || deletingRef.current) return;
      const savingProcess = processType;
      const savingBlocks = blocks;
      const savingVersion = editVersionRef.current;
      setSaveStatus("saving");

      const queuedSave = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const nextRevision = await setChannelMethod(
            channel.id,
            savingProcess,
            {
              contractVersion: 3,
              name: draftName.trim() || `Método de ${PROCESS_META[savingProcess].label}`,
              imageUrl: draftImageUrl,
              processType: savingProcess,
              blocks: savingBlocks,
            },
            definitionRevisionRef.current,
          );
          if (typeof nextRevision === "number") definitionRevisionRef.current = nextRevision;
        });
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
          description:
            error instanceof Error &&
            error.message ===
              "A definição do Canal mudou em outra aba. Recarregue antes de salvar o Método."
              ? t("O Método mudou em outra aba. Recarregue antes de salvar suas alterações.")
              : error instanceof Error
                ? error.message
                : undefined,
        });
      }
    },
    [blocks, channel, draftImageUrl, draftName, processType, t],
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

  const saveOnUnmountRef = useRef({ isDirty, saveStatus, persistMethod });
  saveOnUnmountRef.current = { isDirty, saveStatus, persistMethod };
  useEffect(
    () => () => {
      const pending = saveOnUnmountRef.current;
      if (pending.isDirty && pending.saveStatus !== "saving") void pending.persistMethod();
    },
    [],
  );

  if (!channel || !method) return null;

  const saveBlocks = (nextBlocks: ActionBlock[]) => {
    if (deletingRef.current) return;
    editVersionRef.current += 1;
    rememberMethodDraft(channelId, processType, {
      contractVersion: 3,
      name: draftName,
      imageUrl: draftImageUrl,
      processType,
      blocks: nextBlocks,
    });
    setDraftBlocks(nextBlocks.map((block, order) => ({ ...block, order })));
    setIsDirty(true);
    setSaveStatus("pending");
  };

  async function deleteMethod() {
    if (!channel || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    const wasDirty = isDirty;
    setIsDirty(false);
    editVersionRef.current += 1;
    try {
      await saveQueueRef.current.catch(() => undefined);
      await removeChannelMethod(channel.id, processType, definitionRevisionRef.current);
      setDraftBlocks([]);
      setDraftImageUrl(undefined);
      setSelectedBlockId(null);
      setPluginPanelBlockId(null);
      setSaveStatus("idle");
      setDeleteOpen(false);
      toast.success(t("Método apagado."));
    } catch (error) {
      setIsDirty(wasDirty);
      toast.error(t("Não foi possível apagar o Método."), {
        description: error instanceof Error ? t(error.message) : undefined,
      });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  const loadAppliedProcess = (nextProcess: UniversalProcess) => {
    loadedProcessRef.current = null;
    setSelectedBlockId(null);
    setIsDirty(false);
    setProcessType(nextProcess);
    void navigate({
      to: "/channel/$channelId/methods",
      params: { channelId },
      search: { process: nextProcess },
      replace: true,
    });
  };

  const importMethod = async (sourceChannel: Channel, sourceMethod: ProcessMethod) => {
    if (!channel) return;
    if (
      isDirty &&
      !window.confirm("Importar substituirá as alterações ainda não salvas. Continuar?")
    ) {
      return;
    }
    try {
      const plan = planPortableMethodTransfer({
        name: sourceMethod.name,
        channelName: sourceChannel.name,
        sourceMethods: effectiveProcessOrder(sourceChannel).map(
          (sourceProcess) => sourceChannel.methods[sourceProcess],
        ),
        collections: allCollections.filter(
          (collection) => collection.channelId === sourceChannel.id,
        ),
        processOrder: effectiveProcessOrder(sourceChannel),
        primaryProcessTypes: [sourceMethod.processType],
        preserveLocalConnections: true,
      });
      setTransferPreview({
        name: sourceMethod.name,
        sourceChannelId: sourceChannel.id,
        methods: plan.methods.map((entry) => entry.method),
        collections: plan.collections,
        itemsIncluded: false,
        items: [],
        requirements: plan.methods.flatMap((entry) => entry.requirements),
        preferredOrder: effectiveProcessOrder(channel),
        primaryProcess: sourceMethod.processType,
        preserveLocalConnections: true,
      });
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };

  const shareMethod = async () => {
    if (!blocks.length) return;
    const processLabel = PROCESS_META[processType].label;
    const fileName = `metodo-${processType}.contentflow-method.zip`;
    const methodName = draftName.trim() || `Método de ${processLabel}`;
    const contents = serializeMethodFile(
      methodName,
      { contractVersion: 3, name: methodName, imageUrl: draftImageUrl, processType, blocks },
      collections,
    );
    const packageResponse = await fetch("/api/method-packages/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ manifest: contents }),
    });
    if (!packageResponse.ok) {
      const result = (await packageResponse.json()) as { error?: string };
      toast.error("Não foi possível criar o pacote", {
        description: result.error,
      });
      return;
    }
    const file = new File([await packageResponse.blob()], fileName, { type: "application/zip" });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          title: `Método de ${processLabel} — ContentFlow`,
          text: `Método de ${processLabel} criado no ContentFlow.`,
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
      let contents: string;
      if (file.name.toLocaleLowerCase().endsWith(".zip")) {
        const response = await fetch("/api/method-packages/import", {
          method: "POST",
          headers: { "Content-Type": "application/zip" },
          body: file,
        });
        const result = (await response.json()) as { manifest?: string; error?: string };
        if (!response.ok || !result.manifest) {
          throw new Error(result.error ?? "O pacote não pôde ser aberto.");
        }
        contents = result.manifest;
      } else {
        contents = await file.text();
      }
      const imported = parseMethodImportFile(contents);
      if (imported.format !== "contentflow-method") {
        throw new Error(t("O editor aceita somente um Método por vez."));
      }
      if (
        isDirty &&
        !window.confirm("Importar substituirá as alterações ainda não salvas. Continuar?")
      ) {
        return;
      }
      const isBundle = "methods" in imported;
      const importedMethods = isBundle
        ? imported.methods.map((entry) => entry.method)
        : [imported.method];
      const primaryProcess = isBundle ? imported.primaryProcessType : imported.method.processType;
      if (!primaryProcess) throw new Error(t("O Método principal não foi identificado."));
      setTransferPreview({
        name: imported.name,
        methods: importedMethods,
        collections: isBundle ? imported.collections : [],
        itemsIncluded: isBundle ? imported.itemsIncluded : false,
        items: isBundle ? (imported.items ?? []) : [],
        requirements: isBundle
          ? imported.methods.flatMap((entry) => entry.requirements)
          : (imported.requirements ?? []),
        preferredOrder: effectiveProcessOrder(channel),
        primaryProcess,
        preserveLocalConnections: false,
      });
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : "O arquivo é inválido.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const applyTransferPreview = async () => {
    if (!channel || !transferPreview) return;
    try {
      await applyMethodTransfer({
        targetChannelId: channel.id,
        sourceChannelId: transferPreview.sourceChannelId,
        expectedDefinitionRevision: channel.definitionRevision ?? 0,
        methods: transferPreview.methods,
        collections: transferPreview.collections,
        itemsIncluded: transferPreview.itemsIncluded,
        items: transferPreview.items,
        preferredOrder: transferPreview.preferredOrder,
        selectedProcesses: transferPreview.methods.map((entry) => entry.processType),
        preserveLocalConnections: transferPreview.preserveLocalConnections,
      });
      for (const entry of transferPreview.methods) clearMethodDraft(channelId, entry.processType);
      const primaryProcess = transferPreview.primaryProcess;
      const sourceChannelId = transferPreview.sourceChannelId;
      setTransferPreview(undefined);
      setLibraryOpen(false);
      loadAppliedProcess(primaryProcess);
      toast.success(
        sourceChannelId ? t("Base reutilizada no Canal") : `${transferPreview.name} importado`,
      );
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : undefined,
      });
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
      outputs:
        type === "VALIDAR"
          ? createValidationFields("approval")
          : createSuggestedHumanFields(processType, type),
      validation:
        type === "VALIDAR"
          ? {
              targetBlockId: "",
              mode: "approval",
              onReject: "retry_target",
              maxAttempts: 3,
              retryMode: "full",
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
              <Input
                value={draftName}
                onChange={(event) => {
                  const name = event.target.value.slice(0, 200);
                  setDraftName(name);
                  editVersionRef.current += 1;
                  rememberMethodDraft(channelId, processType, {
                    contractVersion: 3,
                    name,
                    imageUrl: draftImageUrl,
                    processType,
                    blocks,
                  });
                  setIsDirty(true);
                  setSaveStatus("pending");
                }}
                aria-label="Nome do método"
                className="h-9 max-w-md text-lg font-semibold"
              />
              <Badge variant="outline" className="border-brand/30 text-brand-soft">
                {blocks.length} {blocks.length === 1 ? "bloco" : "blocos"}
              </Badge>
            </div>
            <p className="mt-1 max-w-xl text-xs text-muted-foreground">
              Organize as ações na ordem em que devem acontecer em todos os vídeos deste canal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Dialog
              open={deleteOpen}
              onOpenChange={(open) => {
                if (!deleting) setDeleteOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive"
                  disabled={!blocks.length || deleting || saveStatus === "saving"}
                >
                  <Trash2 className="size-3.5" /> {t("Apagar Método")}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("Apagar este Método e todos os seus Blocos?")}</DialogTitle>
                  <DialogDescription>
                    {t(
                      "O Processo ficará sem Método configurado. Coleções e resultados já produzidos serão preservados.",
                    )}
                  </DialogDescription>
                </DialogHeader>
                <p data-i18n-ignore className="break-words text-sm font-medium">
                  {draftName}
                </p>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    disabled={deleting}
                    onClick={() => setDeleteOpen(false)}
                  >
                    {t("Cancelar")}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={deleting}
                    onClick={() => void deleteMethod()}
                  >
                    {deleting && <LoaderCircle className="mr-2 size-4 animate-spin" />}
                    {t("Apagar Método")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json,.contentflow-method.json,application/zip,application/json"
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
                    {reusableMethods.map(({ channel: sourceChannel, method: sourceMethod }) => (
                      <button
                        key={sourceChannel.id}
                        type="button"
                        onClick={() =>
                          sourceMethod && void importMethod(sourceChannel, sourceMethod)
                        }
                        className="flex w-full items-center gap-3 rounded-xl border border-border/70 bg-card p-3 text-left transition hover:border-brand/50 hover:bg-brand/5"
                      >
                        <ChannelAvatar channel={sourceChannel} size="md" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {sourceMethod?.name}
                          </span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {sourceChannel.name}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {sourceMethod?.blocks.map((block, index) => (
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
            <Dialog
              open={Boolean(transferPreview)}
              onOpenChange={(open) => {
                if (!open) setTransferPreview(undefined);
              }}
            >
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{t("Preparação necessária")}</DialogTitle>
                  <DialogDescription>
                    {t(
                      "Revise a estrutura e a prontidão local antes de aplicar o Método neste Canal.",
                    )}
                  </DialogDescription>
                </DialogHeader>
                {transferPreview && (
                  <div className="space-y-4">
                    <div className="rounded-lg border border-border p-3 text-xs">
                      <p className="font-medium">{transferPreview.name}</p>
                      <p className="mt-1 text-muted-foreground">
                        {transferPreview.methods
                          .map((entry) => PROCESS_META[entry.processType].label)
                          .join(" → ")}
                      </p>
                      {transferPreview.itemsIncluded && (
                        <p className="mt-1 text-muted-foreground">
                          {t("Itens incluídos no compartilhamento")}: {transferPreview.items.length}
                          .
                        </p>
                      )}
                    </div>
                    <MethodBuilderTransferReadiness
                      preview={transferPreview}
                      target={channel}
                      targetCollections={collections}
                      plugins={readinessPlugins}
                      connectedPlugins={readinessConnections}
                      onOpenPlugins={() => void navigate({ to: "/plugins" })}
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setTransferPreview(undefined)}>
                        Cancelar
                      </Button>
                      <Button onClick={() => void applyTransferPreview()}>
                        {t("Aplicar importação")}
                      </Button>
                    </div>
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
          if (!open) {
            if (pluginPanelBlockId === selectedBlock?.id) {
              setPluginPanelBlockId(null);
              return;
            }
            setPluginPanelBlockId(null);
            setSelectedBlockId(null);
          }
        }}
      >
        <DialogContent
          className={cn(
            "p-0 transition-[width,max-width,height] duration-200",
            pluginPanelBlockId === selectedBlock?.id
              ? "h-[min(92vh,56rem)] w-[calc(100vw-1rem)] overflow-hidden sm:w-[calc(100vw-2rem)] sm:max-w-[80rem] [&>button:last-child]:hidden lg:[&>button:last-child]:grid"
              : "max-h-[90vh] overflow-y-auto sm:max-w-3xl lg:max-w-4xl",
          )}
          onEscapeKeyDown={(event) => {
            if (pluginPanelBlockId === selectedBlock?.id) {
              event.preventDefault();
              setPluginPanelBlockId(null);
            }
          }}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Configurar bloco de ação</DialogTitle>
            <DialogDescription>
              Configure o que o bloco recebe, faz e entrega, além de quem executa a ação.
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
              processOrder={effectiveProcessOrder(channel)}
              plugins={readinessPlugins}
              index={blocks.indexOf(selectedBlock)}
              total={blocks.length}
              pluginConfigurationOpen={pluginPanelBlockId === selectedBlock.id}
              onPluginConfigurationOpenChange={(open) =>
                setPluginPanelBlockId(open ? selectedBlock.id : null)
              }
              onChange={(patch) => updateBlock(selectedBlock.id, patch)}
              onRemove={() => removeBlock(selectedBlock.id)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MethodBuilderTransferReadiness({
  preview,
  target,
  targetCollections,
  plugins,
  connectedPlugins,
  onOpenPlugins,
}: {
  preview: MethodTransferPreview;
  target: Channel;
  targetCollections: StrategicCollection[];
  plugins: DiscoveredPlugin[];
  connectedPlugins: Record<string, string[]>;
  onOpenPlugins: () => void;
}) {
  const { t } = useAppPreferences();
  if (!preview.requirements.length) {
    return (
      <div className="flex gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
        <CheckCircle2 className="size-4 shrink-0 text-success" />
        {t("Nenhuma dependência externa foi declarada.")}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-warning/35 bg-warning/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-warning" /> {t("Preparação necessária")}
      </div>
      <div className="mt-3 space-y-3 text-xs">
        {preview.requirements.map((requirement, index) => {
          if (requirement.kind === "previous_process") {
            const included = preview.methods.some(
              (method) => method.processType === requirement.processType,
            );
            const available = Boolean(target.methods[requirement.processType]?.blocks.length);
            return (
              <p key={`${requirement.kind}-${index}`}>
                <strong>{t("Processo anterior")}:</strong>{" "}
                {PROCESS_META[requirement.processType].label}.{" "}
                {included
                  ? t("Fonte incluída na importação")
                  : available
                    ? t("Fonte já disponível no Canal de destino")
                    : t("Fonte ainda não disponível no Canal de destino")}
                .
              </p>
            );
          }
          if (requirement.kind === "collection") {
            const included = preview.collections.some(
              (collection) => collection.name === requirement.name,
            );
            const available = targetCollections.some(
              (collection) => collection.name === requirement.name,
            );
            return (
              <p key={`${requirement.kind}-${index}`}>
                <strong>{t("Coleção estratégica")}:</strong> {requirement.name}.{" "}
                {included
                  ? t("Fonte incluída na importação")
                  : available
                    ? t("Fonte já disponível no Canal de destino")
                    : t("Fonte ainda não disponível no Canal de destino")}
                .
              </p>
            );
          }
          const plugin = plugins.find((candidate) => candidate.id === requirement.pluginId);
          const boundConnectionId = preview.methods
            .flatMap((method) => method.blocks)
            .find(
              (block) =>
                block.plugin?.pluginId === requirement.pluginId &&
                block.plugin.capabilityId === requirement.capabilityId &&
                block.plugin.connectionId,
            )?.plugin?.connectionId;
          const readiness = pluginRequirementReadiness({
            plugin,
            capabilityId: requirement.capabilityId,
            connectionRequired: requirement.connectionRequired,
            hasBoundConnection: Boolean(
              boundConnectionId &&
              connectedPlugins[requirement.pluginId]?.includes(boundConnectionId),
            ),
          });
          const status =
            readiness === "missing_plugin"
              ? t("Plugin ausente")
              : readiness === "missing_capability"
                ? t("Capability ausente")
                : readiness === "unavailable_plugin"
                  ? t("Plugin desativado ou indisponível")
                  : readiness === "missing_connection"
                    ? t("Conexão local pendente")
                    : t("Plugin pronto");
          return (
            <div key={`${requirement.kind}-${index}`} className="space-y-1">
              <p>
                <strong>{t("Plugin")}:</strong> {plugin?.manifest.name ?? requirement.pluginId} /{" "}
                {requirement.capabilityId}. {status}.
              </p>
              {readiness !== "ready" && (
                <button
                  type="button"
                  onClick={onOpenPlugins}
                  className="font-medium text-brand hover:underline"
                >
                  {t("Abrir Plugins para corrigir")}
                </button>
              )}
            </div>
          );
        })}
      </div>
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
  const outputCount = (block.outputs ?? []).filter(isMethodContentField).length;
  const inputLabels = (block.inputs ?? [])
    .filter(isMethodContentField)
    .map(instructionInputLabel)
    .filter(Boolean);
  const outputLabels = (block.outputs ?? [])
    .filter(isMethodContentField)
    .map(instructionInputLabel)
    .filter(Boolean);

  return (
    <>
      <span className="w-6 shrink-0 self-start pt-1 font-mono text-[10px] text-muted-foreground">
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="flex w-14 shrink-0 flex-col items-center gap-1.5 self-start">
        <span className={cn("grid size-9 place-items-center rounded-md border", meta.className)}>
          <Icon className="size-4 text-brand" />
        </span>
        <span className="text-center text-[9px] font-semibold uppercase tracking-[0.08em] text-brand">
          {meta.label}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {summary}
        </span>
        {(inputLabels.length > 0 || outputLabels.length > 0) && (
          <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
            {inputLabels.length > 0 && <span>Usa: {inputLabels.join(" · ")}</span>}
            {outputLabels.length > 0 && <span>Entrega: {outputLabels.join(" · ")}</span>}
          </span>
        )}
        <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <OperatorIcon className="size-3" />
            {operator.label}
          </span>
          <span>
            {outputCount} {outputCount === 1 ? "entrega" : "entregas"}
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
  processOrder,
  plugins,
  index,
  total,
  pluginConfigurationOpen,
  onPluginConfigurationOpenChange,
  onChange,
  onRemove,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  channelId: string;
  collections: StrategicCollection[];
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  processOrder: UniversalProcess[];
  plugins: DiscoveredPlugin[];
  index: number;
  total: number;
  pluginConfigurationOpen: boolean;
  onPluginConfigurationOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<ActionBlock>) => void;
  onRemove: () => void;
}) {
  const { language, t } = useAppPreferences();
  const [pluginDraft, setPluginDraft] = useState<BlockPluginBinding | undefined>(() =>
    block.plugin ? clonePluginConfigurationDraft(block.plugin) : undefined,
  );
  const [pluginDraftInvalid, setPluginDraftInvalid] = useState(false);
  const [portDraftBlock, setPortDraftBlock] = useState(() => structuredClone(block));
  const portDefinitionRef = useRef(JSON.stringify([block.id, block.inputs, block.outputs]));
  useEffect(() => {
    const definition = JSON.stringify([block.id, block.inputs, block.outputs]);
    if (portDefinitionRef.current === definition) return;
    portDefinitionRef.current = definition;
    setPortDraftBlock(structuredClone(block));
  }, [block]);
  const pluginTriggerRef = useRef<HTMLButtonElement>(null);
  const previousPluginConfigurationOpenRef = useRef(pluginConfigurationOpen);
  useEffect(() => {
    setPluginDraft(block.plugin ? clonePluginConfigurationDraft(block.plugin) : undefined);
    setPluginDraftInvalid(false);
  }, [block.id, block.plugin]);
  useEffect(() => {
    const wasOpen = previousPluginConfigurationOpenRef.current;
    previousPluginConfigurationOpenRef.current = pluginConfigurationOpen;
    if (wasOpen && !pluginConfigurationOpen) {
      requestAnimationFrame(() => pluginTriggerRef.current?.focus());
    }
  }, [pluginConfigurationOpen]);
  const setPluginConfigurationVisibility = (open: boolean) => {
    onPluginConfigurationOpenChange(open);
    setPluginDraftInvalid(false);
    setPluginDraft(open && block.plugin ? clonePluginConfigurationDraft(block.plugin) : undefined);
    setPortDraftBlock(structuredClone(block));
    if (!open) requestAnimationFrame(() => pluginTriggerRef.current?.focus());
  };
  const meta = BLOCK_META[block.type];
  const Icon = meta.icon;
  const compatibleCapabilities = plugins.flatMap((plugin) => {
    if (!plugin.enabled || !plugin.executable) return [];
    const manifest = localizePluginManifest(plugin.manifest, language);
    return manifest.capabilities
      .filter(
        (capability) =>
          capability.operator === block.operator &&
          (capability.operator === "Humano" ||
            (capability.blockTypes.includes(block.type) &&
              (!capability.processTypes || capability.processTypes.includes(processType)))),
      )
      .map((capability) => ({
        plugin,
        manifest,
        capability,
      }));
  });
  const selectedPlugin = plugins.find((plugin) => plugin.id === block.plugin?.pluginId);
  const selectedManifest = selectedPlugin
    ? localizePluginManifest(selectedPlugin.manifest, language)
    : undefined;
  const selectedCapability = selectedManifest?.capabilities.find(
    (capability) => capability.id === block.plugin?.capabilityId,
  );
  const selectedPluginUnavailable = Boolean(
    selectedPlugin && (!selectedPlugin.enabled || !selectedPlugin.executable),
  );
  const selectedPluginMissing = Boolean(block.plugin && !selectedPlugin);
  const savedPluginLabel = block.plugin
    ? `${selectedManifest?.name ?? block.plugin.pluginId} · ${
        selectedCapability ? pluginCapabilityLabel(selectedCapability) : block.plugin.capabilityId
      }`
    : t("Selecione quem executará esta ação");
  const profileSetup = selectedManifest?.profileSetup;
  const isManualHumanTool = selectedCapability?.operator === "Humano";
  const conversationSources = processOrder.flatMap((candidateProcess) => {
    const processIndex = processOrder.indexOf(candidateProcess);
    const currentProcessIndex = processOrder.indexOf(processType);
    if (processIndex > currentProcessIndex) return [];
    return (channelMethods[candidateProcess]?.blocks ?? []).flatMap((candidate, candidateIndex) => {
      if (candidateProcess === processType && candidateIndex >= index) return [];
      if (candidate.plugin?.pluginId !== block.plugin?.pluginId) return [];
      if (candidate.plugin?.connectionId !== block.plugin?.connectionId) return [];
      return [{ processType: candidateProcess, block: candidate }];
    });
  });
  const inputPortState = (() => {
    if (!selectedCapability || isManualHumanTool) return [];
    const used = new Set<string>();
    return (block.inputs ?? []).map((input) => {
      const compatible = selectedCapability.inputPorts.filter(
        (port) => areValueShapesCompatible(input.shape, port.shape) && !used.has(port.key),
      );
      const selected = input.portKey
        ? compatible.find((port) => port.key === input.portKey)
        : compatible.length === 1
          ? compatible[0]
          : undefined;
      if (selected) used.add(selected.key);
      return { input, compatible, selected, ambiguous: !input.portKey && compatible.length > 1 };
    });
  })();
  const validationTarget =
    block.type === "VALIDAR"
      ? methodBlocks.find((candidate) => candidate.id === block.validation?.targetBlockId)
      : undefined;
  const validationTargetOutput = validationTarget?.outputs?.find(
    (output) => output.key === block.validation?.targetOutputKey,
  );
  const validationTargetPortState = (() => {
    if (!selectedCapability || isManualHumanTool || !validationTargetOutput) return undefined;
    const used = new Set(
      inputPortState.flatMap((item) => (item.selected ? [item.selected.key] : [])),
    );
    const compatible = selectedCapability.inputPorts.filter(
      (port) =>
        areValueShapesCompatible(validationTargetOutput.shape, port.shape) && !used.has(port.key),
    );
    const selected = block.validation?.targetPortKey
      ? compatible.find((port) => port.key === block.validation?.targetPortKey)
      : compatible.length === 1
        ? compatible[0]
        : undefined;
    return {
      compatible,
      selected,
      ambiguous: !block.validation?.targetPortKey && compatible.length > 1,
    };
  })();
  const outputPortState = isManualHumanTool
    ? []
    : (block.outputs ?? []).map((field) => {
        const compatible =
          selectedCapability?.outputPorts.filter((port) =>
            areValueShapesCompatible(port.shape, field.shape),
          ) ?? [];
        const selected = field.portKey
          ? compatible.find((port) => port.key === field.portKey)
          : compatible.length === 1
            ? compatible[0]
            : undefined;
        return { field, compatible, selected, ambiguous: !field.portKey && compatible.length > 1 };
      });
  const requiredPortsMissing =
    (isManualHumanTool
      ? []
      : selectedCapability?.inputPorts.filter(
          (port) =>
            port.required &&
            !inputPortState.some((item) => item.selected?.key === port.key) &&
            validationTargetPortState?.selected?.key !== port.key,
        )) ?? [];
  const unboundInputPorts =
    selectedCapability?.inputPorts.filter(
      (port) =>
        !inputPortState.some((item) => item.selected?.key === port.key) &&
        validationTargetPortState?.selected?.key !== port.key,
    ) ?? [];
  const contractIssues =
    [
      ...inputPortState.filter((item) => !item.selected),
      ...outputPortState.filter((item) => !item.selected),
    ].length +
    requiredPortsMissing.length +
    (validationTargetOutput && !validationTargetPortState?.selected ? 1 : 0);

  return (
    <div
      className={cn(
        "min-w-0",
        pluginConfigurationOpen &&
          "grid h-full min-h-0 lg:grid-cols-[minmax(22rem,0.82fr)_minmax(32rem,1.18fr)]",
      )}
      data-plugin-workspace={pluginConfigurationOpen ? "open" : "closed"}
    >
      <div
        className={cn(
          "min-w-0 p-6",
          pluginConfigurationOpen &&
            "hidden min-h-0 overflow-y-auto lg:block lg:border-r lg:border-border/70",
        )}
      >
        <div className="flex items-start justify-between gap-3 pr-8">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              className={cn("grid size-10 place-items-center rounded-md border", meta.className)}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase text-muted-foreground">{meta.label}</p>
              <Label htmlFor={`${block.id}-name`} className="sr-only">
                Nome da ação
              </Label>
              <Input
                id={`${block.id}-name`}
                value={block.name ?? meta.label}
                onChange={(event) => onChange({ name: event.target.value })}
                placeholder={meta.label}
                className="h-auto border-0 bg-transparent p-0 text-xl font-semibold shadow-none focus-visible:ring-1 focus-visible:ring-brand"
              />
              <p className="text-[11px] text-muted-foreground">
                Bloco {index + 1} de {total}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
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

        <div className="mt-6 space-y-5 rounded-xl border border-brand/30 bg-card/35 p-4 sm:p-5">
          <InstructionEditor
            block={block}
            capability={selectedCapability}
            methodBlocks={methodBlocks}
            blockIndex={index}
            processType={processType}
            channelMethods={channelMethods}
            processOrder={processOrder}
            collections={collections}
            onChange={onChange}
          />

          <div className="space-y-1.5 border-t border-border/60 pt-4">
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
            <div className="space-y-4 border-t border-border/60 pt-4">
              <div className="space-y-1.5">
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
                  Obrigatório: Escolher sempre seleciona entre itens preexistentes desta coleção.
                  Para decidir entre resultados produzidos durante o método, use um bloco Validar.
                </p>
              </div>

              <ContextInputsEditor
                block={block}
                methodBlocks={methodBlocks}
                blockIndex={index}
                processType={processType}
                channelMethods={channelMethods}
                processOrder={processOrder}
                collections={collections}
                onChange={onChange}
              />
            </div>
          )}

          {block.type === "VALIDAR" && (
            <div className="space-y-4 border-t border-border/60 pt-4">
              <ValidationEditor
                block={block}
                methodBlocks={methodBlocks}
                index={index}
                capability={selectedCapability}
                onChange={onChange}
              />
              <ContextInputsEditor
                block={block}
                methodBlocks={methodBlocks}
                blockIndex={index}
                processType={processType}
                channelMethods={channelMethods}
                processOrder={processOrder}
                collections={collections}
                onChange={onChange}
              />
            </div>
          )}

          {block.type !== "ESCOLHER" && block.type !== "VALIDAR" && (
            <DataContractEditor
              block={block}
              methodBlocks={methodBlocks}
              blockIndex={index}
              processType={processType}
              channelMethods={channelMethods}
              processOrder={processOrder}
              collections={collections}
              onChange={onChange}
            />
          )}
        </div>

        <button
          ref={pluginTriggerRef}
          type="button"
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 p-4 text-left transition hover:border-brand/50 hover:bg-brand/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5"
          onClick={(event) => {
            event.stopPropagation();
            setPluginConfigurationVisibility(true);
          }}
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t("Plugin executor")}</p>
            <p className="truncate text-[11px] text-muted-foreground">{savedPluginLabel}</p>
            {block.plugin && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {t("Configuração salva")} · {Object.keys(block.plugin.configuration ?? {}).length}{" "}
                {t("campos")}
                {block.plugin.profileExecution
                  ? ` · ${t("Perfis")}: ${block.plugin.profileExecution.profileIds.length}`
                  : ""}
              </p>
            )}
          </div>
          {selectedPluginMissing || selectedPluginUnavailable ? (
            <Badge
              variant="outline"
              className="shrink-0 border-amber-500/50 text-[9px] font-normal text-amber-700 dark:text-amber-300"
            >
              {selectedPluginMissing ? t("Plugin ausente") : t("Plugin desativado ou indisponível")}
            </Badge>
          ) : selectedCapability ? (
            <Badge
              variant="outline"
              className={cn(
                "shrink-0 text-[9px] font-normal",
                contractIssues
                  ? "border-amber-500/50 text-amber-700 dark:text-amber-300"
                  : "border-emerald-500/50 text-emerald-700 dark:text-emerald-300",
              )}
            >
              {contractIssues ? t("Requer ajustes") : t("Pronto para executar")}
            </Badge>
          ) : null}
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </div>

      {pluginConfigurationOpen && (
        <section
          className="flex min-h-0 min-w-0 flex-col bg-popover"
          aria-labelledby={`${block.id}-plugin-panel-title`}
          data-testid="plugin-configuration-panel"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-border px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("Bloco")} · <span className="normal-case">{block.name ?? meta.label}</span>
              </p>
              <h2 id={`${block.id}-plugin-panel-title`} className="mt-1 text-xl font-semibold">
                {t("Configurar plugin executor")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("Revise o executor, o contrato e as configurações locais desta ação.")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 gap-1.5 lg:hidden"
              aria-label={t("Fechar configuração do plugin")}
              onClick={(event) => {
                event.stopPropagation();
                setPluginConfigurationVisibility(false);
              }}
            >
              <ArrowLeft className="size-4" />
              <span>{t("Voltar ao bloco")}</span>
            </Button>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
            {(selectedPluginMissing || selectedPluginUnavailable) && block.plugin && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100">
                <p className="font-medium">
                  {selectedPluginMissing
                    ? t("A configuração histórica foi preservada, mas o plugin não está instalado.")
                    : t(
                        "A configuração histórica foi preservada, mas o plugin está desativado ou indisponível.",
                      )}
                </p>
                <p className="mt-1 break-all text-[11px] opacity-80">
                  {block.plugin.pluginId} · {block.plugin.capabilityId}
                </p>
                {Object.keys(block.plugin.configuration ?? {}).length > 0 && (
                  <dl className="mt-3 grid gap-2 rounded-md border border-amber-500/20 bg-background/40 p-3 sm:grid-cols-2">
                    {Object.entries(block.plugin.configuration).map(([key, value]) => (
                      <div key={key} className="min-w-0">
                        <dt className="text-[10px] font-medium opacity-70">{key}</dt>
                        <dd className="truncate text-[11px]" title={String(value)}>
                          {String(value)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Plugin e capacidade</Label>
              <p className="text-[11px] text-muted-foreground">
                Escolha a ferramenta que realizará esta ação com o contrato definido acima.
              </p>
              {compatibleCapabilities.length ? (
                <Select
                  value={
                    block.plugin ? `${block.plugin.pluginId}::${block.plugin.capabilityId}` : ""
                  }
                  onValueChange={(value) => {
                    const [pluginId, capabilityId] = value.split("::");
                    const selection = compatibleCapabilities.find(
                      (item) => item.plugin.id === pluginId && item.capability.id === capabilityId,
                    );
                    const properties = selection?.capability.blockConfigSchema.properties ?? {};
                    const managedProfileKeys = [
                      selection?.plugin.manifest.profileSetup?.configurationKey,
                      selection?.plugin.manifest.profileSetup?.fallbackConfigurationKey,
                    ].filter((key): key is string => Boolean(key));
                    const configuration = Object.fromEntries(
                      Object.entries(properties)
                        .filter(
                          ([key, schema]) =>
                            schema.default !== undefined && !managedProfileKeys.includes(key),
                        )
                        .map(([key, schema]) => [key, schema.default as string | number | boolean]),
                    );
                    const requestedInputs = block.inputs?.map((input) => {
                      const compatiblePorts =
                        selection?.capability.inputPorts.filter((candidate) =>
                          areValueShapesCompatible(input.shape, candidate.shape),
                        ) ?? [];
                      const port = compatiblePorts[0];
                      const current = normalizeFieldPresentation(input.shape, input.presentation);
                      return {
                        ...input,
                        portKey: compatiblePorts.length === 1 ? port?.key : undefined,
                        presentation: current,
                      };
                    });
                    const requestedOutputs = block.outputs?.map((output) => {
                      const compatiblePorts =
                        selection?.capability.outputPorts.filter((candidate) =>
                          areValueShapesCompatible(candidate.shape, output.shape),
                        ) ?? [];
                      const port = compatiblePorts[0];
                      const current = normalizeFieldPresentation(output.shape, output.presentation);
                      return {
                        ...output,
                        portKey: compatiblePorts.length === 1 ? port?.key : undefined,
                        presentation: current,
                      };
                    });
                    const requestedValidation = block.validation
                      ? (() => {
                          const target = methodBlocks.find(
                            (candidate) => candidate.id === block.validation?.targetBlockId,
                          );
                          const targetOutput = target?.outputs?.find(
                            (output) => output.key === block.validation?.targetOutputKey,
                          );
                          if (!targetOutput) {
                            return { ...block.validation, targetPortKey: undefined };
                          }
                          const usedPorts = new Set(
                            (requestedInputs ?? []).flatMap((input) =>
                              input.portKey ? [input.portKey] : [],
                            ),
                          );
                          const compatiblePorts =
                            selection?.capability.inputPorts.filter(
                              (port) =>
                                areValueShapesCompatible(targetOutput.shape, port.shape) &&
                                !usedPorts.has(port.key),
                            ) ?? [];
                          return {
                            ...block.validation,
                            targetPortKey:
                              compatiblePorts.length === 1 ? compatiblePorts[0].key : undefined,
                          };
                        })()
                      : undefined;
                    const nextPlugin: BlockPluginBinding = {
                      pluginId,
                      pluginVersion: selection?.plugin.manifest.version,
                      capabilityId,
                      configuration,
                      connectionRequired: selection
                        ? pluginConnectionRequired(selection.plugin.manifest)
                        : false,
                    };
                    setPluginDraft(clonePluginConfigurationDraft(nextPlugin));
                    setPluginDraftInvalid(false);
                    onChange({
                      plugin: nextPlugin,
                      inputs: requestedInputs,
                      outputs: requestedOutputs,
                      validation: requestedValidation,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um plugin compatível" />
                  </SelectTrigger>
                  <SelectContent>
                    {compatibleCapabilities.map(({ plugin, manifest, capability }) => (
                      <SelectItem
                        key={`${plugin.id}::${capability.id}`}
                        value={`${plugin.id}::${capability.id}`}
                      >
                        {manifest.name} · {pluginCapabilityLabel(capability)}
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

            {selectedPlugin &&
              selectedCapability &&
              !selectedPluginUnavailable &&
              block.plugin &&
              pluginDraft && (
                <PluginConfigurationRenderer
                  pluginId={selectedPlugin.id}
                  capability={selectedCapability}
                  connectionId={pluginDraft.connectionId}
                  configuration={pluginDraft.configuration}
                  profileSetup={profileSetup}
                  dataSection={
                    <div
                      className="space-y-3 border-t border-border/60 pt-3"
                      data-testid="plugin-method-data"
                    >
                      <p className="text-xs font-medium">{t("Dados entre blocos")}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("Escolha as entregas anteriores que esta capacidade deve receber.")}
                      </p>
                      {selectedCapability.inputPorts
                        .filter((port) => port.shape.kind === "content")
                        .map((port) => {
                          const sources = pluginInputSources(methodBlocks, block.id, port);
                          const input = (portDraftBlock.inputs ?? []).find(
                            (item) => item.portKey === port.key,
                          );
                          const sourceValue =
                            input?.binding.kind === "previous_block"
                              ? JSON.stringify([input.binding.blockId, input.binding.outputKey])
                              : undefined;
                          const value =
                            sourceValue && sources.some((source) => source.value === sourceValue)
                              ? sourceValue
                              : input
                                ? "configured"
                                : "none";
                          return (
                            <div key={port.key} className="space-y-1">
                              <Label htmlFor={`${block.id}-plugin-source-${port.key}`}>
                                {port.label}
                              </Label>
                              <Select
                                value={value}
                                onValueChange={(source) => {
                                  if (source === "configured") return;
                                  setPortDraftBlock((draft) =>
                                    bindPluginInput(
                                      draft,
                                      methodBlocks,
                                      port,
                                      source === "none" ? "" : source,
                                    ),
                                  );
                                }}
                              >
                                <SelectTrigger id={`${block.id}-plugin-source-${port.key}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">{t("Sem entrega anterior")}</SelectItem>
                                  {value === "configured" && (
                                    <SelectItem value="configured">
                                      {t("Entrada configurada no bloco")}
                                    </SelectItem>
                                  )}
                                  {sources.map((source) => (
                                    <SelectItem key={source.value} value={source.value}>
                                      {t("Usar entrega de")}:{" "}
                                      {source.block.name ?? source.block.type} ·{" "}
                                      {source.field.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {port.description && (
                                <p className="text-[11px] text-muted-foreground">
                                  {port.description}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      {selectedCapability.outputPorts
                        .filter(
                          (port) =>
                            port.shape.kind === "content" &&
                            !(portDraftBlock.outputs ?? []).some(
                              (field) => field.portKey === port.key,
                            ),
                        )
                        .map((port) => (
                          <Button
                            key={port.key}
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setPortDraftBlock((draft) => addPluginOutput(draft, port))
                            }
                          >
                            <Plus className="mr-1 size-3" />
                            {t("Disponibilizar entrega")}: {port.label}
                          </Button>
                        ))}
                    </div>
                  }
                  onConfigurationChange={(configuration) => {
                    setPluginDraftInvalid(false);
                    setPluginDraft({ ...pluginDraft, configuration });
                  }}
                  connectionSection={
                    selectedPlugin.manifest.secretKeys?.length ? (
                      <PluginConnectionSelector
                        plugin={selectedPlugin}
                        value={pluginDraft.connectionId}
                        onChange={(connectionId) => {
                          setPluginDraftInvalid(false);
                          setPluginDraft({
                            ...pluginDraft,
                            connectionId,
                            connectionRequired: true,
                          });
                        }}
                      />
                    ) : undefined
                  }
                  profileSection={
                    profileSetup ? (
                      <ManagedProfileSelector
                        plugin={selectedPlugin}
                        capability={selectedCapability}
                        profileSetup={profileSetup}
                        configuration={pluginDraft.configuration}
                        profileExecution={pluginDraft.profileExecution}
                        onProfileExecutionChange={(profileExecution, configuration) => {
                          setPluginDraftInvalid(false);
                          setPluginDraft({
                            ...pluginDraft,
                            ...(configuration ? { configuration } : {}),
                            profileExecution,
                          });
                        }}
                      />
                    ) : undefined
                  }
                  conversationSection={
                    selectedPlugin.manifest.supportsConversationContinuation ? (
                      <div className="space-y-1.5">
                        <Label>Conversa</Label>
                        <Select
                          value={
                            pluginDraft.conversation?.mode === "reuse"
                              ? `${pluginDraft.conversation.sourceProcessType}::${pluginDraft.conversation.sourceBlockId}`
                              : "new"
                          }
                          onValueChange={(value) => {
                            const [sourceProcessType, sourceBlockId] = value.split("::");
                            setPluginDraftInvalid(false);
                            setPluginDraft({
                              ...pluginDraft,
                              conversation:
                                value === "new"
                                  ? { mode: "new" }
                                  : {
                                      mode: "reuse",
                                      sourceProcessType: sourceProcessType as UniversalProcess,
                                      sourceBlockId,
                                    },
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Iniciar uma conversa nova</SelectItem>
                            {conversationSources.map((source) => (
                              <SelectItem
                                key={`${source.processType}::${source.block.id}`}
                                value={`${source.processType}::${source.block.id}`}
                              >
                                Continuar: {PROCESS_META[source.processType].label} ·{" "}
                                {source.block.name ?? source.block.type}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          Use a mesma conversa para preservar o contexto do provedor. Se o perfil
                          mudar ou a conversa não abrir, o plugin inicia outra e recebe o contexto
                          do bloco de origem.
                        </p>
                      </div>
                    ) : undefined
                  }
                />
              )}

            {selectedCapability && (
              <div className="space-y-3">
                <div
                  className={cn(
                    "rounded-lg border p-3 text-[11px]",
                    contractIssues
                      ? "border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-200"
                      : "border-emerald-500/40 bg-emerald-500/5 text-emerald-800 dark:text-emerald-200",
                  )}
                >
                  <p className="font-medium">
                    {contractIssues
                      ? "Revise o contrato antes de executar"
                      : "O plugin está recebendo tudo o que precisa"}
                  </p>
                  <p className="mt-0.5 opacity-80">
                    {contractIssues
                      ? "Escolha como as entradas e entregas ambíguas serão usadas pelo plugin."
                      : "Entradas, entregas e formatos são compatíveis com esta capacidade."}
                  </p>
                </div>

                {contractIssues > 0 && (
                  <details className="rounded-lg border border-border/70 bg-card/60 p-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                      {t("Dados usados pelo plugin")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {validationTargetPortState && validationTargetOutput && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[10px] text-muted-foreground">
                              {t("Bloco validado")} · {validationTargetOutput.label}
                            </Label>
                            {validationTargetPortState.ambiguous && (
                              <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
                                {t("Escolha necessária")}
                              </span>
                            )}
                          </div>
                          <Select
                            value={
                              block.validation?.targetPortKey ??
                              validationTargetPortState.selected?.key ??
                              ""
                            }
                            onValueChange={(targetPortKey) =>
                              onChange({
                                validation: block.validation
                                  ? { ...block.validation, targetPortKey }
                                  : undefined,
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder={t("Como o plugin usará este dado?")} />
                            </SelectTrigger>
                            <SelectContent>
                              {validationTargetPortState.compatible.map((port) => (
                                <SelectItem key={port.key} value={port.key}>
                                  {port.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {!validationTargetPortState.compatible.length && (
                            <p className="text-[10px] text-destructive">
                              {t("Nenhuma porta aceita este formato.")}
                            </p>
                          )}
                        </div>
                      )}
                      {inputPortState.map(({ input, compatible, selected, ambiguous }) => (
                        <div key={input.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[10px] text-muted-foreground">
                              Entrada · {instructionInputLabel(input)}
                            </Label>
                            {ambiguous && (
                              <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
                                Escolha necessária
                              </span>
                            )}
                          </div>
                          <Select
                            value={input.portKey ?? (selected ? selected.key : "")}
                            onValueChange={(portKey) =>
                              onChange({
                                inputs: (block.inputs ?? []).map((item) =>
                                  item.id === input.id ? { ...item, portKey } : item,
                                ),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Como o plugin usará este dado?" />
                            </SelectTrigger>
                            <SelectContent>
                              {compatible.map((port) => (
                                <SelectItem key={port.key} value={port.key}>
                                  {port.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selected?.description && (
                            <p className="text-[10px] text-muted-foreground">
                              {selected.description}
                            </p>
                          )}
                          {!compatible.length && (
                            <p className="text-[10px] text-destructive">
                              Nenhuma porta aceita o formato {shapeSummary(input.shape)}.
                            </p>
                          )}
                        </div>
                      ))}
                      {outputPortState.map(({ field, compatible, selected, ambiguous }) => (
                        <div key={field.id} className="space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-[10px] text-muted-foreground">
                              Entrega · {instructionInputLabel(field)}
                            </Label>
                            {ambiguous && (
                              <span className="text-[9px] font-medium text-amber-700 dark:text-amber-300">
                                Escolha necessária
                              </span>
                            )}
                          </div>
                          <Select
                            value={field.portKey ?? (selected ? selected.key : "")}
                            onValueChange={(portKey) =>
                              onChange({
                                outputs: (block.outputs ?? []).map((item) =>
                                  item.id === field.id ? { ...item, portKey } : item,
                                ),
                              })
                            }
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="O que o plugin entregará aqui?" />
                            </SelectTrigger>
                            <SelectContent>
                              {compatible.map((port) => (
                                <SelectItem key={port.key} value={port.key}>
                                  {port.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {selected?.description && (
                            <p className="text-[10px] text-muted-foreground">
                              {selected.description}
                            </p>
                          )}
                        </div>
                      ))}
                      {requiredPortsMissing.map((port) => (
                        <p key={port.key} className="text-[10px] text-destructive">
                          Falta uma entrada para: {port.label}.
                        </p>
                      ))}
                      {unboundInputPorts
                        .filter((port) => port.required)
                        .map((port) => (
                          <div
                            key={`available-${port.key}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-medium">{port.label}</p>
                              <p className="text-[10px] text-muted-foreground">
                                {port.required ? "Obrigatória" : "Opcional"} ·{" "}
                                {shapeSummary(port.shape)}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 shrink-0 text-[10px]"
                              onClick={() => {
                                const input: BlockInputBinding = {
                                  id: uid(`${block.id}-runtime-input`),
                                  label: port.label,
                                  shape: structuredClone(port.shape),
                                  binding: { kind: "runtime" },
                                  portKey: port.key,
                                  presentation: normalizeFieldPresentation(
                                    port.shape,
                                    port.presentation,
                                  ),
                                };
                                onChange({ inputs: [...(block.inputs ?? []), input] });
                              }}
                            >
                              <Plus className="mr-1 size-3" /> Fornecer na execução
                            </Button>
                          </div>
                        ))}
                    </div>
                  </details>
                )}
                <PluginPromptPreview
                  block={block}
                  capability={selectedCapability}
                  inputs={inputPortState.map(({ input, selected }) => ({
                    input,
                    portKey: selected?.key,
                  }))}
                />
                <MethodParametersEditor
                  block={block}
                  onChange={(parameters) => onChange({ parameters })}
                />
                {selectedCapability.instructionUsage !== "not_applicable" && (
                  <p className="rounded-lg border border-brand/20 bg-brand/5 p-3 text-[11px] text-muted-foreground">
                    A instrução do bloco define o que deve ser feito. Os templates editáveis do
                    plugin definem como essa instrução e o contexto são montados e enviados ao
                    provedor.
                  </p>
                )}
                {selectedPlugin && !selectedPluginUnavailable && block.plugin && pluginDraft && (
                  <div className="space-y-2 border-t border-border/60 pt-3">
                    {pluginDraftInvalid && (
                      <p className="text-[11px] text-destructive" role="alert">
                        {t("Revise os campos inválidos antes de aplicar.")}
                      </p>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPluginDraft(clonePluginConfigurationDraft(block.plugin!));
                          setPluginDraftInvalid(false);
                          setPluginConfigurationVisibility(false);
                        }}
                      >
                        {t("Cancelar")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          const commit = preparePluginConfigurationCommit(
                            selectedCapability,
                            pluginDraft,
                          );
                          if (!commit.ok) {
                            setPluginDraftInvalid(true);
                            return;
                          }
                          setPluginDraft(commit.value);
                          setPluginDraftInvalid(false);
                          onChange({
                            plugin: commit.value,
                            inputs: portDraftBlock.inputs,
                            outputs: portDraftBlock.outputs,
                          });
                          setPluginConfigurationVisibility(false);
                        }}
                      >
                        {t("Aplicar")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <footer className="flex shrink-0 border-t border-border px-4 py-3 sm:px-6">
            <p className="mr-auto self-center text-[10px] text-muted-foreground">
              {t("Escape fecha a janela e descarta alterações não aplicadas.")}
            </p>
          </footer>
        </section>
      )}
    </div>
  );
}

function PluginPromptPreview({
  block,
  capability,
  inputs,
}: {
  block: ActionBlock;
  capability: PluginCapability;
  inputs: Array<{ input: BlockInputBinding; portKey?: string }>;
}) {
  const preview = renderPluginPromptPreview(block, capability, inputs);
  if (!preview) return null;
  const declaredByPlugin = Boolean(capability.promptPreview);
  return (
    <details className="rounded-lg border border-brand/30 bg-brand/5 p-3" open>
      <summary className="cursor-pointer text-xs font-medium text-foreground">
        Prévia do envio à IA
      </summary>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {declaredByPlugin
          ? "Este é o formato que o plugin declarou que enviará. As variáveis serão substituídas pelos dados do Projeto na execução."
          : "Este plugin ainda não declarou seu formato próprio. A prévia mostra a instrução e os dados que o núcleo encaminhará ao executor."}
      </p>
      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-background/70 p-3 font-mono text-[11px] leading-relaxed text-foreground">
        {preview}
      </pre>
    </details>
  );
}

function MethodParametersEditor({
  block,
  onChange,
}: {
  block: ActionBlock;
  onChange: (parameters: BlockParameter[]) => void;
}) {
  const parameters = block.parameters ?? [];
  const addParameter = () =>
    onChange([
      ...parameters,
      {
        id: uid(`${block.id}-parameter`),
        label: "Novo parâmetro",
        key: `parameter_${parameters.length + 1}`,
        type: "text",
        value: "",
      },
    ]);
  const updateParameter = (id: string, patch: Partial<BlockParameter>) =>
    onChange(
      parameters.map((parameter) => (parameter.id === id ? { ...parameter, ...patch } : parameter)),
    );

  return (
    <details className="rounded-lg border border-border/70 bg-card/60 p-3">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
        Parâmetros do prompt ({parameters.length})
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-[10px] text-muted-foreground">
          Valores reutilizáveis no prompt como {"{{parameters.chave}}"}. Eles ficam salvos no
          Método.
        </p>
        {parameters.map((parameter) => (
          <div key={parameter.id} className="rounded-lg border border-border/60 p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_1fr_auto]">
              <Input
                className="h-8 text-xs"
                value={parameter.label}
                onChange={(event) => updateParameter(parameter.id, { label: event.target.value })}
                placeholder="Nome"
              />
              <Input
                className="h-8 text-xs"
                value={parameter.key}
                onChange={(event) => updateParameter(parameter.id, { key: event.target.value })}
                placeholder="chave"
              />
              <Select
                value={parameter.type}
                onValueChange={(type) =>
                  updateParameter(parameter.id, {
                    type: type as BlockParameter["type"],
                    value: type === "number" ? 0 : type === "boolean" ? false : "",
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Texto</SelectItem>
                  <SelectItem value="textarea">Texto longo</SelectItem>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="boolean">Sim ou não</SelectItem>
                  <SelectItem value="select">Seleção</SelectItem>
                </SelectContent>
              </Select>
              {parameter.type === "boolean" ? (
                <Select
                  value={String(parameter.value)}
                  onValueChange={(value) =>
                    updateParameter(parameter.id, { value: value === "true" })
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">Sim</SelectItem>
                    <SelectItem value="false">Não</SelectItem>
                  </SelectContent>
                </Select>
              ) : parameter.type === "number" ? (
                <NumberInput
                  className="h-8 text-xs"
                  value={typeof parameter.value === "number" ? parameter.value : undefined}
                  onValueChange={(value) => updateParameter(parameter.id, { value: value ?? 0 })}
                />
              ) : (
                <Input
                  className="h-8 text-xs"
                  value={String(parameter.value ?? "")}
                  onChange={(event) => updateParameter(parameter.id, { value: event.target.value })}
                  placeholder="Valor"
                />
              )}
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => onChange(parameters.filter((item) => item.id !== parameter.id))}
                aria-label={`Remover parâmetro ${parameter.label}`}
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addParameter}>
          <Plus className="size-3" /> Adicionar parâmetro
        </Button>
      </div>
    </details>
  );
}

function PluginConnectionSelector({
  plugin,
  value,
  onChange,
}: {
  plugin: DiscoveredPlugin;
  value?: string;
  onChange: (connectionId: string | undefined) => void;
}) {
  const [connections, setConnections] = useState<LocalPluginConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [name, setName] = useState("");
  const [secrets, setSecrets] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/connections`);
      const result = (await response.json()) as {
        connections?: LocalPluginConnection[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível listar as conexões.");
      setConnections(result.connections ?? []);
    } catch (error) {
      toast.error("Não foi possível carregar as conexões", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [plugin.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createConnection() {
    setCreating(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, secrets }),
      });
      const result = (await response.json()) as LocalPluginConnection & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar a conexão.");
      setName("");
      setSecrets({});
      await load();
      onChange(result.id);
      toast.success("Conexão criada", { description: "Teste a conta antes da primeira execução." });
    } catch (error) {
      toast.error("Não foi possível criar a conexão", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  }

  async function testConnection() {
    if (!value) return;
    setTesting(true);
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/connections/${encodeURIComponent(value)}/test`,
        { method: "POST" },
      );
      const result = (await response.json()) as { valid?: boolean; error?: string };
      if (!response.ok || !result.valid) {
        throw new Error(result.error ?? "A conexão não foi validada.");
      }
      await load();
      toast.success("Conexão validada");
    } catch (error) {
      toast.error("A conexão não pôde ser validada", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setTesting(false);
    }
  }

  const selected = connections.find((connection) => connection.id === value);
  const canCreate =
    Boolean(name.trim()) &&
    (plugin.manifest.secretKeys ?? []).some((secretKey) => secrets[secretKey]?.trim());

  return (
    <section className="rounded-lg border border-border/70 bg-card/60 p-3">
      <Label>Conta ou conexão</Label>
      <div className="mt-2 flex gap-2">
        <Select
          value={value ?? ""}
          onValueChange={(connectionId) => onChange(connectionId || undefined)}
          disabled={loading || !connections.length}
        >
          <SelectTrigger className="min-w-0 flex-1">
            <SelectValue
              placeholder={loading ? "Carregando conexões..." : "Selecione uma conexão local"}
            />
          </SelectTrigger>
          <SelectContent>
            {connections.map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!selected || testing}
          onClick={() => void testConnection()}
        >
          {testing && <LoaderCircle className="size-3.5 animate-spin" />}
          Testar
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        O Método salva somente o identificador local. A credencial permanece no cofre seguro.
      </p>
      {value && !loading && !selected && (
        <p className="mt-2 text-xs text-destructive">
          A conexão anteriormente associada não está mais disponível. Escolha outra conta.
        </p>
      )}

      <details className="mt-3 rounded-md border border-border/70 bg-background/40 p-2.5">
        <summary className="cursor-pointer text-xs font-medium">Criar nova conexão</summary>
        <div className="mt-3 space-y-2">
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Preencha somente as credenciais necessárias para esta conexão.
          </p>
          <Input
            value={name}
            placeholder="Ex.: Conta principal do canal"
            onChange={(event) => setName(event.target.value)}
          />
          {(plugin.manifest.secretKeys ?? []).map((secretKey) => (
            <div key={secretKey} className="space-y-1">
              <Label
                htmlFor={`${plugin.id}-${secretKey}-connection`}
                className="font-mono text-[10px]"
              >
                {secretKey}
              </Label>
              <Input
                id={`${plugin.id}-${secretKey}-connection`}
                type="password"
                autoComplete="off"
                value={secrets[secretKey] ?? ""}
                onChange={(event) =>
                  setSecrets((current) => ({ ...current, [secretKey]: event.target.value }))
                }
              />
            </div>
          ))}
          <Button
            type="button"
            size="sm"
            disabled={creating || !canCreate}
            onClick={() => void createConnection()}
          >
            {creating && <LoaderCircle className="size-3.5 animate-spin" />}
            Salvar no cofre local
          </Button>
        </div>
      </details>
    </section>
  );
}

function InstructionEditor({
  block,
  capability,
  methodBlocks,
  blockIndex,
  processType,
  channelMethods,
  processOrder,
  collections,
  onChange,
}: {
  block: ActionBlock;
  capability?: PluginCapability;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  processOrder: UniversalProcess[];
  collections: StrategicCollection[];
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const { t } = useAppPreferences();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const promptSessionRef = useRef<
    { instructions: string; inputs: BlockInputBinding[] } | undefined
  >(undefined);
  const usage = capability?.instructionUsage ?? "optional";
  const label =
    block.operator === "IA" && usage !== "not_applicable"
      ? "Prompt do bloco"
      : block.operator === "Humano"
        ? "Orientação para a pessoa"
        : usage === "not_applicable"
          ? "Observação do bloco"
          : "Instrução da operação";
  const description =
    block.operator === "IA" && usage === "required"
      ? "Esta é a instrução principal enviada ao executor. Use variáveis para inserir as informações recebidas pelo bloco."
      : usage === "not_applicable"
        ? "Opcional. Esta capability executa uma operação definida e não usa este texto como prompt."
        : "Explique o que deve ser feito e qual resultado é esperado.";
  const contextVariables = [
    { label: "Nome do projeto", token: "{{project.title}}" },
    { label: "Prazo do projeto", token: "{{project.deadline}}" },
    { label: "Nome do canal", token: "{{channel.name}}" },
    { label: "Idioma do canal", token: "{{channel.language}}" },
    { label: "Nicho do canal", token: "{{channel.niche}}" },
    { label: "Nome do bloco", token: "{{block.name}}" },
    { label: "Tipo de ação", token: "{{block.type}}" },
  ];
  const inputVariables = (block.inputs ?? []).filter(isMethodContentField).map((input) => ({
    label: instructionInputLabel(input),
    token: `{{inputs.${instructionInputKey(input)}}}`,
  }));
  const parameterVariables = (block.parameters ?? []).map((parameter) => ({
    label: parameter.label,
    token: `{{parameters.${parameter.key}}}`,
  }));
  const collectionVariables = collections.map((collection) => ({
    label: collection.name,
    token: `{{collections.${instructionCollectionKey(collection)}}}`,
  }));
  const acceptsInputShape = (shape: ValueShape) =>
    !capability ||
    capability.inputPorts.some((port) => areValueShapesCompatible(shape, port.shape));
  const isAlreadyConnected = (candidate: BlockInputBinding) =>
    (block.inputs ?? []).some(
      (input) => JSON.stringify(input.binding) === JSON.stringify(candidate.binding),
    );
  const toAvailableInput = (input: Omit<BlockInputBinding, "id">, context: string, id: string) => {
    const normalizedInput: BlockInputBinding = { ...input, id };
    return {
      id,
      context,
      input: normalizedInput,
      label: instructionInputLabel(normalizedInput),
    };
  };
  const previousBlockInputs = methodBlocks.slice(0, blockIndex).flatMap((sourceBlock) =>
    getBlockSourceFields(sourceBlock, collections)
      .filter((output) => isMethodContentField(output) && acceptsInputShape(output.shape))
      .map((output) =>
        toAvailableInput(
          {
            label: instructionInputLabel(output),
            shape: structuredClone(output.shape),
            binding: {
              kind: "previous_block",
              blockId: sourceBlock.id,
              outputKey: output.key,
            },
            presentation: output.presentation,
          },
          `Neste processo · ${sourceBlock.name ?? sourceBlock.type}`,
          `${processType}::${sourceBlock.id}::${output.key}`,
        ),
      ),
  );
  const previousProcessInputs = processOrder
    .slice(0, processOrder.indexOf(processType))
    .flatMap((sourceProcessType) => {
      const officialOutput = createProcessOutputFields(sourceProcessType)[0];
      const sources = [
        {
          blockId: "__process_output__",
          blockLabel: "Resultado oficial",
          output: officialOutput,
        },
        ...(channelMethods[sourceProcessType]?.blocks ?? []).flatMap((sourceBlock) =>
          (sourceBlock.outputs ?? []).map((output) => ({
            blockId: sourceBlock.id,
            blockLabel: sourceBlock.name ?? sourceBlock.type,
            output,
          })),
        ),
      ];
      return sources
        .filter(({ output }) => isMethodContentField(output) && acceptsInputShape(output.shape))
        .map(({ blockId, blockLabel, output }) =>
          toAvailableInput(
            {
              label: instructionInputLabel(output),
              shape: structuredClone(output.shape),
              binding: {
                kind: "previous_process",
                processType: sourceProcessType,
                outputKey: output.key,
                ...(blockId === "__process_output__" ? {} : { blockId }),
              },
              presentation: output.presentation,
            },
            `${PROCESS_META[sourceProcessType].label} · ${blockLabel}`,
            `${sourceProcessType}::${blockId}::${output.key}`,
          ),
        );
    });
  const availableInputs = [...previousBlockInputs, ...previousProcessInputs].filter(
    ({ input }) => !isAlreadyConnected(input),
  );

  const insertVariable = (token: string, input?: BlockInputBinding) => {
    const current = block.instructions ?? "";
    const element = textareaRef.current;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? start;
    const prefix = start > 0 && !/\s$/.test(current.slice(0, start)) ? " " : "";
    const suffix = end < current.length && !/^\s/.test(current.slice(end)) ? " " : "";
    const next = `${current.slice(0, start)}${prefix}${token}${suffix}${current.slice(end)}`;
    onChange({
      instructions: next,
      ...(input
        ? { inputs: [...(block.inputs ?? []), { ...input, id: uid(`${block.id}-input`) }] }
        : {}),
    });
    window.setTimeout(() => {
      const cursor = start + prefix.length + token.length + suffix.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
  };

  const insertAvailableInput = (candidate: (typeof availableInputs)[number]) => {
    const input = { ...candidate.input, label: candidate.label };
    insertVariable(`{{inputs.${instructionInputKey(input)}}}`, input);
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>{label}</Label>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Textarea
        ref={textareaRef}
        value={block.instructions ?? ""}
        onChange={(event) => onChange({ instructions: event.target.value })}
        onFocus={() => {
          promptSessionRef.current = {
            instructions: block.instructions ?? "",
            inputs: block.inputs ?? [],
          };
        }}
        onBlur={(event) => {
          const session = promptSessionRef.current;
          promptSessionRef.current = undefined;
          if (!session) return;
          const removedInputs = session.inputs.filter(
            (input) =>
              instructionReferencesInput(session.instructions, input) &&
              !instructionReferencesInput(event.target.value, input),
          );
          if (!removedInputs.length) return;
          const removedIds = new Set(removedInputs.map((input) => input.id));
          onChange({
            instructions: event.target.value,
            inputs: (block.inputs ?? []).filter((input) => !removedIds.has(input.id)),
          });
          toast.info(
            `${removedInputs.length === 1 ? "A entrada vinculada foi removida" : "As entradas vinculadas foram removidas"} junto com a variável do prompt.`,
          );
        }}
        placeholder="Explique o que deve ser feito e qual resultado é esperado."
        rows={5}
      />
      {usage !== "not_applicable" && (
        <div className="space-y-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                <Braces className="size-3.5" /> Inserir variável
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80">
              {inputVariables.length > 0 && (
                <>
                  <DropdownMenuLabel>Informações usadas pelo bloco</DropdownMenuLabel>
                  {inputVariables.map((variable) => (
                    <DropdownMenuItem
                      key={`${variable.token}-${variable.label}`}
                      onSelect={() => insertVariable(variable.token)}
                    >
                      <Braces /> {variable.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              {availableInputs.length > 0 && (
                <>
                  <DropdownMenuLabel>Entregas anteriores disponíveis</DropdownMenuLabel>
                  {availableInputs.map((candidate) => (
                    <DropdownMenuItem
                      key={candidate.id}
                      className="items-start"
                      onSelect={() => insertAvailableInput(candidate)}
                    >
                      <Braces className="mt-0.5" />
                      <span className="min-w-0">
                        <span className="block truncate">{candidate.label}</span>
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {candidate.context}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}

              {parameterVariables.length > 0 && (
                <>
                  <DropdownMenuLabel>Parâmetros do Método</DropdownMenuLabel>
                  {parameterVariables.map((variable) => (
                    <DropdownMenuItem
                      key={`${variable.token}-${variable.label}`}
                      onSelect={() => insertVariable(variable.token)}
                    >
                      <Braces /> {variable.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}

              {collectionVariables.length > 0 && (
                <>
                  <DropdownMenuLabel>{t("Coleções")}</DropdownMenuLabel>
                  {collectionVariables.map((variable) => (
                    <DropdownMenuItem
                      key={variable.token}
                      onSelect={() => insertVariable(variable.token)}
                    >
                      <Library /> {variable.label}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}

              <DropdownMenuLabel>Projeto, canal e bloco</DropdownMenuLabel>
              {contextVariables.map((variable) => (
                <DropdownMenuItem
                  key={`${variable.token}-${variable.label}`}
                  onSelect={() => insertVariable(variable.token)}
                >
                  <Braces /> {variable.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <p className="text-[10px] text-muted-foreground">
            Cada entrada possui uma variável vinculada no prompt. Apagar a variável remove a
            entrada; remover ou renomear a entrada também atualiza a variável.
          </p>
        </div>
      )}
      {usage === "required" && !block.instructions?.trim() && (
        <p className="text-[11px] text-destructive">
          Este executor exige um prompt antes de iniciar o bloco.
        </p>
      )}
    </div>
  );
}

function ManagedProfileSelector({
  plugin,
  capability,
  profileSetup,
  configuration,
  profileExecution,
  onProfileExecutionChange,
}: {
  plugin: DiscoveredPlugin;
  capability: PluginCapability;
  profileSetup: PluginProfileSetup;
  configuration: Record<string, string | number | boolean>;
  profileExecution?: ProfileExecutionPolicy;
  onProfileExecutionChange: (
    profileExecution: ProfileExecutionPolicy | undefined,
    configuration?: Record<string, string | number | boolean>,
  ) => void;
}) {
  const { t } = useAppPreferences();
  const [profiles, setProfiles] = useState<ManagedPluginProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const primaryAlias = String(configuration[profileSetup.configurationKey] ?? "").trim();
  const fallbackAliases = profileSetup.fallbackConfigurationKey
    ? String(configuration[profileSetup.fallbackConfigurationKey] ?? "")
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter((value, index, values) => value && values.indexOf(value) === index)
    : [];
  const orchestration = capability.execution.itemOrchestration;
  const parallelDeclaration = orchestration?.profileParallelism;
  const supportsParallel =
    parallelDeclaration?.supported === true &&
    orchestration?.strategies?.includes("continuous_session") === true &&
    (orchestration.preferredStrategy === "continuous_session" ||
      (!orchestration.preferredStrategy && orchestration.strategies.length === 1));
  const legacyProfileIds = [primaryAlias, ...fallbackAliases]
    .map((alias) => profiles.find((profile) => profile.alias === alias)?.id)
    .filter((profileId): profileId is string => Boolean(profileId));
  const selectedProfileIds = (
    profileExecution?.profileIds.length ? profileExecution.profileIds : legacyProfileIds
  ).filter((profileId, index, all) => all.indexOf(profileId) === index);
  const selectedMode = profileExecution?.mode === "parallel" ? "parallel" : "fallback";
  const revokedProfileIds = loading
    ? []
    : selectedProfileIds.filter(
        (profileId) => !profiles.some((profile) => profile.id === profileId),
      );
  const selectedProfiles = selectedProfileIds
    .map((profileId) => profiles.find((profile) => profile.id === profileId))
    .filter((profile): profile is ManagedPluginProfile => Boolean(profile));
  const unpreparedProfiles = selectedProfiles.filter(
    (profile) => profile.readinessState !== "ready",
  );
  const occupiedProfiles = selectedProfiles.filter((profile) => profile.occupied);
  const parallelLimit = Math.max(
    1,
    Math.min(
      selectedProfileIds.length || 1,
      profileExecution?.mode === "parallel"
        ? (profileExecution.maxParallel ?? selectedProfileIds.length)
        : selectedProfileIds.length || 1,
      parallelDeclaration?.maxProfiles ?? Number.POSITIVE_INFINITY,
      capability.execution.maxConcurrency ?? Number.POSITIVE_INFINITY,
    ),
  );
  const distributedInput = orchestration
    ? (capability.inputPorts.find((port) => port.key === orchestration.inputPort)?.label ??
      orchestration.inputPort)
    : undefined;
  const aggregateOutput = orchestration?.combinedOutputPort
    ? (capability.outputPorts.find((port) => port.key === orchestration.combinedOutputPort)
        ?.label ?? orchestration.combinedOutputPort)
    : orchestration
      ? (capability.outputPorts.find((port) => port.key === orchestration.outputPort)?.label ??
        orchestration.outputPort)
      : undefined;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/profile-inventory`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          linked?: Array<{
            profile: Omit<ManagedPluginProfile, "pluginId" | "readinessState" | "occupied">;
            readiness?: { state: string };
            occupied?: boolean;
          }>;
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? t("Não foi possível carregar os perfis."));
        setProfiles(
          (result.linked ?? []).map((entry) => ({
            ...entry.profile,
            pluginId: plugin.id,
            readinessState: entry.readiness?.state,
            occupied: entry.occupied === true,
          })),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        toast.error(t("Não foi possível carregar os perfis"), {
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
    };
  }, [plugin.id, t]);

  function aliasesForProfileIds(profileIds: string[]) {
    return profileIds
      .map((profileId) => profiles.find((profile) => profile.id === profileId)?.alias)
      .filter((alias): alias is string => Boolean(alias));
  }

  function persistPolicy(
    mode: ProfileExecutionPolicy["mode"],
    profileIds: string[],
    maxParallel?: number,
  ) {
    const uniqueProfileIds = profileIds.filter(
      (profileId, index, all) => profileId && all.indexOf(profileId) === index,
    );
    if (!uniqueProfileIds.length) {
      onProfileExecutionChange(undefined);
      return;
    }
    const normalizedMode = mode === "parallel" ? "parallel" : "fallback";
    const nextPolicy: ProfileExecutionPolicy =
      normalizedMode === "parallel"
        ? {
            mode: "parallel",
            profileIds: uniqueProfileIds,
            maxParallel: Math.max(
              1,
              Math.min(maxParallel ?? uniqueProfileIds.length, uniqueProfileIds.length),
            ),
          }
        : {
            mode: normalizedMode,
            profileIds: uniqueProfileIds,
          };
    const aliases = aliasesForProfileIds(nextPolicy.profileIds);
    onProfileExecutionChange(
      nextPolicy,
      aliases.length
        ? {
            ...configuration,
            [profileSetup.configurationKey]: aliases[0],
            ...(profileSetup.fallbackConfigurationKey
              ? { [profileSetup.fallbackConfigurationKey]: aliases.slice(1).join("\n") }
              : {}),
          }
        : undefined,
    );
  }

  function setMode(mode: ProfileExecutionPolicy["mode"]) {
    const ordered = [...selectedProfileIds];
    const minimum = mode === "parallel" ? 2 : 1;
    for (const profile of profiles) {
      if (ordered.length >= minimum) break;
      if (!ordered.includes(profile.id)) ordered.push(profile.id);
    }
    persistPolicy(mode, ordered, profileExecution?.maxParallel);
  }

  function toggleSelectedProfile(profileId: string, checked: boolean) {
    const next = checked
      ? [...selectedProfileIds.filter((value) => value !== profileId), profileId]
      : selectedProfileIds.filter((value) => value !== profileId);
    persistPolicy(selectedMode, next, profileExecution?.maxParallel);
  }

  function moveSelectedProfile(profileId: string, direction: -1 | 1) {
    const index = selectedProfileIds.indexOf(profileId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selectedProfileIds.length) return;
    persistPolicy(
      selectedMode,
      arrayMove(selectedProfileIds, index, target),
      profileExecution?.maxParallel,
    );
  }

  return (
    <section className="space-y-3 rounded-lg border border-border/70 bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <Label>Perfil da conta</Label>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Selecione um perfil já cadastrado. A preparação e o gerenciamento ficam em Plugins.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" className="h-7 text-[10px]" asChild>
          <a href="/plugins">Gerenciar perfis</a>
        </Button>
      </div>

      {profiles.length || revokedProfileIds.length ? (
        <>
          <div className="space-y-1.5">
            <Label>{t("Modo de execução dos perfis")}</Label>
            <Select
              value={selectedMode}
              onValueChange={(value) => setMode(value as ProfileExecutionPolicy["mode"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fallback">{t("Fallback ordenado")}</SelectItem>
                {supportsParallel && (
                  <SelectItem value="parallel">{t("Executar perfis simultaneamente")}</SelectItem>
                )}
              </SelectContent>
            </Select>
            {!supportsParallel && parallelDeclaration?.supported === true && (
              <p className="text-[10px] text-muted-foreground">
                {t(
                  "O modo simultâneo exige sessão contínua com correlação incremental compatível.",
                )}
              </p>
            )}
            {supportsParallel && (
              <p className="text-[10px] text-muted-foreground">
                {t(
                  "O modo simultâneo só inicia quando a coleção estiver materializada em itens independentes pelo núcleo.",
                )}
              </p>
            )}
          </div>

          {(revokedProfileIds.length > 0 ||
            unpreparedProfiles.length > 0 ||
            occupiedProfiles.length > 0) && (
            <div className="space-y-1 rounded-md border border-border/70 bg-muted/30 p-2.5 text-[10px] text-muted-foreground">
              {revokedProfileIds.length > 0 && (
                <p>
                  {t(
                    "Um perfil selecionado foi desvinculado deste plugin. Escolha outro perfil antes de executar.",
                  )}
                </p>
              )}
              {unpreparedProfiles.length > 0 && (
                <p>
                  {t(
                    "Há perfil selecionado ainda não preparado para este plugin. Prepare-o na Central de Plugins antes de executar.",
                  )}
                </p>
              )}
              {occupiedProfiles.length > 0 && (
                <p>
                  {t(
                    "Há perfil selecionado ocupado por outra execução. Ele ficará indisponível até o lease atual ser liberado.",
                  )}
                </p>
              )}
            </div>
          )}

          <Select
            value={primaryAlias}
            onValueChange={(alias) => {
              const profile = profiles.find((candidate) => candidate.alias === alias);
              if (!profile) return;
              const rest = selectedProfileIds.filter((profileId) => profileId !== profile.id);
              persistPolicy(selectedMode, [profile.id, ...rest], profileExecution?.maxParallel);
            }}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={loading ? "Carregando perfis…" : "Selecione o perfil principal"}
              />
            </SelectTrigger>
            <SelectContent>
              {profiles.map((profile) => (
                <SelectItem key={profile.id} value={profile.alias}>
                  {profile.name}
                  {profile.readinessState !== "ready" ? ` · ${t("Não preparado")}` : ""}
                  {profile.occupied ? ` · ${t("Ocupado")}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="space-y-2">
            <div>
              <p className="text-[11px] font-medium">
                {selectedMode === "parallel" ? t("Perfis simultâneos") : t("Perfis alternativos")}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {selectedMode === "parallel"
                  ? t("Selecione e ordene os perfis que poderão receber itens desta execução.")
                  : t("Em caso de falha, serão tentados na ordem abaixo.")}
              </p>
            </div>
            <div className="space-y-1.5">
              {profiles.map((profile) => {
                const fallbackIndex = selectedProfileIds.indexOf(profile.id);
                const selected = fallbackIndex >= 0;
                const isPrimary = fallbackIndex === 0;
                return (
                  <div
                    key={profile.id}
                    className="flex items-center gap-2 rounded-md border border-border/70 px-2.5 py-2"
                  >
                    <Checkbox
                      id={`${plugin.id}-${profile.id}-fallback`}
                      checked={selected}
                      disabled={isPrimary}
                      onCheckedChange={(checked) =>
                        toggleSelectedProfile(profile.id, checked === true)
                      }
                    />
                    <Label
                      htmlFor={`${plugin.id}-${profile.id}-fallback`}
                      className="min-w-0 flex-1 cursor-pointer text-xs font-normal"
                    >
                      {selected && (
                        <span className="mr-1.5 text-[10px] text-muted-foreground">
                          {fallbackIndex + 1}.
                        </span>
                      )}
                      {profile.name}
                      {profile.readinessState !== "ready" && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          · {t("Não preparado")}
                        </span>
                      )}
                      {profile.occupied && (
                        <span className="ml-1.5 text-[10px] text-muted-foreground">
                          · {t("Ocupado")}
                        </span>
                      )}
                    </Label>
                    {selected && (
                      <div className="flex gap-0.5">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={fallbackIndex === 0}
                          aria-label={`${t("Subir")} ${profile.name}`}
                          onClick={() => moveSelectedProfile(profile.id, -1)}
                        >
                          <ChevronUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          disabled={fallbackIndex === selectedProfileIds.length - 1}
                          aria-label={`${t("Descer")} ${profile.name}`}
                          onClick={() => moveSelectedProfile(profile.id, 1)}
                        >
                          <ChevronDown className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {selectedMode === "parallel" && supportsParallel && (
            <div className="space-y-3 rounded-md border border-border/70 bg-background/50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("Máximo de workers")}</Label>
                  <NumberInput
                    integer
                    min={1}
                    max={Math.max(1, selectedProfileIds.length)}
                    value={
                      profileExecution?.mode === "parallel"
                        ? (profileExecution.maxParallel ?? selectedProfileIds.length)
                        : selectedProfileIds.length
                    }
                    onValueChange={(value) =>
                      persistPolicy(
                        "parallel",
                        selectedProfileIds,
                        value ?? selectedProfileIds.length,
                      )
                    }
                  />
                </div>
                <div className="rounded-md bg-muted/50 p-2.5">
                  <p className="text-[10px] text-muted-foreground">{t("Workers efetivos")}</p>
                  <p className="text-sm font-semibold">{parallelLimit}</p>
                </div>
              </div>
              {distributedInput && (
                <p className="text-[10px] text-muted-foreground">
                  {t("Coleção distribuída")}:{" "}
                  <span className="font-medium text-foreground">{distributedInput}</span>
                  {aggregateOutput ? (
                    <>
                      {" "}
                      · {t("Entrega agregada")}:{" "}
                      <span className="font-medium text-foreground">{aggregateOutput}</span>
                    </>
                  ) : null}
                </p>
              )}
            </div>
          )}

          <div
            className="rounded-md border border-border/70 bg-muted/20 p-3 text-[10px]"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium text-foreground">{t("Resumo antes de salvar")}</p>
            <p className="mt-1 text-muted-foreground">
              {t("Modo")}:{" "}
              {t(
                selectedMode === "fallback"
                  ? "Fallback ordenado"
                  : "Executar perfis simultaneamente",
              )}
              {" · "}
              {t("Perfis selecionados")}: {selectedProfileIds.length}
              {selectedMode === "parallel" ? (
                <>
                  {" · "}
                  {t("Workers efetivos")}: {parallelLimit}
                </>
              ) : null}
            </p>
            {selectedProfiles.length > 0 && (
              <p className="mt-1 text-muted-foreground">
                {t("Ordem dos perfis")}:{" "}
                {selectedProfiles.map((profile) => profile.name).join(" → ")}
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          {loading
            ? "Carregando perfis…"
            : "Nenhum perfil cadastrado para este plugin. Abra Plugins para adicionar o primeiro."}
        </p>
      )}
    </section>
  );
}

function ValidationEditor({
  block,
  methodBlocks,
  index,
  capability,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  index: number;
  capability?: PluginCapability;
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const { t } = useAppPreferences();
  const previousBlocks = methodBlocks.slice(0, index).filter((item) => item.type !== "VALIDAR");
  const validation = block.validation ?? {
    targetBlockId: "",
    mode: "approval" as ValidationMode,
    onReject: "retry_target" as const,
    maxAttempts: 3,
    retryMode: "full" as const,
  };
  const target = previousBlocks.find((item) => item.id === validation.targetBlockId);
  const targetOutputs = target?.outputs ?? [];

  function sourceOutputFor(targetBlock: ActionBlock | undefined, key?: string) {
    return key ? targetBlock?.outputs?.find((output) => output.key === key) : undefined;
  }

  function applyValidation(
    patch: Partial<NonNullable<ActionBlock["validation"]>>,
    nextMode = patch.mode ?? validation.mode,
    nextTarget = previousBlocks.find(
      (item) => item.id === (patch.targetBlockId ?? validation.targetBlockId),
    ),
  ) {
    const nextValidation = { ...validation, ...patch };
    const sourceOutput = sourceOutputFor(nextTarget, nextValidation.targetOutputKey);
    if (!sourceOutput) {
      nextValidation.targetOutputKey = undefined;
      nextValidation.targetPortKey = undefined;
    } else if (capability) {
      const usedPorts = new Set(
        (block.inputs ?? [])
          .map((input) => input.portKey)
          .filter((key): key is string => Boolean(key)),
      );
      const compatiblePorts = capability.inputPorts.filter(
        (port) =>
          areValueShapesCompatible(sourceOutput.shape, port.shape) && !usedPorts.has(port.key),
      );
      const configured = compatiblePorts.find((port) => port.key === nextValidation.targetPortKey);
      nextValidation.targetPortKey =
        configured?.key ?? (compatiblePorts.length === 1 ? compatiblePorts[0].key : undefined);
    }
    onChange({
      validation: nextValidation,
      outputs: createValidationFields(
        nextMode,
        nextValidation.targetBlockId,
        nextValidation.targetOutputKey,
        sourceOutput?.shape,
      ),
    });
  }

  return (
    <div className="space-y-4">
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

      {validation.mode === "approval" && capability && (
        <div className="space-y-1.5">
          <Label>{t("Saída enviada ao plugin")}</Label>
          <Select
            value={validation.targetOutputKey ?? "__whole_block__"}
            onValueChange={(targetOutputKey) =>
              applyValidation({
                targetOutputKey:
                  targetOutputKey === "__whole_block__" ? undefined : targetOutputKey,
                targetPortKey: undefined,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__whole_block__">{t("Aprovar o bloco inteiro")}</SelectItem>
              {targetOutputs.map((output) => (
                <SelectItem key={output.id} value={output.key}>
                  {output.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Mensagem da nova tentativa</Label>
                <Select
                  value={validation.retryMode ?? "full"}
                  onValueChange={(retryMode) =>
                    applyValidation({
                      retryMode: retryMode as "full" | "conversation_feedback",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Reenviar instrução e contexto completos</SelectItem>
                    <SelectItem value="conversation_feedback">
                      Continuar o chat enviando somente as observações
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Se a conversa não estiver acessível no perfil usado, uma nova conversa recebe o
                  resultado anterior e as observações.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label>Máximo de tentativas</Label>
                <NumberInput
                  min={1}
                  max={20}
                  integer
                  value={validation.maxAttempts}
                  onValueChange={(maxAttempts) =>
                    applyValidation({ maxAttempts: maxAttempts ?? validation.maxAttempts })
                  }
                />
                <p className="text-[10px] text-muted-foreground">
                  Ao atingir o limite, a validação permanece pausada para decisão humana.
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChannelHistoryToggle({
  block,
  processType,
  onChange,
}: {
  block: ActionBlock;
  processType: UniversalProcess;
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const historyInputs = inputs.filter((input) => input.binding.kind === "channel_history");
  const regularInputs = inputs.filter((input) => input.binding.kind !== "channel_history");
  const usesChoiceHistory = block.type === "ESCOLHER";

  const setEnabled = (enabled: boolean) => {
    if (!enabled) {
      onChange({ inputs: regularInputs });
      return;
    }
    if (historyInputs.length) return;
    const processOutput = createProcessOutputFields(processType)[0];
    const input: BlockInputBinding = {
      id: uid(`${block.id}-history`),
      label: usesChoiceHistory ? "Histórico de escolhas" : "Histórico de criações",
      shape: recordShape(
        "many",
        createChannelHistoryRecordFields(
          usesChoiceHistory ? controlShape("identifier") : processOutput.shape,
        ),
      ),
      binding: {
        kind: "channel_history",
        processType,
        blockId: usesChoiceHistory ? block.id : "__process_output__",
        outputKey: usesChoiceHistory ? "selectedItemId" : processOutput.key,
        limit: 10,
        eligibility: "completed",
      },
      presentation: { renderer: "table" },
    };
    onChange({ inputs: [...regularInputs, input] });
  };

  const setLimit = (limit: number) => {
    onChange({
      inputs: inputs.map((input) =>
        input.binding.kind === "channel_history"
          ? { ...input, binding: { ...input.binding, limit } }
          : input,
      ),
    });
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/70 bg-background/30 p-3">
      <Checkbox
        id={`${block.id}-channel-history`}
        className="mt-0.5"
        checked={historyInputs.length > 0}
        onCheckedChange={(checked) => setEnabled(checked === true)}
      />
      <label htmlFor={`${block.id}-channel-history`} className="min-w-0 flex-1 cursor-pointer">
        <span className="block text-xs font-medium">
          {usesChoiceHistory ? "Considerar escolhas anteriores" : "Considerar criações anteriores"}
        </span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
          {usesChoiceHistory
            ? "Consulte o que este mesmo bloco escolheu nos projetos anteriores do canal."
            : "Use como contexto os resultados finais deste processo nos projetos anteriores do canal."}
        </span>
      </label>
      {historyInputs.length > 0 && (
        <div className="w-20 shrink-0 space-y-1">
          <Label
            htmlFor={`${block.id}-channel-history-limit`}
            className="text-[10px] text-muted-foreground"
          >
            Últimos
          </Label>
          <NumberInput
            id={`${block.id}-channel-history-limit`}
            min={1}
            max={100}
            integer
            className="h-8 text-xs"
            value={
              historyInputs[0]?.binding.kind === "channel_history"
                ? historyInputs[0].binding.limit
                : 10
            }
            onValueChange={(historyLimit) => setLimit(historyLimit ?? 10)}
          />
        </div>
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
  processOrder,
  collections,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  processOrder: UniversalProcess[];
  collections: StrategicCollection[];
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const regularInputs = inputs
    .filter(isMethodContentField)
    .filter((input) => input.binding.kind !== "channel_history");
  const addInput = () => {
    const input: BlockInputBinding = {
      id: uid(`${block.id}-input`),
      label: nextManualInputLabel(inputs),
      shape: contentShape("text"),
      binding: { kind: "previous_block", blockId: "", outputKey: "" },
      presentation: { renderer: "auto" },
    };
    onChange({
      inputs: [...inputs, input],
      instructions: addInstructionInputVariable(block.instructions ?? "", input),
    });
  };

  return (
    <div className="mt-5 border-t border-border/60 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold">
            <History className="size-3.5 text-muted-foreground" /> Entradas de contexto
          </h3>
          <p className="text-[11px] text-muted-foreground">
            Opcional. Cada entrada é vinculada à sua variável no prompt para manter a configuração
            explícita e sem duplicidade.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addInput}>
            <Plus className="size-3" /> Adicionar entrada
          </Button>
        </div>
      </div>
      {block.type === "ESCOLHER" && (
        <div className="mt-3">
          <ChannelHistoryToggle block={block} processType={processType} onChange={onChange} />
        </div>
      )}
      <div className="mt-3 space-y-3">
        {regularInputs.map((input) => (
          <InputBindingEditor
            key={input.id}
            input={input}
            availableBlocks={methodBlocks.slice(0, blockIndex)}
            processType={processType}
            channelMethods={channelMethods}
            processOrder={processOrder}
            collections={collections}
            allowRuntime={Boolean(block.plugin && block.operator !== "Humano")}
            onChange={(patch) => {
              const nextInput = { ...input, ...patch };
              onChange({
                inputs: inputs.map((item) => (item.id === input.id ? nextInput : item)),
                instructions: replaceInstructionInputVariable(
                  block.instructions ?? "",
                  input,
                  nextInput,
                ),
              });
            }}
            onRemove={() => {
              const remainingInputs = inputs.filter((item) => item.id !== input.id);
              onChange({
                inputs: remainingInputs,
                instructions: removeInstructionInputVariables(
                  block.instructions ?? "",
                  input,
                  remainingInputs,
                ),
              });
            }}
          />
        ))}
        {!regularInputs.length && (
          <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
            Nenhuma entrada adicional. Adicione somente quando esta ação precisar de um resultado
            anterior como contexto.
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
  processOrder,
  collections,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  processOrder: UniversalProcess[];
  collections: StrategicCollection[];
  onChange: (patch: Partial<ActionBlock>) => void;
}) {
  const inputs = block.inputs ?? [];
  const regularInputs = inputs
    .filter(isMethodContentField)
    .filter((input) => input.binding.kind !== "channel_history");
  const outputs = block.outputs ?? [];
  const visibleOutputs = outputs.filter(isMethodContentField);
  const addInput = () => {
    const input: BlockInputBinding = {
      id: uid(`${block.id}-input`),
      label: nextManualInputLabel(inputs),
      shape: contentShape("text"),
      binding: { kind: "previous_block", blockId: "", outputKey: "" },
      presentation: { renderer: "auto" },
    };
    onChange({
      inputs: [...inputs, input],
      instructions: addInstructionInputVariable(block.instructions ?? "", input),
    });
  };
  const addOutput = () => {
    const output: BlockFieldDefinition = {
      id: uid(`${block.id}-output`),
      label: "Nova entrega",
      key: `output_${outputs.length + 1}`,
      shape: contentShape("text"),
      required: true,
      presentation: { renderer: "auto" },
    };
    onChange({ outputs: [...outputs, output] });
  };
  return (
    <div className="space-y-5 border-t border-border/60 pt-4">
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {block.type === "BUSCAR" ? "Informações para a busca" : "Informações de entrada"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Defina apenas as entradas adicionais que esta ação precisa.
            </p>
          </div>
          <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1" onClick={addInput}>
            <Plus className="size-3" /> Adicionar entrada
          </Button>
        </div>
        {block.type === "CRIAR" && (
          <div className="mb-3">
            <ChannelHistoryToggle block={block} processType={processType} onChange={onChange} />
          </div>
        )}
        <div className="space-y-3">
          {regularInputs.map((input) => (
            <InputBindingEditor
              key={input.id}
              input={input}
              availableBlocks={methodBlocks.slice(0, blockIndex)}
              processType={processType}
              channelMethods={channelMethods}
              processOrder={processOrder}
              collections={collections}
              allowRuntime={Boolean(block.plugin && block.operator !== "Humano")}
              onChange={(patch) => {
                const nextInput = { ...input, ...patch };
                onChange({
                  inputs: inputs.map((item) => (item.id === input.id ? nextInput : item)),
                  instructions: replaceInstructionInputVariable(
                    block.instructions ?? "",
                    input,
                    nextInput,
                  ),
                });
              }}
              onRemove={() => {
                const remainingInputs = inputs.filter((item) => item.id !== input.id);
                onChange({
                  inputs: remainingInputs,
                  instructions: removeInstructionInputVariables(
                    block.instructions ?? "",
                    input,
                    remainingInputs,
                  ),
                });
              }}
            />
          ))}
          {regularInputs.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-4 text-center text-[11px] text-muted-foreground">
              Este bloco não precisa de uma entrada específica para começar.
            </div>
          )}
        </div>
      </section>

      <section className="border-t border-border/60 pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {block.type === "BUSCAR" ? "Resultados encontrados" : "Resultado desta ação"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Cada entrega fica disponível para os próximos blocos.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 px-2 text-[10px]"
              onClick={() =>
                onChange({
                  outputs: replaceMethodContentFields(
                    outputs,
                    createSuggestedHumanFields(processType, block.type),
                  ),
                })
              }
            >
              Usar sugestão
            </Button>
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={addOutput}>
              <Plus className="size-3" /> Adicionar entrega
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {visibleOutputs.map((output) => (
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
              onRemove={() =>
                onChange({ outputs: outputs.filter((item) => item.id !== output.id) })
              }
            />
          ))}
          {outputs.length === 0 && (
            <div className="rounded-lg border border-dashed border-destructive/50 p-4 text-center text-[11px] text-destructive">
              Adicione ao menos uma entrega para concluir esta ação.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function InputBindingEditor({
  input,
  availableBlocks,
  processType,
  channelMethods,
  processOrder,
  collections,
  allowRuntime,
  onChange,
  onRemove,
}: {
  input: BlockInputBinding;
  availableBlocks: ActionBlock[];
  processType: UniversalProcess;
  channelMethods: Record<UniversalProcess, ProcessMethod>;
  processOrder: UniversalProcess[];
  collections: StrategicCollection[];
  allowRuntime: boolean;
  onChange: (patch: Partial<BlockInputBinding>) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const binding = input.binding;
  const sourceBlock =
    binding.kind === "previous_block"
      ? availableBlocks.find((block) => block.id === binding.blockId)
      : undefined;
  const sourceFields = getBlockSourceFields(sourceBlock, collections).filter(isMethodContentField);
  const previousProcesses = processOrder.slice(0, processOrder.indexOf(processType));
  const previousDeliverySources = previousProcesses.flatMap((sourceProcessType) => {
    const method = channelMethods[sourceProcessType];
    const blockOutputs = (method?.blocks ?? []).flatMap((sourceBlock) =>
      (sourceBlock.outputs ?? []).filter(isMethodContentField).map((output) => ({
        id: `${sourceProcessType}::${sourceBlock.id}::${output.key}`,
        processType: sourceProcessType,
        blockId: sourceBlock.id,
        blockLabel: sourceBlock.name ?? sourceBlock.type,
        output,
      })),
    );
    const officialOutputs = createProcessOutputFields(sourceProcessType)
      .filter(isMethodContentField)
      .map((output) => ({
        id: `${sourceProcessType}::process::${output.key}`,
        processType: sourceProcessType,
        blockId: undefined,
        blockLabel: "Resultado oficial",
        output,
      }));
    return [...officialOutputs, ...blockOutputs];
  });
  const selectedPreviousDelivery =
    binding.kind === "previous_process"
      ? previousDeliverySources.find(
          (source) =>
            source.processType === binding.processType &&
            source.blockId === binding.blockId &&
            source.output.key === binding.outputKey,
        )
      : undefined;
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
          <span className="truncate text-sm font-medium">{instructionInputLabel(input)}</span>
          <Badge variant="outline" className="ml-auto shrink-0 text-[9px] font-normal">
            {shapeSummary(input.shape)}
          </Badge>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remover entrada ${instructionInputLabel(input)}`}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)]">
            <Input
              value={instructionInputLabel(input)}
              onChange={(event) => onChange({ label: event.target.value })}
              placeholder="Nome da entrada"
              className="h-8 text-xs"
            />
            <PresentationSelector
              shape={input.shape}
              value={input.presentation}
              onChange={(presentation) => onChange({ presentation })}
            />
          </div>

          <ShapeEditor
            shape={input.shape}
            onChange={(shape) =>
              onChange({
                shape,
                presentation: normalizeFieldPresentation(shape, input.presentation),
              })
            }
          />

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Origem</Label>
              <Select
                value={binding.kind}
                onValueChange={(source) => {
                  if (source === "previous_process") {
                    const selected = previousDeliverySources.at(-1);
                    const output = selected?.output;
                    if (!selected || !output) return;
                    onChange({
                      label: instructionInputLabel(output),
                      shape: structuredClone(output.shape),
                      binding: {
                        kind: "previous_process",
                        processType: selected.processType,
                        outputKey: output.key,
                        ...(selected.blockId ? { blockId: selected.blockId } : {}),
                      },
                      presentation: output.presentation,
                    });
                    return;
                  }
                  if (source === "project")
                    onChange({ binding: { kind: "project", key: "title" } });
                  if (source === "runtime") onChange({ binding: { kind: "runtime" } });
                  if (source === "static") onChange({ binding: { kind: "static", value: "" } });
                  if (source === "previous_block") {
                    const candidate = availableBlocks.at(-1);
                    const output = getBlockSourceFields(candidate, collections).filter(
                      isMethodContentField,
                    )[0];
                    onChange({
                      ...(output
                        ? {
                            label: instructionInputLabel(output),
                            shape: structuredClone(output.shape),
                            presentation: output.presentation,
                          }
                        : {}),
                      binding: {
                        kind: "previous_block",
                        blockId: candidate?.id ?? "",
                        outputKey: output?.key ?? "",
                      },
                    });
                  }
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
                  <SelectItem value="project">Dados do projeto</SelectItem>
                  {allowRuntime && <SelectItem value="runtime">Fornecido na execução</SelectItem>}
                  <SelectItem value="static">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {binding.kind === "previous_block" && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Bloco</Label>
                <Select
                  value={binding.blockId}
                  onValueChange={(blockId) => {
                    const candidate = availableBlocks.find((item) => item.id === blockId);
                    const output = getBlockSourceFields(candidate, collections).filter(
                      isMethodContentField,
                    )[0];
                    onChange({
                      ...(output
                        ? {
                            label: instructionInputLabel(output),
                            shape: structuredClone(output.shape),
                            presentation: output.presentation,
                          }
                        : {}),
                      binding: {
                        kind: "previous_block",
                        blockId,
                        outputKey: output?.key ?? "",
                      },
                    });
                  }}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBlocks.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.order + 1}. {candidate.name ?? candidate.type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {binding.kind === "previous_process" && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">
                  Processo, bloco e entrega
                </Label>
                <Select
                  value={selectedPreviousDelivery?.id}
                  onValueChange={(sourceId) => {
                    const selected = previousDeliverySources.find(
                      (candidate) => candidate.id === sourceId,
                    );
                    const output = selected?.output;
                    if (!selected || !output) return;
                    onChange({
                      label: instructionInputLabel(output),
                      shape: structuredClone(output.shape),
                      binding: {
                        kind: "previous_process",
                        processType: selected.processType,
                        outputKey: output.key,
                        ...(selected.blockId ? { blockId: selected.blockId } : {}),
                      },
                      presentation: output.presentation,
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
                        {instructionInputLabel(source.output)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {binding.kind === "project" && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Dado</Label>
                <Select
                  value={binding.key}
                  onValueChange={(key) =>
                    onChange({ binding: { kind: "project", key: key as "title" | "deadline" } })
                  }
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

            {binding.kind === "static" && (
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Valor</Label>
                <Input
                  className="h-8 text-xs"
                  value={binding.value}
                  onChange={(event) =>
                    onChange({ binding: { kind: "static", value: event.target.value } })
                  }
                  placeholder="Valor usado nesta entrada"
                />
              </div>
            )}
          </div>

          {binding.kind === "previous_block" && binding.blockId && (
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Saída do bloco</Label>
              <Select
                value={binding.outputKey}
                onValueChange={(outputKey) => {
                  const output = sourceFields.find((candidate) => candidate.key === outputKey);
                  onChange({
                    ...(output
                      ? {
                          label: instructionInputLabel(output),
                          shape: structuredClone(output.shape),
                          presentation: output.presentation,
                        }
                      : {}),
                    binding: { ...binding, outputKey },
                  });
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sourceFields.map((output) => (
                    <SelectItem key={output.id} value={output.key}>
                      {instructionInputLabel(output)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
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
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-xl border border-border/70 bg-card p-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
          />
          <span className="truncate text-sm font-medium">{instructionInputLabel(field)}</span>
          <Badge variant="outline" className="ml-auto shrink-0 text-[9px] font-normal">
            {shapeSummary(field.shape)}
          </Badge>
        </button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label={`Remover entrega ${instructionInputLabel(field)}`}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.8fr)]">
            <Input
              value={instructionInputLabel(field)}
              onChange={(event) => onChange({ label: event.target.value })}
              placeholder="Nome da entrega"
              className="h-8 text-xs"
            />
            <PresentationSelector
              shape={field.shape}
              value={field.presentation}
              onChange={(presentation) => onChange({ presentation })}
            />
          </div>
          <ShapeEditor
            shape={field.shape}
            onChange={(shape) =>
              onChange({
                shape,
                presentation: normalizeFieldPresentation(shape, field.presentation),
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ShapeEditor({
  shape,
  onChange,
}: {
  shape: ValueShape;
  onChange: (shape: ContentShape) => void;
}) {
  const { t } = useAppPreferences();
  if (shape.kind !== "content") return null;
  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-background/30 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{t("Conteúdo")}</Label>
          <Select
            value={shape.family}
            onValueChange={(family) =>
              onChange(contentShape(family as ContentFamily, shape.cardinality))
            }
          >
            <SelectTrigger className="h-8 text-xs" aria-label={t("Tipo de conteúdo")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">{t("Texto")}</SelectItem>
              <SelectItem value="image">{t("Imagem")}</SelectItem>
              <SelectItem value="audio">{t("Áudio")}</SelectItem>
              <SelectItem value="video">{t("Vídeo")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CardinalityEditor
          value={shape.cardinality}
          onChange={(cardinality) => onChange({ ...shape, cardinality })}
        />
      </div>
      {shape.family === "text" && (
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">{t("Representação")}</Label>
          <Select
            value={shape.representation}
            onValueChange={(representation) =>
              onChange({ ...shape, representation: representation as ContentRepresentation })
            }
          >
            <SelectTrigger className="h-8 text-xs" aria-label={t("Representação")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inline">{t("Direto")}</SelectItem>
              <SelectItem value="artifact">{t("Arquivo")}</SelectItem>
              <SelectItem value="either">{t("Direto ou arquivo")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function CardinalityEditor({
  value,
  onChange,
}: {
  value: ContentCardinality;
  onChange: (value: ContentCardinality) => void;
}) {
  const { t } = useAppPreferences();
  return (
    <div className="space-y-1">
      <Label className="text-[10px] text-muted-foreground">{t("Quantidade")}</Label>
      <Select value={value} onValueChange={(next) => onChange(next as ContentCardinality)}>
        <SelectTrigger className="h-8 text-xs" aria-label={t("Quantidade")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">{t("Um")}</SelectItem>
          <SelectItem value="many">{t("Vários")}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PresentationSelector({
  shape,
  value,
  onChange,
}: {
  shape: ValueShape;
  value?: FieldPresentation;
  onChange: (presentation: FieldPresentation) => void;
}) {
  const normalized = normalizeFieldPresentation(shape, value);
  const compatible = getCompatiblePresentationRenderers(shape);
  const selected = compatible.includes(normalized.renderer) ? normalized.renderer : "auto";
  const [previewId, setPreviewId] = useState<PresentationRendererId>(selected);
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

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) return;
        setPreviewId(selected);
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
          </div>
          <aside className="md:sticky md:top-0 md:self-start">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Prévia real
            </p>
            <div className="min-h-56 rounded-xl border border-border/70 bg-card p-4">
              <p className="mb-3 text-xs font-semibold">{preview.label}</p>
              <RuntimeValueViewer
                shape={preview.preview.shape}
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
