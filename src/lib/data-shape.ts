import type {
  ContentCardinality,
  ContentFamily,
  ContentRepresentation,
  ContentShape,
  ControlKind,
  ControlShape,
  RecordShape,
  ValueShape,
} from "@/lib/domain";

export type DataShape = ValueShape;
export type DataCardinality = ContentCardinality;

export type ValueShapeIssue = {
  path: string;
  code:
    | "INVALID_REPRESENTATION"
    | "INVALID_FORMAT_CONSTRAINT"
    | "INVALID_CONTROL_OPTIONS"
    | "INVALID_ITEM_REFERENCE_FIELD"
    | "DUPLICATE_RECORD_FIELD"
    | "EMPTY_RECORD_FIELD";
  message: string;
};

export function contentShape(
  family: ContentFamily,
  cardinality: ContentCardinality = "one",
  representation: ContentRepresentation = family === "text" ? "inline" : "artifact",
  formats?: ContentShape["formats"],
): ContentShape {
  const shape: ContentShape = {
    kind: "content",
    family,
    cardinality,
    representation,
    ...(formats && (formats.mimeTypes?.length || formats.extensions?.length)
      ? {
          formats: {
            ...(formats.mimeTypes?.length
              ? { mimeTypes: normalizeMimeTypes(formats.mimeTypes) }
              : {}),
            ...(formats.extensions?.length
              ? { extensions: normalizeExtensions(formats.extensions) }
              : {}),
          },
        }
      : {}),
  };
  const issue = validateValueShape(shape)[0];
  if (issue) throw new Error(issue.message);
  return shape;
}

export function controlShape(
  control: ControlKind,
  cardinality: ContentCardinality = "one",
  options?: string[],
): ControlShape {
  const shape: ControlShape = {
    kind: "control",
    control,
    cardinality,
    ...(options?.length ? { options: [...options] } : {}),
  };
  const issue = validateValueShape(shape)[0];
  if (issue) throw new Error(issue.message);
  return shape;
}

export function recordShape(
  cardinality: ContentCardinality,
  fields: RecordShape["fields"],
): RecordShape {
  return { kind: "record", cardinality, fields: fields.map((field) => structuredClone(field)) };
}

export function areValueShapesCompatible(source: ValueShape, target: ValueShape): boolean {
  if (validateValueShape(source).length || validateValueShape(target).length) return false;
  if (source.kind !== target.kind || source.cardinality !== target.cardinality) return false;
  if (source.kind === "content" && target.kind === "content") {
    if (source.family !== target.family) return false;
    if (!representationsCompatible(source.representation, target.representation)) return false;
    return formatConstraintsAreCompatible(source, target);
  }
  if (source.kind === "control" && target.kind === "control") {
    if (source.control !== target.control) return false;
    if (source.control !== "selection" || !target.options?.length || !source.options?.length) {
      return true;
    }
    return source.options.every((option) => target.options!.includes(option));
  }
  if (source.kind === "record" && target.kind === "record") {
    if (source.open || target.open) return true;
    return target.fields.every((targetField) => {
      const sourceField = source.fields.find((field) => field.key === targetField.key);
      return Boolean(
        sourceField &&
        (!targetField.required || sourceField.required) &&
        areValueShapesCompatible(sourceField.shape, targetField.shape),
      );
    });
  }
  return false;
}

/** Compatibility at the producer → consumer boundary, including the one allowed contraction. */
export function areInputShapesCompatible(source: ValueShape, target: ValueShape): boolean {
  if (areValueShapesCompatible(source, target)) return true;
  return (
    source.kind === "content" &&
    target.kind === "content" &&
    source.family === "text" &&
    target.family === "text" &&
    source.cardinality === "many" &&
    target.cardinality === "one" &&
    source.representation === "inline" &&
    (target.representation === "inline" || target.representation === "either")
  );
}

export function consumeInputValue(source: ValueShape, target: ValueShape, value: unknown): unknown {
  if (areValueShapesCompatible(source, target)) return structuredClone(value);
  if (
    areInputShapesCompatible(source, target) &&
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return value.join("\n\n");
  }
  return undefined;
}

