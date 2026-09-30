import type { BlockInputBinding, RuntimeValue } from "../src/lib/domain";
import { isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import { runtimeValueMatchesShape } from "../src/lib/runtime-value-validation";

export function runtimeInputBindings(inputs: BlockInputBinding[] | undefined) {
  return (inputs ?? []).filter((input) => input.binding?.kind === "runtime");
}

export function runtimeInputsReady(
  inputs: BlockInputBinding[] | undefined,
  values: Readonly<Record<string, RuntimeValue>> | undefined,
) {
  return runtimeInputBindings(inputs).every(
    (input) => values?.[input.id] !== undefined && !isEmptyRuntimeValue(values[input.id]),
  );
}

export function validateRuntimeInputValues(
  inputs: BlockInputBinding[] | undefined,
  submitted: unknown,
) {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    return { error: "Entradas de execução inválidas." } as const;
  }
  const bindings = runtimeInputBindings(inputs);
  const values = submitted as Record<string, RuntimeValue>;
  const allowed = new Set(bindings.map((input) => input.id));
  const unknown = Object.keys(values).filter((key) => !allowed.has(key));
  if (unknown.length) {
    return { error: `Entradas de execução desconhecidas: ${unknown.join(", ")}.` } as const;
  }
  const normalized = Object.fromEntries(
    bindings.map((input) => [input.id, values[input.id] ?? null]),
  ) as Record<string, RuntimeValue>;
  const missing = bindings.filter((input) => isEmptyRuntimeValue(normalized[input.id]));
  if (missing.length) {
    return { error: `Preencha: ${missing.map((input) => input.label).join(", ")}.` } as const;
  }
  for (const input of bindings) {
    const value = normalized[input.id];
    if (!runtimeValueMatchesShape(input.shape, value)) {
      return { error: `${input.label}: valor incompatível com o shape declarado.` } as const;
    }
    const restriction = getPresentationRestrictionIssue(input.shape, input.presentation, value);
    if (restriction) return { error: `${input.label}: ${restriction}.` } as const;
  }
  return { values: structuredClone(normalized) } as const;
}
