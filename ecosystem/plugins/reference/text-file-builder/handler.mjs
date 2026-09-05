import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";

function pluginError(code, message, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.retryable = retryable;
  return error;
}

function normalizeFormat(value) {
  return value === "plain" ? "plain" : "markdown";
}

function safeFileName(value, format) {
  const extension = format === "plain" ? ".txt" : ".md";
  const fallback = `contexto${extension}`;
  const raw = String(value ?? fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .slice(0, 110);
  if (!raw) return fallback;
  return `${raw.replace(/\.(?:md|txt)$/i, "")}${extension}`;
}

function renderScalar(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function renderContent(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : JSON.stringify(item, null, 2)))
      .filter(Boolean)
      .join("\n\n");
  }
  return renderScalar(value);
}

function buildDocument(request) {
  const body = renderContent(request.inputs?.content);
  if (!body) throw pluginError("INVALID_INPUT", "O conteúdo do arquivo está vazio.");
  const heading = String(request.context?.block?.name ?? "Contexto consolidado").trim();
  return normalizeFormat(request.configuration?.format) === "markdown"
    ? `# ${heading}\n\n${body}\n`
    : `${heading}\n\n${body}\n`;
}

export async function execute(request, services) {
  if (request.invocation?.mode === "cancel") return { status: "cancelled" };
  if (!services?.getOutputPath) {
    throw pluginError("INVALID_REQUEST", "O runtime não forneceu um diretório de artefatos.");
  }

  const format = normalizeFormat(request.configuration?.format);
  const name = safeFileName(request.configuration?.fileName, format);
  const content = buildDocument(request);
  const bytes = Buffer.from(content, "utf8");
  const id = `text-${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}`;
  await writeFile(services.getOutputPath(name), bytes);

  const artifact = {
    id,
    name,
    mimeType: format === "plain" ? "text/plain" : "text/markdown",
    size: bytes.length,
    source: { kind: "path", path: name },
  };

  return {
    status: "success",
    values: {
      document: {
        id: artifact.id,
        name: artifact.name,
        mimeType: artifact.mimeType,
        size: artifact.size,
        url: `artifact://${id}`,
      },
    },
    artifacts: [artifact],
    usage: { outputCharacters: content.length },
  };
}

export const __test = { buildDocument, normalizeFormat, safeFileName };
