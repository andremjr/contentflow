import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/script")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Roteiro · ${p.title}` : "Roteiro · Projeto" },
        { name: "description", content: "Gerar roteiro para este projeto." },
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
  component: ProjectScriptPage,
});

function ProjectScriptPage() {
  const { project } = Route.useLoaderData();
  return (
    <ProcessRunner
      project={project}
      processId="script"
      description="Executa o pipeline de outline + desenvolvimento configurado no canal."
      renderResult={(data) => (
        <article className="prose prose-invert max-w-none text-sm leading-relaxed">
          <p className="text-[11px] text-muted-foreground">
            ~{data.wordCount.toLocaleString()} palavras alvo · {data.sections.length} seções
          </p>
          {data.sections.map((s) => (
            <div key={s.heading}>
              <h3 className="mt-4 text-base font-semibold text-foreground">
                {s.heading}
              </h3>
              <p className="text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </article>
      )}
    />
  );
}
