import { createFileRoute, Link } from "@tanstack/react-router";
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
  RefreshCw,
  Trash2,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { ChannelAvatar } from "@/components/channel-avatar";
import { ProcessStatus } from "@/components/process-status";
import { NewProjectDialog } from "@/components/new-project-dialog";
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
import { PROCESS_META, type Channel, type Project } from "@/lib/domain";
import { removeProject, syncChannelFromYouTube, useChannel, useProjects } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/channel/$channelId/")({ component: ChannelWorkspace });

function ChannelWorkspace() {
  const { channelId } = Route.useParams();
  const channel = useChannel(channelId);
  const projects = useProjects(channelId);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return projects;
    const q = search.toLowerCase();
    return projects.filter((p) => p.title.toLowerCase().includes(q));
  }, [projects, search]);

  if (!channel) return null;

  async function syncYouTube() {
    setIsSyncing(true);
    try {
      await syncChannelFromYouTube(channelId);
      toast.success("Canal atualizado com os dados públicos do YouTube.");
    } catch (error) {
      toast.error("Não foi possível atualizar o canal", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setIsSyncing(false);
    }
  }

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
            <NewProjectDialog channelId={channel.id} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-9 text-muted-foreground">
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Ações do canal</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Editar canal</DropdownMenuItem>
                <DropdownMenuItem>Duplicar configurações</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive">Arquivar canal</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <main className="flex-1 space-y-4 px-4 py-4 sm:px-6 sm:py-6">
        <section className="relative isolate min-h-36 overflow-hidden rounded-2xl border border-border/70 bg-card sm:min-h-44">
          {channel.bannerUrl ? (
            <img
              src={channel.bannerUrl}
              alt={`Banner do canal ${channel.name}`}
              className="absolute inset-0 size-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(circle at 20% 20%, ${channel.color}88, transparent 45%), linear-gradient(135deg, ${channel.color}55, #090f1c 70%)`,
              }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/15" />
          <div className="relative flex min-h-36 items-end justify-between gap-4 p-4 sm:min-h-44 sm:p-5">
            <div className="flex min-w-0 items-center gap-3 text-white">
              <ChannelAvatar
                channel={channel}
                size="lg"
                className="!size-14 ring-2 ring-white/50 sm:!size-16"
              />
              <div className="min-w-0 drop-shadow">
                <h2 className="truncate text-lg font-semibold sm:text-xl">{channel.name}</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/80">
                  <span>{channel.handle}</span>
                  <span className="inline-flex items-center gap-1">
                    <UsersRound className="size-3.5" />
                    {channel.subscribers || "0 inscritos"}
                  </span>
                </div>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 gap-1.5 bg-black/45 text-white backdrop-blur hover:bg-black/60"
              onClick={syncYouTube}
              disabled={isSyncing}
            >
              <RefreshCw className={cn("size-3.5", isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">Atualizar YouTube</span>
            </Button>
          </div>
        </section>

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
          <EmptyProjects channelId={channel.id} channelName={channel.name} />
        ) : view === "cards" ? (
          <ProjectGrid projects={filtered} channel={channel} />
        ) : (
          <ProjectTable projects={filtered} channel={channel} />
        )}
      </main>
    </AppShell>
  );
}

function ProjectGrid({ projects, channel }: { projects: Project[]; channel: Channel }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {projects.map((p) => {
        const stage = PROCESS_META[p.currentStage];
        return (
          <div
            key={p.id}
            className="group relative overflow-hidden rounded-xl border border-border/70 bg-card transition hover:border-brand/50"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 z-10 size-7 bg-black/50 text-white opacity-0 backdrop-blur transition group-hover:opacity-100 hover:bg-black/70"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => {
                    if (confirm(`Excluir "${p.title}"?`)) removeProject(p.id);
                  }}
                >
                  <Trash2 className="mr-2 size-3.5" />
                  Excluir projeto
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link to="/project/$projectId" params={{ projectId: p.id }} className="block">
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
                    <span className="font-mono text-foreground">{p.progress}%</span>
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
                    <span className="truncate">{p.assignee.name.split(" ")[0]}</span>
                  </span>
                  <span
                    className={cn("inline-flex items-center gap-1", p.isLate && "text-destructive")}
                  >
                    <Calendar className="size-3" />
                    {p.deadline}
                  </span>
                </footer>
              </div>
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function ProjectTable({ projects, channel }: { projects: Project[]; channel: Channel }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card">
      <Table>
        <TableHeader>
          <TableRow className="border-border/60 hover:bg-transparent">
            <TableHead className="text-[11px] uppercase tracking-wider">Projeto</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Etapa</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Progresso</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Prazo</TableHead>
            <TableHead className="text-[11px] uppercase tracking-wider">Responsável</TableHead>
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
                    <span className="font-mono text-xs text-muted-foreground">{p.progress}%</span>
                  </div>
                </TableCell>
                <TableCell
                  className={cn("text-xs", p.isLate ? "text-destructive" : "text-muted-foreground")}
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
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs text-brand-soft"
                    >
                      <Link to="/project/$projectId" params={{ projectId: p.id }}>
                        Abrir
                        <ArrowRight className="size-3" />
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir "${p.title}"?`)) removeProject(p.id);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function EmptyProjects({ channelId, channelName }: { channelId: string; channelName: string }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <div className="grid size-14 place-items-center rounded-2xl border border-border/60 bg-card">
        <FolderKanban className="size-6 text-brand-soft" />
      </div>
      <h2 className="mt-4 text-lg font-semibold">Nenhum projeto ainda</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Comece a produção de {channelName} criando o primeiro projeto.
      </p>
      <div className="mt-5">
        <NewProjectDialog
          channelId={channelId}
          trigger={
            <Button className="gap-1.5 gradient-brand text-white">
              <Plus className="size-4" />
              Novo projeto
            </Button>
          }
        />
      </div>
    </div>
  );
}
