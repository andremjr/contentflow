import { useMemo, useRef, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Blocks,
  Bot,
  CircleUserRound,
  Code2,
  Copy,
  Download,
  Search,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { ChannelAvatar } from "@/components/channel-avatar";
import { TopBar } from "@/components/top-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  type BlockOperator,
  type Channel,
  type ProcessMethod,
  type UniversalProcess,
} from "@/lib/domain";
import { copyImportedBlocks, parseMethodFile, serializeMethodFile } from "@/lib/method-file";
import { setChannelMethod, useChannels } from "@/lib/store";

export const Route = createFileRoute("/methods")({
  head: () => ({
    meta: [
      { title: "Métodos — ContentFlow OS" },
      {
        name: "description",
        content: "Biblioteca global de métodos de criação salvos nos canais.",
      },
    ],
  }),
  component: MethodsLibraryPage,
});

type MethodEntry = {
  channel: Channel;
  processType: UniversalProcess;
  method: ProcessMethod;
};

type TransferDraft = {
  name: string;
  method: ProcessMethod;
  sourceChannelId?: string;
};

const OPERATOR_ICON: Record<BlockOperator, typeof Bot> = {
  IA: Bot,
  Humano: CircleUserRound,
  Código: Code2,
};

function MethodsLibraryPage() {
  const channels = useChannels();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [processFilter, setProcessFilter] = useState<UniversalProcess | "all">("all");
  const [transfer, setTransfer] = useState<TransferDraft>();
  const [targetChannelId, setTargetChannelId] = useState("");

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

  const filteredEntries = entries.filter((entry) => {
    const matchesProcess = processFilter === "all" || entry.processType === processFilter;
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    const matchesQuery =
      !normalizedQuery ||
      entry.channel.name.toLocaleLowerCase("pt-BR").includes(normalizedQuery) ||
      PROCESS_META[entry.processType].label.toLocaleLowerCase("pt-BR").includes(normalizedQuery) ||
      entry.method.blocks.some((block) =>
        (block.name ?? block.type).toLocaleLowerCase("pt-BR").includes(normalizedQuery),
      );
    return matchesProcess && matchesQuery;
  });

  function downloadMethod(entry: MethodEntry) {
    const processLabel = PROCESS_META[entry.processType].label;
    const contents = serializeMethodFile(`${processLabel} — ${entry.channel.name}`, entry.method);
    downloadJson(contents, `metodo-${entry.processType}-${slug(entry.channel.name)}.json`);
    toast.success("Método exportado", {
      description: "O arquivo pode ser compartilhado e importado em outra instalação.",
    });
  }

  async function importFile(file: File) {
    try {
      const parsed = parseMethodFile(await file.text());
      setTransfer({ name: parsed.name, method: parsed.method });
      setTargetChannelId(channels[0]?.id ?? "");
    } catch (error) {
      toast.error("Não foi possível importar o método", {
        description: error instanceof Error ? error.message : "Arquivo inválido.",
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmTransfer() {
    if (!transfer || !targetChannelId) return;
    const target = channels.find((channel) => channel.id === targetChannelId);
    if (!target) return;
    const copiedBlocks = copyImportedBlocks(
      transfer.method.processType,
      transfer.method.blocks,
      createId,
    );
    await setChannelMethod(target.id, transfer.method.processType, {
      processType: transfer.method.processType,
      blocks: copiedBlocks,
    });
    toast.success(`Método copiado para ${target.name}`, {
      description: "Blocos Escolher devem ser vinculados às coleções desse canal.",
    });
    setTransfer(undefined);
    setTargetChannelId("");
  }

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Métodos" }]}
        title="Métodos"
        subtitle="Use, compartilhe e gerencie métodos salvos nos seus canais"
        showNewProject={false}
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.contentflow-method.json,application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importFile(file);
              }}
            />
            <Button
              size="sm"
              className="gap-1.5"
              disabled={!channels.length}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" /> Importar método
            </Button>
          </>
        }
      />

      <main className="flex-1 px-4 py-5 sm:px-6">
        <section className="grid gap-3 sm:grid-cols-3">
          <Stat label="Métodos salvos" value={entries.length} />
          <Stat
            label="Canais com métodos"
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
                placeholder="Buscar por canal, processo ou ação..."
                className="pl-9"
              />
            </div>
            <Select
              value={processFilter}
              onValueChange={(value) => setProcessFilter(value as UniversalProcess | "all")}
            >
              <SelectTrigger className="w-full sm:w-56">
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
          </div>

          {filteredEntries.length ? (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {filteredEntries.map((entry) => (
                <MethodCard
                  key={`${entry.channel.id}-${entry.processType}`}
                  entry={entry}
                  canCopy={channels.some((channel) => channel.id !== entry.channel.id)}
                  onDownload={() => downloadMethod(entry)}
                  onCopy={() => {
                    setTransfer({
                      name: `${PROCESS_META[entry.processType].label} — ${entry.channel.name}`,
                      method: entry.method,
                      sourceChannelId: entry.channel.id,
                    });
                    setTargetChannelId(
                      channels.find((channel) => channel.id !== entry.channel.id)?.id ?? "",
                    );
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 grid min-h-72 place-items-center rounded-xl border border-dashed border-border bg-card/25 p-8 text-center">
              <div>
                <Blocks className="mx-auto size-7 text-muted-foreground" />
                <h2 className="mt-3 text-sm font-semibold">Nenhum método encontrado</h2>
                <p className="mt-1 max-w-md text-xs text-muted-foreground">
                  Crie métodos dentro de um canal ou importe um arquivo compartilhado.
                </p>
              </div>
            </div>
          )}
        </section>
      </main>

      <Dialog open={Boolean(transfer)} onOpenChange={(open) => !open && setTransfer(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar método a um canal</DialogTitle>
            <DialogDescription>
              {transfer?.name}. A cópia ficará independente do método original.
            </DialogDescription>
          </DialogHeader>
          <Select value={targetChannelId} onValueChange={setTargetChannelId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o canal" />
            </SelectTrigger>
            <SelectContent>
              {channels
                .filter((channel) => channel.id !== transfer?.sourceChannelId)
                .map((channel) => (
                  <SelectItem key={channel.id} value={channel.id}>
                    {channel.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransfer(undefined)}>
              Cancelar
            </Button>
            <Button disabled={!targetChannelId} onClick={() => void confirmTransfer()}>
              <Copy className="mr-1.5 size-4" /> Adicionar ao canal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function MethodCard({
  entry,
  canCopy,
  onDownload,
  onCopy,
}: {
  entry: MethodEntry;
  canCopy: boolean;
  onDownload: () => void;
  onCopy: () => void;
}) {
  const process = PROCESS_META[entry.processType];
  const ProcessIcon = process.icon;
  return (
    <article className="rounded-xl border border-border/70 bg-card p-4">
      <header className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/25 bg-brand/10 text-brand-soft">
          <ProcessIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">Método de {process.label}</h2>
            <Badge variant="secondary" className="text-[10px]">
              {entry.method.blocks.length} {entry.method.blocks.length === 1 ? "bloco" : "blocos"}
            </Badge>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <ChannelAvatar channel={entry.channel} size="sm" className="!size-5 !text-[9px]" />
            <span className="truncate">{entry.channel.name}</span>
          </div>
        </div>
      </header>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {entry.method.blocks.map((block, index) => {
          const OperatorIcon = OPERATOR_ICON[block.operator];
          return (
            <Badge key={block.id} variant="outline" className="gap-1 text-[10px]">
              {index + 1}. {block.name ?? block.type}
              <OperatorIcon className="size-3 text-muted-foreground" />
            </Badge>
          );
        })}
      </div>

      <footer className="mt-4 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        <Button asChild size="sm" variant="ghost" className="gap-1.5">
          <Link
            to="/channel/$channelId/methods"
            params={{ channelId: entry.channel.id }}
            search={{ process: entry.processType }}
          >
            Abrir <ArrowRight className="size-3.5" />
          </Link>
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={onDownload}>
          <Download className="size-3.5" /> Compartilhar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={!canCopy}
          onClick={onCopy}
        >
          <Copy className="size-3.5" /> Usar em outro canal
        </Button>
      </footer>
    </article>
  );
}

function Stat({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 text-xl font-semibold">
        {value}{" "}
        {suffix && <span className="text-xs font-normal text-muted-foreground">{suffix}</span>}
      </p>
    </div>
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

function downloadJson(contents: string, fileName: string) {
  const blob = new Blob([contents], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
