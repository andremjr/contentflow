import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects } from "@/lib/mock-data";

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
  component: ProjectThumbnailPage,
});

function ProjectThumbnailPage() {
  const { project } = Route.useLoaderData();
  return (
    <ProcessRunner
      project={project}
      processId="thumbnail"
      description="Renderiza variações usando os layouts e assets do canal."
      renderResult={(data) => (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            {data.palette.map((c) => (
              <span
                key={c}
                className="size-4 rounded border border-border/60"
                style={{ background: c }}
                title={c}
              />
            ))}
            <span className="font-mono text-[10px] text-muted-foreground">
              paleta do canal
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {data.images.map((src, i) => (
              <div
                key={src}
                className="relative aspect-video overflow-hidden rounded-xl border border-border/60 bg-black"
              >
                <img
                  src={src}
                  alt={`Variação ${i + 1}`}
                  className="absolute inset-0 h-full w-full object-cover"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3 text-white">
                  <p className="text-xs uppercase tracking-widest opacity-80">
                    Variação {i + 1}
                  </p>
                  <p className="mt-1 text-lg font-extrabold leading-tight drop-shadow">
                    {project.title}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    />
  );
}
