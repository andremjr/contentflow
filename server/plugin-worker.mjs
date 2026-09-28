import fs, { existsSync, mkdirSync, realpathSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";

const PARTIAL_PREFIX = "CONTENTFLOW_PARTIAL\t";
const SERVICE_PREFIX = "CONTENTFLOW_SERVICE\t";
const SERVICE_RESULT_PREFIX = "CONTENTFLOW_SERVICE_RESULT\t";

function pathIsInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function resolveAuthorizedPath(root, relativePath, label, verifyExistingPaths) {
  if (!relativePath || path.isAbsolute(relativePath)) throw new Error(`${label} inválido.`);
  const resolved = path.resolve(root, relativePath);
  if (!pathIsInside(root, resolved)) throw new Error(`${label} fora da pasta autorizada.`);
  if (verifyExistingPaths) {
    const relative = path.relative(root, resolved);
    let current = root;
    for (const segment of relative.split(path.sep).filter(Boolean)) {
      current = path.join(current, segment);
      if (!existsSync(current)) break;
      if (!pathIsInside(root, realpathSync(current))) {
        throw new Error(`${label} usa link simbólico fora da pasta autorizada.`);
      }
    }
  }
  return resolved;
}

let activeInput;

async function main() {
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  activeInput = input;
  const iterator = input[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done || !first.value) throw new Error("Envelope do plugin ausente.");
  const envelope = JSON.parse(first.value);
  const pendingServices = new Map();
  void (async () => {
    for await (const line of { [Symbol.asyncIterator]: () => iterator }) {
      if (!line.startsWith(SERVICE_RESULT_PREFIX)) continue;
      const result = JSON.parse(line.slice(SERVICE_RESULT_PREFIX.length));
      const pending = pendingServices.get(result.requestId);
      if (!pending) continue;
      pendingServices.delete(result.requestId);
      if (result.ok && result.value) pending.resolve(result.value);
      else pending.reject(new Error(result.error ?? "Falha no serviço do núcleo."));
    }
  })();
  const permissions = new Set(envelope.sandbox.permissions);
  const denyLinkCreation = () => {
    throw new Error("Criação de links de filesystem não é permitida no sandbox do plugin.");
  };
  fs.symlink = denyLinkCreation;
  fs.symlinkSync = denyLinkCreation;
  fs.link = denyLinkCreation;
  fs.linkSync = denyLinkCreation;
  fs.promises.symlink = denyLinkCreation;
  fs.promises.link = denyLinkCreation;
  syncBuiltinESMExports();
  const loaded = await import(pathToFileURL(envelope.entrypoint).href);
  const execute = loaded.execute ?? loaded.default;
  if (typeof execute !== "function") {
    throw new Error("O entrypoint do plugin não exporta a função execute().");
  }

  const controller = new AbortController();
  let partialSequence = 0;
  const services = {
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
      const resolved = resolveAuthorizedPath(
        envelope.sandbox.outputDirectory,
        relativePath,
        "Caminho de saída",
        permissions.has("filesystem:read"),
      );
      mkdirSync(path.dirname(resolved), { recursive: true });
      return resolved;
    },
    getWorkspacePath: (relativePath) => {
      if (!permissions.has("filesystem:read") && !permissions.has("filesystem:write")) {
        throw new Error("O plugin não declarou uma permissão de filesystem.");
      }
      const resolved = resolveAuthorizedPath(
        envelope.sandbox.workspaceDirectory,
        relativePath,
        "Caminho de trabalho",
        permissions.has("filesystem:read"),
      );
      if (permissions.has("filesystem:write") && resolved !== envelope.sandbox.workspaceDirectory)
        mkdirSync(path.dirname(resolved), { recursive: true });
      return resolved;
    },
    ...(envelope.sandbox.profileDirectory
      ? {
          getProfilePath: (relativePath) => {
            if (!permissions.has("filesystem:read") && !permissions.has("filesystem:write")) {
              throw new Error("O plugin não declarou uma permissão de filesystem.");
            }
            const resolved = resolveAuthorizedPath(
              envelope.sandbox.profileDirectory,
              relativePath,
              "Caminho de perfil",
              permissions.has("filesystem:read"),
            );
            if (
              permissions.has("filesystem:write") &&
              resolved !== envelope.sandbox.profileDirectory
            )
              mkdirSync(path.dirname(resolved), { recursive: true });
            return resolved;
          },
        }
      : {}),
    publishPartial: async (update) => {
      if (!update || typeof update !== "object" || !update.values) {
        throw new Error("A entrega parcial do plugin é inválida.");
      }
      process.stdout.write(
        `${PARTIAL_PREFIX}${JSON.stringify({ sequence: ++partialSequence, update })}\n`,
      );
    },
    registerItems: async (parentItemId, plannedItems) => {
      const requestId = `register-items:${++partialSequence}`;
      return new Promise((resolve, reject) => {
        pendingServices.set(requestId, { resolve, reject });
        process.stdout.write(
          `${SERVICE_PREFIX}${JSON.stringify({
            requestId,
            method: "registerItems",
            parentItemId,
            plannedItems,
          })}\n`,
        );
      });
    },
    claimItems: async (limit) => {
      const requestId = `claim-items:${++partialSequence}`;
      return new Promise((resolve, reject) => {
        pendingServices.set(requestId, { resolve, reject });
        process.stdout.write(
          `${SERVICE_PREFIX}${JSON.stringify({
            requestId,
            method: "claimItems",
            limit,
          })}\n`,
        );
      });
    },
    publishItemUpdate: async (update) => {
      const requestId = `publish-item-update:${++partialSequence}`;
      return new Promise((resolve, reject) => {
        pendingServices.set(requestId, { resolve, reject });
        process.stdout.write(
          `${SERVICE_PREFIX}${JSON.stringify({
            requestId,
            method: "publishItemUpdate",
            update,
          })}\n`,
        );
      });
    },
  };
  const response = await execute(envelope.request, services);
  input.close();
  activeInput = undefined;
  process.stdin.pause();
  process.stdout.write(JSON.stringify(response));
}

void main().catch((error) => {
  activeInput?.close();
  activeInput = undefined;
  process.stdin.pause();
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
