import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  AudioLines,
  Bot,
  Boxes,
  CheckCircle2,
  CircleUserRound,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileText,
  FolderPlus,
  Image,
  KeyRound,
  LoaderCircle,
  Pencil,
  Plug,
  RefreshCw,
  Search,
  Sparkles,
  SlidersHorizontal,
  ShieldCheck,
  SquareArrowOutUpRight,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { PROCESS_META, type BlockType, type UniversalProcess } from "@/lib/domain";
import { ECOSYSTEM_DOWNLOADS } from "@/lib/ecosystem-downloads";
import type { PluginDeliveryType, PluginManifest } from "@/lib/plugin-contract";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins — ContentFlow" },
      {
        name: "description",
        content: "Gerenciamento dos plugins locais do ContentFlow.",
      },
    ],
  }),
  component: PluginsPage,
});

type DiscoveredPlugin = {
  id: string;
  source: "installed" | "local";
  directory: string;
  manifest: PluginManifest;
  enabled: boolean;
  executable: boolean;
  sandboxed: boolean;
  networkIsolation: boolean;
  profileCount?: number;
};

type PluginIssue = { directory: string; message: string };
type PluginResponse = {
  plugins: DiscoveredPlugin[];
  issues: PluginIssue[];
};
type PluginUpdate = {
  id: string;
  currentVersion: string;
  version?: string;
  updateAvailable: boolean;
};
type PluginMethodDependency = {
  channelId: string;
  channelName: string;
  processType: UniversalProcess;
  blockId: string;
  blockName: string;
  capabilityId: string;
};

type PluginProfileUsage = PluginMethodDependency & {
  methodName: string;
  role: "primary" | "fallback";
  fallbackPosition?: number;
};

