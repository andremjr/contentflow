import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";
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
  return manifest;
}

function scanRoot(root: string, source: PluginSource, includeNestedBundled = false) {
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === "bundled" && !includeNestedBundled) continue;
    const pluginDirectory = path.resolve(root, entry.name);
    const manifestPath = manifestPathFor(pluginDirectory);
    if (!manifestPath) continue;
    const displayDirectory = path.relative(process.cwd(), pluginDirectory).replaceAll("\\", "/");
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
      registry.set(manifest.id, {
        id: manifest.id,
        source,
        directory: displayDirectory,
        absoluteDirectory: realDirectory,
        entrypoint: realEntrypoint,
        manifest,
        executable: source === "bundled",
      });
    } catch (error) {
      discoveryIssues.push({
        directory: displayDirectory,
        message: error instanceof Error ? error.message : "Não foi possível carregar o plugin.",
      });
    }
  }
}

export function initializePluginRunner() {
  registry.clear();
  discoveryIssues = [];
  scanRoot(path.join(process.cwd(), "plugins", "bundled"), "bundled", true);
  scanRoot(path.join(process.cwd(), "plugins"), "local");
  scanRoot(path.join(process.cwd(), "data", "plugins", "installed"), "installed");
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
): Promise<PluginExecutionResponse> {
  if (!plugin.executable) {
    throw new Error(
      "Plugins externos permanecem bloqueados até a conclusão do sandbox comunitário.",
    );
  }

  const workerPath = path.resolve(process.cwd(), "server", "plugin-worker.ts");
  const child = spawn(process.execPath, ["--import", "tsx", workerPath], {
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
      Math.max(1_000, Math.min(timeoutMs, 120_000)),
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
          const response = JSON.parse(stdout) as PluginExecutionResponse;
          resolve(response);
        } catch {
          reject(new Error(stderr.trim() || "O plugin devolveu uma resposta inválida."));
        }
      });
    });
    child.stdin.end(JSON.stringify({ entrypoint: plugin.entrypoint, request }));
  });
}
