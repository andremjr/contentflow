import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bot,
  Code2,
  Download,
  FolderOpen,
  LoaderCircle,
  Plug,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

      <main className="flex-1 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Plugins disponíveis" value={data.plugins.length} />
          <Stat label="Incluídos no aplicativo" value={bundled.length} />
          <Stat label="Instalados pelo usuário" value={installed.length} />
        </section>

        <section className="mt-5 rounded-xl border border-border/70 bg-card p-4 sm:p-5">
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
          <section className="mt-5 grid gap-3 xl:grid-cols-2">
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
    <article className="rounded-xl border border-border/70 bg-card p-4">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand-soft">
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

      <div className="mt-4 space-y-3">
        {manifest.capabilities.map((capability) => (
          <div
            key={capability.id}
            className="rounded-lg border border-border/60 bg-background/30 p-3"
          >
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
      </footer>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
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
