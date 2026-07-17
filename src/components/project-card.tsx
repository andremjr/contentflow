import { MoreHorizontal, Clock, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { ChannelAvatar } from "./channel-avatar";
import { ProcessStatus } from "./process-status";
import { PipelineTrack } from "./pipeline-track";
import { channels, PROCESS_META, type Project } from "@/lib/mock-data";

export function ProjectCard({ project }: { project: Project }) {
  const channel = channels.find((c) => c.id === project.channelId)!;
  const stageMeta = PROCESS_META[project.currentStage];

  return (
    <article className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 transition hover:border-brand/50 hover:shadow-[0_0_0_1px_oklch(0.58_0.22_264/0.3),0_10px_40px_-20px_oklch(0.58_0.22_264/0.5)]">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChannelAvatar channel={channel} size="md" />
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{channel.name}</p>
            <h3 className="truncate text-sm font-semibold text-foreground">
              {project.title}
            </h3>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem>Abrir projeto</DropdownMenuItem>
            <DropdownMenuItem>Duplicar</DropdownMenuItem>
            <DropdownMenuItem>Mover para canal…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive">
              Arquivar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <stageMeta.icon className="size-3.5 text-brand-soft" />
          <span className="text-foreground">{stageMeta.label}</span>
        </div>
        <ProcessStatus state={project.state} />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Progresso</span>
          <span className="font-mono text-foreground">{project.progress}%</span>
        </div>
        <Progress value={project.progress} className="h-1.5" />
      </div>

      <div className="mt-4">
        <PipelineTrack stages={project.stages} compact />
      </div>

      <footer className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3" />
          {project.deadline}
        </span>
        <span className="inline-flex items-center gap-1 font-mono">
          <Clock className="size-3" />
          {project.duration}
        </span>
        <span>{project.updatedAt}</span>
      </footer>
    </article>
  );
}
