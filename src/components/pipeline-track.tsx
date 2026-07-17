import { cn } from "@/lib/utils";
import {
  PROCESS_META,
  PROCESS_ORDER,
  STATE_META,
  type ProcessState,
  type ProcessId,
} from "@/lib/mock-data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function toneToClasses(state: ProcessState) {
  const tone = STATE_META[state].tone;
  switch (tone) {
    case "done":
    case "success":
      return "border-success/60 bg-success/15 text-success";
    case "brand":
      return "border-brand/60 bg-brand/20 text-brand-soft";
    case "warning":
      return "border-warning/60 bg-warning/15 text-warning";
    case "error":
    case "blocked":
      return "border-destructive/60 bg-destructive/15 text-destructive";
    case "info":
      return "border-info/60 bg-info/15 text-info";
    default:
      return "border-border bg-muted/30 text-muted-foreground";
  }
}

export function PipelineTrack({
  stages,
  compact = false,
}: {
  stages: Record<ProcessId, ProcessState>;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {PROCESS_ORDER.map((id, i) => {
        const state = stages[id];
        const meta = PROCESS_META[id];
        const Icon = meta.icon;
        return (
          <div key={id} className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className={cn(
                    "flex items-center justify-center rounded-md border transition",
                    compact ? "size-6" : "size-7",
                    toneToClasses(state),
                  )}
                >
                  <Icon className={compact ? "size-3" : "size-3.5"} />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                <div className="font-medium">{meta.label}</div>
                <div className="text-muted-foreground">{STATE_META[state].label}</div>
              </TooltipContent>
            </Tooltip>
            {i < PROCESS_ORDER.length - 1 && (
              <span className="h-px w-2 bg-border" />
            )}
          </div>
        );
      })}
    </div>
  );
}