export function validateValueShape(shape: ValueShape, path = "shape"): ValueShapeIssue[] {
  const issues: ValueShapeIssue[] = [];
  if (shape.kind === "content") {
    if (shape.family !== "text" && shape.representation !== "artifact") {
      issues.push({
        path: `${path}.representation`,
        code: "INVALID_REPRESENTATION",
        message: `${shape.family} deve usar representação artifact.`,
      });
    }
    if (shape.representation === "inline" && shape.formats) {
      issues.push({
        path: `${path}.formats`,
        code: "INVALID_FORMAT_CONSTRAINT",
        message: "Conteúdo inline não declara MIME ou extensão de artifact.",
      });
    }
    return issues;
  }
  if (shape.kind === "control") {
    if (shape.control !== "selection" && shape.options?.length) {
      issues.push({
        path: `${path}.options`,
        code: "INVALID_CONTROL_OPTIONS",
        message: "Somente controles de seleção declaram opções.",
      });
    }
    return issues;
  }
  const keys = new Set<string>();
  for (const [index, field] of shape.fields.entries()) {
    const fieldPath = `${path}.fields.${index}`;
    if (!field.key.trim()) {
      issues.push({
        path: `${fieldPath}.key`,
        code: "EMPTY_RECORD_FIELD",
        message: "Campo de registro precisa de uma chave.",
      });
    } else if (keys.has(field.key)) {
      issues.push({
        path: `${fieldPath}.key`,
        code: "DUPLICATE_RECORD_FIELD",
        message: `A chave ${field.key} está duplicada.`,
      });
    }
    keys.add(field.key);
    if (
      field.referencesInputId &&
      !(field.shape.kind === "control" && field.shape.control === "identifier")
    ) {
      issues.push({
        path: `${fieldPath}.referencesInputId`,
        code: "INVALID_ITEM_REFERENCE_FIELD",
        message: "Referências de itens exigem um campo de controle identifier.",
      });
    }
    issues.push(...validateValueShape(field.shape, `${fieldPath}.shape`));
  }
  return issues;
}

function representationsCompatible(source: ContentRepresentation, target: ContentRepresentation) {
  return target === "either" || source === target;
}

function formatConstraintsAreCompatible(source: ContentShape, target: ContentShape) {
  const sourceMimes = source.formats?.mimeTypes ?? [];
  const targetMimes = target.formats?.mimeTypes ?? [];
  if (targetMimes.length) {
    if (!sourceMimes.length) return false;
    if (
      !sourceMimes.every((sourceMime) =>
        targetMimes.some((targetMime) => mimePatternContainedBy(sourceMime, targetMime)),
      )
    ) {
      return false;
    }
  }
  const sourceExtensions = source.formats?.extensions ?? [];
  const targetExtensions = target.formats?.extensions ?? [];
  if (!targetExtensions.length) return true;
  if (!sourceExtensions.length) return false;
  const accepted = new Set(targetExtensions.map((value) => value.toLowerCase().replace(/^\./, "")));
  return sourceExtensions.every((value) => accepted.has(value.toLowerCase().replace(/^\./, "")));
}

function mimePatternContainedBy(source: string, target: string) {
  const left = source.toLowerCase();
  const right = target.toLowerCase();
  if (right === "*/*" || left === right) return true;
  if (left === "*/*") return false;
  const [leftType, leftSubtype] = left.split("/");
  const [rightType, rightSubtype] = right.split("/");
  if (!leftType || !leftSubtype || !rightType || !rightSubtype) return false;
  return rightSubtype === "*" && leftType === rightType;
}

function normalizeMimeTypes(values: string[]) {
  return Array.from(
    new Set(
      values.map((value) => value.trim().toLowerCase()).filter((value) => value.includes("/")),
    ),
  );
}

function normalizeExtensions(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase().replace(/^\./, ""))
        .filter((value) => /^[a-z0-9][a-z0-9._+-]*$/.test(value)),
    ),
  );
}
