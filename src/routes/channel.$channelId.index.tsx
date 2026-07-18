import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus,
  MoreHorizontal,
  Search,
  ArrowRight,
  Calendar,
  AlertTriangle,
  LayoutGrid,
  Table as TableIcon,
  FolderKanban,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ProcessStatus } from "@/components/process-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  channels,
  projects as allProjects,
  PROCESS_META,
  PROCESS_ORDER,
  type Project,
  type ProcessId,
  type ProcessState,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/channel/$channelId/")({
  head: ({ params }) => {
    const ch = channels.find((c) => c.id === params.channelId);
    const title = ch ? `${ch.name} — ContentFlow OS` : "Canal — ContentFlow OS";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: ch
            ? `Projetos do canal ${ch.name}.`
            : "Projetos do canal.",
        },
      ],
    };
  },
  loader: ({ params }) => {
    const channel = channels.find((c) => c.id === params.channelId);
    if (!channel) throw notFound();
    return { channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Canal não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para a visão geral</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ChannelWorkspace,
});

function ChannelWorkspace() {
  const { channel } = Route.useLoaderData();
  const projects = useMemo(
    () => allProjects.filter((p) => p.channelId === channel.id),
    [channel.id],
  );
  const [view, setView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");


  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, search]);

  return (
    <AppShell>
      <TopBar
        showNewProject={false}
        breadcrumbs={[
          { label: "ContentFlow OS", to: "/dashboard" },
          { label: "Canais", to: "/dashboard" },
          { label: channel.name },
        ]}
        title={channel.name}
        subtitle={`${channel.handle} · ${channel.niche} · ${channel.language}`}
        actions={
          <>
            <Button
              size="sm"
              className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]"
            >
              <Plus className="size-4" />
              Novo projeto
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground"
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ações do canal</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Editar canal</DropdownMenuItem>
                <DropdownMenuItem>Duplicar configurações</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">
                  Arquivar canal
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main className="flex-1 space-y-4 px-6 py-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Projetos</h2>
            <p className="text-xs text-muted-foreground">
              {filtered.length} de {projects.length} projetos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto…"
                className="h-9 border-border/60 bg-background/60 pl-8 text-xs"
              />
            </div>
            <div className="inline-flex overflow-hidden rounded-md border border-border/60 bg-background/40 p-0.5">
              <button
                onClick={() => setView("cards")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                  view === "cards"
                    ? "bg-brand/20 text-brand-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <LayoutGrid className="size-3.5" /> Cards
              </button>
              <button
                onClick={() => setView("table")}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs transition",
                  view === "table"
                    ? "bg-brand/20 text-brand-soft"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <TableIcon className="size-3.5" /> Tabela
              </button>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <EmptyProjects channelName={channel.name} />
        ) : view === "cards" ? (
          <ProjectGrid projects={filtered} channel={channel} />
        ) : (
          <ProjectTable projects={filtered} channel={channel} />
        )}
      </main>
    </AppShell>
  );
}

function ProjectGrid({
  projects,
  channel,
}: {
  projects: Project[];
  channel: (typeof channels)[number];
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => {
        const stage = PROCESS_META[p.currentStage];
        return (
          <Link
            key={p.id}
            to="/project/$projectId"
            params={{ projectId: p.id }}
            className="group relative overflow-hidden rounded-xl border border-border/70 bg-card transition hover:border-brand/50"
          >
            <div
              className="relative aspect-video overflow-hidden"
              style={{
                background: `linear-gradient(135deg, oklch(0.4 0.18 ${p.thumbHue}), oklch(0.22 0.05 ${p.thumbHue}))`,
              }}
            >
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 60%)",
                }}
              />
              <div className="absolute left-2 top-2">
                <ChannelAvatar channel={channel} size="sm" />
              </div>
              <div className="absolute bottom-2 right-2 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white backdrop-blur">
                {p.duration}
              </div>
              {p.isLate && (
                <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/20 px-2 py-0.5 text-[10px] text-destructive backdrop-blur">
                  <AlertTriangle className="size-3" />
                  Atrasado
                </div>
              )}
            </div>

            <div className="p-3">
              <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight">
                {p.title}
              </h3>

              <div className="mt-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <stage.icon className="size-3.5 text-brand-soft" />
                  <span className="truncate">{stage.label}</span>
                </div>
                <ProcessStatus state={p.state} />
              </div>

              <div className="mt-3">
                <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>Progresso</span>
                  <span className="font-mono text-foreground">
                    {p.progress}%
                  </span>
                </div>
                <Progress value={p.progress} className="h-1" />
              </div>

              <footer className="mt-3 flex items-center justify-between border-t border-border/50 pt-2.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft font-mono text-[9px] font-bold text-white"
                    title={p.assignee.name}
                  >
                    {p.assignee.initials}
                  </span>
                  <span className="truncate">
                    {p.assignee.name.split(" ")[0]}
                  </span>
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1",
                    p.isLate && "text-destructive",
                  )}
                >
                  <Calendar className="size-3" />
                  {p.deadline}
                </span>
              </footer>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function ProjectTable({
  projects,
  channel,
}: {
  projects: Project[];
  channel: (typeof channels)[number];
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider">
              Projeto
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Etapa
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Progresso
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Prazo
            </TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">
              Responsável
            </TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {projects.map((p) => {
            const stage = PROCESS_META[p.currentStage];
            return (
              <TableRow key={p.id} className="border-border/50">
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <ChannelAvatar channel={channel} size="sm" />
                    <span className="text-sm font-medium">{p.title}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs">
                    <stage.icon className="size-3.5 text-brand-soft" />
                    {stage.label}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Progress value={p.progress} className="h-1.5 w-24" />
                    <span className="font-mono text-xs text-muted-foreground">
                      {p.progress}%
                    </span>
                  </div>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-xs",
                    p.isLate ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {p.deadline}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="grid size-5 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-soft font-mono text-[9px] font-bold text-white">
                      {p.assignee.initials}
                    </span>
                    {p.assignee.name.split(" ")[0]}
                  </span>
                </TableCell>
                <TableCell>
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs text-brand-soft"
                  >
                    <Link
                      to="/project/$projectId"
                      params={{ projectId: p.id }}
                    >
                      Abrir
                      <ArrowRight className="size-3" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyProjects({ channelName }: { channelName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
        <FolderKanban className="size-6 text-brand-soft" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nenhum projeto ainda</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comece a produção de {channelName} criando o primeiro projeto.
      </p>
      <Button className="mt-5 gap-1.5 gradient-brand text-white">
        <Plus className="size-4" />
        Novo projeto
      </Button>
    </div>
  );
}
