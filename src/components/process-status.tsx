import { cn } from "@/lib/utils";
import { STATE_META, type ProcessState } from "@/lib/domain";

const TONE_CLASS: Record<
  (typeof STATE_META)[ProcessState]["tone"],
  { dot: string; chip: string }
> = {
  muted: {
    dot: "bg-muted-foreground/50",
    chip: "bg-muted/40 text-muted-foreground border-border/60",
  },
  info: {
    dot: "bg-info",
    chip: "bg-info/10 text-info border-info/30",
  },
  brand: {
    dot: "bg-brand animate-pulse",
    chip: "bg-brand/15 text-brand-soft border-brand/40",
  },
  warning: {
    dot: "bg-warning",
    chip: "bg-warning/10 text-warning border-warning/30",
  },
  success: {
    dot: "bg-success",
    chip: "bg-success/10 text-success border-success/30",
  },
  done: {
    dot: "bg-success",
    chip: "bg-success/10 text-success border-success/30",
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
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-wide",
        tone.chip,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", tone.dot)} />
      {meta.label}
    </span>
  );
}
