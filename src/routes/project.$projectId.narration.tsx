import { createFileRoute, notFound, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { ProcessRunner } from "@/components/process-runner";
import { projects, channels, PROCESS_META } from "@/lib/mock-data";
import { Download } from "lucide-react";

export const Route = createFileRoute("/project/$projectId/narration")({
  head: ({ params }) => {
    const p = projects.find((x) => x.id === params.projectId);
    return {
      meta: [
        { title: p ? `Narração · ${p.title}` : "Narração · Projeto" },
        { name: "description", content: "Gerar narração para este projeto." },
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
  component: ProjectNarrationPage,
});

function ProjectNarrationPage() {
  const { project, channel } = Route.useLoaderData();
  const meta = PROCESS_META.narration;
  return (
    <>
      <ProcessRunner
        project={project}
        processId="narration"
        description="Sintetiza áudio a partir do roteiro com a voz padrão do canal."
        result={
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-background/40 p-4">
              <audio
                controls
                preload="metadata"
                className="w-full"
                src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
              >
                Seu navegador não suporta reprodução de áudio.
              </audio>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 p-3 text-xs">
              <span className="text-muted-foreground">
                Voz: <span className="text-foreground">Marcus (grave, cadência controlada)</span> · 1.0× · Estabilidade 78%
              </span>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 border-border/60">
                <Download className="size-3.5" /> WAV
              </Button>
            </div>
          </div>
        }
      />
    </>
  );
}

