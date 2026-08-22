import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const envelope = JSON.parse(await readStdin());
  const loaded = await import(pathToFileURL(envelope.entrypoint).href);
  const execute = loaded.execute ?? loaded.default;
  if (typeof execute !== "function") {
    throw new Error("O entrypoint do plugin não exporta a função execute().");
  }

  const permissions = new Set(envelope.sandbox.permissions);
  const controller = new AbortController();
  const response = await execute(envelope.request, {
    signal: controller.signal,
    getSecret: async (key) => envelope.secrets[key],
    resolveInputFile: async (file) => {
      if (!permissions.has("filesystem:read")) {
        throw new Error("O plugin não declarou a permissão filesystem:read.");
      }
      if (!file.url.startsWith("/api/files/")) throw new Error("Referência de arquivo inválida.");
      const storedName = decodeURIComponent(file.url.slice("/api/files/".length));
      if (!storedName || storedName !== path.basename(storedName)) {
        throw new Error("Referência de arquivo inválida.");
      }
      const resolved = path.resolve(envelope.sandbox.uploadsDirectory, storedName);
      if (!existsSync(resolved)) throw new Error(`Arquivo não encontrado: ${file.name}.`);
      return resolved;
    },
    getOutputPath: (relativePath) => {
      if (!permissions.has("filesystem:write")) {
        throw new Error("O plugin não declarou a permissão filesystem:write.");
      }
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) {
        throw new Error("Caminho de saída inválido.");
      }
      const resolved = path.resolve(envelope.sandbox.outputDirectory, relativePath);
      if (!resolved.startsWith(`${envelope.sandbox.outputDirectory}${path.sep}`)) {
        throw new Error("Caminho de saída fora da pasta autorizada.");
      }
      mkdirSync(path.dirname(resolved), { recursive: true });
      return resolved;
    },
    getWorkspacePath: (relativePath) => {
      if (!permissions.has("filesystem:read") && !permissions.has("filesystem:write")) {
        throw new Error("O plugin não declarou uma permissão de filesystem.");
      }
      if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) {
        throw new Error("Caminho de trabalho inválido.");
      }
      const resolved = path.resolve(envelope.sandbox.workspaceDirectory, relativePath);
      if (
        resolved !== envelope.sandbox.workspaceDirectory &&
        !resolved.startsWith(`${envelope.sandbox.workspaceDirectory}${path.sep}`)
      ) {
        throw new Error("Caminho fora da pasta de trabalho autorizada.");
      }
      if (permissions.has("filesystem:write") && resolved !== envelope.sandbox.workspaceDirectory)
        mkdirSync(path.dirname(resolved), { recursive: true });
      return resolved;
    },
  });
  process.stdout.write(JSON.stringify(response));
}

void main().catch((error) => {
  process.stdout.write(
    JSON.stringify({
      status: "error",
      code: "PLUGIN_WORKER_ERROR",
      message: error instanceof Error ? error.message : "O plugin falhou durante a execução.",
      retryable: false,
    }),
  );
  process.exitCode = 1;
});
