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
    <>
      <ProcessRunner
        project={project}
        processId="script"
        description="Executa o pipeline de outline + desenvolvimento configurado no canal."
        result={
          <article className="prose prose-invert max-w-none text-sm leading-relaxed">
            <h3 className="text-base font-semibold text-foreground">Abertura</h3>
            <p className="text-muted-foreground">
              Tem um número que quase ninguém está olhando — e ele explica por que o seu
              poder de compra continua caindo mesmo com a inflação oficial em queda. Nos
              próximos minutos, você vai entender exatamente o que está acontecendo.
            </p>
            <h3 className="mt-4 text-base font-semibold text-foreground">Desenvolvimento</h3>
            <p className="text-muted-foreground">
              Nas últimas décadas, três forças convergiram para redesenhar a economia global:
              a financeirização do crédito, a dependência dos bancos centrais e a
              fragmentação das cadeias produtivas.
            </p>
            <h3 className="mt-4 text-base font-semibold text-foreground">CTA final</h3>
            <p className="text-muted-foreground">
              Se esse tipo de análise te ajuda a enxergar o que os grandes veículos ignoram,
              se inscreva no canal — no próximo vídeo eu mostro os três indicadores que
              o mercado está usando agora.
            </p>
          </article>
        }
      />
    </>
  );
}
