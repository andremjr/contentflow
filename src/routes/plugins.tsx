import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FolderOpen,
  ExternalLink,
  FileCode2,
  KeyRound,
  LoaderCircle,
  Plug,
  RefreshCw,
  ShieldCheck,
  Unplug,
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
import { PROCESS_META, type BlockType, type UniversalProcess } from "@/lib/domain";
import type { PluginManifest } from "@/lib/plugin-contract";

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
  source: "bundled" | "installed";
  directory: string;
  manifest: PluginManifest;
};

type PluginIssue = { directory: string; message: string };
type PluginResponse = { plugins: DiscoveredPlugin[]; issues: PluginIssue[] };
type OpenAIConnection = {
  connected: boolean;
  models: Array<{ id: string; name: string }>;
  updatedAt?: string;
  persistence: "session";
};
type PluginSource = { root: string; files: Array<{ path: string; content: string }> };

const BLOCK_LABEL: Record<BlockType, string> = {
  BUSCAR: "Buscar",
  ESCOLHER: "Escolher",
  CRIAR: "Criar",
  VALIDAR: "Validar",
};

function PluginsPage() {
  const [data, setData] = useState<PluginResponse>({ plugins: [], issues: [] });
  const [loading, setLoading] = useState(true);

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

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Plugins" }]}
        title="Plugins"
        subtitle="Gerencie as ferramentas que executam blocos de IA e Código"
        showNewProject={false}
        actions={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refresh()}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} /> Atualizar
          </Button>
        }
      />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <section className="grid divide-y divide-border border-y border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          <Stat label="Plugins disponíveis" value={data.plugins.length} />
          <Stat label="Incluídos no aplicativo" value={bundled.length} />
          <Stat label="Instalados pelo usuário" value={installed.length} />
        </section>

        <section className="mt-6 border-b border-border pb-5">
          <div className="flex items-start gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand-soft">
              <FolderOpen className="size-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">Instalação local e compartilhável</h2>
              <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                Plugins oficiais ficam em <code>plugins/bundled</code>. Plugins adicionados por cada
                usuário ficam em <code>data/plugins/installed</code>. Coloque a pasta completa do
                plugin em um desses locais e use “Atualizar” para o ContentFlow ler o manifesto.
              </p>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" /> Procurando plugins locais...
            </span>
          </div>
        ) : data.plugins.length ? (
          <section className="mt-5 divide-y divide-border border-y border-border">
            {data.plugins.map((plugin) => (
              <PluginCard key={`${plugin.source}-${plugin.id}`} plugin={plugin} />
            ))}
          </section>
        ) : (
          <section className="mt-5 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
            <div>
              <Plug className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 text-sm font-semibold">Nenhum plugin instalado ainda</h2>
              <p className="mt-1 max-w-lg text-xs text-muted-foreground">
                A interface já está preparada para descobrir plugins reais. Nenhum dado de exemplo
                foi criado.
              </p>
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

function PluginCard({ plugin }: { plugin: DiscoveredPlugin }) {
  const { manifest } = plugin;
  return (
    <article className="px-2 py-5 sm:px-4">
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
              {plugin.source === "bundled" ? "Incluído" : "Instalado"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{manifest.description}</p>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {manifest.author} · <code>{plugin.directory}</code>
          </p>
        </div>
      </header>

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

      {plugin.id === "official-openai-gpt" && <OpenAIConnectionPanel />}

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
        {plugin.source === "bundled" && <PluginSourceDialog plugin={plugin} />}
      </footer>
    </article>
  );
}

function OpenAIConnectionPanel() {
  const [connection, setConnection] = useState<OpenAIConnection>();
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);

  const loadConnection = useCallback(async () => {
    const response = await fetch("/api/plugins/official-openai-gpt/connection");
    if (!response.ok) throw new Error("Não foi possível consultar a conexão OpenAI.");
    setConnection((await response.json()) as OpenAIConnection);
  }, []);

  useEffect(() => {
    void loadConnection();
  }, [loadConnection]);

  async function updateConnection(action: "connect" | "refresh" | "disconnect") {
    setLoading(true);
    try {
      const response = await fetch(
        action === "refresh"
          ? "/api/plugins/official-openai-gpt/models/refresh"
          : "/api/plugins/official-openai-gpt/connection",
        {
          method: action === "disconnect" ? "DELETE" : "POST",
          headers: action === "connect" ? { "Content-Type": "application/json" } : undefined,
          body: action === "connect" ? JSON.stringify({ apiKey }) : undefined,
        },
      );
      const result = (await response.json()) as OpenAIConnection & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível atualizar a conexão.");
      setConnection(result);
      setApiKey("");
      toast.success(
        action === "disconnect"
          ? "OpenAI desconectada"
          : `${result.models.length} modelos OpenAI disponíveis`,
      );
    } catch (error) {
      toast.error("Não foi possível conectar à OpenAI", {
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
            <p className="text-xs font-semibold">Conexão OpenAI</p>
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
                diretamente na OpenAI e usada nos blocos de Método.
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
                real. Ela permanece apenas na memória enquanto o aplicativo estiver aberto.
              </p>
              <div className="mt-3 grid gap-1.5 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="openai-session-key" className="sr-only">
                    Chave da API da OpenAI
                  </Label>
                  <Input
                    id="openai-session-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder="sk-..."
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
                href="https://platform.openai.com/api-keys"
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-4 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
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
