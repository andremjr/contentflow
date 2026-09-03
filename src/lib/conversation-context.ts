import type { ActionBlock, RuntimeValue, StoredFile } from "@/lib/domain";

const MAX_FALLBACK_CONTEXT = 40_000;

export function pluginConversationFallbackContext(
  block: ActionBlock,
  values: Record<string, RuntimeValue>,
) {
  const outputLines = (block.outputs ?? []).flatMap((output) => {
    const value = values[output.key];
    return value === undefined || value === null
      ? []
      : [`${output.label}: ${safeConversationValue(value)}`];
  });
  const text = [
    `CONTEXTO DA CONVERSA ANTERIOR — ${block.name ?? block.type}`,
    block.instructions?.trim() ? `Instrução original:\n${block.instructions.trim()}` : "",
    outputLines.length ? `Resultado anterior:\n${outputLines.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return text.slice(0, MAX_FALLBACK_CONTEXT);
}

export function pluginConversationFallbackAttachments(
  values: Record<string, RuntimeValue>,
): StoredFile[] {
  const attachments = new Map<string, StoredFile>();
  collectImageFiles(values, attachments);
  return [...attachments.values()];
}

function collectImageFiles(value: unknown, output: Map<string, StoredFile>) {
  if (isStoredFile(value)) {
    if (value.mimeType.toLowerCase().startsWith("image/")) output.set(value.id, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImageFiles(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectImageFiles(item, output);
  }
}

function isStoredFile(value: unknown): value is StoredFile {
  return Boolean(
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as StoredFile).id === "string" &&
    typeof (value as StoredFile).name === "string" &&
    typeof (value as StoredFile).mimeType === "string" &&
    typeof (value as StoredFile).url === "string",
  );
}

function safeConversationValue(value: RuntimeValue | Record<string, unknown>): string {
  if (typeof value === "string") return value.slice(0, 20_000);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "";
  if (Array.isArray(value))
    return value
      .slice(0, 50)
      .map((item) => safeConversationValue(item as RuntimeValue | Record<string, unknown>))
      .join("\n");
  if (typeof value === "object" && "name" in value && "mimeType" in value) {
    const file = value as { name?: unknown; mimeType?: unknown; size?: unknown };
    return `[arquivo: ${String(file.name ?? "sem nome")}; ${String(file.mimeType ?? "tipo desconhecido")}; ${String(file.size ?? "tamanho desconhecido")} bytes]`;
  }
  try {
    return JSON.stringify(value, null, 2).slice(0, 20_000);
  } catch {
    return "[valor não serializável]";
  }
}