type ManagedPluginProfile = {
  id: string;
  pluginId: string;
  name: string;
  alias: string;
  createdAt: string;
  updatedAt: string;
  usages: PluginProfileUsage[];
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

const BLOCK_LABEL: Record<BlockType, string> = {
  BUSCAR: "Buscar",
  ESCOLHER: "Escolher",
  CRIAR: "Criar",
  VALIDAR: "Validar",
};

const PERMISSION_LABEL: Record<string, string> = {
  network: "Acessar a internet",
  "filesystem:read": "Ler arquivos liberados",
  "filesystem:write": "Criar arquivos do projeto",
  process: "Executar programas como FFmpeg",
  worker: "Usar processamento paralelo",
  native: "Usar bibliotecas nativas",
};

const DELIVERY_META: Record<
  PluginDeliveryType,
  { label: string; icon: typeof FileText; className: string }
> = {
  text: { label: "Texto", icon: FileText, className: "bg-sky-500/10 text-sky-600" },
  image: { label: "Imagem", icon: Image, className: "bg-violet-500/10 text-violet-600" },
  audio: { label: "Áudio", icon: AudioLines, className: "bg-amber-500/10 text-amber-600" },
  video: { label: "Vídeo", icon: Video, className: "bg-rose-500/10 text-rose-600" },
  processing: {
    label: "Processamento",
    icon: SlidersHorizontal,
    className: "bg-emerald-500/10 text-emerald-600",
  },
};

function deliveryTypes(plugin: DiscoveredPlugin) {
  return plugin.manifest.deliveryTypes?.length
    ? plugin.manifest.deliveryTypes
    : (["processing"] satisfies PluginDeliveryType[]);
}

function PluginsPage() {
  const [data, setData] = useState<PluginResponse>({ plugins: [], issues: [] });
  const [loading, setLoading] = useState(true);
  const [updates, setUpdates] = useState<Record<string, PluginUpdate>>({});
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [search, setSearch] = useState("");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | PluginDeliveryType>("all");
  const [blockFilter, setBlockFilter] = useState<"all" | BlockType>("all");
  const [processFilter, setProcessFilter] = useState<"all" | UniversalProcess>("all");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/plugins");
      if (!response.ok) throw new Error("A API local não respondeu.");
      setData((await response.json()) as PluginResponse);
    } catch (error) {
      toast.error("Não foi possível carregar os plugins", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const checkUpdates = useCallback(async (notify = false) => {
    setCheckingUpdates(true);
    try {
      const response = await fetch(`/api/plugins/updates${notify ? "?refresh=true" : ""}`);
      const result = (await response.json()) as { updates?: PluginUpdate[]; error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Não foi possível consultar as atualizações.");
      const next = Object.fromEntries((result.updates ?? []).map((update) => [update.id, update]));
      setUpdates(next);
      if (notify) {
        const count = Object.values(next).filter((update) => update.updateAvailable).length;
        toast.success(
          count
            ? `${count} ${count === 1 ? "plugin tem" : "plugins têm"} atualização`
            : "Todos os plugins estão atualizados",
        );
      }
    } catch (error) {
      if (notify)
        toast.error("Não foi possível verificar atualizações", {
          description: error instanceof Error ? error.message : undefined,
        });
    } finally {
      setCheckingUpdates(false);
    }
  }, []);

  const refreshPluginsAndUpdates = useCallback(async () => {
    await refresh();
    await checkUpdates();
  }, [checkUpdates, refresh]);

  useEffect(() => {
    void refresh();
    void checkUpdates();
  }, [checkUpdates, refresh]);

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredPlugins = data.plugins.filter((plugin) => {
    const capabilities = plugin.manifest.capabilities;
    const matchesSearch =
      !normalizedSearch ||
      [plugin.manifest.name, plugin.manifest.description, plugin.manifest.author, plugin.id].some(
        (value) => value.toLocaleLowerCase().includes(normalizedSearch),
      );
    const matchesDelivery =
      deliveryFilter === "all" || deliveryTypes(plugin).includes(deliveryFilter);
    const matchesBlock =
      blockFilter === "all" ||
      capabilities.some((capability) => capability.blockTypes.includes(blockFilter));
    const matchesProcess =
      processFilter === "all" ||
      capabilities.some((capability) => capability.processTypes?.includes(processFilter));
    return matchesSearch && matchesDelivery && matchesBlock && matchesProcess;
  });
  const filtersActive =
    Boolean(normalizedSearch) ||
    deliveryFilter !== "all" ||
    blockFilter !== "all" ||
    processFilter !== "all";

  function clearFilters() {
    setSearch("");
    setDeliveryFilter("all");
    setBlockFilter("all");
    setProcessFilter("all");
  }

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow" }, { label: "Plugins" }]}
        title="Plugins"
        subtitle="Gerencie as ferramentas que executam blocos de IA e Código"
        showNewProject={false}
        actions={
          <div className="flex items-center gap-2">
            <InstallPluginDialog onInstalled={refresh} />
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={checkingUpdates}
              onClick={() => {
                void refresh();
                void checkUpdates(true);
              }}
            >
              <RefreshCw
                className={loading || checkingUpdates ? "size-4 animate-spin" : "size-4"}
              />
              Verificar atualizações
            </Button>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section className="mb-4 rounded-xl border border-brand/25 bg-card/55 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-md">
              <h2 className="text-sm font-semibold">Componentes externos</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O ContentFlow é instalado sem plugins. Baixe o pacote, extraia uma vez e instale
                todos de uma vez pela pasta raiz — ou informe a pasta de apenas um plugin.
              </p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[44rem]">
              <Button asChild variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5">
                <a href={ECOSYSTEM_DOWNLOADS.plugins} target="_blank" rel="noreferrer">
                  <Boxes className="size-4 shrink-0 text-brand-soft" />
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-semibold">Baixar plugins</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      Mesmo fluxo para qualquer autor
                    </span>
                  </span>
                  <Download className="ml-auto size-3.5 shrink-0" />
                </a>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5">
                <a href={ECOSYSTEM_DOWNLOADS.browserBridge} target="_blank" rel="noreferrer">
                  <SquareArrowOutUpRight className="size-4 shrink-0 text-brand-soft" />
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-semibold">Baixar Browser Bridge</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      Somente para automação web
                    </span>
                  </span>
                  <Download className="ml-auto size-3.5 shrink-0" />
                </a>
              </Button>
              <Button asChild variant="outline" className="h-auto justify-start gap-3 px-3 py-2.5">
                <a
                  href={ECOSYSTEM_DOWNLOADS.pluginDevelopmentSkill}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Sparkles className="size-4 shrink-0 text-brand-soft" />
                  <span className="min-w-0 text-left">
                    <span className="block text-xs font-semibold">Baixar skill de plugins</span>
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      Para criar com um agente de IA
                    </span>
                  </span>
                  <Download className="ml-auto size-3.5 shrink-0" />
                </a>
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{data.plugins.length} plugins</Badge>
            {filtersActive && (
              <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={clearFilters}>
                Limpar filtros
              </Button>
            )}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(15rem,1fr)_repeat(3,minmax(9rem,0.42fr))]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pesquisar plugins por nome..."
                className="pl-9"
              />
            </div>
            <Select
              value={deliveryFilter}
              onValueChange={(value) => setDeliveryFilter(value as "all" | PluginDeliveryType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Capacidade" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as capacidades</SelectItem>
                {Object.entries(DELIVERY_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={blockFilter}
              onValueChange={(value) => setBlockFilter(value as "all" | BlockType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Bloco" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os blocos</SelectItem>
                {Object.entries(BLOCK_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={processFilter}
              onValueChange={(value) => setProcessFilter(value as "all" | UniversalProcess)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Processo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os processos</SelectItem>
                {Object.entries(PROCESS_META).map(([value, meta]) => (
                  <SelectItem key={value} value={value}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Procurando plugins locais...
            </span>
          </div>
        ) : filteredPlugins.length ? (
          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={`${plugin.source}-${plugin.id}`}
                plugin={plugin}
                update={updates[plugin.id]}
                onChanged={refreshPluginsAndUpdates}
              />
            ))}
          </section>
        ) : (
          <section className="mt-5 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
            <div>
              <Plug className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-semibold">
                {data.plugins.length
                  ? "Nenhum plugin corresponde aos filtros"
                  : "Nenhum plugin instalado ainda"}
              </h2>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                {data.plugins.length
                  ? "Ajuste a pesquisa ou limpe os filtros para voltar a visualizar o catálogo."
                  : "A interface já está preparada para descobrir plugins reais. Nenhum dado de exemplo foi criado."}
              </p>
              {filtersActive && (
                <Button size="sm" variant="outline" className="mt-4" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              )}
            </div>
          </section>
        )}

        {data.issues.length > 0 && (
          <section className="mt-5 rounded-xl border border-warning/40 bg-warning/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-warning">
              <AlertTriangle className="size-4" /> Manifestos que precisam de correção
            </div>
            <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
              {data.issues.map((issue) => (
                <li key={issue.directory}>
                  <code>{issue.directory}</code>: {issue.message}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </AppShell>
  );
}

function InstallPluginDialog({ onInstalled }: { onInstalled: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [folderPath, setFolderPath] = useState("");
  const [installing, setInstalling] = useState(false);
  const [mode, setMode] = useState<"install" | "development">("install");

  async function install() {
    setInstalling(true);
    try {
      const response = await fetch(
        mode === "install"
          ? "/api/plugins/install-from-folder"
          : "/api/plugins/link-development-folder",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: folderPath }),
        },
      );
      const result = (await response.json()) as {
        installed?: string[];
        skipped?: string[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível instalar os plugins.");
      toast.success(
        mode === "install"
          ? result.installed?.length === 1
            ? "Plugin instalado"
            : `${result.installed?.length ?? 0} plugins instalados`
          : "Pasta de desenvolvimento conectada",
        {
          description:
            mode === "install" && result.skipped?.length
              ? `${result.skipped.length} já estavam instalados. Confira as permissões dos novos plugins.`
              : "Confira as permissões e clique em Ativar e permitir.",
        },
      );
      setFolderPath("");
      setOpen(false);
      await onInstalled();
    } catch (error) {
      toast.error("Não foi possível instalar o plugin", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setInstalling(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <FolderPlus className="size-4" /> Instalar plugin
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Instalar plugin criado por você ou pela comunidade</DialogTitle>
          <DialogDescription>
            Cole o caminho da pasta de um plugin ou da raiz do pacote extraído. O pacote instala
            vários plugins de uma vez, sem sobrescrever os já instalados.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <Button
            size="sm"
            variant={mode === "install" ? "default" : "ghost"}
            onClick={() => setMode("install")}
          >
            Instalar uma cópia
          </Button>
          <Button
            size="sm"
            variant={mode === "development" ? "default" : "ghost"}
            onClick={() => setMode("development")}
          >
            Usar pasta ao vivo
          </Button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="plugin-folder-path">Pasta do plugin ou pacote</Label>
          <Input
            id="plugin-folder-path"
            value={folderPath}
            placeholder="C:\\Downloads\\ContentFlow-Plugins"
            onChange={(event) => setFolderPath(event.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {mode === "install"
              ? "O ContentFlow aceita o caminho com ou sem aspas, valida todo o conjunto e guarda uma cópia de cada plugin."
              : "O caminho pode ter aspas. Alterações na pasta aparecem ao atualizar, e desconectar não apaga seus arquivos."}
          </p>
        </div>
        <Button disabled={installing || !folderPath.trim()} onClick={() => void install()}>
          {installing && <LoaderCircle className="mr-1.5 size-4 animate-spin" />}
          {mode === "install" ? "Validar e instalar" : "Conectar para desenvolvimento"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function PluginCard({
  plugin,
  update,
  onChanged,
}: {
  plugin: DiscoveredPlugin;
  update?: PluginUpdate;
  onChanged: () => Promise<void>;
}) {
  const { manifest } = plugin;
  const types = deliveryTypes(plugin);
  const [open, setOpen] = useState(false);
  const [iconFailed, setIconFailed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const initials = manifest.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join("");

  useEffect(() => {
    setIconFailed(false);
  }, [manifest.branding?.iconPath, manifest.version, plugin.id]);

  async function removePlugin() {
    const action = plugin.source === "local" ? "desconectar" : "desinstalar";
    setRemoving(true);
    try {
      const dependencyResponse = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/dependencies`,
      );
      const dependencyResult = (await dependencyResponse.json()) as {
        dependencies?: PluginMethodDependency[];
        error?: string;
      };
      if (!dependencyResponse.ok) {
        throw new Error(dependencyResult.error ?? "Não foi possível verificar as dependências.");
      }
      const dependencies = dependencyResult.dependencies ?? [];
      const dependencySummary = dependencies.length
        ? `\n\nEste plugin é usado por ${dependencies.length} bloco(s):\n${dependencies
            .slice(0, 8)
            .map(
              (dependency) =>
                `• ${dependency.channelName} › ${PROCESS_META[dependency.processType].label} › ${dependency.blockName}`,
            )
            .join(
              "\n",
            )}${dependencies.length > 8 ? `\n• e mais ${dependencies.length - 8}` : ""}\n\nOs Métodos ficarão bloqueados até você escolher outro plugin. Outputs históricos serão preservados.`
        : "\n\nNenhum Método depende deste plugin. Outputs históricos serão preservados.";
      if (!window.confirm(`Deseja ${action} ${manifest.name}?${dependencySummary}`)) return;

      const confirmation = dependencies.length ? "?confirmDependencies=true" : "";
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}${confirmation}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? `Não foi possível ${action} o plugin.`);
      }
      toast.success(plugin.source === "local" ? "Pasta desconectada" : "Plugin desinstalado");
      setOpen(false);
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível remover o plugin", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setRemoving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Abrir detalhes de ${manifest.name}`}
          className="group relative flex aspect-square min-h-40 flex-col items-center justify-center overflow-hidden rounded-2xl border border-border bg-card/55 p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-brand/45 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60"
        >
          <span className="absolute right-3 top-3 flex items-center gap-2">
            {update?.updateAvailable && (
              <span
                className="size-2 rounded-full bg-sky-500 ring-4 ring-sky-500/10"
                title={`Atualização disponível: v${update.version}`}
              >
                <span className="sr-only">Atualização disponível</span>
              </span>
            )}
            {!plugin.enabled && (
              <span
                className="size-2 rounded-full bg-warning ring-4 ring-warning/10"
                title="Plugin ainda não ativado"
              >
                <span className="sr-only">Plugin ainda não ativado</span>
              </span>
            )}
          </span>
          <span className="grid size-14 place-items-center rounded-2xl border border-border/70 bg-gradient-to-br from-brand/15 to-secondary text-xl font-semibold tracking-tight text-brand-soft transition-transform group-hover:scale-105">
            {manifest.branding?.iconPath && !iconFailed ? (
              <img
                src={`/api/plugins/${encodeURIComponent(plugin.id)}/icon?v=${encodeURIComponent(manifest.version)}`}
                alt=""
                className="size-9 object-contain"
                onError={() => setIconFailed(true)}
              />
            ) : (
              initials || <Plug className="size-6" />
            )}
          </span>
          <h2 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug">{manifest.name}</h2>
          <p className="mt-1.5 line-clamp-3 min-h-[2.75rem] max-w-[15rem] text-[11px] leading-snug text-muted-foreground">
            {manifest.description}
          </p>
          {manifest.profileSetup && (
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-brand-soft">
              <CircleUserRound className="size-3" /> {plugin.profileCount ?? 0}{" "}
              {plugin.profileCount === 1 ? "perfil" : "perfis"}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <div className="flex items-start gap-3 pr-8 text-left">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-border bg-gradient-to-br from-brand/15 to-secondary text-base font-semibold text-brand-soft">
              {manifest.branding?.iconPath && !iconFailed ? (
                <img
                  src={`/api/plugins/${encodeURIComponent(plugin.id)}/icon?v=${encodeURIComponent(manifest.version)}`}
                  alt=""
                  className="size-8 object-contain"
                  onError={() => setIconFailed(true)}
                />
              ) : (
                initials || <Plug className="size-5" />
              )}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{manifest.name}</DialogTitle>
                <Badge variant="secondary" className="text-[10px]">
                  v{manifest.version}
                </Badge>
                {!plugin.enabled && (
                  <Badge variant="outline" className="text-[10px] text-warning">
                    Desativado
                  </Badge>
                )}
              </div>
              <DialogDescription className="mt-1">{manifest.description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="grid gap-3 rounded-xl border border-border bg-muted/20 p-3 text-xs sm:grid-cols-2">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Fornecedor</p>
            <p className="mt-1 font-medium">{manifest.author}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Origem</p>
            <p className="mt-1 font-medium">
              {plugin.source === "installed" ? "Instalado localmente" : "Pasta de desenvolvimento"}
            </p>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Identificador
            </p>
            <code className="mt-1 block truncate text-[11px]">{plugin.id}</code>
          </div>
        </div>

        <section>
          <h3 className="text-xs font-semibold">Entregas e capacidades</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {types.map((type) => {
              const meta = DELIVERY_META[type];
              const Icon = meta.icon;
              return (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium ${meta.className}`}
                >
                  <Icon className="size-3" /> {meta.label}
                </span>
              );
            })}
          </div>
          <div className="mt-3 divide-y divide-border rounded-xl border border-border px-3">
            {manifest.capabilities.map((capability) => (
              <div key={capability.id} className="py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {capability.operator === "IA" ? (
                    <Bot className="size-3.5 text-brand-soft" />
                  ) : (
                    <Code2 className="size-3.5 text-brand-soft" />
                  )}
                  <span className="text-xs font-medium">{capability.id}</span>
                  <Badge variant="outline" className="ml-auto text-[9px]">
                    {capability.operator}
                  </Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {capability.blockTypes.map((block) => (
                    <Badge key={block} variant="secondary" className="text-[9px]">
                      {BLOCK_LABEL[block]}
                    </Badge>
                  ))}
                  {(capability.processTypes ?? []).map((process) => (
                    <Badge key={process} variant="outline" className="text-[9px]">
                      {PROCESS_META[process as UniversalProcess].label}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-muted/15 p-3">
          <div className="flex items-center gap-2 text-xs font-semibold">
            <ShieldCheck className="size-3.5 text-brand-soft" /> Permissões declaradas
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {manifest.permissions.length ? (
              manifest.permissions.map((permission) => (
                <Badge key={permission} variant="outline" className="text-[9px]">
                  {PERMISSION_LABEL[permission] ?? permission}
                </Badge>
              ))
            ) : (
              <span className="text-[11px] text-muted-foreground">Sem permissões adicionais.</span>
            )}
          </div>
        </section>

        <CommunityAccessPanel plugin={plugin} onChanged={onChanged} />

        {manifest.secretKeys?.length ? <PluginConnectionsPanel plugin={plugin} /> : null}

        {manifest.profileSetup && <PluginProfilesPanel plugin={plugin} />}

        {plugin.source === "installed" && (
          <UpdateInstalledPluginPanel plugin={plugin} update={update} onChanged={onChanged} />
        )}

        <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
          {manifest.homepage && (
            <Button size="sm" variant="ghost" className="gap-1.5" asChild>
              <a href={manifest.homepage} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" /> Site do plugin
              </a>
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportManifest(plugin)}
          >
            <Download className="size-3.5" /> Exportar manifesto
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto gap-1.5 text-destructive"
            disabled={removing}
            onClick={() => void removePlugin()}
          >
            {removing ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Trash2 className="size-3.5" />
            )}
            {plugin.source === "local" ? "Desconectar pasta" : "Desinstalar"}
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function PluginConnectionsPanel({ plugin }: { plugin: DiscoveredPlugin }) {
  const secretKeys = plugin.manifest.secretKeys ?? [];
  const [connections, setConnections] = useState<LocalPluginConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [editingSecrets, setEditingSecrets] = useState<Record<string, string>>({});

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
    setSaving(true);
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
      toast.success("Conexão criada", {
        description: "As credenciais foram protegidas no cofre do sistema.",
      });
    } catch (error) {
      toast.error("Não foi possível criar a conexão", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function updateConnection(connection: LocalPluginConnection) {
    setSaving(true);
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/connections/${encodeURIComponent(connection.id)}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editingName, secrets: editingSecrets }),
        },
      );
      const result = (await response.json()) as LocalPluginConnection & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a conexão.");
      setEditingId(undefined);
      setEditingSecrets({});
      await load();
      toast.success("Conexão atualizada", {
        description: "As novas credenciais foram protegidas no cofre do sistema.",
      });
    } catch (error) {
      toast.error("Não foi possível atualizar a conexão", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  const canCreate = Boolean(name.trim()) && Object.values(secrets).some((value) => value.trim());

  return (
    <details className="group rounded-xl border border-brand/25 bg-brand/5 p-3" open>
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-brand/10 text-brand-soft">
          <KeyRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Credenciais e conexões</span>
          <span className="mt-0.5 block text-[10px] text-muted-foreground">
            Adicione, substitua e organize chaves protegidas no cofre local.
          </span>
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {connections.length} {connections.length === 1 ? "conexão" : "conexões"}
        </Badge>
      </summary>

      <div className="mt-3 space-y-3 border-t border-brand/15 pt-3">
        {loading ? (
          <p className="text-[11px] text-muted-foreground">Carregando conexões...</p>
        ) : connections.length ? (
          connections.map((connection) => {
            const editing = editingId === connection.id;
            return (
              <article
                key={connection.id}
                className="rounded-lg border border-border bg-card/55 p-3"
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold" data-i18n-ignore>
                      {connection.name}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {connection.connectedSecretKeys.length} de {secretKeys.length} credenciais
                      configuradas
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="gap-1.5"
                    onClick={() => {
                      setEditingId(editing ? undefined : connection.id);
                      setEditingName(connection.name);
                      setEditingSecrets({});
                    }}
                  >
                    <Pencil className="size-3.5" /> {editing ? "Cancelar" : "Editar"}
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {secretKeys.map((secretKey) => (
                    <Badge
                      key={secretKey}
                      variant={
                        connection.connectedSecretKeys.includes(secretKey) ? "secondary" : "outline"
                      }
                      className="font-mono text-[9px]"
                      data-i18n-ignore
                    >
                      {secretKey}
                    </Badge>
                  ))}
                </div>
                {editing && (
                  <div className="mt-3 space-y-2 border-t border-border pt-3">
                    <Input
                      value={editingName}
                      placeholder="Nome da conexão"
                      onChange={(event) => setEditingName(event.target.value)}
                    />
                    {secretKeys.map((secretKey) => (
                      <div key={secretKey} className="space-y-1">
                        <Label className="font-mono text-[10px]" data-i18n-ignore>
                          {secretKey}
                        </Label>
                        <Input
                          type="password"
                          autoComplete="off"
                          value={editingSecrets[secretKey] ?? ""}
                          placeholder={
                            connection.connectedSecretKeys.includes(secretKey)
                              ? "Nova chave (deixe vazio para manter)"
                              : "Cole a chave para adicionar"
                          }
                          onChange={(event) =>
                            setEditingSecrets((current) => ({
                              ...current,
                              [secretKey]: event.target.value,
                            }))
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      size="sm"
                      disabled={saving || !editingName.trim()}
                      onClick={() => void updateConnection(connection)}
                    >
                      {saving && <LoaderCircle className="size-3.5 animate-spin" />}
                      Salvar alterações
                    </Button>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <p className="rounded-lg border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
            Nenhuma conexão cadastrada para este plugin.
          </p>
        )}

        <details className="rounded-lg border border-border bg-background/40 p-3">
          <summary className="cursor-pointer text-xs font-medium">Adicionar conexão</summary>
          <div className="mt-3 space-y-2">
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              Preencha somente os provedores que deseja usar. Você pode criar outras conexões,
              inclusive para adicionar outra chave do mesmo provedor.
            </p>
            <Input
              value={name}
              placeholder="Ex.: Pexels principal"
              onChange={(event) => setName(event.target.value)}
            />
            {secretKeys.map((secretKey) => (
              <div key={secretKey} className="space-y-1">
                <Label className="font-mono text-[10px]" data-i18n-ignore>
                  {secretKey}
                </Label>
                <Input
                  type="password"
                  autoComplete="off"
                  value={secrets[secretKey] ?? ""}
                  placeholder="Cole a chave"
                  onChange={(event) =>
                    setSecrets((current) => ({ ...current, [secretKey]: event.target.value }))
                  }
                />
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              disabled={saving || !canCreate}
              onClick={() => void createConnection()}
            >
              {saving && <LoaderCircle className="size-3.5 animate-spin" />}
              Salvar no cofre local
            </Button>
          </div>
        </details>
      </div>
    </details>
  );
}

function PluginProfilesPanel({ plugin }: { plugin: DiscoveredPlugin }) {
  type ProfileStatus = "unknown" | "checking" | "ready" | "missing" | "preparing";
  const [profiles, setProfiles] = useState<ManagedPluginProfile[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProfileStatus>>({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string>();
  const [editingName, setEditingName] = useState("");
  const [browserBridgeDirectory, setBrowserBridgeDirectory] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/profiles`);
      const result = (await response.json()) as {
        profiles?: ManagedPluginProfile[];
        browserBridgeDirectory?: string;
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível carregar os perfis.");
      setProfiles(result.profiles ?? []);
      setBrowserBridgeDirectory(result.browserBridgeDirectory ?? "");
    } catch (error) {
      toast.error("Não foi possível carregar os perfis", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [plugin.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const profileIds = profiles.map((profile) => profile.id).join("|");
  useEffect(() => {
    if (!profileIds || !plugin.enabled || !plugin.executable) return;
    const controller = new AbortController();
    setStatuses(Object.fromEntries(profiles.map((profile) => [profile.id, "checking"])));
    void Promise.all(
      profiles.map(async (profile) => {
        try {
          const response = await fetch(
            `/api/plugins/${encodeURIComponent(plugin.id)}/profiles/${encodeURIComponent(profile.id)}/status`,
            { method: "POST", signal: controller.signal },
          );
          const result = (await response.json()) as { ready?: boolean };
          return [profile.id, response.ok && result.ready ? "ready" : "missing"] as const;
        } catch {
          return [profile.id, "missing"] as const;
        }
      }),
    ).then((entries) => {
      if (!controller.signal.aborted) setStatuses(Object.fromEntries(entries));
    });
    return () => controller.abort();
    // Profiles are rechecked only when the inventory itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugin.enabled, plugin.executable, plugin.id, profileIds]);

  async function createProfile() {
    setCreating(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const result = (await response.json()) as ManagedPluginProfile & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível criar o perfil.");
      setName("");
      await load();
      toast.success("Perfil adicionado", {
        description: "Agora prepare a conta para confirmar a sessão neste perfil.",
      });
    } catch (error) {
      toast.error("Não foi possível adicionar o perfil", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setCreating(false);
    }
  }

  async function copyBrowserBridgeDirectory() {
    if (!browserBridgeDirectory) return;
    await navigator.clipboard.writeText(browserBridgeDirectory);
    toast.success("Caminho da extensão copiado");
  }

  async function renameProfile(profile: ManagedPluginProfile) {
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/profiles/${encodeURIComponent(profile.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: editingName }),
        },
      );
      const result = (await response.json()) as ManagedPluginProfile & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível renomear o perfil.");
      setEditingId(undefined);
      await load();
      toast.success("Perfil renomeado");
    } catch (error) {
      toast.error("Não foi possível renomear o perfil", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function prepareProfile(profile: ManagedPluginProfile) {
    setStatuses((current) => ({ ...current, [profile.id]: "preparing" }));
    toast.info("Prepare a conta na janela do navegador", {
      description: plugin.manifest.profileSetup?.description,
    });
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/profiles/${encodeURIComponent(profile.id)}/prepare`,
        { method: "POST" },
      );
      const result = (await response.json()) as {
        ready?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.ready) {
        throw new Error(result.error ?? "O login não foi confirmado pelo plugin.");
      }
      setStatuses((current) => ({ ...current, [profile.id]: "ready" }));
      toast.success("Perfil pronto", { description: result.message });
    } catch (error) {
      setStatuses((current) => ({ ...current, [profile.id]: "missing" }));
      toast.error("Não foi possível preparar o perfil", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  async function removeProfile(profile: ManagedPluginProfile) {
    if (profile.usages.length) return;
    if (
      !window.confirm(
        `Remover ${profile.name} do gerenciamento? A pasta de sessão local não será apagada.`,
      )
    )
      return;
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/profiles/${encodeURIComponent(profile.id)}`,
        { method: "DELETE" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? "Não foi possível remover o perfil.");
      }
      await load();
      toast.success("Perfil removido do gerenciamento");
    } catch (error) {
      toast.error("Não foi possível remover o perfil", {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  }

  return (
    <details className="group rounded-xl border border-brand/25 bg-brand/5 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-3">
        <span className="grid size-9 place-items-center rounded-lg bg-brand/10 text-brand-soft">
          <CircleUserRound className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold">Perfis e contas</span>
          <span className="block text-[10px] text-muted-foreground">
            Cadastre, prepare e veja onde cada perfil é utilizado.
          </span>
        </span>
        <Badge variant="secondary" className="text-[9px]">
          {loading ? "…" : profiles.length}
        </Badge>
      </summary>

      <div className="mt-4 space-y-3 border-t border-border/70 pt-4">
        {browserBridgeDirectory && (
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <p className="text-[11px] font-semibold">Extensão persistente do navegador</p>
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Ao preparar uma conta, carregue esta pasta uma única vez em chrome://extensions. Ela
              fica fora da pasta do código e não muda quando o aplicativo é atualizado ou renomeado.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1.5 text-[10px]">
                {browserBridgeDirectory}
              </code>
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="size-8 shrink-0"
                aria-label="Copiar caminho da extensão"
                onClick={() => void copyBrowserBridgeDirectory()}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2 rounded-lg border border-dashed border-border bg-background/50 p-3 sm:flex-row">
          <Input
            value={name}
            maxLength={64}
            placeholder="Nome do novo perfil"
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={creating || !name.trim()}
            onClick={() => void createProfile()}
          >
            {creating ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <CircleUserRound className="size-3.5" />
            )}
            Adicionar perfil
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" /> Carregando perfis…
          </div>
        ) : profiles.length ? (
          <div className="space-y-2">
            {profiles.map((profile) => {
              const status = statuses[profile.id] ?? "unknown";
              const channels = new Set(profile.usages.map((usage) => usage.channelId)).size;
              const primaryCount = profile.usages.filter(
                (usage) => usage.role === "primary",
              ).length;
              const fallbackCount = profile.usages.length - primaryCount;
              return (
                <article
                  key={profile.id}
                  className="rounded-lg border border-border bg-background/70 p-3"
                >
                  <div className="flex flex-wrap items-start gap-2">
                    <span
                      className={`mt-0.5 size-2.5 rounded-full ${
                        status === "ready"
                          ? "bg-emerald-500"
                          : status === "missing"
                            ? "bg-warning"
                            : status === "checking" || status === "preparing"
                              ? "animate-pulse bg-muted-foreground/50"
                              : "bg-muted-foreground/50"
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      {editingId === profile.id ? (
                        <div className="flex gap-2">
                          <Input
                            value={editingName}
                            maxLength={80}
                            className="h-8"
                            onChange={(event) => setEditingName(event.target.value)}
                          />
                          <Button
                            type="button"
                            size="sm"
                            disabled={!editingName.trim()}
                            onClick={() => void renameProfile(profile)}
                          >
                            Salvar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-semibold">{profile.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Identificador local: {profile.alias}
                          </p>
                        </>
                      )}
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={status === "ready" ? "outline" : "default"}
                      disabled={status === "checking" || status === "preparing" || !plugin.enabled}
                      onClick={() => void prepareProfile(profile)}
                    >
                      {status === "checking" || status === "preparing" ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : status === "ready" ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <CircleUserRound className="size-3.5" />
                      )}
                      {!plugin.enabled
                        ? "Ative o plugin"
                        : status === "ready"
                          ? "Pronto"
                          : status === "preparing"
                            ? "Preparando"
                            : "Preparar"}
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label={`Renomear ${profile.name}`}
                      onClick={() => {
                        setEditingId(profile.id);
                        setEditingName(profile.name);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-8 text-destructive"
                      aria-label={`Remover ${profile.name}`}
                      title={
                        profile.usages.length
                          ? "Troque as referências antes de remover"
                          : "Remover do gerenciamento"
                      }
                      disabled={Boolean(profile.usages.length)}
                      onClick={() => void removeProfile(profile)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="text-[9px]">
                      {channels} {channels === 1 ? "canal" : "canais"}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      Principal em {primaryCount}
                    </Badge>
                    <Badge variant="outline" className="text-[9px]">
                      Fallback em {fallbackCount}
                    </Badge>
                  </div>

                  {profile.usages.length ? (
                    <details className="mt-2 rounded-md bg-muted/35 px-2.5 py-2">
                      <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">
                        Ver {profile.usages.length} {profile.usages.length === 1 ? "uso" : "usos"}
                      </summary>
                      <div className="mt-2 space-y-1.5">
                        {profile.usages.map((usage) => (
                          <p
                            key={`${usage.channelId}-${usage.processType}-${usage.blockId}-${usage.role}`}
                            className="text-[10px]"
                          >
                            <span className="font-medium">{usage.channelName}</span> ·{" "}
                            {PROCESS_META[usage.processType].label} · {usage.blockName} ·{" "}
                            <span className="text-muted-foreground">
                              {usage.role === "primary"
                                ? "principal"
                                : `fallback ${usage.fallbackPosition ?? ""}`.trim()}
                            </span>
                          </p>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Este perfil ainda não é utilizado por nenhum Método.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            Nenhum perfil cadastrado para este plugin.
          </p>
        )}
      </div>
    </details>
  );
}

function UpdateInstalledPluginPanel({
  plugin,
  update,
  onChanged,
}: {
  plugin: DiscoveredPlugin;
  update?: PluginUpdate;
  onChanged: () => Promise<void>;
}) {
  const [folderPath, setFolderPath] = useState("");
  const [updating, setUpdating] = useState(false);

  async function updateFromCatalog() {
    setUpdating(true);
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/update-from-catalog`,
        { method: "PUT" },
      );
      const result = (await response.json()) as { version?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o plugin.");
      toast.success(`Plugin atualizado para v${result.version}`, {
        description: "Revise as permissões e reative o plugin para usar a nova versão.",
      });
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível atualizar o plugin", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUpdating(false);
    }
  }

  async function updatePlugin() {
    setUpdating(true);
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(plugin.id)}/update-from-folder`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: folderPath }),
        },
      );
      const result = (await response.json()) as { version?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar o plugin.");
      toast.success(`Plugin atualizado para v${result.version}`, {
        description: "Revise as permissões e reative o plugin para usar a nova versão.",
      });
      setFolderPath("");
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível atualizar o plugin", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-muted/15 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold">
        <RefreshCw className="size-3.5 text-brand-soft" /> Atualizações
      </div>
      {update?.updateAvailable && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-sky-600">Versão {update.version} disponível</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              O pacote será baixado, conferido e validado antes da substituição.
            </p>
          </div>
          <Button
            size="sm"
            className="shrink-0 gap-1.5"
            disabled={updating}
            onClick={() => void updateFromCatalog()}
          >
            {updating ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            Atualizar plugin
          </Button>
        </div>
      )}
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {update?.updateAvailable
          ? "Como alternativa, você ainda pode atualizar manualmente usando uma pasta."
          : "Se você recebeu uma versão por fora do catálogo, pode atualizá-la manualmente pela pasta."}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Input
          value={folderPath}
          placeholder="C:\\Meus Plugins\\nova-versão"
          onChange={(event) => setFolderPath(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          disabled={updating || !folderPath.trim()}
          onClick={() => void updatePlugin()}
        >
          {updating ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <RefreshCw className="size-3.5" />
          )}
          Validar e atualizar
        </Button>
      </div>
    </section>
  );
}

function CommunityAccessPanel({
  plugin,
  onChanged,
}: {
  plugin: DiscoveredPlugin;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  async function update(enabled: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/consent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível alterar o plugin.");
      toast.success(enabled ? "Plugin ativado" : "Plugin desativado");
      await onChanged();
    } catch (error) {
      toast.error("Não foi possível alterar o plugin", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-muted/30 p-3">
      <p className="text-xs font-semibold">Acesso deste plugin</p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        Este plugin foi instalado localmente. O ContentFlow executa seu código em um processo
        separado e entrega somente os recursos declarados abaixo.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {plugin.manifest.permissions.length ? (
          plugin.manifest.permissions.map((permission) => (
            <Badge key={permission} variant="outline" className="text-[9px]">
              {PERMISSION_LABEL[permission] ?? permission}
            </Badge>
          ))
        ) : (
          <Badge variant="outline" className="text-[9px]">
            Sem permissões adicionais
          </Badge>
        )}
      </div>
      {plugin.manifest.permissions.includes("network") &&
        (plugin.manifest.networkHosts?.length ? (
          <div className="mt-3 rounded-md border border-border/70 bg-background/40 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Hosts declarados
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {plugin.manifest.networkHosts.map((host) => (
                <Badge key={host} variant="secondary" className="font-mono text-[9px]">
                  {host}
                </Badge>
              ))}
            </div>
            <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
              O núcleo aplica esta lista ao importar artifacts remotos. O Permission Model do Node
              26 ainda não restringe por host a rede usada diretamente pelo código do plugin.
            </p>
          </div>
        ) : (
          <p className="mt-2 flex gap-1.5 text-[10px] leading-relaxed text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            Acesso irrestrito à rede: este plugin comunitário pediu network sem declarar hosts.
            Ative apenas se você confia na origem e no código.
          </p>
        ))}
      {!plugin.networkIsolation && (
        <p className="mt-2 text-[10px] leading-relaxed text-warning">
          Reinicie o ContentFlow com Node 26 antes de ativar código não confiável. O runtime atual
          não consegue impor o bloqueio técnico de rede da sandbox.
        </p>
      )}
      {plugin.manifest.permissions.some((permission) =>
        ["process", "native"].includes(permission),
      ) && (
        <p className="mt-2 text-[10px] leading-relaxed text-warning">
          Acesso avançado: programas externos e bibliotecas nativas podem agir com as permissões
          normais da sua conta no computador. Ative apenas se você confia na origem e no código.
        </p>
      )}
      <Button
        size="sm"
        variant={plugin.enabled ? "outline" : "default"}
        className="mt-3"
        disabled={saving}
        onClick={() => void update(!plugin.enabled)}
      >
        {saving && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
        {plugin.enabled ? "Desativar plugin" : "Ativar e permitir"}
      </Button>
    </div>
  );
}

export function CommunityWorkspaceField({ pluginId }: { pluginId: string }) {
  const [folderPath, setFolderPath] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/workspace`);
    if (response.ok) {
      const result = (await response.json()) as { path?: string };
      setFolderPath(result.path ?? "");
    }
  }, [pluginId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setLoading(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(pluginId)}/workspace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: folderPath }),
      });
      const result = (await response.json()) as { path?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível preparar a pasta.");
      setFolderPath(result.path ?? "");
      toast.success(result.path ? "Pasta de trabalho conectada" : "Pasta padrão restaurada");
    } catch (error) {
      toast.error("Não foi possível atualizar a pasta", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <Label htmlFor={`workspace-${pluginId}`} className="text-xs font-semibold">
        Pasta de trabalho (opcional)
      </Label>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Use uma pasta sua para arquivos persistentes e checkpoints. Deixe vazio para usar a pasta
        interna e isolada do ContentFlow.
      </p>
      <div className="flex gap-2">
        <Input
          id={`workspace-${pluginId}`}
          value={folderPath}
          placeholder="C:\\Meus Projetos\\ContentFlow"
          onChange={(event) => setFolderPath(event.target.value)}
        />
        <Button size="sm" variant="outline" disabled={loading} onClick={() => void save()}>
          {loading && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

function exportManifest(plugin: DiscoveredPlugin) {
  const blob = new Blob([JSON.stringify(plugin.manifest, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${plugin.id}.contentflow.plugin.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast.success("Manifesto exportado", {
    description:
      "Para compartilhar um plugin funcional, envie também a pasta completa do executor.",
  });
}
