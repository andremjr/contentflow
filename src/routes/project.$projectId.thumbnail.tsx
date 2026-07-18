import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";

export const Route = createFileRoute("/project/$projectId/thumbnail")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Thumbnail · ${p.title}` : "Thumbnail · Projeto" },
        { name: "description", content: "Gerar thumbnails para este projeto." },
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
  component: ProjectThumbnailPage,
});

function ProjectThumbnailPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.thumbnail;
  const hues = [220, 12, 145, 285];
  return (
    <>
      <ProcessRunner
        project={project}
        processId="thumbnail"
        description="Renderiza variações usando os layouts e assets do canal."
        result={
          <div className="grid gap-4 sm:grid-cols-2">
            {hues.map((h, i) => (
              <div
                key={h}
                className="relative aspect-video overflow-hidden rounded-xl border border-border/60"
                style={{
                  background: `linear-gradient(135deg, oklch(0.4 0.18 ${h}), oklch(0.22 0.05 ${h}))`,
                }}
              >
                <div
                  className="absolute inset-0 opacity-40"
                  style={{
                    backgroundImage:
                      "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.35), transparent 60%)",
                  }}
                />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="text-xs uppercase tracking-widest opacity-80">Variação {i + 1}</p>
                  <p className="mt-1 text-lg font-extrabold leading-tight drop-shadow">
                    {project.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        }
      />
    </>
  );
}
