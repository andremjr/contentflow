import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  AudioLines,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  FolderPlus,
  Image,
  KeyRound,
  LoaderCircle,
  Plug,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ShieldCheck,
  Trash2,
  Unplug,
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
import type { PluginDeliveryType, PluginManifest } from "@/lib/plugin-contract";

export const Route = createFileRoute("/plugins")({
  head: () => ({
    meta: [
      { title: "Plugins — ContentFlow OS" },
      {
        name: "description",
        content: "Gerenciamento dos plugins locais do ContentFlow OS.",
      },
    ],
  }),
  component: PluginsPage,
});

type DiscoveredPlugin = {
  id: string;
  source: "bundled" | "installed" | "local";
  directory: string;
  manifest: PluginManifest;
  enabled: boolean;
  executable: boolean;
  sandboxed: boolean;
  networkIsolation: boolean;
};

type PluginIssue = { directory: string; message: string };
type PluginResponse = {
  plugins: DiscoveredPlugin[];
  issues: PluginIssue[];
  examplesDirectory?: string;
};
type ProviderConnection = {
  connected: boolean;
  models: Array<{ id: string; name: string }>;
  updatedAt?: string;
  persistence: "keychain";
  credentialStore: string;
};
type PluginSource = { root: string; files: Array<{ path: string; content: string }> };

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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const bundled = data.plugins.filter((plugin) => plugin.source === "bundled");
  const installed = data.plugins.filter((plugin) => plugin.source === "installed");
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
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Plugins" }]}
        title="Plugins"
        subtitle="Gerencie as ferramentas que executam blocos de IA e Código"
        showNewProject={false}
        actions={
          <div className="flex items-center gap-2">
            <InstallPluginDialog onInstalled={refresh} examplesDirectory={data.examplesDirectory} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refresh()}>
              <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Atualizar
            </Button>
          </div>
        }
      />

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <section className="rounded-xl border border-border bg-card/40 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{data.plugins.length} plugins</Badge>
            <Badge variant="outline">{bundled.length} incluídos</Badge>
            <Badge variant="outline">{installed.length} instalados</Badge>
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
          <section className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filteredPlugins.map((plugin) => (
              <PluginCard
                key={`${plugin.source}-${plugin.id}`}
                plugin={plugin}
                onChanged={refresh}
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

function InstallPluginDialog({
  onInstalled,
  examplesDirectory,
}: {
  onInstalled: () => Promise<void>;
  examplesDirectory?: string;
}) {
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
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível instalar o plugin.");
      toast.success(
        mode === "install" ? "Plugin instalado" : "Pasta de desenvolvimento conectada",
        {
          description: "Confira as permissões e clique em Ativar e permitir.",
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
            Cole o caminho da pasta que contém contentflow.plugin.json. Nenhuma publicação ou
            aprovação é necessária.
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
          <Label htmlFor="plugin-folder-path">Pasta do plugin</Label>
          <Input
            id="plugin-folder-path"
            value={folderPath}
            placeholder="C:\\Meus Plugins\\meu-plugin"
            onChange={(event) => setFolderPath(event.target.value)}
          />
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {mode === "install"
              ? "O ContentFlow OS guarda uma cópia. Você poderá apagar a pasta original sem remover o plugin."
              : "Ideal para criar com IA: alterações na pasta aparecem ao atualizar, e desconectar não apaga seus arquivos."}
          </p>
          {examplesDirectory && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFolderPath(`${examplesDirectory}\\community-reference`)}
            >
              Usar o plugin de exemplo
            </Button>
          )}
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
  onChanged,
}: {
  plugin: DiscoveredPlugin;
  onChanged: () => Promise<void>;
}) {
  const { manifest } = plugin;
  const types = deliveryTypes(plugin);
  const [removing, setRemoving] = useState(false);

  async function removePlugin() {
    const action = plugin.source === "local" ? "desconectar" : "desinstalar";
    if (!window.confirm(`Deseja ${action} ${manifest.name}?`)) return;
    setRemoving(true);
    try {
      const response = await fetch(`/api/plugins/${encodeURIComponent(plugin.id)}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = (await response.json()) as { error?: string };
        throw new Error(result.error ?? `Não foi possível ${action} o plugin.`);
      }
      toast.success(plugin.source === "local" ? "Pasta desconectada" : "Plugin desinstalado");
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
    <article className="rounded-xl border border-border bg-card/55 p-4 shadow-sm transition-colors hover:border-brand/35">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-secondary text-foreground">
          <Plug className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">{manifest.name}</h2>
            <Badge variant="secondary" className="text-[10px]">
              v{manifest.version}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              {plugin.source === "bundled"
                ? "Incluído"
                : plugin.source === "local"
                  ? "Desenvolvimento"
                  : "Instalado"}
            </Badge>
            {plugin.source !== "bundled" && (
              <Badge variant={plugin.enabled ? "secondary" : "outline"} className="text-[10px]">
                {plugin.enabled ? "Ativo" : "Desativado"}
              </Badge>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {manifest.description}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {manifest.author} · <code>{plugin.directory}</code>
          </p>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1.5">
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

      <details className="group mt-4 border-t border-border/60 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground">
          <span>
            {manifest.capabilities.length} capacidade{manifest.capabilities.length === 1 ? "" : "s"}{" "}
            · {new Set(manifest.capabilities.flatMap((capability) => capability.blockTypes)).size}{" "}
            blocos
          </span>
          <span className="text-brand-soft group-open:hidden">Configurar</span>
          <span className="hidden text-brand-soft group-open:inline">Fechar detalhes</span>
        </summary>

        <div className="mt-4 divide-y divide-border border-y border-border">
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

        {plugin.id === "official-openai-gpt" && (
          <ProviderConnectionPanel
            pluginId="official-openai-gpt"
            provider="OpenAI"
            keyLabel="Chave da API da OpenAI"
            keyPlaceholder="sk-..."
            apiKeysUrl="https://platform.openai.com/api-keys"
          />
        )}
        {plugin.id === "official-anthropic-claude" && (
          <ProviderConnectionPanel
            pluginId="official-anthropic-claude"
            provider="Anthropic"
            keyLabel="Chave da API da Anthropic"
            keyPlaceholder="sk-ant-..."
            apiKeysUrl="https://platform.claude.com/settings/keys"
          />
        )}

        {plugin.source !== "bundled" && (
          <CommunityAccessPanel plugin={plugin} onChanged={onChanged} />
        )}

        {plugin.source !== "bundled" &&
          plugin.manifest.permissions.some((permission) =>
            permission.startsWith("filesystem:"),
          ) && <CommunityWorkspaceField pluginId={plugin.id} />}

        {plugin.source !== "bundled" &&
          (manifest.secretKeys ?? []).map((secretKey) => (
            <CommunitySecretField key={secretKey} pluginId={plugin.id} secretKey={secretKey} />
          ))}

        <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <span className="mr-auto inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <ShieldCheck className="size-3.5" /> {manifest.permissions.length} permissões declaradas
          </span>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => exportManifest(plugin)}
          >
            <Download className="size-3.5" /> Exportar manifesto
          </Button>
          {plugin.source !== "bundled" && (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5 text-destructive"
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
          )}
          {plugin.source === "bundled" && <PluginSourceDialog plugin={plugin} />}
        </footer>
      </details>
    </article>
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
        Este plugin foi instalado localmente. O ContentFlow OS executa seu código em um processo
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
          Reinicie o ContentFlow OS com Node 26 antes de ativar código não confiável. O runtime
          atual não consegue impor o bloqueio técnico de rede da sandbox.
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

function CommunitySecretField({ pluginId, secretKey }: { pluginId: string; secretKey: string }) {
  const [connected, setConnected] = useState(false);
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(
      `/api/plugins/${encodeURIComponent(pluginId)}/secrets/${encodeURIComponent(secretKey)}`,
    );
    if (response.ok) {
      const result = (await response.json()) as { connected: boolean };
      setConnected(result.connected);
    }
  }, [pluginId, secretKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(remove = false) {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/plugins/${encodeURIComponent(pluginId)}/secrets/${encodeURIComponent(secretKey)}`,
        {
          method: remove ? "DELETE" : "PUT",
          headers: remove ? undefined : { "Content-Type": "application/json" },
          body: remove ? undefined : JSON.stringify({ value }),
        },
      );
      const result = (await response.json()) as { connected?: boolean; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível salvar a credencial.");
      setConnected(Boolean(result.connected));
      setValue("");
      toast.success(remove ? "Credencial removida" : "Credencial protegida no cofre do sistema");
    } catch (error) {
      toast.error("Não foi possível atualizar a credencial", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-3.5 text-brand-soft" />
        <Label htmlFor={`${pluginId}-${secretKey}`} className="font-mono text-[11px]">
          {secretKey}
        </Label>
        {connected && (
          <Badge variant="secondary" className="ml-auto text-[9px]">
            Conectada
          </Badge>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          id={`${pluginId}-${secretKey}`}
          type="password"
          autoComplete="off"
          value={value}
          placeholder={connected ? "Substituir credencial" : "Cole a credencial"}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button size="sm" disabled={loading || !value.trim()} onClick={() => void save()}>
          Salvar
        </Button>
        {connected && (
          <Button size="sm" variant="ghost" disabled={loading} onClick={() => void save(true)}>
            Remover
          </Button>
        )}
      </div>
    </div>
  );
}

function CommunityWorkspaceField({ pluginId }: { pluginId: string }) {
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
        interna e isolada do ContentFlow OS.
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

function ProviderConnectionPanel({
  pluginId,
  provider,
  keyLabel,
  keyPlaceholder,
  apiKeysUrl,
}: {
  pluginId: string;
  provider: string;
  keyLabel: string;
  keyPlaceholder: string;
  apiKeysUrl: string;
}) {
  const [connection, setConnection] = useState<ProviderConnection>();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConnection = useCallback(async () => {
    const response = await fetch(`/api/plugins/${pluginId}/connection`);
    if (!response.ok) throw new Error(`Não foi possível consultar a conexão ${provider}.`);
    setConnection((await response.json()) as ProviderConnection);
  }, [pluginId, provider]);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  async function updateConnection(action: "connect" | "refresh" | "disconnect") {
    setLoading(true);
    try {
      const response = await fetch(
        action === "refresh"
          ? `/api/plugins/${pluginId}/models/refresh`
          : `/api/plugins/${pluginId}/connection`,
        {
          method: action === "disconnect" ? "DELETE" : "POST",
          headers: action === "connect" ? { "Content-Type": "application/json" } : undefined,
          body: action === "connect" ? JSON.stringify({ apiKey }) : undefined,
        },
      );
      const result = (await response.json()) as ProviderConnection & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a conexão.");
      setConnection(result);
      setApiKey("");
      toast.success(
        action === "disconnect"
          ? `${provider} desconectada`
          : `${result.models.length} modelos ${provider} disponíveis`,
      );
    } catch (error) {
      toast.error(`Não foi possível conectar à ${provider}`, {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-brand/25 bg-brand/5 p-3">
      <div className="flex items-start gap-2.5">
        <KeyRound className="mt-0.5 size-4 shrink-0 text-brand-soft" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold">Conexão {provider}</p>
            {connection?.connected && (
              <Badge className="gap-1 text-[9px]" variant="secondary">
                <CheckCircle2 className="size-3" /> Conectada
              </Badge>
            )}
          </div>
          {connection?.connected ? (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {connection.models.length} modelos disponíveis para esta chave. A lista é consultada
                diretamente na {provider} e usada nos blocos de Método. A credencial está protegida
                pelo {connection.credentialStore}.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void updateConnection("refresh")}
                >
                  <RefreshCw
                    className={loading ? "mr-1.5 size-3.5 animate-spin" : "mr-1.5 size-3.5"}
                  />
                  Atualizar modelos
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => void updateConnection("disconnect")}
                >
                  <Unplug className="mr-1.5 size-3.5" /> Desconectar
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Informe a chave para validar a conexão e carregar os modelos disponíveis em tempo
                real. Depois de validada, ela será protegida pelo cofre de credenciais do sistema e
                reutilizada nas próximas sessões.
              </p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor={`${pluginId}-session-key`} className="sr-only">
                    {keyLabel}
                  </Label>
                  <Input
                    id={`${pluginId}-session-key`}
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder={keyPlaceholder}
                    onChange={(event) => setApiKey(event.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  disabled={loading || !apiKey.trim()}
                  onClick={() => void updateConnection("connect")}
                >
                  {loading && <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />}
                  Conectar e buscar modelos
                </Button>
              </div>
              <a
                href={apiKeysUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-brand-soft hover:underline"
              >
                Criar ou consultar chave da API <ExternalLink className="size-3" />
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PluginSourceDialog({ plugin }: { plugin: DiscoveredPlugin }) {
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<PluginSource>();
  const [selectedPath, setSelectedPath] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || source || plugin.source !== "bundled") return;
    setLoading(true);
    void fetch(`/api/plugins/${encodeURIComponent(plugin.id)}/source`)
      .then(async (response) => {
        const result = (await response.json()) as PluginSource & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Não foi possível ler o plugin.");
        setSource(result);
        setSelectedPath(result.files[0]?.path);
      })
      .catch((error) => {
        toast.error("Não foi possível abrir o código", {
          description: error instanceof Error ? error.message : undefined,
        });
      })
      .finally(() => setLoading(false));
  }, [open, plugin.id, plugin.source, source]);

  const selected = source?.files.find((file) => file.path === selectedPath);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <FileCode2 className="size-3.5" /> Ver estrutura e código
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Estrutura de {plugin.manifest.name}</DialogTitle>
          <DialogDescription>
            O manifesto declara compatibilidade e parâmetros; o handler contém a execução real.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
          </div>
        ) : source ? (
          <div className="grid min-h-[28rem] overflow-hidden rounded-lg border border-border md:grid-cols-[14rem_1fr]">
            <aside className="border-b border-border bg-card/50 p-3 md:border-b-0 md:border-r">
              <p className="mb-2 truncate font-mono text-[10px] text-muted-foreground">
                {source.root}/
              </p>
              <div className="space-y-1">
                {source.files.map((file) => (
                  <button
                    type="button"
                    key={file.path}
                    onClick={() => setSelectedPath(file.path)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-xs transition-colors ${
                      file.path === selectedPath
                        ? "bg-brand/10 text-brand-soft"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    <FileCode2 className="size-3.5" /> {file.path}
                  </button>
                ))}
              </div>
            </aside>
            <div className="min-w-0 bg-[#080d18]">
              <div className="border-b border-white/10 px-4 py-2 font-mono text-xs text-slate-400">
                {selected?.path}
              </div>
              <pre className="max-h-[34rem] overflow-auto p-4 text-[11px] leading-relaxed text-slate-300">
                <code>{selected?.content}</code>
              </pre>
            </div>
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Código indisponível para este plugin.
          </p>
        )}
      </DialogContent>
    </Dialog>
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
