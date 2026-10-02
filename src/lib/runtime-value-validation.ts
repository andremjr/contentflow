import type { AtomicValueShape, StoredFile, ValueShape } from "@/lib/domain";

export type RuntimeValueIssue = {
  path: string;
  code:
    | "CARDINALITY_MISMATCH"
    | "INVALID_CONTENT_VALUE"
    | "INVALID_STORED_FILE"
    | "CONTENT_FAMILY_MISMATCH"
    | "MIME_TYPE_MISMATCH"
    | "EXTENSION_MISMATCH"
    | "INVALID_CONTROL_VALUE"
    | "INVALID_RECORD_VALUE"
    | "MISSING_REQUIRED_RECORD_FIELD";
  message: string;
};

export function validateRuntimeValueAgainstShape(
  shape: ValueShape,
  value: unknown,
  path = "value",
): RuntimeValueIssue[] {
  if (shape.cardinality === "many") {
    if (!Array.isArray(value)) {
      return [{ path, code: "CARDINALITY_MISMATCH", message: "O valor deve ser uma coleção." }];
    }
    return value.flatMap((item, index) =>
      validateOne({ ...shape, cardinality: "one" }, item, `${path}.${index}`),
    );
  }
  if (Array.isArray(value)) {
    return [{ path, code: "CARDINALITY_MISMATCH", message: "O valor deve conter um único item." }];
  }
  return validateOne(shape, value, path);
}

export function runtimeValueMatchesShape(shape: ValueShape, value: unknown) {
  return validateRuntimeValueAgainstShape(shape, value).length === 0;
}

export function runtimeItemMatchesShape(shape: ValueShape, value: unknown) {
  return runtimeValueMatchesShape({ ...shape, cardinality: "one" }, value);
}

export function isStoredFile(value: unknown): value is StoredFile {
  if (!isPlainObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.name === "string" &&
    value.name.length > 0 &&
    typeof value.mimeType === "string" &&
    value.mimeType.length > 0 &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 0 &&
    typeof value.url === "string" &&
    /^\/api\/files\/[a-zA-Z0-9._-]+$/.test(value.url) &&
    (value.sha256 === undefined || typeof value.sha256 === "string") &&
    (value.flowMediaId === undefined || typeof value.flowMediaId === "string")
  );
}

function validateOne(shape: ValueShape, value: unknown, path: string): RuntimeValueIssue[] {
  if (value === null || value === undefined) {
    const code =
      shape.kind === "content"
        ? "INVALID_CONTENT_VALUE"
        : shape.kind === "record"
          ? "INVALID_RECORD_VALUE"
          : "INVALID_CONTROL_VALUE";
    return [{ path, code, message: "O valor está ausente." }];
  }
  if (shape.kind === "content") {
    const allowsInline = shape.representation === "inline" || shape.representation === "either";
    const allowsArtifact = shape.representation === "artifact" || shape.representation === "either";
    if (shape.family === "text" && allowsInline && typeof value === "string") return [];
    if (!allowsArtifact) {
      return [
        {
          path,
          code: "INVALID_CONTENT_VALUE",
          message: "A representação material é incompatível.",
        },
      ];
    }
    if (!isStoredFile(value)) {
      return [
        { path, code: "INVALID_STORED_FILE", message: "O artifact não é um StoredFile válido." },
      ];
    }
    if (shape.family !== "text" && !value.mimeType.toLowerCase().startsWith(`${shape.family}/`)) {
      return [
        {
          path,
          code: "CONTENT_FAMILY_MISMATCH",
          message: `O artifact não pertence à família ${shape.family}.`,
        },
      ];
    }
    if (
      shape.formats?.mimeTypes?.length &&
      !shape.formats.mimeTypes.some((pattern) => mimeMatches(value.mimeType, pattern))
    ) {
      return [
        {
          path,
          code: "MIME_TYPE_MISMATCH",
          message: `MIME ${value.mimeType} não é aceito pelo contrato.`,
        },
      ];
    }
    if (shape.formats?.extensions?.length) {
      const allowed = shape.formats.extensions.map(normalizeExtension).filter(Boolean);
      if (!allowed.some((extension) => fileNameHasExtension(value.name, extension))) {
        return [
          {
            path,
            code: "EXTENSION_MISMATCH",
            message: `A extensão de ${value.name} não é aceita pelo contrato.`,
          },
        ];
      }
    }
    return [];
  }
  if (shape.kind === "record") {
    if (!isPlainObject(value) || isStoredFile(value)) {
      return [{ path, code: "INVALID_RECORD_VALUE", message: "O valor deve ser um registro." }];
    }
    return shape.fields.flatMap((field) => {
      const fieldValue = value[field.key];
      if (fieldValue === undefined || fieldValue === null || fieldValue === "") {
        return field.required
          ? [
              {
                path: `${path}.${field.key}`,
                code: "MISSING_REQUIRED_RECORD_FIELD" as const,
                message: `${field.label} é obrigatório.`,
              },
            ]
          : [];
      }
      return validateAtomic(field.shape, fieldValue, `${path}.${field.key}`);
    });
  }
  return validateControl(shape, value, path);
}

function validateAtomic(shape: AtomicValueShape, value: unknown, path: string) {
  return validateRuntimeValueAgainstShape(shape, value, path);
}

function validateControl(
  shape: Extract<ValueShape, { kind: "control" }>,
  value: unknown,
  path: string,
): RuntimeValueIssue[] {
  let valid = false;
  if (shape.control === "number") valid = typeof value === "number" && Number.isFinite(value);
  else if (shape.control === "boolean") valid = typeof value === "boolean";
  else if (shape.control === "thumbnail_layout") {
    valid = Boolean(
      isPlainObject(value) &&
      value.aspectRatio === "16:9" &&
      Array.isArray(value.boxes) &&
      value.boxes.every(
        (box) =>
          isPlainObject(box) &&
          typeof box.id === "string" &&
          typeof box.label === "string" &&
          typeof box.color === "string" &&
          [box.x, box.y, box.w, box.h].every(
            (coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate),
          ),
      ),
    );
  } else {
    valid = typeof value === "string";
    if (valid && shape.control === "selection" && shape.options?.length) {
      valid = shape.options.includes(value as string);
    }
  }
  return valid
    ? []
    : [
        {
          path,
          code: "INVALID_CONTROL_VALUE",
          message: `O valor não é válido para o controle ${shape.control}.`,
        },
      ];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mimeMatches(mimeType: string, pattern: string) {
  const value = mimeType.trim().toLowerCase();
  const expected = pattern.trim().toLowerCase();
  if (expected === "*/*") return true;
  return expected.endsWith("/*") ? value.startsWith(expected.slice(0, -1)) : value === expected;
}

function fileNameHasExtension(name: string, extension: string) {
  const normalized = name.trim().toLowerCase();
  return Boolean(extension) && normalized.endsWith(`.${extension}`);
}

function normalizeExtension(value: string) {
  return value.trim().toLowerCase().replace(/^\./, "");
}
