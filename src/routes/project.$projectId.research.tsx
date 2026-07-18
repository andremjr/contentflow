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
        { title: p ? `Pesquisa · ${p.title}` : "Pesquisa · Projeto" },
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
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.research;

  return (
    <>
      <ProcessRunner
        project={project}
        processId="research"
        description="Roda a busca com os filtros e canais de referência do canal."
        result={
          <ul className="divide-y divide-border/50 text-sm">
            {mockResults.map((r) => (
              <li key={r.title} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">{r.channel} · {r.views} · {r.date}</p>
                </div>
                <a href="#" className="inline-flex items-center gap-1 text-xs text-brand-soft hover:underline">
                  Abrir <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        }
      />
    </>
  );
}

const mockResults = [
  { title: "O verdadeiro custo da dívida americana", channel: "Money Explained", views: "1,2M", date: "há 3 dias" },
  { title: "Por que juros altos travam a economia", channel: "Economia Diária", views: "820k", date: "há 1 semana" },
  { title: "A crise silenciosa dos bancos regionais", channel: "Cortex Finance", views: "450k", date: "há 2 semanas" },
  { title: "O que ninguém te contou sobre inflação", channel: "Finance Simplified", views: "2,1M", date: "há 1 mês" },
];
