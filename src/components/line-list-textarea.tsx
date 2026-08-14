import { useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";

type LineListTextareaProps = Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value?: string[];
  onChange: (value: string[]) => void;
};

function normalizeLineList(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function LineListTextarea({
  value = [],
  onChange,
  onBlur,
  ...props
}: LineListTextareaProps) {
  const serializedValue = value.join("\n");
  const [draft, setDraft] = useState(serializedValue);
  const lastEmittedValue = useRef(serializedValue);

  useEffect(() => {
    if (serializedValue === lastEmittedValue.current) return;
    lastEmittedValue.current = serializedValue;
    setDraft(serializedValue);
  }, [serializedValue]);

  return (
    <Textarea
      {...props}
      value={draft}
      onChange={(event) => {
        const nextDraft = event.target.value;
        const nextValue = nextDraft.split(/\r?\n/);
        setDraft(nextDraft);
        lastEmittedValue.current = nextValue.join("\n");
        onChange(nextValue);
      }}
      onBlur={(event) => {
        const normalized = normalizeLineList(event.target.value);
        const nextDraft = normalized.join("\n");
        setDraft(nextDraft);
        lastEmittedValue.current = nextDraft;
        onChange(normalized);
        onBlur?.(event);
      }}
    />
  );
}
