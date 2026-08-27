import * as React from "react";

import { Input } from "@/components/ui/input";

type NumberInputProps = Omit<
  React.ComponentProps<typeof Input>,
  "type" | "value" | "defaultValue" | "onChange"
> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  nullable?: boolean;
  integer?: boolean;
};

function numericBound(value: React.ComponentProps<typeof Input>["min" | "max"]) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function NumberInput({
  value,
  onValueChange,
  nullable = false,
  integer = false,
  min,
  max,
  step,
  onFocus,
  onBlur,
  ...props
}: NumberInputProps) {
  const [draft, setDraft] = React.useState(
    value === null || value === undefined ? "" : String(value),
  );
  const focused = React.useRef(false);

  React.useEffect(() => {
    if (!focused.current) {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
  }, [value]);

  const restoreValue = () => {
    if (nullable) {
      onValueChange(null);
      setDraft("");
      return;
    }
    setDraft(value === null || value === undefined ? "" : String(value));
  };

  return (
    <Input
      {...props}
      type="number"
      min={min}
      max={max}
      step={step ?? (integer ? 1 : undefined)}
      value={draft}
      onFocus={(event) => {
        focused.current = true;
        onFocus?.(event);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === "") {
          if (nullable) onValueChange(null);
          return;
        }
        const parsed = Number(nextDraft);
        if (Number.isFinite(parsed)) onValueChange(parsed);
      }}
      onBlur={(event) => {
        focused.current = false;
        if (draft.trim() === "") {
          restoreValue();
        } else {
          const parsed = Number(draft);
          if (!Number.isFinite(parsed)) {
            restoreValue();
          } else {
            const minimum = numericBound(min);
            const maximum = numericBound(max);
            let normalized = integer ? Math.round(parsed) : parsed;
            if (minimum !== undefined) normalized = Math.max(minimum, normalized);
            if (maximum !== undefined) normalized = Math.min(maximum, normalized);
            onValueChange(normalized);
            setDraft(String(normalized));
          }
        }
        onBlur?.(event);
      }}
    />
  );
}

export { NumberInput };
