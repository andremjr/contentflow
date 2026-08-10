import { cn } from "@/lib/utils";
import { STATE_META, type ProcessState } from "@/lib/domain";

const TONE_CLASS: Record<(typeof STATE_META)[ProcessState]["tone"], { dot: string; chip: string }> =
  {
    muted: {
      dot: "bg-muted-foreground/50",
      chip: "bg-muted/40 text-muted-foreground border-border/60",
    },
    info: {
      dot: "bg-muted-foreground",
      chip: "text-muted-foreground border-transparent",
    },
    brand: {
      dot: "bg-brand animate-pulse",
      chip: "text-foreground border-transparent",
    },
    warning: {
      dot: "bg-warning",
      chip: "text-warning border-transparent",
    },
    success: {
      dot: "bg-success",
      chip: "text-muted-foreground border-transparent",
    },
    done: {
      dot: "bg-success",
      chip: "text-muted-foreground border-transparent",
    },
    error: {
      dot: "bg-destructive",
      chip: "bg-destructive/10 text-destructive border-destructive/40",
    },
    blocked: {
      dot: "bg-destructive/70",
      chip: "bg-destructive/5 text-destructive/80 border-destructive/30",
    },
  };

export function ProcessStatus({
  state,
  className,
  variant = "chip",
}: {
  state: ProcessState;
  className?: string;
  variant?: "chip" | "dot";
}) {
  const meta = STATE_META[state];
  const tone = TONE_CLASS[meta.tone];
  if (variant === "dot") {
    return (
      <span
        className={cn("inline-block size-2 rounded-full", tone.dot, className)}
        title={meta.label}
        aria-label={meta.label}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 border px-1 py-0.5 text-[11px] font-medium",
        tone.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {meta.label}
    </span>
  );
}
