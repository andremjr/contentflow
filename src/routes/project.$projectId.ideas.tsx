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
    <>
      <ProcessRunner
        project={project}
        processId="ideas"
        description="Executa o gerador de ideias com o prompt e variáveis do canal."
        result={
          <ul className="grid gap-3 sm:grid-cols-2">
            {mockIdeas.map((i) => (
              <li key={i.title} className="rounded-lg border border-border/60 bg-background/40 p-4">
                <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-2 py-0.5 text-[10px] text-brand-soft">
                  <Lightbulb className="size-3" /> {i.trigger}
                </div>
                <p className="text-sm font-medium leading-snug">{i.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{i.summary}</p>
              </li>
            ))}
          </ul>
        }
      />
    </>
  );
}

const mockIdeas = [
  { trigger: "Curiosidade", title: "O que aconteceria com a economia sem o dólar?", summary: "Cenário hipotético analisando comércio global e reservas." },
  { trigger: "Medo", title: "5 sinais de que uma nova recessão está chegando", summary: "Indicadores macroeconômicos que antecedem crises." },
  { trigger: "Contra-intuitivo", title: "Por que salários maiores nem sempre te enriquecem", summary: "Efeito da inflação de estilo de vida e impostos progressivos." },
  { trigger: "Autoridade", title: "O manual secreto do Fed para conter crises", summary: "Ferramentas usadas por bancos centrais em choques sistêmicos." },
];
