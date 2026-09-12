import { cn } from "@/lib/utils";
import { useAppPreferences } from "@/lib/app-preferences";

export function countTextCharacters(value: string) {
  return Array.from(value).length;
}

export function OutputCharacterCount({ value, className }: { value: string; className?: string }) {
  const { t } = useAppPreferences();
  const label = `${countTextCharacters(value)} ${t("caracteres")}`;

  return (
    <span
      data-testid="output-character-count"
      aria-label={label}
      className={cn(
        "pointer-events-none block text-right text-[10px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
