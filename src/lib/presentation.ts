import {
  PRESENTATION_RENDERER_IDS,
  type FieldPresentation,
  type HumanFieldType,
  type PresentationItemType,
  type PresentationRendererId,
  type RuntimeValue,
  type StoredFile,
} from "@/lib/domain";

const COMPATIBLE_RENDERERS: Record<HumanFieldType, PresentationRendererId[]> = {
  text: ["text-short", "text-long"],
  textarea: ["text-long", "text-short"],
  number: ["text-short"],
  boolean: ["text-short"],
  select: ["text-short", "tags"],
  multiselect: ["tags", "list"],
  list: ["list", "tags"],
  records: ["table", "cards"],
  datetime: ["text-short"],
  url: ["text-short"],
  file: ["file-list", "image-gallery", "audio-player", "video-player"],
  files: ["file-list", "image-gallery", "audio-player", "video-player"],
  image: ["image-gallery", "file-list"],
  audio: ["audio-player", "file-list"],
  video: ["video-player", "file-list"],
  approval: ["decision"],
  thumbnail_layout: [],
};

const DEFAULT_RENDERER: Record<HumanFieldType, PresentationRendererId> = {
  text: "text-short",
  textarea: "text-long",
  number: "text-short",
  boolean: "text-short",
  select: "text-short",
  multiselect: "tags",
  list: "list",
  records: "table",
  datetime: "text-short",
  url: "text-short",
  file: "file-list",
  files: "file-list",
  image: "image-gallery",
  audio: "audio-player",
  video: "video-player",
  approval: "decision",
  thumbnail_layout: "auto",
};

const ITEM_TYPES = new Set<PresentationItemType>([
  "text",
  "record",
  "file",
  "image",
  "audio",
  "video",
]);

const COMPATIBLE_ITEM_TYPES: Partial<Record<HumanFieldType, PresentationItemType[]>> = {
  list: ["text"],
  multiselect: ["text"],
  records: ["record"],
  file: ["file", "image", "audio", "video"],
  files: ["file", "image", "audio", "video"],
  image: ["image"],
  audio: ["audio"],
  video: ["video"],
};

const MIME_FIELD_TYPES = new Set<HumanFieldType>(["file", "files", "image", "audio", "video"]);

export function getCompatiblePresentationRenderers(type: HumanFieldType) {
  return ["auto", ...COMPATIBLE_RENDERERS[type]] as PresentationRendererId[];
}

export function resolvePresentationRenderer(
  type: HumanFieldType,
  presentation?: FieldPresentation,
  value?: unknown,
): PresentationRendererId {
  const requested = presentation?.renderer ?? "auto";
  if (requested === "auto") {
    const inferredMediaRenderer = inferMediaRenderer(value);
    if (inferredMediaRenderer && COMPATIBLE_RENDERERS[type].includes(inferredMediaRenderer)) {
      return inferredMediaRenderer;
    }
    return DEFAULT_RENDERER[type];
  }
  if (!COMPATIBLE_RENDERERS[type].includes(requested)) {
    return DEFAULT_RENDERER[type];
  }
  return requested;
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
  type: HumanFieldType,
  value?: Partial<FieldPresentation> | null,
): FieldPresentation {
  const renderer = PRESENTATION_RENDERER_IDS.includes(value?.renderer as PresentationRendererId)
    ? (value?.renderer as PresentationRendererId)
    : "auto";
  const requestedItemType = ITEM_TYPES.has(value?.itemType as PresentationItemType)
    ? (value?.itemType as PresentationItemType)
    : undefined;
  const itemType =
    requestedItemType && COMPATIBLE_ITEM_TYPES[type]?.includes(requestedItemType)
      ? requestedItemType
      : undefined;
  const acceptedMimeTypes = Array.from(
    new Set(
      (MIME_FIELD_TYPES.has(type) ? (value?.acceptedMimeTypes ?? []) : [])
        .map((mime) => mime.trim().toLowerCase())
        .filter((mime) => /^[-\w.+]+\/[-\w.+*]+$/.test(mime)),
    ),
  ).slice(0, 50);

  return {
    renderer: getCompatiblePresentationRenderers(type).includes(renderer) ? renderer : "auto",
    ...(itemType ? { itemType } : {}),
    ...(acceptedMimeTypes.length ? { acceptedMimeTypes } : {}),
  };
}

export function getPresentationRestrictionIssue(
  presentation: FieldPresentation | undefined,
  value: RuntimeValue | undefined,
) {
  if (!presentation || value == null) return undefined;
  const values = Array.isArray(value) ? value : [value];
  const files = values.filter(isStoredFile);
  if (presentation.itemType === "text" && values.some((item) => typeof item !== "string")) {
    return "deve conter apenas textos";
  }
  if (
    presentation.itemType === "record" &&
    values.some((item) => !item || typeof item !== "object" || isStoredFile(item))
  ) {
    return "deve conter apenas registros";
  }
  const mediaPrefix =
    presentation.itemType === "image"
      ? "image/"
      : presentation.itemType === "audio"
        ? "audio/"
        : presentation.itemType === "video"
          ? "video/"
          : undefined;
  if (mediaPrefix && files.some((file) => !file.mimeType.startsWith(mediaPrefix))) {
    return `deve conter apenas arquivos ${presentation.itemType}`;
  }
  if (
    presentation.acceptedMimeTypes?.length &&
    files.some(
      (file) =>
        !presentation.acceptedMimeTypes?.some((pattern) => mimeMatches(file.mimeType, pattern)),
    )
  ) {
    return `aceita somente MIME: ${presentation.acceptedMimeTypes.join(", ")}`;
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
