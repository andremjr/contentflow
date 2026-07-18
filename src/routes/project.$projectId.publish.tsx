import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";
import { CheckCircle2, Youtube } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/publish")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Publicação · ${p.title}` : "Publicação · Projeto" },
        { name: "description", content: "Publicar este projeto no YouTube." },
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
  component: ProjectPublishPage,
});

function ProjectPublishPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.publishing;
  return (
    <>
      <ProcessRunner
        project={project}
        processId="publishing"
        description="Envia o vídeo para o YouTube usando a agenda e metadados do canal."
        result={
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
              <CheckCircle2 className="mt-0.5 size-5 text-emerald-300" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Publicação agendada com sucesso</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {project.title} · publicará em <span className="text-foreground">quarta, 20:00 BRT</span>
                </p>
              </div>
              <a
                href="#"
                className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"
              >
                <Youtube className="size-3.5" /> Abrir no YouTube
              </a>
            </div>
            <dl className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Visibilidade</dt>
                <dd className="mt-0.5 font-medium">Público (agendado)</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Playlist</dt>
                <dd className="mt-0.5 font-medium">Economia em foco</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Tags</dt>
                <dd className="mt-0.5 font-medium">economia, dívida, macro, análise</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Canal</dt>
                <dd className="mt-0.5 font-medium">{channel.name}</dd>
              </div>
            </dl>
          </div>
        }
      />
    </>
  );
}
