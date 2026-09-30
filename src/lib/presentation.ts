import {
  PRESENTATION_RENDERER_IDS,
  type FieldPresentation,
  type PresentationRendererId,
  type RuntimeValue,
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
  return {
    renderer: getCompatiblePresentationRenderers(shape).includes(renderer) ? renderer : "auto",
  };
}

export function getPresentationRestrictionIssue(
  shape: ValueShape,
  presentation: FieldPresentation | undefined,
  _value: RuntimeValue | undefined,
) {
  const renderer = presentation?.renderer;
  if (!renderer || renderer === "auto") return undefined;
  return getCompatiblePresentationRenderers(shape).includes(renderer)
    ? undefined
    : `renderer ${renderer} incompatível com o shape declarado`;
}
