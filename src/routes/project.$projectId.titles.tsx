import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";
import { Check } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/titles")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Títulos · ${p.title}` : "Títulos · Projeto" },
        { name: "description", content: "Gerar variações de título para este projeto." },
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
  component: ProjectTitlesPage,
});

function ProjectTitlesPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.titles;
  return (
    <>
      <ProcessRunner
        project={project}
        processId="titles"
        description="Aplica fórmulas, vocabulário e limites de comprimento do canal."
        result={
          <ul className="space-y-2">
            {mockTitles.map((t, i) => (
              <li
                key={t}
                className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-xs text-muted-foreground">
                    #{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate text-sm">{t}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{t.length} chars</span>
              </li>
            ))}
          </ul>
        }
      />
    </>
  );
}

const mockTitles = [
  "O verdadeiro custo da dívida americana (é pior do que parece)",
  "Ninguém está falando sobre esse indicador — mas deveriam",
  "Por que economistas estão em pânico com esse gráfico",
  "A bomba-relógio silenciosa da economia global",
  "O que o Fed sabe que você ainda não descobriu",
];
