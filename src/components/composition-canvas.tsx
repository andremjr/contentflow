import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type CompositionBox = {
  id: string;
  label: string;
  color: string;
  /** all values in percent of the frame */
  x: number;
  y: number;
  w: number;
  h: number;
};

export const BOX_COLORS = [
  "#2563EB",
  "#F59E0B",
  "#10B981",
  "#EF4444",
  "#A855F7",
  "#06B6D4",
  "#EC4899",
];

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

export function CompositionCanvas({
  boxes,
  onChange,
}: {
  boxes: CompositionBox[];
  onChange: (boxes: CompositionBox[]) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const update = (id: string, patch: Partial<CompositionBox>) =>
    onChange(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  const remove = (id: string) => onChange(boxes.filter((b) => b.id !== id));

  const addBox = () => {
    const id = `box-${Date.now()}`;
    onChange([
      ...boxes,
      {
        id,
        label: `Caixa ${boxes.length + 1}`,
        color: BOX_COLORS[boxes.length % BOX_COLORS.length],
        x: 8 + (boxes.length % 3) * 6,
        y: 8 + (boxes.length % 3) * 6,
        w: 34,
        h: 30,
      },
    ]);
    setSelected(id);
  };

  const startDrag = (
    e: React.PointerEvent,
    box: CompositionBox,
    mode: "move" | "resize",
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(box.id);
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { ...box };
    (e.target as Element).setPointerCapture?.(e.pointerId);

    const onMove = (ev: PointerEvent) => {
      const dx = ((ev.clientX - startX) / rect.width) * 100;
      const dy = ((ev.clientY - startY) / rect.height) * 100;
      if (mode === "move") {
        update(box.id, {
          x: clamp(origin.x + dx, 0, 100 - origin.w),
          y: clamp(origin.y + dy, 0, 100 - origin.h),
        });
      } else {
        update(box.id, {
          w: clamp(origin.w + dx, 6, 100 - origin.x),
          h: clamp(origin.h + dy, 6, 100 - origin.y),
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Quadro da thumbnail (16:9)
        </div>
        <Button type="button" variant="secondary" size="sm" onClick={addBox}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Adicionar caixa
        </Button>
      </div>

      <div
        ref={frameRef}
        onPointerDown={() => setSelected(null)}
        className="relative aspect-video w-full select-none overflow-hidden rounded-xl border border-border bg-[linear-gradient(to_right,hsl(var(--border)/0.35)_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border)/0.35)_1px,transparent_1px)] bg-[length:8.333%_11.111%] bg-secondary/30"
      >
        {boxes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Adicione caixas para montar a composição.
          </div>
        )}
        {boxes.map((b) => (
          <div
            key={b.id}
            onPointerDown={(e) => startDrag(e, b, "move")}
            className={cn(
              "absolute cursor-move rounded-md border-2 backdrop-blur-[1px] transition-shadow",
              selected === b.id && "ring-2 ring-primary ring-offset-0",
            )}
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              backgroundColor: `${b.color}59`,
              borderColor: b.color,
            }}
          >
            <span className="pointer-events-none absolute left-1.5 top-1.5 max-w-[90%] truncate rounded bg-background/70 px-1.5 py-0.5 text-[10px] font-medium">
              {b.label}
            </span>
            <div
              onPointerDown={(e) => startDrag(e, b, "resize")}
              className="absolute -bottom-1 -right-1 h-3.5 w-3.5 cursor-nwse-resize rounded-sm border border-background"
              style={{ backgroundColor: b.color }}
            />
          </div>
        ))}
      </div>

      {boxes.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">
            Camadas (topo → base)
          </div>
          <ul className="space-y-1.5">
            {[...boxes].reverse().map((b, ri) => {
              const index = boxes.length - 1 - ri;
              return (
                <li
                  key={b.id}
                  onClick={() => setSelected(b.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2",
                    selected === b.id && "border-primary/60 bg-primary/5",
                  )}
                >
                  <input
                    type="color"
                    aria-label={`Cor de ${b.label}`}
                    value={b.color}
                    onChange={(e) => update(b.id, { color: e.target.value })}
                    className="h-6 w-6 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <Input
                    value={b.label}
                    onChange={(e) => update(b.id, { label: e.target.value })}
                    className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                  <button
                    type="button"
                    aria-label="Mover para frente"
                    disabled={index === boxes.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover para trás"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="rounded-md p-1 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Remover caixa"
                    onClick={() => remove(b.id)}
                    className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

    </div>
  );
}
