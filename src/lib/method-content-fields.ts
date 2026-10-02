import type { ContentShape, ValueShape } from "./domain";

/** Projection for the strategic editor. Never converts or deletes runtime contracts. */
export function isMethodContentField<T extends { shape: ValueShape }>(
  field: T,
): field is T & { shape: ContentShape } {
  return field.shape.kind === "content";
}

/** Replacing visible suggestions must preserve internal relations and decisions. */
export function replaceMethodContentFields<T extends { shape: ValueShape; key: string }>(
  existing: T[],
  suggested: T[],
): T[] {
  const internal = existing.filter((field) => !isMethodContentField(field));
  const reservedKeys = new Set(internal.map((field) => field.key));
  return [
    ...internal,
    ...suggested.filter((field) => isMethodContentField(field) && !reservedKeys.has(field.key)),
  ];
}
