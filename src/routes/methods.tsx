import { useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Blocks,
  Bot,
  CheckCircle2,
  CircleUserRound,
  Code2,
  Copy,
  Download,
  ImagePlus,
  LayoutGrid,
  Layers3,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ChannelAvatar } from "@/components/channel-avatar";
import { MethodAgentCta } from "@/components/method-agent-cta";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROCESS_META,
  PROCESS_ORDER,
  createEmptyMethods,
  type BlockOperator,
  type Channel,
  type ProcessMethod,
  type StrategicCollection,
  type UniversalProcess,
} from "@/lib/domain";
import { useAppPreferences } from "@/lib/app-preferences";
import {
  collectMethodRequirements,
  copyImportedMethods,
  parseMethodImportFile,
  serializeMethodFile,
  serializeMethodPackFile,
  type MethodRequirement,
} from "@/lib/method-file";
import {
  createChannel,
  setChannelMethods,
  updateChannel,
  uploadLocalFile,
  useChannels,
  useLibraryCollections,
} from "@/lib/store";

export const Route = createFileRoute("/methods")({
  head: () => ({
    meta: [
      { title: "Métodos — ContentFlow" },
      { name: "description", content: "Biblioteca global de Métodos salvos nos canais." },
    ],
  }),
  component: MethodsLibraryPage,
});

type MethodEntry = { channel: Channel; processType: UniversalProcess; method: ProcessMethod };
type TransferDraft = {
  name: string;
  channelName: string;
  channelImageUrl?: string;
  methods: ProcessMethod[];
  requirements: Partial<Record<UniversalProcess, MethodRequirement[]>>;
  sourceChannelId?: string;
  isPack: boolean;
};

const OPERATOR_ICON: Record<BlockOperator, typeof Bot> = {
  IA: Bot,
  Humano: CircleUserRound,
  Código: Code2,
};

