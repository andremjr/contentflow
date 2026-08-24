import { spawn } from "node:child_process";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { rename, rm } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginArtifact,
  PluginManifest,
} from "../src/lib/plugin-contract";
import type { RuntimeValue, StoredFile } from "../src/lib/domain";
import {
  assertRemoteArtifactNetworkPermission,
  DEFAULT_REMOTE_ARTIFACT_MAX_BYTES,
  downloadRemoteArtifact,
} from "./remote-artifact-downloader";
import { findPluginManifest, validatePluginDirectory } from "./plugin-validation";

export type PluginSource = "bundled" | "local" | "installed";

export type RegisteredPlugin = {
  id: string;
  source: PluginSource;
  directory: string;
  absoluteDirectory: string;
  entrypoint: string;
  manifest: PluginManifest;
  executable: boolean;
};

type PluginIssue = { directory: string; message: string };

const maxPluginExecutionMs = 24 * 60 * 60 * 1_000;
const maxArtifactBytes = 4 * 1024 * 1024 * 1024;
const maxArtifactBatchBytes = 4 * 1024 * 1024 * 1024;
const maxRemoteArtifactBatchBytes = 2 * 1024 * 1024 * 1024;
const maxArtifactsPerResponse = 100;
const applicationRoot = path.resolve(process.env.CONTENTFLOW_APP_ROOT ?? process.cwd());
const defaultDataRoot =
  process.platform === "win32" && process.env.APPDATA
    ? path.join(process.env.APPDATA, "ContentFlow OS", "data")
    : path.join(applicationRoot, "data");
const dataRoot = path.resolve(process.env.CONTENTFLOW_DATA_DIR ?? defaultDataRoot);
const bundledPluginsRoot = path.resolve(
  process.env.CONTENTFLOW_BUNDLED_PLUGINS_DIR ?? path.join(applicationRoot, "plugins", "bundled"),
);
const localPluginsRoot = path.resolve(
  process.env.CONTENTFLOW_LOCAL_PLUGINS_DIR ?? path.join(applicationRoot, "plugins"),
);
const installedPluginsRoot = path.resolve(
  process.env.CONTENTFLOW_INSTALLED_PLUGINS_DIR ?? path.join(dataRoot, "plugins", "installed"),
);
const developmentLinksRoot = path.resolve(
  process.env.CONTENTFLOW_DEVELOPMENT_LINKS_DIR ?? path.join(dataRoot, "plugins", "development"),
);

const registry = new Map<string, RegisteredPlugin>();
let discoveryIssues: PluginIssue[] = [];

function scanPluginDirectory(
  pluginDirectory: string,
  source: PluginSource,
  displayDirectory?: string,
) {
  const shownDirectory =
    displayDirectory ?? path.relative(applicationRoot, pluginDirectory).replaceAll("\\", "/");
  const manifestPath = findPluginManifest(pluginDirectory);
  if (!manifestPath) return;
  try {
    const validated = validatePluginDirectory(pluginDirectory, source !== "bundled");
    const { manifest, absoluteDirectory: realDirectory, entrypoint: realEntrypoint } = validated;
    const registered = registry.get(manifest.id);
    if (registered?.source === "bundled" && source !== "bundled") return;
    if (registered) {
      throw new Error(`O id ${manifest.id} já foi registrado por outro plugin.`);
    }
    registry.set(manifest.id, {
      id: manifest.id,
      source,
      directory: shownDirectory,
      absoluteDirectory: realDirectory,
      entrypoint: realEntrypoint,
      manifest,
      executable: true,
    });
  } catch (error) {
    discoveryIssues.push({
      directory: shownDirectory,
      message: error instanceof Error ? error.message : "Não foi possível carregar o plugin.",
    });
  }
}

function scanRoot(root: string, source: PluginSource, includeNestedBundled = false) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "bundled" && !includeNestedBundled) continue;
    const pluginDirectory = path.resolve(root, entry.name);
    scanPluginDirectory(pluginDirectory, source);
  }
}

