import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Plus,
  MoreHorizontal,
  ArrowRight,
  Radio,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NewChannelDialog } from "@/components/new-channel-dialog";
import type { Channel } from "@/lib/mock-data";
import { useChannels, removeChannel } from "@/lib/store";
import { cn } from "@/lib/utils";

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

const STATUS_META: Record<
  Channel["status"],
  { label: string; class: string; dot: string }
> = {
  healthy: {
    label: "Saudável",
    class: "bg-success/10 text-success border-success/40",
    dot: "bg-success",
  },
  attention: {
    label: "Atenção",
    class: "bg-warning/10 text-warning border-warning/40",
    dot: "bg-warning",
  },
  paused: {
    label: "Pausado",
    class: "bg-muted/40 text-muted-foreground border-border/60",
    dot: "bg-muted-foreground/60",
  },
};

function DashboardPage() {
  const channels = useChannels();
  const hasChannels = channels.length > 0;

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Visão geral" }]}
        title="Visão geral"
        subtitle="Escolha um canal para abrir sua produção"
        showNewProject={false}
        actions={<NewChannelDialog />}
      />

      <main className="flex-1 px-6 py-6">
        {hasChannels ? (
          <section>
            <header className="mb-4">
              <h2 className="text-sm font-semibold">Seus canais</h2>
              <p className="text-xs text-muted-foreground">
                {channels.length} {channels.length === 1 ? "canal" : "canais"} · cada canal é um workspace
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {channels.map((c) => {
                return (
                  <article
                    key={c.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card transition hover:border-brand/50"
                  >
                    <div
                      className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-70"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${c.color}, transparent)`,
                      }}
                    />

                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <ChannelAvatar channel={c} size="lg" />
                          <div className="min-w-0">
                            <h3 className="truncate text-base font-semibold">
                              {c.name}
                            </h3>
                            <p className="truncate text-xs text-muted-foreground">
                              {c.handle} · {c.niche} · {c.language}
                            </p>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground"
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>Editar canal</DropdownMenuItem>
                            <DropdownMenuItem>
                              Pausar produção
                            </DropdownMenuItem>
                            <DropdownMenuItem>Duplicar</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => removeChannel(c.id)}
                            >
                              Remover
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <Link
                      to="/channel/$channelId"
                      params={{ channelId: c.id }}
                      className="flex items-center justify-between border-t border-border/50 bg-background/30 px-5 py-3 text-xs text-brand-soft transition hover:bg-brand/10"
                    >
                      <span>Abrir workspace do canal</span>
                      <ArrowRight className="size-4" />
                    </Link>
                  </article>
                );
              })}
            </div>
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
        Adicione seu primeiro canal para começar a organizar a produção de
        conteúdo.
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
