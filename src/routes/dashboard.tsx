import { createFileRoute } from "@tanstack/react-router";
import { LoaderCircle, Plus, Radio } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { AppUpdateCard } from "@/components/app-update-card";
import { NewChannelDialog } from "@/components/new-channel-dialog";
import { SortableChannelGrid } from "@/components/sortable-channel-grid";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { useHiddenChannelIds } from "@/lib/channel-privacy";
import { useChannels, useDatabaseReady } from "@/lib/store";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Visão geral — ContentFlow OS" },
      {
        name: "description",
        content: "Cada canal é um workspace independente de produção de conteúdo.",
      },
      { property: "og:title", content: "Visão geral — ContentFlow OS" },
      {
        property: "og:description",
        content: "Escolha um canal para abrir sua produção.",
      },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const channels = useChannels();
  const databaseReady = useDatabaseReady();
  const hiddenChannelIds = useHiddenChannelIds();

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Visão geral" }]}
        title="Visão geral"
        subtitle="Escolha um canal para abrir sua produção"
        showNewProject={false}
        actions={<NewChannelDialog />}
      />

      <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <AppUpdateCard />
        {!databaseReady ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <LoaderCircle className="size-4 animate-spin" />
              Carregando seus canais...
            </span>
          </div>
        ) : channels.length > 0 ? (
          <section className="mx-auto max-w-[1500px]">
            <header className="mb-3 flex items-end justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-lg font-semibold">Seus canais</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Workspaces independentes de estratégia e produção
                </p>
              </div>
              <span className="text-xs text-muted-foreground">{channels.length} ativos</span>
            </header>
            <SortableChannelGrid channels={channels} hiddenChannelIds={hiddenChannelIds} />
          </section>
        ) : (
          <EmptyState />
        )}
      </main>
    </AppShell>
  );
}

function EmptyState() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
        <Radio className="size-6 text-brand-soft" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nenhum canal ainda</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Adicione seu primeiro canal para começar a organizar a produção de conteúdo.
      </p>
      <div className="mt-5">
        <NewChannelDialog
          trigger={
            <Button className="gap-1.5 gradient-brand text-white">
              <Plus className="size-4" />
              Adicionar canal
            </Button>
          }
        />
      </div>
    </div>
  );
}
