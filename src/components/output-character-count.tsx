import { cn } from "@/lib/utils";

export function countTextCharacters(value: string) {
  return Array.from(value).length;
}

export function OutputCharacterCount({ value, className }: { value: string; className?: string }) {
  const count = String(countTextCharacters(value));

  return (
    <span
      data-testid="output-character-count"
      aria-label={count}
      className={cn(
        "pointer-events-none block text-right text-[10px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {count}
    </span>
  );
}
