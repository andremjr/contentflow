import { spawn } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginManifest,
} from "../src/lib/plugin-contract";

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

const pluginDeliveryTypes = new Set(["text", "image", "audio", "video", "processing"]);
const maxPluginExecutionMs = 24 * 60 * 60 * 1_000;
const maxArtifactBytes = 4 * 1024 * 1024 * 1024;
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

function manifestPathFor(directory: string) {
  const compatible = path.join(directory, "plugin.json");
  if (existsSync(compatible)) {
    try {
      const alias = JSON.parse(readFileSync(compatible, "utf8")) as {
        canonical_manifest?: unknown;
      };
      if (
        typeof alias.canonical_manifest === "string" &&
        !path.isAbsolute(alias.canonical_manifest) &&
        !alias.canonical_manifest.includes("..")
      ) {
        const referenced = path.join(directory, alias.canonical_manifest);
        if (existsSync(referenced)) return referenced;
      }
    } catch {
      return compatible;
    }
  }
  const canonical = path.join(directory, "contentflow.plugin.json");
  if (existsSync(canonical)) return canonical;
  return existsSync(compatible) ? compatible : undefined;
}

function validateManifest(value: unknown): PluginManifest {
  if (!value || typeof value !== "object") throw new Error("Manifesto inválido.");
  const manifest = value as PluginManifest;
  if (
    manifest.apiVersion !== "1" ||
    !manifest.id ||
    !manifest.name ||
    !manifest.version ||
    manifest.runtime?.kind !== "node" ||
    manifest.runtime.module !== "esm" ||
    !manifest.entrypoint ||
    path.isAbsolute(manifest.entrypoint) ||
    manifest.entrypoint.includes("..") ||
    !Array.isArray(manifest.capabilities) ||
    !manifest.capabilities.length
  ) {
    throw new Error("Manifesto incompleto ou incompatível com a API v1.");
  }
  if (
    manifest.deliveryTypes !== undefined &&
    (!Array.isArray(manifest.deliveryTypes) ||
      !manifest.deliveryTypes.length ||
      new Set(manifest.deliveryTypes).size !== manifest.deliveryTypes.length ||
      manifest.deliveryTypes.some((type) => !pluginDeliveryTypes.has(type)))
  ) {
    throw new Error("deliveryTypes contém uma capacidade de entrega inválida.");
  }
  return manifest;
}

function scanPluginDirectory(
  pluginDirectory: string,
  source: PluginSource,
  displayDirectory?: string,
) {
  const shownDirectory =
    displayDirectory ?? path.relative(applicationRoot, pluginDirectory).replaceAll("\\", "/");
  const manifestPath = manifestPathFor(pluginDirectory);
  if (!manifestPath) return;
  try {
    const manifest = validateManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
    const entrypoint = path.resolve(pluginDirectory, manifest.entrypoint);
    const realDirectory = realpathSync(pluginDirectory);
    const realEntrypoint = realpathSync(entrypoint);
    if (!realEntrypoint.startsWith(`${realDirectory}${path.sep}`)) {
      throw new Error("O entrypoint precisa permanecer dentro da pasta do plugin.");
    }
    if (registry.has(manifest.id)) {
      throw new Error(`O id ${manifest.id} já foi registrado por outro plugin.`);
    }
    if (source !== "bundled") assertNoSymlinks(realDirectory);
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

function assertNoSymlinks(directory: string) {
  const pending = [directory];
  let visited = 0;
  while (pending.length) {
    const current = pending.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      visited += 1;
      if (visited > 20_000) throw new Error("O pacote excede o limite de 20.000 arquivos.");
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink() || lstatSync(target).isSymbolicLink()) {
        throw new Error("Plugins comunitários não podem conter links simbólicos.");
      }
      if (entry.isDirectory()) pending.push(target);
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
  options: { workspaceDirectory?: string } = {},
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
          resolve(importArtifacts(pluginResponse, outputDirectory, uploadsDirectory));
        } catch {
          reject(new Error(stderr.trim() || "O plugin devolveu uma resposta inválida."));
        } finally {
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

function importArtifacts(
  response: PluginExecutionResponse,
  outputDirectory: string,
  uploadsDirectory: string,
): PluginExecutionResponse {
  if (response.status !== "success" || !response.artifacts?.length) return response;
  const imported = new Map<string, string>();
  const outputRoot = realpathSync(outputDirectory);
  for (const artifact of response.artifacts) {
    if (artifact.source.kind !== "path") continue;
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
    const extension = path.extname(artifact.name).slice(0, 20);
    const storedName = `${randomUUID()}${extension}`;
    copyFileSync(realCandidate, path.join(uploadsDirectory, storedName));
    imported.set(artifact.id, `/api/files/${storedName}`);
  }
  return {
    ...response,
    values: replaceArtifactUrls(response.values, imported) as typeof response.values,
  };
}

function replaceArtifactUrls(value: unknown, imported: Map<string, string>): unknown {
  if (typeof value === "string" && value.startsWith("artifact://")) {
    return imported.get(value.slice("artifact://".length)) ?? value;
  }
  if (Array.isArray(value)) return value.map((item) => replaceArtifactUrls(item, imported));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceArtifactUrls(item, imported)]),
    );
  }
  return value;
}