function MethodsLibraryPage() {
  const channels = useChannels();
  const collections = useLibraryCollections();
  const { methodsLibraryView: view, setMethodsLibraryView } = useAppPreferences();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [processFilter, setProcessFilter] = useState<UniversalProcess | "all">("all");
  const [transfer, setTransfer] = useState<TransferDraft>();
  const [targetChannelId, setTargetChannelId] = useState("");
  const [newChannelName, setNewChannelName] = useState("");
  const [selectedProcesses, setSelectedProcesses] = useState<UniversalProcess[]>([]);

  const entries = useMemo(
    () =>
      channels.flatMap<MethodEntry>((channel) =>
        PROCESS_ORDER.flatMap((processType) => {
          const method = channel.methods[processType];
          return method.blocks.length ? [{ channel, processType, method }] : [];
        }),
      ),
    [channels],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const filteredEntries = entries.filter((entry) => {
    const matchesProcess = processFilter === "all" || entry.processType === processFilter;
    const searchable = [
      entry.channel.name,
      entry.method.name,
      PROCESS_META[entry.processType].label,
      ...entry.method.blocks.map((block) => block.name ?? block.type),
    ];
    return (
      matchesProcess &&
      (!normalizedQuery ||
        searchable.some((value) => value.toLocaleLowerCase("pt-BR").includes(normalizedQuery)))
    );
  });
  const filteredChannels = channels.filter((channel) => {
    const methods = methodsOf(channel);
    return (
      methods.length > 0 &&
      (!normalizedQuery ||
        channel.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery) ||
        methods.some((method) => method.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery)))
    );
  });

  const channelCollections = (channelId: string) =>
    collections.filter((collection) => collection.channelId === channelId);

  function openTransfer(name: string, channel: Channel, methods: ProcessMethod[], isPack: boolean) {
    const requirements = Object.fromEntries(
      methods.map((method) => [
        method.processType,
        collectMethodRequirements(method, channelCollections(channel.id)),
      ]),
    );
    const firstTarget = channels.find((candidate) => candidate.id !== channel.id);
    setTransfer({
      name,
      channelName: channel.name,
      channelImageUrl: channel.methodsImageUrl,
      methods,
      requirements,
      sourceChannelId: channel.id,
      isPack,
    });
    setNewChannelName(channel.name);
    setTargetChannelId(firstTarget?.id ?? "__new__");
    setSelectedProcesses(
      methods
        .filter((method) => !firstTarget?.methods[method.processType]?.blocks.length)
        .map((method) => method.processType),
    );
  }

  async function downloadMethod(entry: MethodEntry) {
    try {
      await downloadMethodPackage(
        serializeMethodFile(entry.method.name, entry.method, channelCollections(entry.channel.id)),
        `${slug(entry.method.name)}.contentflow-method.zip`,
      );
      toast.success("Método exportado", {
        description: "O pacote inclui manifest.json, capa e requisitos de configuração.",
      });
    } catch (error) {
      toast.error("Não foi possível criar o pacote", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function downloadPack(channel: Channel) {
    const methods = methodsOf(channel);
    try {
      await downloadMethodPackage(
        serializeMethodPackFile(
          `Métodos de ${channel.name}`,
          channel.name,
          methods,
          channelCollections(channel.id),
          channel.methodsImageUrl,
        ),
        `metodos-${slug(channel.name)}.contentflow-method-pack.zip`,
      );
      toast.success("Pacote de Métodos exportado", {
        description: `${methods.length} ${methods.length === 1 ? "Método incluído" : "Métodos incluídos"}, com suas capas.`,
      });
    } catch (error) {
      toast.error("Não foi possível criar o pacote", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function importFile(file: File) {
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
      const methods =
        imported.format === "contentflow-method" ? [imported.method] : imported.methods;
      const channelName =
        imported.format === "contentflow-method" ? imported.name : imported.channelName;
      setTransfer({
        name: imported.name,
        channelName,
        channelImageUrl:
          imported.format === "contentflow-method-pack" ? imported.channelImageUrl : undefined,
        methods,
        requirements:
          imported.format === "contentflow-method"
            ? { [imported.method.processType]: imported.requirements ?? [] }
            : (imported.requirements ?? {}),
        isPack: imported.format === "contentflow-method-pack",
      });
      setNewChannelName(channelName);
      setTargetChannelId(channels[0]?.id ?? "__new__");
      setSelectedProcesses(
        methods
          .filter((method) => !channels[0]?.methods[method.processType]?.blocks.length)
          .map((method) => method.processType),
      );
    } catch (error) {
      toast.error("Não foi possível importar", {
        description: error instanceof Error ? error.message : "Arquivo inválido.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function selectTarget(value: string) {
    setTargetChannelId(value);
    const target = channels.find((channel) => channel.id === value);
    setSelectedProcesses(
      (transfer?.methods ?? [])
        .filter(
          (method) => value === "__new__" || !target?.methods[method.processType]?.blocks.length,
        )
        .map((method) => method.processType),
    );
  }

  async function confirmTransfer() {
    if (!transfer || !selectedProcesses.length) return;
    const selected = transfer.methods.filter((method) =>
      selectedProcesses.includes(method.processType),
    );
    const copied = copyImportedMethods(selected, createId, {
      preserveLocalConnections: Boolean(transfer.sourceChannelId),
    });
    try {
      if (targetChannelId === "__new__") {
        const methods = createEmptyMethods();
        for (const method of copied) methods[method.processType] = method;
        await createChannel({
          id: `ch-${crypto.randomUUID()}`,
          name: newChannelName.trim(),
          handle: "",
          color: "#2563EB",
          subscribers: "—",
          description: "",
          niche: "",
          language: "PT-BR",
          activeProjects: 0,
          frequency: "1x / semana",
          nextPublish: "",
          currentProjectProgress: 0,
          status: "healthy",
          trend: [],
          methodsImageUrl: transfer.channelImageUrl,
          methods,
        });
      } else {
        const target = channels.find((channel) => channel.id === targetChannelId);
        if (!target) return;
        await setChannelMethods(
          target.id,
          Object.fromEntries(copied.map((method) => [method.processType, method])),
        );
      }
      toast.success(transfer.isPack ? "Pacote importado" : "Método importado", {
        description:
          "Revise os avisos e associe localmente coleções, plugins e contas antes de executar.",
      });
      setTransfer(undefined);
      setSelectedProcesses([]);
    } catch (error) {
      toast.error("Não foi possível concluir a importação", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function setMethodCover(entry: MethodEntry, file?: File) {
    if (!file) return;
    try {
      const imageUrl = (await uploadLocalFile(await prepareCoverImage(file))).url;
      await setChannelMethods(entry.channel.id, {
        [entry.processType]: { ...entry.method, imageUrl },
      });
      toast.success("Capa do Método atualizada");
    } catch (error) {
      toast.error("Não foi possível usar esta imagem", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function setChannelCover(channel: Channel, file?: File) {
    if (!file) return;
    try {
      const imageUrl = (await uploadLocalFile(await prepareCoverImage(file))).url;
      await updateChannel({ ...channel, methodsImageUrl: imageUrl });
      toast.success("Capa do Canal atualizada");
    } catch (error) {
      toast.error("Não foi possível usar esta imagem", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow" }, { label: "Métodos" }]}
        title="Métodos"
        subtitle="Use, compartilhe e gerencie Métodos salvos nos seus canais"
        showNewProject={false}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.json,.contentflow-method.json,.contentflow-method-pack.json,application/zip,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
            <Button size="sm" className="gap-1.5" onClick={() => fileInputRef.current?.click()}>
              <Upload className="size-4" /> Importar
            </Button>
          </>
        }
      />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <MethodAgentCta className="mb-5" />
        <section className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Métodos salvos" value={entries.length} />
          <Stat
            label="Canais com Métodos"
            value={new Set(entries.map((item) => item.channel.id)).size}
          />
          <Stat
            label="Processos cobertos"
            value={new Set(entries.map((item) => item.processType)).size}
            suffix={`de ${PROCESS_ORDER.length}`}
          />
        </section>
        <section className="mt-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscar por nome, Canal, processo ou ação..."
                className="pl-9"
              />
            </div>
            {view === "methods" && (
              <Select
                value={processFilter}
                onValueChange={(value) => setProcessFilter(value as UniversalProcess | "all")}
              >
                <SelectTrigger className="w-full sm:w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os processos</SelectItem>
                  {PROCESS_ORDER.map((process) => (
                    <SelectItem key={process} value={process}>
                      {PROCESS_META[process].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <div className="flex rounded-md border border-border p-0.5">
              <Button
                size="sm"
                variant={view === "channels" ? "secondary" : "ghost"}
                onClick={() => {
                  if (view !== "channels") setMethodsLibraryView("channels");
                }}
                aria-pressed={view === "channels"}
                className="gap-1.5"
              >
                <Layers3 className="size-3.5" /> Canais
              </Button>
              <Button
                size="sm"
                variant={view === "methods" ? "secondary" : "ghost"}
                onClick={() => {
                  if (view !== "methods") setMethodsLibraryView("methods");
                }}
                aria-pressed={view === "methods"}
                className="gap-1.5"
              >
                <LayoutGrid className="size-3.5" /> Métodos
              </Button>
            </div>
          </div>
          {view === "methods" && filteredEntries.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredEntries.map((entry) => (
                <MethodCard
                  key={`${entry.channel.id}-${entry.processType}`}
                  entry={entry}
                  canCopy={channels.some((channel) => channel.id !== entry.channel.id)}
                  onDownload={() => void downloadMethod(entry)}
                  onCopy={() =>
                    openTransfer(entry.method.name, entry.channel, [entry.method], false)
                  }
                  onCover={(file) => void setMethodCover(entry, file)}
                />
              ))}
            </div>
          )}
          {view === "channels" && filteredChannels.length > 0 && (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filteredChannels.map((channel) => (
                <ChannelMethodsCard
                  key={channel.id}
                  channel={channel}
                  methods={methodsOf(channel)}
                  canCopy={channels.some((candidate) => candidate.id !== channel.id)}
                  onDownload={() => void downloadPack(channel)}
                  onCopy={() =>
                    openTransfer(`Métodos de ${channel.name}`, channel, methodsOf(channel), true)
                  }
                  onCover={(file) => void setChannelCover(channel, file)}
                />
              ))}
            </div>
          )}
          {((view === "methods" && !filteredEntries.length) ||
            (view === "channels" && !filteredChannels.length)) && <EmptyState />}
        </section>
      </main>
      <ImportDialog
        transfer={transfer}
        channels={channels}
        collections={collections}
        targetChannelId={targetChannelId}
        newChannelName={newChannelName}
        selectedProcesses={selectedProcesses}
        onTargetChange={selectTarget}
        onNewChannelNameChange={setNewChannelName}
        onSelectedProcessesChange={setSelectedProcesses}
        onClose={() => setTransfer(undefined)}
        onConfirm={() => void confirmTransfer()}
      />
    </AppShell>
  );
}

function ImportDialog({
  transfer,
  channels,
  collections,
  targetChannelId,
  newChannelName,
  selectedProcesses,
  onTargetChange,
  onNewChannelNameChange,
  onSelectedProcessesChange,
  onClose,
  onConfirm,
}: {
  transfer?: TransferDraft;
  channels: Channel[];
  collections: StrategicCollection[];
  targetChannelId: string;
  newChannelName: string;
  selectedProcesses: UniversalProcess[];
  onTargetChange: (value: string) => void;
  onNewChannelNameChange: (value: string) => void;
  onSelectedProcessesChange: (value: UniversalProcess[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const target = channels.find((channel) => channel.id === targetChannelId);
  return (
    <Dialog open={Boolean(transfer)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {transfer?.isPack ? "Importar pacote de Métodos" : "Adicionar Método a um Canal"}
          </DialogTitle>
          <DialogDescription>
            {transfer?.name}. Revise o destino, os conflitos e a preparação necessária.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">Destino</label>
            <Select value={targetChannelId} onValueChange={onTargetChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o destino" />
              </SelectTrigger>
              <SelectContent>
                {channels
                  .filter((channel) => channel.id !== transfer?.sourceChannelId)
                  .map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                <SelectItem value="__new__">Criar um Canal novo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {targetChannelId === "__new__" && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Nome do novo Canal</label>
              <Input
                value={newChannelName}
                maxLength={200}
                onChange={(event) => onNewChannelNameChange(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-2">
            <p className="text-xs font-medium">Métodos que serão importados</p>
            {transfer?.methods.map((method) => {
              const conflict = Boolean(target?.methods[method.processType]?.blocks.length);
              const checked = selectedProcesses.includes(method.processType);
              return (
                <label
                  key={method.processType}
                  className="flex items-start gap-3 rounded-lg border border-border p-3"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      onSelectedProcessesChange(
                        value
                          ? [...selectedProcesses, method.processType]
                          : selectedProcesses.filter((process) => process !== method.processType),
                      )
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{method.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {PROCESS_META[method.processType].label} · {method.blocks.length}{" "}
                      {method.blocks.length === 1 ? "bloco" : "blocos"}
                    </span>
                    {conflict && (
                      <span className="mt-1 block text-[11px] text-warning">
                        Já existe um Método neste processo. Marque para substituí-lo.
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
          <DependencyWarnings
            transfer={transfer}
            selectedProcesses={selectedProcesses}
            target={target}
            targetCollections={collections.filter(
              (collection) => collection.channelId === target?.id,
            )}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              !selectedProcesses.length ||
              (targetChannelId === "__new__" && newChannelName.trim().length < 2)
            }
            onClick={onConfirm}
          >
            <Copy className="mr-1.5 size-4" />{" "}
            {targetChannelId === "__new__" ? "Criar e importar" : "Importar selecionados"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DependencyWarnings({
  transfer,
  selectedProcesses,
  target,
  targetCollections,
}: {
  transfer?: TransferDraft;
  selectedProcesses: UniversalProcess[];
  target?: Channel;
  targetCollections: StrategicCollection[];
}) {
  if (!transfer) return null;
  const requirements = selectedProcesses.flatMap((process) => transfer.requirements[process] ?? []);
  if (!requirements.length) {
    return (
      <div className="flex gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs">
        <CheckCircle2 className="size-4 shrink-0 text-success" /> Nenhuma dependência externa foi
        declarada.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-warning/35 bg-warning/5 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="size-4 text-warning" /> Preparação necessária
      </div>
      <div className="mt-3 space-y-3 text-xs">
        {requirements.map((requirement, index) => {
          if (requirement.kind === "previous_process") {
            const included = selectedProcesses.includes(requirement.processType);
            const available = Boolean(target?.methods[requirement.processType]?.blocks.length);
            return (
              <p key={`${requirement.kind}-${index}`}>
                <strong>Processo anterior:</strong> {PROCESS_META[requirement.processType].label}
                {requirement.sourceKey ? `, entrega “${requirement.sourceKey}”` : ""}.{" "}
                {included
                  ? "Será importado junto."
                  : available
                    ? "Já existe no Canal de destino."
                    : "Crie ou importe esse Método antes de executar."}
              </p>
            );
          }
          if (requirement.kind === "plugin") {
            return (
              <p key={`${requirement.kind}-${index}`}>
                <strong>Plugin:</strong> {requirement.pluginId} / {requirement.capabilityId}.{" "}
                {requirement.connectionRequired
                  ? "Uma conta ou conexão local deverá ser associada."
                  : "Verifique se está instalado e ativo."}
              </p>
            );
          }
          const localCollection = targetCollections.find(
            (collection) =>
              collection.name.toLocaleLowerCase("pt-BR") ===
              requirement.name.toLocaleLowerCase("pt-BR"),
          );
          return (
            <div key={`${requirement.kind}-${index}`}>
              <p>
                <strong>Coleção estratégica:</strong> {requirement.name}.{" "}
                {localCollection
                  ? "Foi encontrada uma coleção com esse nome; confirme o vínculo e o schema."
                  : "Crie essa coleção e vincule-a ao bloco antes de executar."}
              </p>
              {requirement.fields.length ? (
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {requirement.fields.map((field) => (
                    <li key={field.key}>
                      {field.label} — {field.type}
                      {field.required ? " (obrigatório)" : " (opcional)"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  O arquivo não informa os campos; consulte o autor do Método.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Cover({
  imageUrl,
  alt,
  onChange,
}: {
  imageUrl?: string;
  alt: string;
  onChange: (file?: File) => void;
}) {
  return (
    <div className="group relative aspect-video overflow-hidden rounded-lg border border-border bg-secondary">
      <img
        src={imageUrl || "/brand/contentflow-mark.png"}
        alt={alt}
        className={`size-full ${imageUrl ? "object-cover" : "object-contain p-8"}`}
      />
      <label className="absolute inset-0 grid cursor-pointer place-items-center bg-background/70 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1.5 text-xs font-medium">
          <ImagePlus className="size-3.5" /> Alterar capa
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(event) => {
            onChange(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </label>
    </div>
  );
}

function MethodCard({
  entry,
  canCopy,
  onDownload,
  onCopy,
  onCover,
}: {
  entry: MethodEntry;
  canCopy: boolean;
  onDownload: () => void;
  onCopy: () => void;
  onCover: (file?: File) => void;
}) {
  const process = PROCESS_META[entry.processType];
  return (
    <article className="flex min-h-96 flex-col rounded-xl border border-border bg-card p-4">
      <Cover
        imageUrl={entry.method.imageUrl}
        alt={`Capa de ${entry.method.name}`}
        onChange={onCover}
      />
      <header className="mt-4 min-w-0">
        <h2 className="line-clamp-2 text-sm font-semibold">{entry.method.name}</h2>
        <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
          <ChannelAvatar channel={entry.channel} size="sm" className="!size-5 !text-[9px]" />
          <span className="truncate">{entry.channel.name}</span>
        </div>
      </header>
      <div className="mt-3">
        <Badge variant="secondary" className="text-[10px]">
          {process.label} · {entry.method.blocks.length}{" "}
          {entry.method.blocks.length === 1 ? "bloco" : "blocos"}
        </Badge>
      </div>
      <div className="mt-4 flex-1 space-y-1.5 text-[11px] text-muted-foreground">
        {entry.method.blocks.slice(0, 4).map((block, index) => {
          const OperatorIcon = OPERATOR_ICON[block.operator];
          return (
            <div key={block.id} className="flex items-center gap-1.5">
              <span>
                {index + 1}. {block.name ?? block.type}
              </span>
              <OperatorIcon className="size-3" />
            </div>
          );
        })}
        {entry.method.blocks.length > 4 && <p>+ {entry.method.blocks.length - 4} ações</p>}
      </div>
      <footer className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <Button asChild size="sm" variant="ghost">
          <Link
            to="/channel/$channelId/methods"
            params={{ channelId: entry.channel.id }}
            search={{ process: entry.processType }}
          >
            Abrir <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="mr-1 size-3.5" /> Compartilhar
        </Button>
        <Button size="sm" variant="outline" disabled={!canCopy} onClick={onCopy}>
          <Copy className="mr-1 size-3.5" /> Reutilizar
        </Button>
      </footer>
    </article>
  );
}

function ChannelMethodsCard({
  channel,
  methods,
  canCopy,
  onDownload,
  onCopy,
  onCover,
}: {
  channel: Channel;
  methods: ProcessMethod[];
  canCopy: boolean;
  onDownload: () => void;
  onCopy: () => void;
  onCover: (file?: File) => void;
}) {
  return (
    <article className="flex min-h-96 flex-col rounded-xl border border-border bg-card p-4">
      <Cover
        imageUrl={channel.methodsImageUrl}
        alt={`Capa de ${channel.name}`}
        onChange={onCover}
      />
      <header className="mt-4 flex items-center gap-3">
        <ChannelAvatar channel={channel} size="lg" />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">{channel.name}</h2>
          <p className="text-xs text-muted-foreground">
            {methods.length} de {PROCESS_ORDER.length} processos configurados
          </p>
        </div>
      </header>
      <div className="mt-4 flex-1 space-y-2">
        {methods.map((method) => (
          <div
            key={method.processType}
            className="flex items-center justify-between gap-3 rounded-md bg-secondary/50 px-2.5 py-2 text-xs"
          >
            <span className="truncate">{method.name}</span>
            <Badge variant="outline" className="shrink-0 text-[9px]">
              {PROCESS_META[method.processType].label}
            </Badge>
          </div>
        ))}
      </div>
      <footer className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <Button asChild size="sm" variant="ghost">
          <Link
            to="/channel/$channelId/methods"
            params={{ channelId: channel.id }}
            search={{ process: methods[0]?.processType ?? "theme" }}
          >
            Abrir <ArrowRight className="ml-1 size-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" onClick={onDownload}>
          <Download className="mr-1 size-3.5" /> Compartilhar
        </Button>
        <Button size="sm" variant="outline" disabled={!canCopy} onClick={onCopy}>
          <Copy className="mr-1 size-3.5" /> Reutilizar
        </Button>
      </footer>
    </article>
  );
}

function EmptyState() {
  return (
    <div className="mt-4 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
      <div>
        <Blocks className="mx-auto size-7 text-muted-foreground" />
        <h2 className="mt-3 text-sm font-semibold">Nenhum Método encontrado</h2>
        <p className="mt-1 max-w-md text-xs text-muted-foreground">
          Crie Métodos dentro de um Canal ou importe um arquivo compartilhado.
        </p>
      </div>
    </div>
  );
}
function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">
        {value}{" "}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );
}
function methodsOf(channel: Channel) {
  return PROCESS_ORDER.map((process) => channel.methods[process]).filter(
    (method) => method.blocks.length,
  );
}
function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}
function slug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
async function downloadMethodPackage(manifest: string, fileName: string) {
  const response = await fetch("/api/method-packages/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ manifest }),
  });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error ?? "O pacote não pôde ser criado.");
  }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function prepareCoverImage(file: File) {
  if (!file.type.match(/^image\/(png|jpeg|webp)$/))
    throw new Error("Use uma imagem PNG, JPEG ou WebP.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const scale = Math.min(1, 1200 / image.naturalWidth, 675 / image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("O navegador não conseguiu preparar a imagem.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.82),
    );
    if (!blob || blob.size > 1_500_000)
      throw new Error("A imagem continua muito grande após a otimização.");
    return new File([blob], "contentflow-cover.webp", { type: "image/webp" });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
