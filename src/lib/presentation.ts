import {
  PRESENTATION_RENDERER_IDS,
  type FieldPresentation,
  type PresentationItemType,
  type PresentationRendererId,
  type RuntimeValue,
  type StoredFile,
  type ValueShape,
} from "@/lib/domain";

export function getCompatiblePresentationRenderers(shape: ValueShape): PresentationRendererId[] {
  if (shape.kind === "content") {
    if (shape.family === "image") return ["auto", "image-gallery", "file-list"];
    if (shape.family === "audio") return ["auto", "audio-player", "file-list"];
    if (shape.family === "video") return ["auto", "video-player", "file-list"];
    if (shape.representation === "artifact") return ["auto", "file-list", "text-long"];
    return shape.cardinality === "many"
      ? ["auto", "list", "tags", "text-long"]
      : ["auto", "text-short", "text-long"];
  }
  if (shape.kind === "record") return ["auto", "table", "cards"];
  if (shape.control === "approval") return ["auto", "decision"];
  if (shape.control === "selection" && shape.cardinality === "many") {
    return ["auto", "tags", "list"];
  }
  return ["auto", "text-short"];
}

export function resolvePresentationRenderer(
  shape: ValueShape,
  presentation?: FieldPresentation,
  value?: unknown,
): PresentationRendererId {
  const compatible = getCompatiblePresentationRenderers(shape);
  const requested = presentation?.renderer ?? "auto";
  if (requested !== "auto" && compatible.includes(requested)) return requested;
  if (shape.kind === "content") {
    if (shape.family === "image") return "image-gallery";
    if (shape.family === "audio") return "audio-player";
    if (shape.family === "video") return "video-player";
    if (shape.representation === "artifact") return inferMediaRenderer(value) ?? "file-list";
    return shape.cardinality === "many" ? "list" : "text-short";
  }
  if (shape.kind === "record") return "table";
  if (shape.control === "approval") return "decision";
  if (shape.control === "selection" && shape.cardinality === "many") return "tags";
  return "text-short";
}

function inferMediaRenderer(value: unknown): PresentationRendererId | undefined {
  const values = Array.isArray(value) ? value : [value];
  const mimeTypes = values.flatMap((item) => {
    if (!item || typeof item !== "object" || !("mimeType" in item)) return [];
    return typeof item.mimeType === "string" ? [item.mimeType] : [];
  });
  if (!mimeTypes.length) return undefined;
  if (mimeTypes.every((mime) => mime.startsWith("image/"))) return "image-gallery";
  if (mimeTypes.every((mime) => mime.startsWith("audio/"))) return "audio-player";
  if (mimeTypes.every((mime) => mime.startsWith("video/"))) return "video-player";
  return "file-list";
}

export function normalizeFieldPresentation(
  shape: ValueShape,
  value?: Partial<FieldPresentation> | null,
): FieldPresentation {
  const renderer = PRESENTATION_RENDERER_IDS.includes(value?.renderer as PresentationRendererId)
    ? (value?.renderer as PresentationRendererId)
    : "auto";
  const itemType = compatibleItemTypes(shape).includes(value?.itemType as PresentationItemType)
    ? (value?.itemType as PresentationItemType)
    : undefined;
  return {
    renderer: getCompatiblePresentationRenderers(shape).includes(renderer) ? renderer : "auto",
    ...(itemType ? { itemType } : {}),
  };
}

function compatibleItemTypes(shape: ValueShape): PresentationItemType[] {
  if (shape.kind === "record") return ["record"];
  if (shape.kind !== "content") return shape.control === "selection" ? ["text"] : [];
  if (shape.family === "text") {
    return shape.representation === "artifact" ? ["file"] : ["text"];
  }
  return ["file", shape.family];
}

export function getPresentationRestrictionIssue(
  shape: ValueShape,
  presentation: FieldPresentation | undefined,
  value: RuntimeValue | undefined,
) {
  if (value == null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  if (shape.cardinality === "one" && Array.isArray(value)) return "aceita somente um valor";
  if (shape.cardinality === "many" && !Array.isArray(value)) return "exige uma coleção de valores";
  if (shape.kind === "content") {
    const issue = contentMaterialIssue(shape, values);
    if (issue) return issue;
  }
  if (shape.kind === "record") {
    if (values.some((item) => !item || typeof item !== "object" || isStoredFile(item))) {
      return "deve conter apenas registros";
    }
  }
  if (presentation?.itemType === "text" && values.some((item) => typeof item !== "string")) {
    return "deve conter apenas textos";
  }
  return undefined;
}

function contentMaterialIssue(shape: Extract<ValueShape, { kind: "content" }>, values: unknown[]) {
  const allowsInline = shape.representation === "inline" || shape.representation === "either";
  const allowsArtifact = shape.representation === "artifact" || shape.representation === "either";
  for (const value of values) {
    if (typeof value === "string" && shape.family === "text" && allowsInline) continue;
    if (!isStoredFile(value) || !allowsArtifact) return "possui representação incompatível";
    if (shape.family !== "text" && !value.mimeType.startsWith(`${shape.family}/`)) {
      return `deve conter apenas ${shape.family}`;
    }
    if (
      shape.formats?.mimeTypes?.length &&
      !shape.formats.mimeTypes.some((pattern) => mimeMatches(value.mimeType, pattern))
    ) {
      return `aceita somente MIME: ${shape.formats.mimeTypes.join(", ")}`;
    }
  }
  return undefined;
}

function isStoredFile(value: unknown): value is StoredFile {
  return Boolean(
    value && typeof value === "object" && "mimeType" in value && "url" in value && "id" in value,
  );
}

function mimeMatches(mimeType: string, pattern: string) {
  return pattern.endsWith("/*") ? mimeType.startsWith(pattern.slice(0, -1)) : mimeType === pattern;
}
