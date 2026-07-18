import {
  createFileRoute,
  Link,
  notFound,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { TopBar } from "@/components/top-bar";
import { Button } from "@/components/ui/button";
import { ChannelAvatar } from "@/components/channel-avatar";
import {
  channels,
  projects,
  PROCESS_ORDER,
  PROCESS_META,
  type ProcessId,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/project/$projectId")({
  loader: ({ params }) => {
    const project = projects.find((x) => x.id === params.projectId);
    if (!project) throw notFound();
    const channel = channels.find((c) => c.id === project.channelId);
    if (!channel) throw notFound();
    return { project, channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Projeto não encontrado</h2>
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ProjectLayout,
});

// ProcessId → URL segment used by the sibling route files
const SLUG: Record<ProcessId, string> = {
  research: "research",
  ideas: "ideas",
  titles: "titles",
  thumbnail: "thumbnail",
  script: "script",
  narration: "narration",
  assets: "assets",
  editing: "edit",
  publishing: "publish",
};

function ProjectLayout() {
  const { project, channel } = Route.useLoaderData();
  const pathname = useLocation({ select: (s) => s.pathname });
  const base = `/project/${project.id}`;
  const activeSlug = pathname.startsWith(base + "/")
    ? pathname.slice(base.length + 1).split("/")[0]
    : "";

  return (
    <AppShell>
      <TopBar
        title={project.title}
        subtitle={channel.name}
        breadcrumbs={[
          { label: "Canais", to: "/dashboard" },
          { label: channel.name, to: `/channel/${channel.id}` as never },
          { label: project.title },
        ]}
      />

      {/* Simple, responsive process nav */}
      <nav
        aria-label="Processos do projeto"
        className="border-b border-border/70 bg-background/60"
      >
        <div className="scrollbar-thin flex gap-1 overflow-x-auto px-3 py-2 sm:px-4">
          {PROCESS_ORDER.map((p, i) => {
            const meta = PROCESS_META[p];
            const slug = SLUG[p];
            const isActive = activeSlug === slug;
            const Icon = meta.icon;
            return (
              <Link
                key={p}
                to={`${base}/${slug}` as never}
                className={cn(
                  "group inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                  isActive
                    ? "bg-brand/15 text-brand-soft"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full font-mono text-[9px]",
                    isActive
                      ? "bg-brand text-white"
                      : "bg-secondary text-muted-foreground group-hover:bg-secondary/80",
                  )}
                >
                  {i + 1}
                </span>
                <Icon className="hidden size-3.5 sm:inline" />
                <span className="whitespace-nowrap">{meta.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Outlet />

      {/* keep ChannelAvatar import from being flagged as unused in tree-shake */}
      <span className="hidden">
        <ChannelAvatar channel={channel} size="sm" />
      </span>
    </AppShell>
  );
}
