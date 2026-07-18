import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";
import { Play, Download } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/edit")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Edição · ${p.title}` : "Edição · Projeto" },
        { name: "description", content: "Renderizar edição final deste projeto." },
      ],
    };
  },
  loader: ({ params }) => {
    const project = projects.find((x) => x.id === params.projectId);
    if (!project) throw notFound();
    const channel = channels.find((c) => c.id === project.channelId)!;
    return { project, channel };
  },
  notFoundComponent: () => (
    <AppShell>
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Projeto não encontrado</h2>
          <Button asChild className="mt-4"><Link to="/dashboard">Voltar</Link></Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ProjectEditPage,
});

function ProjectEditPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.editing;
  return (
    <>
      <ProcessRunner
        project={project}
        processId="editing"
        description="Executa a renderização usando o preset de edição do canal."
        result={
          <div className="space-y-4">
            <div
              className="relative aspect-video overflow-hidden rounded-xl border border-border/60"
              style={{
                background: `linear-gradient(135deg, oklch(0.35 0.15 ${project.thumbHue}), oklch(0.18 0.05 ${project.thumbHue}))`,
              }}
            >
              <div className="absolute inset-0 grid place-items-center">
                <Button size="icon" className="size-14 rounded-full gradient-brand text-white shadow-lg">
                  <Play className="size-6 fill-current" />
                </Button>
              </div>
              <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                <p className="text-lg font-extrabold drop-shadow">{project.title}</p>
                <p className="text-xs opacity-80">Duração final · {project.duration}</p>
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
              <span className="text-muted-foreground">
                Render: <span className="font-mono text-foreground">1920×1080 · H.264 · 45MB</span>
              </span>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60">
                <Download className="size-3.5" /> Baixar MP4
              </Button>
            </div>
          </div>
        }
      />
    </>
  );
}
