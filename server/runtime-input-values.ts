import type {
  BlockInputBinding,
  HumanFieldType,
  RuntimeValue,
  StoredFile,
} from "../src/lib/domain";
import { isEmptyRuntimeValue } from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";

function isStoredFile(value: unknown): value is StoredFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const file = value as Partial<StoredFile>;
  return (
    typeof file.id === "string" &&
    /^[a-zA-Z0-9_-]+$/.test(file.id) &&
    typeof file.name === "string" &&
    Boolean(file.name) &&
    typeof file.mimeType === "string" &&
    Boolean(file.mimeType) &&
    typeof file.size === "number" &&
    Number.isFinite(file.size) &&
    file.size >= 0 &&
    typeof file.url === "string" &&
    /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(file.url)
  );
}

function typeMatches(type: HumanFieldType, value: RuntimeValue) {
  if (value === null) return false;
  if (["text", "textarea", "select", "datetime", "url", "approval"].includes(type)) {
    return typeof value === "string";
  }
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "list" || type === "multiselect") {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
  }
  if (type === "records") {
    return (
      Array.isArray(value) &&
      value.every(
        (item) => item && typeof item === "object" && !Array.isArray(item) && !isStoredFile(item),
      )
    );
  }
  if (type === "files") return Array.isArray(value) && value.every(isStoredFile);
  if (["file", "image", "audio", "video"].includes(type)) return isStoredFile(value);
  if (type === "thumbnail_layout") {
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && "boxes" in value);
  }
  return false;
}

function mediaTypeIssue(input: BlockInputBinding, value: RuntimeValue) {
  const values = Array.isArray(value) ? value : [value];
  const files = values.filter(isStoredFile);
  const prefix =
    input.type === "image"
      ? "image/"
      : input.type === "audio"
        ? "audio/"
        : input.type === "video"
          ? "video/"
          : undefined;
  if (prefix && files.some((file) => !file.mimeType.toLowerCase().startsWith(prefix))) {
    return `deve conter apenas arquivos ${input.type}`;
  }
  return getPresentationRestrictionIssue(input.presentation, value);
}

export function runtimeInputBindings(inputs: BlockInputBinding[] | undefined) {
  return (inputs ?? []).filter((input) => input.source === "runtime");
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
    if (!typeMatches(input.type, value)) {
      return { error: `${input.label}: valor incompatível com o formato ${input.type}.` } as const;
    }
    const restriction = mediaTypeIssue(input, value);
    if (restriction) return { error: `${input.label}: ${restriction}.` } as const;
  }
  return { values: structuredClone(normalized) } as const;
}