function scanDevelopmentLinks() {
  if (!existsSync(developmentLinksRoot)) return;
  for (const entry of readdirSync(developmentLinksRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const linkPath = path.join(developmentLinksRoot, entry.name);
    try {
      const link = JSON.parse(readFileSync(linkPath, "utf8")) as { path?: unknown };
      if (typeof link.path !== "string" || !existsSync(link.path)) {
        const pluginId = entry.name.slice(0, -".json".length);
        if (registry.get(pluginId)?.source === "bundled") continue;
        throw new Error("A pasta de desenvolvimento não existe mais.");
      }
      scanPluginDirectory(path.resolve(link.path), "local", path.resolve(link.path));
    } catch (error) {
      discoveryIssues.push({
        directory: linkPath,
        message: error instanceof Error ? error.message : "Não foi possível carregar o plugin.",
      });
    }
  }
}

export function initializePluginRunner() {
  registry.clear();
  discoveryIssues = [];
  scanRoot(bundledPluginsRoot, "bundled", true);
  if (localPluginsRoot !== path.dirname(bundledPluginsRoot)) scanRoot(localPluginsRoot, "local");
  scanDevelopmentLinks();
  scanRoot(installedPluginsRoot, "installed");
  return getPluginRegistrySnapshot();
}

export function getPluginRegistrySnapshot() {
  return { plugins: [...registry.values()], issues: [...discoveryIssues] };
}

export function getRegisteredPlugin(pluginId: string) {
  return registry.get(pluginId);
}

export async function executeRegisteredPlugin(
  plugin: RegisteredPlugin,
  request: PluginExecutionRequest,
  timeoutMs: number,
  secrets: Record<string, string> = {},
  options: { workspaceDirectory?: string; existingArtifacts?: StoredFile[] } = {},
): Promise<PluginExecutionResponse> {
  if (!plugin.executable) {
    throw new Error("Este plugin não está disponível para execução.");
  }

  const sandboxed = plugin.source !== "bundled";
  const workerRoot = path.resolve(
    process.env.CONTENTFLOW_PLUGIN_WORKER_DIR ?? path.join(applicationRoot, "server"),
  );
  const workerPath = path.join(workerRoot, sandboxed ? "plugin-worker.mjs" : "plugin-worker.ts");
  const uploadsDirectory = path.resolve(dataRoot, "uploads");
  const workspaceDirectory = path.resolve(
    options.workspaceDirectory ??
      path.join(
        dataRoot,
        "plugin-workspaces",
        safeSegment(request.context.project.id),
        safeSegment(plugin.id),
      ),
  );
  const outputDirectory = path.resolve(
    workspaceDirectory,
    ".contentflow-output",
    safeSegment(request.executionId),
    safeSegment(request.traceId),
  );
  mkdirSync(uploadsDirectory, { recursive: true });
  mkdirSync(workspaceDirectory, { recursive: true });
  mkdirSync(outputDirectory, { recursive: true });
  const realWorkspaceDirectory = realpathSync(workspaceDirectory);
  const permissions = new Set(plugin.manifest.permissions);
  const nodeMajor = Number(
    process.env.CONTENTFLOW_PLUGIN_NODE_MAJOR ?? process.versions.node.split(".")[0],
  );
  const args = sandboxed ? ["--permission"] : [];
  if (sandboxed) {
    for (const readable of [plugin.absoluteDirectory, workerPath]) {
      args.push(`--allow-fs-read=${readable}`);
    }
    if (permissions.has("filesystem:read")) {
      args.push(`--allow-fs-read=${uploadsDirectory}`, `--allow-fs-read=${realWorkspaceDirectory}`);
    }
    if (permissions.has("filesystem:write")) {
      args.push(`--allow-fs-write=${realWorkspaceDirectory}`);
    }
    if (permissions.has("process")) args.push("--allow-child-process");
    if (permissions.has("worker")) args.push("--allow-worker");
    if (permissions.has("native")) args.push("--allow-addons");
    if (nodeMajor >= 26 && permissions.has("network")) args.push("--allow-net");
    args.push(workerPath);
  } else {
    if (process.env.CONTENTFLOW_PLUGIN_NODE_EXECUTABLE) args.push(workerPath);
    else args.push("--import", "tsx", workerPath);
  }
  const runtimeExecutable = process.env.CONTENTFLOW_PLUGIN_NODE_EXECUTABLE ?? process.execPath;
  const child = spawn(runtimeExecutable, args, {
    cwd: plugin.absoluteDirectory,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "development",
      PATH: process.env.PATH,
      SYSTEMROOT: process.env.SYSTEMROOT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };
    const timer = setTimeout(
      () => {
        child.kill();
        finish(() => reject(new Error("O plugin excedeu o tempo máximo de execução.")));
      },
      Math.max(1_000, Math.min(timeoutMs, maxPluginExecutionMs)),
    );

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
      if (stdout.length > 2_000_000) child.kill();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) child.kill();
    });
    child.on("error", (error) => finish(() => reject(error)));
    child.on("close", () => {
      finish(() => {
        try {
          const pluginResponse = JSON.parse(stdout) as PluginExecutionResponse;
          void importPluginArtifacts(
            pluginResponse,
            outputDirectory,
            uploadsDirectory,
            plugin.manifest,
            { existingArtifacts: options.existingArtifacts },
          )
            .then(resolve, reject)
            .finally(() => rmSync(outputDirectory, { recursive: true, force: true }));
        } catch {
          reject(new Error(stderr.trim() || "O plugin devolveu uma resposta inválida."));
          rmSync(outputDirectory, { recursive: true, force: true });
        }
      });
    });
    const declaredSecrets = new Set(plugin.manifest.secretKeys ?? []);
    const authorizedSecrets = Object.fromEntries(
      Object.entries(secrets).filter(([key]) => declaredSecrets.has(key)),
    );
    child.stdin.end(
      JSON.stringify({
        entrypoint: plugin.entrypoint,
        request,
        secrets: authorizedSecrets,
        sandbox: {
          permissions: [...permissions],
          uploadsDirectory,
          workspaceDirectory: realWorkspaceDirectory,
          outputDirectory,
          networkEnforced: nodeMajor >= 26,
        },
      }),
    );
  });
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 160) || "unknown";
}

