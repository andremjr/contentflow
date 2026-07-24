import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects } from "@/lib/mock-data";
import { Download } from "lucide-react";

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
    return { project };
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
  const { project } = Route.useLoaderData();
  return (
    <ProcessRunner
      project={project}
      processId="editing"
      description="Executa a renderização usando o preset de edição do canal."
      renderResult={(data) => (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-border/60 bg-black">
            <video
              key={data.videoUrl}
              controls
              preload="metadata"
              poster={`https://picsum.photos/seed/${project.id}-cover/1280/720`}
              className="aspect-video w-full"
              src={data.videoUrl}
            >
              Seu navegador não suporta reprodução de vídeo.
            </video>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
            <span className="text-muted-foreground">
              Render:{" "}
              <span className="font-mono text-foreground">
                {data.resolution} · template {data.template} ·
                {data.captions ? " com legendas" : " sem legendas"}
              </span>
            </span>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60">
              <Download className="size-3.5" /> Baixar MP4
            </Button>
          </div>
        </div>
      )}
    />
  );
}
