import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects } from "@/lib/mock-data";
import { Lightbulb } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/ideas")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Ideias · ${p.title}` : "Ideias · Projeto" },
        { name: "description", content: "Gerar ideias de vídeo para este projeto." },
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
  component: ProjectIdeasPage,
});

function ProjectIdeasPage() {
  const { project } = Route.useLoaderData();
  return (
    <ProcessRunner
      project={project}
      processId="ideas"
      description="Executa o gerador de ideias com o prompt e variáveis do canal."
      renderResult={(data) => (
        <ul className="grid gap-3 sm:grid-cols-2">
          {data.ideas.map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-border/60 bg-background/40 p-4"
            >
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand-soft">
                <Lightbulb className="size-3" /> {i.angle}
              </div>
              <p className="text-sm font-medium leading-snug">{i.title}</p>
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                score {i.score}
              </p>
            </li>
          ))}
        </ul>
      )}
    />
  );
}