export async function importPluginArtifacts(
  response: PluginExecutionResponse,
  outputDirectory: string,
  uploadsDirectory: string,
  manifest: PluginManifest,
  dependencies: {
    downloadRemote?: typeof downloadRemoteArtifact;
    existingArtifacts?: StoredFile[];
  } = {},
): Promise<PluginExecutionResponse> {
  if (response.status === "error") return response;
  const artifacts = response.status === "success" ? response.artifacts : response.partialArtifacts;
  const responseValues = response.status === "success" ? response.values : response.partialValues;
  const imported = new Map(
    (dependencies.existingArtifacts ?? []).map((file) => [file.id, file] as const),
  );
  if (!artifacts?.length) {
    const values = replaceArtifactUrls(responseValues ?? {}, imported) as Record<
      string,
      RuntimeValue
    >;
    if (containsArtifactUrl(values)) {
      throw new Error("A resposta contém artifact://, mas não declarou o arquivo correspondente.");
    }
    const storedArtifacts = [...imported.values()];
    return response.status === "success"
      ? { ...response, values, storedArtifacts }
      : { ...response, partialValues: values, storedArtifacts };
  }
  if (artifacts.length > maxArtifactsPerResponse) {
    throw new Error(`A resposta excede o limite de ${maxArtifactsPerResponse} artifacts.`);
  }
  const artifactIds = artifacts.map((artifact) => artifact.id);
  if (new Set(artifactIds).size !== artifactIds.length) {
    throw new Error("A resposta do plugin contém IDs de artifacts duplicados.");
  }
  const createdPaths: string[] = [];
  let importedBytes = 0;
  let remoteBytes = 0;
  const outputRoot = realpathSync(outputDirectory);
  try {
    for (const artifact of artifacts) {
      const existing = imported.get(artifact.id);
      if (existing) {
        if (
          existing.name !== artifact.name ||
          existing.mimeType !== artifact.mimeType.toLowerCase() ||
          (artifact.size !== undefined && existing.size !== artifact.size)
        ) {
          throw new Error(`O artifact parcial ${artifact.id} mudou após ser importado.`);
        }
        continue;
      }
      if (artifact.source.kind === "url") {
        assertRemoteArtifactNetworkPermission(manifest.permissions);
        const remainingBytes = Math.min(
          DEFAULT_REMOTE_ARTIFACT_MAX_BYTES,
          maxRemoteArtifactBatchBytes - remoteBytes,
          maxArtifactBatchBytes - importedBytes,
        );
        if (remainingBytes < 1) throw new Error("A resposta excede o limite total de artifacts.");
        const remote = await (dependencies.downloadRemote ?? downloadRemoteArtifact)({
          artifact: { ...artifact, source: artifact.source },
          uploadsDirectory,
          allowedHosts: manifest.networkHosts,
          maxBytes: remainingBytes,
        });
        imported.set(artifact.id, remote.file);
        createdPaths.push(remote.storedPath);
        importedBytes += remote.file.size;
        remoteBytes += remote.file.size;
        continue;
      }
      const candidate = path.resolve(outputDirectory, artifact.source.path);
      if (!existsSync(candidate)) throw new Error(`Artifact ausente: ${artifact.name}.`);
      const realCandidate = realpathSync(candidate);
      if (!realCandidate.startsWith(`${outputRoot}${path.sep}`)) {
        throw new Error(`Artifact fora da pasta autorizada: ${artifact.name}.`);
      }
      const metadata = statSync(realCandidate);
      if (!metadata.isFile() || metadata.size > maxArtifactBytes) {
        throw new Error(`Artifact inválido ou maior que 4 GB: ${artifact.name}.`);
      }
      if (importedBytes + metadata.size > maxArtifactBatchBytes) {
        throw new Error("A resposta excede o limite total de artifacts.");
      }
      if (artifact.size !== undefined && artifact.size !== metadata.size) {
        throw new Error(`Tamanho declarado incorreto no artifact: ${artifact.name}.`);
      }
      const importedLocal = await importLocalArtifact(
        artifact,
        realCandidate,
        uploadsDirectory,
        metadata.size,
      );
      imported.set(artifact.id, importedLocal.file);
      createdPaths.push(importedLocal.storedPath);
      importedBytes += importedLocal.file.size;
    }
    const values = replaceArtifactUrls(responseValues ?? {}, imported) as Record<
      string,
      RuntimeValue
    >;
    if (containsArtifactUrl(values)) {
      throw new Error("A resposta contém uma referência artifact:// sem arquivo correspondente.");
    }
    const storedArtifacts = [...imported.values()];
    return response.status === "success"
      ? { ...response, values, storedArtifacts }
      : { ...response, partialValues: values, storedArtifacts };
  } catch (error) {
    await Promise.all(createdPaths.map((createdPath) => rm(createdPath, { force: true })));
    throw error;
  }
}

