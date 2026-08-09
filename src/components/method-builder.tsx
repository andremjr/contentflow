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
  type BlockType,
  type HumanFieldType,
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
import type { JsonSchema, PluginManifest } from "@/lib/plugin-contract";
import { setChannelMethod, useChannel, useChannels, useLibraryCollections } from "@/lib/store";
import { cn } from "@/lib/utils";

type DiscoveredPlugin = {
  id: string;
  source: "bundled" | "installed";
  directory: string;
  manifest: PluginManifest;
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
    className: "border-blue-500/35 bg-blue-500/10 text-blue-300",
  },
  ESCOLHER: {
    label: "Escolher",
    description: "Selecionar itens preexistentes da Biblioteca Estratégica.",
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

export function MethodBuilder({
  channelId,
  initialProcess,
}: {
  channelId: string;
  initialProcess?: UniversalProcess;
}) {
  const channel = useChannel(channelId);
  const channels = useChannels();
  const collections = useLibraryCollections(channelId);
  const [processType, setProcessType] = useState<UniversalProcess>(initialProcess ?? "theme");
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [draftBlocks, setDraftBlocks] = useState<ActionBlock[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "pending" | "saving" | "saved" | "error">(
    "idle",
  );
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [pendingFileImport, setPendingFileImport] = useState<SharedMethodFile | null>(null);
  const [availablePlugins, setAvailablePlugins] = useState<DiscoveredPlugin[]>([]);
  const [openAIModels, setOpenAIModels] = useState<Array<{ id: string; name: string }>>([]);
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
    let active = true;
    void fetch("/api/plugins")
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao consultar plugins.");
        return response.json() as Promise<{ plugins: DiscoveredPlugin[] }>;
      })
      .then((result) => {
        if (active) setAvailablePlugins(result.plugins);
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
                        {block.type === "ESCOLHER" && block.collectionId
                          ? `Coleção: ${collections.find((item) => item.id === block.collectionId)?.name ?? "não encontrada"}`
                          : block.instructions || "Sem instruções"}
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
            methodBlocks={blocks}
            channelId={channelId}
            collections={collections}
            processType={processType}
            plugins={availablePlugins}
            openAIModels={openAIModels}
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
  methodBlocks,
  channelId,
  collections,
  processType,
  plugins,
  openAIModels,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  channelId: string;
  collections: StrategicCollection[];
  processType: UniversalProcess;
  plugins: DiscoveredPlugin[];
  openAIModels: Array<{ id: string; name: string }>;
  index: number;
  total: number;
  onChange: (patch: Partial<ActionBlock>) => void;
  onMove: (direction: -1 | 1) => void;
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

      {block.type !== "ESCOLHER" && block.type !== "VALIDAR" && (
        <DataContractEditor
          block={block}
          methodBlocks={methodBlocks}
          blockIndex={index}
          processType={processType}
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
                  onChange({ plugin: { pluginId, capabilityId, configuration } });
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
              {Object.entries(configProperties).map(([key, schema]) => (
                <PluginConfigurationField
                  key={key}
                  propertyKey={key}
                  schema={schema}
                  value={block.plugin?.configuration[key]}
                  options={
                    selectedPlugin?.id === "official-openai-gpt" &&
                    key === "model" &&
                    openAIModels.length
                      ? openAIModels.map((model) => ({ value: model.id, label: model.name }))
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
              ))}
              {selectedPlugin?.id === "official-openai-gpt" && (
                <p className="text-[11px] text-muted-foreground">
                  {openAIModels.length
                    ? `${openAIModels.length} modelos disponíveis foram consultados na sua conta OpenAI.`
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
    <div className="mt-6 space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
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

function DataContractEditor({
  block,
  methodBlocks,
  blockIndex,
  processType,
  onChange,
}: {
  block: ActionBlock;
  methodBlocks: ActionBlock[];
  blockIndex: number;
  processType: UniversalProcess;
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
            processType={processType}
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
  processType,
  onChange,
  onRemove,
}: {
  input: BlockInputBinding;
  availableBlocks: ActionBlock[];
  processType: UniversalProcess;
  onChange: (patch: Partial<BlockInputBinding>) => void;
  onRemove: () => void;
}) {
  const sourceBlock = availableBlocks.find((block) => block.id === input.blockId);
  const previousProcesses = PROCESS_ORDER.slice(0, PROCESS_ORDER.indexOf(processType));

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)_32px] items-center gap-2">
        <Input
          value={input.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Nome da entrada"
          className="h-8 text-xs"
        />
        <Select
          value={input.type ?? "text"}
          onValueChange={(type) =>
            onChange({
              type: type as HumanFieldType,
              recordFields:
                type === "records" ? (input.recordFields ?? [newRecordField(0)]) : undefined,
            })
          }
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
        <Button
          size="icon"
          variant="ghost"
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Origem</Label>
          <Select
            value={input.source}
            onValueChange={(source) => {
              if (source === "previous_process") {
                const latestProcess = previousProcesses.at(-1);
                const output = latestProcess
                  ? createProcessOutputFields(latestProcess)[0]
                  : undefined;
                onChange({
                  source: "previous_process",
                  sourceKey: output?.key,
                  blockId: undefined,
                  staticValue: undefined,
                  type: output?.type ?? input.type,
                  recordFields: output?.recordFields,
                });
                return;
              }
              onChange({
                source: source as BlockInputBinding["source"],
                sourceKey: source === "project" ? "title" : undefined,
                blockId: undefined,
                staticValue: undefined,
              });
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="previous_block">Bloco anterior</SelectItem>
              <SelectItem value="previous_process" disabled={!previousProcesses.length}>
                Processo anterior
              </SelectItem>
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
            <Label className="text-[10px] text-muted-foreground">Resultado do processo</Label>
            <Select
              value={input.sourceKey}
              onValueChange={(sourceKey) => {
                const output = previousProcesses
                  .flatMap((process) => createProcessOutputFields(process))
                  .find((candidate) => candidate.key === sourceKey);
                onChange({
                  sourceKey,
                  type: output?.type ?? input.type,
                  recordFields: output?.recordFields,
                });
              }}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Selecione o resultado" />
              </SelectTrigger>
              <SelectContent>
                {previousProcesses.map((process) => {
                  const output = createProcessOutputFields(process)[0];
                  return (
                    <SelectItem key={process} value={output.key}>
                      {PROCESS_META[process].label}: {output.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
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
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(130px,0.8fr)_32px] items-center gap-2">
        <Input
          value={field.label}
          onChange={(event) => onChange({ label: event.target.value })}
          placeholder="Nome da saída"
          className="h-8 text-xs"
        />
        <Select
          value={field.type}
          onValueChange={(type) =>
            onChange({
              type: type as HumanFieldType,
              recordFields:
                type === "records" ? (field.recordFields ?? [newRecordField(0)]) : undefined,
            })
          }
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
        <Button
          size="icon"
          variant="ghost"
          className="size-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
      {usesOptions && (
        <div>
          <Textarea
            value={(field.options ?? []).join("\n")}
            onChange={(event) =>
              onChange({
                options: event.target.value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              })
            }
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
              <Textarea
                className="min-h-20 text-xs sm:col-span-3"
                value={(recordField.options ?? []).join("\n")}
                onChange={(event) =>
                  update(recordField.id, {
                    options: event.target.value
                      .split("\n")
                      .map((option) => option.trim())
                      .filter(Boolean),
                  })
                }
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
