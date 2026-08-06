import { AlertTriangle, ArrowRight, Blocks, Play, RotateCcw } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PROCESS_META, PROCESS_ORDER, type ProcessId, type Project } from "@/lib/domain";
import { completeStage, resetStage, useChannel } from "@/lib/store";

const PROCESS_ROUTE_SEGMENT: Record<ProcessId, string> = {
  theme: "theme",
  title: "title",
  thumbnail: "thumbnail",
  script: "script",
  narration: "narration",
  assets: "assets",
  editing: "edit",
  publishing: "publish",
};

export function ProcessRunner({
  project,
  processId,
  description,
}: {
  project?: Project;
  processId: ProcessId;
  description: string;
}) {
  const navigate = useNavigate();
  const channel = useChannel(project?.channelId ?? "");
  const method = channel?.methods[processId];
  const hasMethod = Boolean(method?.blocks.length);
  const meta = PROCESS_META[processId];
  const completed =
    project?.stages[processId] === "done" || project?.stages[processId] === "approved";
  const currentIndex = PROCESS_ORDER.indexOf(processId);
  const nextProcess = PROCESS_ORDER[currentIndex + 1];

  if (!project || !channel) return null;
  const projectId = project.id;
  const channelId = channel.id;

  function executeStage() {
    if (!hasMethod) {
      toast.error(`A etapa ${meta.label} está bloqueada`, {
        description: `Crie ou importe um método de ${meta.label} para este canal antes de executar.`,
      });
      return;
    }
    completeStage(projectId, processId);
  }

  function openMethodBuilder() {
    navigate({
      to: `/channel/${channelId}/methods`,
      search: { process: processId } as never,
    });
  }

  return (
    <main className="flex-1 space-y-6 px-6 py-6">
      <section className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-brand/15 text-brand-soft">
              <meta.icon className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">{meta.label}</h2>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>
          {completed ? (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => resetStage(project.id, processId)}>
                <RotateCcw className="mr-1.5 size-3.5" /> Reabrir
              </Button>
              {nextProcess && (
                <Button
                  size="sm"
                  onClick={() =>
                    navigate({ to: `/project/${project.id}/${PROCESS_ROUTE_SEGMENT[nextProcess]}` })
                  }
                >
                  Próxima etapa <ArrowRight className="ml-1.5 size-3.5" />
                </Button>
              )}
            </div>
          ) : (
            <Button
              size="sm"
              variant={hasMethod ? "default" : "destructive"}
              onClick={executeStage}
            >
              {hasMethod ? (
                <Play className="mr-1.5 size-3.5 fill-current" />
              ) : (
                <AlertTriangle className="mr-1.5 size-3.5" />
              )}
              {hasMethod ? "Executar etapa" : "Método necessário"}
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border/70 bg-card">
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <div className="flex items-center gap-2">
            <Blocks className="size-4 text-brand-soft" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Método salvo do canal
            </h3>
          </div>
          <Badge
            variant={completed ? "default" : "outline"}
            className={
              !completed && !hasMethod ? "border-destructive/50 text-destructive" : undefined
            }
          >
            {completed ? "Concluída" : hasMethod ? "Pronta" : "Bloqueada"}
          </Badge>
        </header>
        <div className="p-5">
          {method?.blocks.length ? (
            <ol className="space-y-3">
              {method.blocks.map((block, index) => (
                <li
                  key={block.id}
                  className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/35 p-3"
                >
                  <span className="grid size-7 place-items-center rounded-full bg-brand/15 font-mono text-xs text-brand-soft">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{block.type}</p>
                    <p className="text-xs text-muted-foreground">
                      Operador: {block.operator} · {block.parameters.length} parâmetros
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <div className="rounded-xl border border-destructive/35 bg-destructive/5 px-5 py-10 text-center">
              <AlertTriangle className="mx-auto size-6 text-destructive" />
              <p className="mt-3 text-sm font-medium">Nenhum método salvo para este processo.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Esta etapa não pode ser executada até que o canal tenha um método de {meta.label}.
              </p>
              <Button className="mt-4" variant="destructive" size="sm" onClick={openMethodBuilder}>
                Criar ou importar método
              </Button>
            </div>
          )}
        </div>
      </section>

      <p className="rounded-lg border border-dashed border-border/70 px-4 py-3 text-xs text-muted-foreground">
        A execução por IA, humano ou código será conectada posteriormente por plugins. Nesta fase, o
        aplicativo utiliza o método salvo como plano operacional e não gera conteúdo fictício.
      </p>
    </main>
  );
}