async function importLocalArtifact(
  artifact: PluginArtifact,
  sourcePath: string,
  uploadsDirectory: string,
  size: number,
) {
  validateLocalArtifactMetadata(artifact.id, artifact.name, artifact.mimeType);
  const extension = safeArtifactExtension(artifact.name);
  const storedName = `${randomUUID()}${extension}`;
  const storedPath = path.join(uploadsDirectory, storedName);
  const partialPath = path.join(uploadsDirectory, `.${storedName}.${randomUUID()}.partial`);
  const hash = createHash("sha256");
  let bytes = 0;
  let promoted = false;
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxArtifactBytes) {
        callback(new Error(`Artifact inválido ou maior que 4 GB: ${artifact.name}.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(
      createReadStream(sourcePath),
      meter,
      createWriteStream(partialPath, { flags: "wx" }),
    );
    if (bytes !== size || !statSync(partialPath).isFile()) {
      throw new Error(`Cópia final inválida do artifact: ${artifact.name}.`);
    }
    await rename(partialPath, storedPath);
    promoted = true;
    const finalMetadata = statSync(storedPath);
    if (!finalMetadata.isFile() || finalMetadata.size !== bytes) {
      await rm(storedPath, { force: true });
      promoted = false;
      throw new Error(`Arquivo final inválido do artifact: ${artifact.name}.`);
    }
    return {
      storedPath,
      file: {
        id: artifact.id,
        name: artifact.name,
        mimeType: artifact.mimeType.toLowerCase(),
        size,
        url: `/api/files/${storedName}`,
        sha256: hash.digest("hex"),
      } satisfies StoredFile,
    };
  } catch (error) {
    await rm(partialPath, { force: true }).catch(() => undefined);
    if (promoted) await rm(storedPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

function replaceArtifactUrls(value: unknown, imported: Map<string, StoredFile>): unknown {
  if (typeof value === "string" && value.startsWith("artifact://")) {
    return imported.get(value.slice("artifact://".length)) ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceArtifactUrls(item, imported));
  if (value && typeof value === "object") {
    const candidate = value as Record<string, unknown>;
    if (typeof candidate.url === "string" && candidate.url.startsWith("artifact://")) {
      const file = imported.get(candidate.url.slice("artifact://".length));
      if (file) return { ...candidate, ...file };
    }
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceArtifactUrls(item, imported)]),
    );
  }
  return value;
}

function validateLocalArtifactMetadata(id: string, name: string, mimeType: string) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,159}$/.test(id)) {
    throw new Error("O id do artifact é inválido.");
  }
  if (
    typeof name !== "string" ||
    !name ||
    name.length > 255 ||
    name === "." ||
    name === ".." ||
    path.basename(name) !== name ||
    /[\\/]/.test(name) ||
    hasControlCharacters(name)
  ) {
    throw new Error("O nome do artifact é inválido.");
  }
  if (typeof mimeType !== "string" || !/^[-\w.+]+\/[-\w.+]+$/.test(mimeType)) {
    throw new Error("O MIME do artifact é inválido.");
  }
}

function containsArtifactUrl(value: unknown): boolean {
  if (typeof value === "string") return value.startsWith("artifact://");
  if (Array.isArray(value)) return value.some(containsArtifactUrl);
  return Boolean(
    value && typeof value === "object" && Object.values(value).some(containsArtifactUrl),
  );
}

function hasControlCharacters(value: string) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function safeArtifactExtension(name: string) {
  const extension = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,20}$/.test(extension) ? extension : "";
}
