import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/assets")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Assets · ${p.title}` : "Assets · Projeto" },
        { name: "description", content: "Selecionar assets para este projeto." },
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
  component: ProjectAssetsPage,
});

function ProjectAssetsPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.assets;
  const hues = [200, 30, 120, 300, 60, 260, 180, 340];
  return (
    <>
      <ProcessRunner
        project={project}
        processId="assets"
        description="Aplica as regras de inserção, estilo e referências visuais do canal."
        result={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {hues.map((h, i) => (
              <div
                key={h}
                className="relative aspect-square overflow-hidden rounded-lg border border-border/60"
                style={{
                  background: `linear-gradient(135deg, oklch(0.45 0.15 ${h}), oklch(0.2 0.05 ${h}))`,
                }}
              >
                <div className="absolute inset-x-0 bottom-0 bg-black/40 px-2 py-1 text-[10px] text-white backdrop-blur">
                  Asset #{String(i + 1).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>
        }
      />
    </>
  );
}
