import { createFileRoute } from "@tanstack/react-router";
import { Activity, ArrowUpRight, Sparkles } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { MetricCard } from "@/components/metric-card";
import { ProjectCard } from "@/components/project-card";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ProcessStatus } from "@/components/process-status";
import { PipelineTrack } from "@/components/pipeline-track";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  metrics,
  projects,
  channels,
  activityFeed,
  PROCESS_ORDER,
  PROCESS_META,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Visão geral — ContentFlow OS" },
      {
        name: "description",
        content:
          "Central de comando para produção de conteúdo em canais do YouTube. Pipeline, canais e métricas em um só lugar.",
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

const activityToneClass = {
  brand: "bg-brand/15 text-brand-soft border-brand/40",
  warning: "bg-warning/15 text-warning border-warning/40",
  error: "bg-destructive/15 text-destructive border-destructive/40",
  success: "bg-success/15 text-success border-success/40",
} as const;

function OverviewPage() {
  const activeCounts = PROCESS_ORDER.map((stage) => ({
    stage,
    count: projects.filter((p) => p.currentStage === stage).length,
  }));
  const maxCount = Math.max(1, ...activeCounts.map((s) => s.count));

  return (
    <AppShell>
      <TopBar
        breadcrumbs={[{ label: "ContentFlow OS" }, { label: "Visão geral" }]}
        title="Visão geral"
        subtitle="Estado atual da produção em todos os canais"
      />

      <main className="flex-1 space-y-8 px-6 py-6">
        {/* Hero banner */}
        <section className="relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6">
          <div
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              background:
                "radial-gradient(40rem 20rem at 90% -20%, oklch(0.58 0.22 264 / 0.35), transparent 60%)",
            }}
          />
          <div className="relative flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand-soft">
                <Sparkles className="size-3" />
                Pipeline em tempo real
              </span>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                Bom trabalho, Lucas. Hoje 4 processos precisam da sua atenção.
              </h2>
              <p className="mt-1.5 text-sm text-muted-foreground">
                2 aprovações pendentes há mais de 24h e 1 erro no gerador de
                roteiro. Sua fila de publicação está fluindo.
              </p>
              <div className="mt-4 flex gap-2">
                <Button className="gradient-brand text-white shadow-[0_8px_24px_-8px_oklch(0.58_0.22_264/0.8)]">
                  Revisar pendências
                </Button>
                <Button variant="outline" className="border-border/60 bg-background/40">
                  Ver pipeline
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:min-w-[360px]">
              {channels.slice(0, 3).map((c) => (
                <div
                  key={c.id}
                  className="rounded-xl border border-border/60 bg-background/40 p-3"
                >
                  <ChannelAvatar channel={c} size="lg" />
                  <p className="mt-2 truncate text-xs font-medium">{c.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {c.subscribers} inscritos
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map((m) => (
            <MetricCard key={m.id} {...m} />
          ))}
        </section>

        {/* Pipeline distribution */}
        <section className="rounded-2xl border border-border/60 bg-card p-5">
          <header className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Distribuição do pipeline</h3>
              <p className="text-xs text-muted-foreground">
                Projetos ativos por estágio atual
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs text-muted-foreground"
            >
              Ver pipeline completo
              <ArrowUpRight className="size-3" />
            </Button>
          </header>

          <div className="mt-5 grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
            {activeCounts.map(({ stage, count }) => {
              const meta = PROCESS_META[stage];
              const Icon = meta.icon;
              const heightPct = (count / maxCount) * 100;
              return (
                <div
                  key={stage}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border/50 bg-background/40 p-3"
                >
                  <div className="flex h-20 items-end">
                    <div
                      className={cn(
                        "w-6 rounded-md transition-all",
                        count > 0
                          ? "bg-gradient-to-t from-brand to-brand-soft shadow-[0_0_20px_-4px_oklch(0.58_0.22_264/0.6)]"
                          : "bg-muted/40",
                      )}
                      style={{ height: `${Math.max(6, heightPct)}%` }}
                    />
                  </div>
                  <Icon className="size-3.5 text-muted-foreground" />
                  <p className="text-center text-[10px] font-medium text-muted-foreground">
                    {meta.label}
                  </p>
                  <p className="font-mono text-sm font-semibold">
                    {String(count).padStart(2, "0")}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Projects + activity */}
        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Projetos em produção</h3>
                <p className="text-xs text-muted-foreground">
                  Visão rápida do que está em movimento agora
                </p>
              </div>
              <Button variant="outline" size="sm" className="h-8 border-border/60 bg-background/40 text-xs">
                Ver todos
              </Button>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
              {projects.map((p) => (
                <ProjectCard key={p.id} project={p} />
              ))}
            </div>
          </div>

          {/* Right rail */}
          <aside className="space-y-6">
            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <header className="flex items-center justify-between">
                <h3 className="inline-flex items-center gap-2 text-sm font-semibold">
                  <Activity className="size-4 text-brand-soft" />
                  Atividade recente
                </h3>
                <span className="text-[10px] text-muted-foreground">ao vivo</span>
              </header>
              <ul className="mt-4 space-y-4">
                {activityFeed.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={cn(
                        "mt-1 size-2 shrink-0 rounded-full border",
                        activityToneClass[a.tone],
                      )}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">{a.project}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {a.action}
                      </p>
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                        {a.time}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-border/60 bg-card p-5">
              <h3 className="text-sm font-semibold">Fila de revisão</h3>
              <p className="text-xs text-muted-foreground">
                Aguardando sua aprovação
              </p>
              <Separator className="my-4 bg-border/60" />
              <ul className="space-y-4">
                {projects
                  .filter((p) => p.state === "awaiting_review")
                  .concat(projects.filter((p) => p.state === "error"))
                  .slice(0, 3)
                  .map((p) => {
                    const channel = channels.find((c) => c.id === p.channelId)!;
                    return (
                      <li key={p.id} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <ChannelAvatar channel={channel} size="sm" />
                          <p className="min-w-0 flex-1 truncate text-xs font-medium">
                            {p.title}
                          </p>
                          <ProcessStatus state={p.state} />
                        </div>
                        <PipelineTrack stages={p.stages} compact />
                      </li>
                    );
                  })}
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </AppShell>
  );
}
