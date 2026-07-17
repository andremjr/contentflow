import { ArrowUpRight, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  delta,
  trend = "up",
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: "up" | "down" | "warning" | "flat";
}) {
  const trendClass =
    trend === "warning"
      ? "text-warning"
      : trend === "down"
        ? "text-destructive"
        : "text-success";

  const Icon = trend === "warning" ? AlertTriangle : ArrowUpRight;

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border/70 bg-card p-4 transition hover:border-brand/50">
      <div
        className="pointer-events-none absolute inset-x-0 -top-px h-px opacity-60"
        style={{
          background:
            "linear-gradient(90deg, transparent, oklch(0.58 0.22 264 / 0.6), transparent)",
        }}
      />
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {delta && (
          <span className={cn("inline-flex items-center gap-1 text-[11px]", trendClass)}>
            <Icon className="size-3" />
          </span>
        )}
      </div>
      <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      {delta && (
        <p className={cn("mt-1 text-xs", trendClass)}>{delta}</p>
      )}
    </div>
  );
}
