import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, ChevronRight, Clock3, Inbox, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROCESS_META } from "@/lib/domain";
import { PROCESS_ROUTE_SEGMENT } from "@/lib/human-workflow";
import { useHumanTasks } from "@/lib/store";

const SEEN_KEY = "contentflow.seen-human-tasks";

function ageLabel(value?: string) {
  if (!value) return "Agora";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `Há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Há ${hours} h`;
  return `Há ${Math.floor(hours / 24)} d`;
}

export function HumanTaskCenter() {
  const tasks = useHumanTasks();
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const taskIds = useMemo(
    () => tasks.map((task) => `${task.execution.id}:${task.block.id}`),
    [tasks],
  );
  const unseen = taskIds.filter((id) => !seenIds.includes(id)).length;

  useEffect(() => {
    try {
      setSeenIds(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[]);
    } catch {
      setSeenIds([]);
    }
  }, []);

  function changeOpen(next: boolean) {
    setOpen(next);
    if (next) {
      const merged = [...new Set([...seenIds, ...taskIds])];
      setSeenIds(merged);
      localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
    }
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-9 text-muted-foreground"
          aria-label={`${tasks.length} tarefas humanas pendentes`}
        >
          <Bell className="size-4" />
          {tasks.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-warning px-1 text-[9px] font-bold leading-4 text-black">
              {tasks.length > 99 ? "99+" : tasks.length}
            </span>
          )}
          {unseen > 0 && (
            <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-brand" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,420px)] p-0">
        <header className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Pendências humanas</h2>
            <p className="text-[11px] text-muted-foreground">
              A tarefa sai daqui somente depois que o operador conclui a ação.
            </p>
          </div>
          <Badge variant="outline" className="border-warning/40 text-warning">
            {tasks.length} {tasks.length === 1 ? "pendente" : "pendentes"}
          </Badge>
        </header>
        {tasks.length ? (
          <div className="max-h-[65vh] overflow-y-auto p-2">
            {tasks.map((task) => {
              const id = `${task.execution.id}:${task.block.id}`;
              const isNew = !seenIds.includes(id);
              const meta = PROCESS_META[task.execution.processType];
              return (
                <Link
                  key={id}
                  to={
                    `/project/${task.project.id}/${PROCESS_ROUTE_SEGMENT[task.execution.processType]}` as never
                  }
                  onClick={() => setOpen(false)}
                  className="group flex gap-3 rounded-xl border border-transparent p-3 transition hover:border-border/70 hover:bg-secondary/50"
                >
                  <span className="relative grid size-9 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning">
                    <UserRound className="size-4" />
                    {isNew && (
                      <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-brand" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold">{task.project.title}</span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock3 className="size-3" />
                        {ageLabel(task.blockExecution.startedAt)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] text-brand-soft">
                      {task.channel.name} · {meta.label} · {task.block.name ?? task.block.type}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                      {task.block.instructions ||
                        task.block.outputs?.map((field) => field.label).join(", ") ||
                        "Ação humana necessária"}
                    </span>
                  </span>
                  <ChevronRight className="mt-3 size-4 shrink-0 text-muted-foreground transition group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <Inbox className="mx-auto size-7 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhuma ação humana aguardando</p>
            <p className="mt-1 text-xs text-muted-foreground">
              As tarefas aparecerão aqui quando um processo chegar a um bloco Humano.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
