import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, RotateCcw, Check, Loader2, AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { PROCESS_META, PROCESS_ORDER, type ProcessId, type Project } from "@/lib/mock-data";
import { completeStage } from "@/lib/store";

const PROCESS_ROUTE_SEGMENT: Record<ProcessId, string> = {
  research: "research",
  ideas: "ideas",
  titles: "titles",
  thumbnail: "thumbnail",
  script: "script",
  narration: "narration",
  assets: "assets",
  editing: "edit",
  publishing: "publish",
};

type RunState = "idle" | "running" | "done" | "error";

export function ProcessRunner({
  project,
  processId,
  description,
  result,
  emptyHint,
}: {
  project?: Project;
  processId: ProcessId;
  description: string;
  result: ReactNode;
  emptyHint?: string;
}) {
  const meta = PROCESS_META[processId];
  const stageState = project?.stages[processId];
  const initial: RunState = stageState === "done" || stageState === "approved" ? "done" : "idle";
  const [state, setState] = useState<RunState>(initial);
  const navigate = useNavigate();

  const currentIdx = PROCESS_ORDER.indexOf(processId);
  const nextProcess = currentIdx >= 0 ? PROCESS_ORDER[currentIdx + 1] : undefined;

  const run = () => {
    setState("running");
    window.setTimeout(() => {
      setState("done");
      if (project) completeStage(project.id, processId);
    }, 1400);
  };

  const goNext = () => {
    if (!project || !nextProcess) return;
    navigate({
      to: `/project/${project.id}/${PROCESS_ROUTE_SEGMENT[nextProcess]}`,
    });
  };



  return (
    <main className="flex-1 space-y-6 px-6 py-6">
      {/* Command bar */}
      <section className="rounded-xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-lg bg-brand/15 text-brand-soft">
              <meta.icon className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Executar {meta.label.toLowerCase()}</h2>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <StatusPill state={state} />

            {state === "done" ? (
              <Button
                size="sm"
                variant="outline"
                onClick={run}
                className="h-9 gap-1.5 border-border/60"
              >
                <RotateCcw className="size-3.5" />
                Executar novamente
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={run}
                disabled={state === "running"}
                className="h-9 gap-1.5 gradient-brand text-white shadow-[0_6px_20px_-8px_oklch(0.58_0.22_264/0.8)]"
              >
                {state === "running" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5 fill-current" />
                )}
                {state === "running" ? "Executando…" : "Executar"}
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* Result */}
      <section className="rounded-xl border border-border/70 bg-card">
        <header className="flex items-center justify-between border-b border-border/60 px-5 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Resultado
          </h3>
          {state === "done" && (
            <Badge variant="outline" className="border-brand/40 text-[10px] text-brand-soft">
              Última execução · agora
            </Badge>
          )}
        </header>
        <div className="p-5">
          {state === "idle" ? (
            <div className="grid place-items-center gap-2 py-16 text-center text-xs text-muted-foreground">
              <div className="grid size-12 place-items-center rounded-full border border-border/60 bg-background/40">
                <meta.icon className="size-5 text-brand-soft" />
              </div>
              <p>{emptyHint ?? "Nenhum resultado ainda. Clique em Executar para começar."}</p>
            </div>
          ) : state === "running" ? (
            <div className="grid place-items-center gap-2 py-16 text-center text-xs text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-brand-soft" />
              <p>Processando com as configurações do canal…</p>
            </div>
          ) : (
            <div>{result}</div>
          )}
        </div>
      </section>
    </main>
  );
}

function StatusPill({ state }: { state: RunState }) {
  const map: Record<RunState, { label: string; icon: typeof Check; className: string }> = {
    idle: {
      label: "Pronto",
      icon: Play,
      className: "border-border/60 bg-background/40 text-muted-foreground",
    },
    running: {
      label: "Executando",
      icon: Loader2,
      className: "border-brand/40 bg-brand/15 text-brand-soft",
    },
    done: {
      label: "Concluído",
      icon: Check,
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    },
    error: {
      label: "Erro",
      icon: AlertTriangle,
      className: "border-destructive/40 bg-destructive/15 text-destructive",
    },
  };
  const s = map[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium",
        s.className,
      )}
    >
      <s.icon className={cn("size-3", state === "running" && "animate-spin")} />
      {s.label}
    </span>
  );
}
