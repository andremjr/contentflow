import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels } from "@/lib/mock-data";
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
  return (
    <ProcessRunner
      project={project}
      processId="publishing"
      description="Envia o vídeo para o YouTube usando a agenda e metadados do canal."
      renderResult={(data) => (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
            <CheckCircle2 className="mt-0.5 size-5 text-emerald-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Publicação enviada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {project.title} · visibilidade{" "}
                <span className="text-foreground">{data.visibility}</span>
                {data.scheduledFor && (
                  <>
                    {" "}· agendado para{" "}
                    <span className="text-foreground">{data.scheduledFor}</span>
                  </>
                )}
              </p>
            </div>
            <a
              href={data.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"
            >
              <Youtube className="size-3.5" /> Abrir no YouTube
            </a>
          </div>
          <dl className="grid gap-3 rounded-lg border border-border/60 bg-background/40 p-4 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Video ID</dt>
              <dd className="mt-0.5 font-mono text-foreground">{data.videoId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Canal</dt>
              <dd className="mt-0.5 font-medium">{channel.name}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Tags</dt>
              <dd className="mt-0.5 font-medium">
                {data.tags.length ? data.tags.join(", ") : "—"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    />
  );
}
