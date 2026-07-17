import { createFileRoute } from "@tanstack/react-router";
import { MoreHorizontal, Plus } from "lucide-react";
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
import { channels } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — ContentFlow OS" },
      {
        name: "description",
        content:
          "Central de comando para produção de conteúdo em canais do YouTube.",
      },
      { property: "og:title", content: "ContentFlow OS" },
      {
        property: "og:description",
        content:
          "Sistema operacional para produção de conteúdo em canais do YouTube.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: OverviewPage,
});

function OverviewPage() {
  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Visão geral" }]}
        title="Seus canais"
        subtitle={`${channels.length} canais gerenciados neste workspace`}
      />

      <main className="flex-1 px-6 py-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {channels.map((c) => (
            <article
              key={c.id}
              className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 transition hover:border-brand/50 hover:shadow-[0_0_0_1px_oklch(0.58_0.22_264/0.3),0_10px_40px_-20px_oklch(0.58_0.22_264/0.5)]"
            >
              <div
                className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-60"
                style={{
                  background: `linear-gradient(90deg, transparent, ${c.color}, transparent)`,
                }}
              />
              <header className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <ChannelAvatar channel={c} size="lg" />
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                      {c.name}
                    </h3>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.handle}
                    </p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem>Abrir canal</DropdownMenuItem>
                    <DropdownMenuItem>Editar</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive">
                      Remover
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </header>

              <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/50 pt-4">
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Inscritos
                  </dt>
                  <dd className="mt-0.5 font-mono text-lg font-semibold">
                    {c.subscribers}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Nicho
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">{c.niche}</dd>
                </div>
              </dl>
            </article>
          ))}

          {/* Add channel tile */}
          <button className="group flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border/70 bg-background/30 p-5 text-muted-foreground transition hover:border-brand/60 hover:bg-brand/5 hover:text-foreground">
            <span className="grid size-10 place-items-center rounded-full border border-border/60 bg-background/60 transition group-hover:border-brand/60 group-hover:text-brand-soft">
              <Plus className="size-4" />
            </span>
            <span className="text-sm font-medium">Adicionar canal</span>
            <span className="text-[11px] text-muted-foreground">
              Conecte um novo canal ao workspace
            </span>
          </button>
        </section>
      </main>
    </AppShell>
  );
}
