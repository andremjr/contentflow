import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects } from "@/lib/mock-data";
import { ExternalLink } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/research")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Pesquisa de conteúdo · ${p.title}` : "Pesquisa de conteúdo · Projeto" },
        { name: "description", content: "Executar pesquisa de vídeos de referência para este projeto." },
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
          <Button asChild className="mt-4">
            <Link to="/dashboard">Ir para o dashboard</Link>
          </Button>
        </div>
      </div>
    </AppShell>
  ),
  component: ProjectResearchPage,
});

function ProjectResearchPage() {
  const { project } = Route.useLoaderData();
  return (
    <ProcessRunner
      project={project}
      processId="research"
      description="Roda a busca com os filtros e canais de referência do canal."
      renderResult={(data) => (
        <div className="space-y-3">
          <p className="text-[11px] text-muted-foreground">
            {data.items.length} resultado{data.items.length === 1 ? "" : "s"} ·
            idioma <span className="text-foreground">{data.meta.language}</span> ·
            views mínimas{" "}
            <span className="text-foreground">
              {data.meta.minViews?.toLocaleString() ?? "—"}
            </span>
          </p>
          <ul className="divide-y divide-border/50 text-sm">
            {data.items.map((r) => (
              <li
                key={r.url}
                className="flex items-center justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.channel} · {r.views} · {r.publishedAt}
                  </p>
                </div>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline"
                >
                  Abrir <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    />
  );
}
