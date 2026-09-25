import type { BlockExecutionItemValue } from "./domain";

export function isLocalStoredFileUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/api/files/");
}

/** Validates the core-owned replacement action without involving a plugin. */
export function normalizeItemReplacement(
  currentOutput: BlockExecutionItemValue | undefined,
  submittedOutput: BlockExecutionItemValue | undefined,
) {
  const unwrapSingle = (value: BlockExecutionItemValue | undefined) =>
    Array.isArray(value) && value.length === 1 ? value[0] : value;
  const currentSingle = unwrapSingle(currentOutput);
  const submittedSingle = unwrapSingle(submittedOutput);
  const currentIsText = typeof currentSingle === "string";
  const currentIsMedia = isSupportedMediaFile(currentSingle);

  if (currentIsText && typeof submittedSingle !== "string") {
    throw new Error("Este item aceita somente texto.");
  }
  if (currentIsMedia && !isSupportedLocalMediaFile(submittedSingle)) {
    throw new Error("Este item aceita somente imagem, áudio ou vídeo local.");
  }
  if (!currentIsText && !currentIsMedia) {
    throw new Error("Este tipo de item ainda não pode ser alterado manualmente.");
  }
  return Array.isArray(currentOutput)
    ? ([structuredClone(submittedSingle)] as BlockExecutionItemValue)
    : (structuredClone(submittedSingle) as BlockExecutionItemValue);
}

function isSupportedMediaFile(value: unknown) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "mimeType" in value &&
    typeof value.mimeType === "string" &&
    /^(image|audio|video)\//.test(value.mimeType)
  );
}

function isSupportedLocalMediaFile(value: unknown) {
  if (!isSupportedMediaFile(value)) return false;
  return isLocalStoredFileUrl((value as Record<string, unknown>).url);
}
