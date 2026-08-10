import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import type { RegisteredPlugin } from "./plugin-runner";

const temporaryDataDirectory = mkdtempSync(path.join(tmpdir(), "contentflow-sandbox-data-"));
process.env.CONTENTFLOW_DATA_DIR = temporaryDataDirectory;
const { executeRegisteredPlugin } = await import("./plugin-runner");

const pluginDirectory = realpathSync(
  path.resolve(process.cwd(), "plugins", "examples", "community-reference"),
);
const manifest = JSON.parse(
  readFileSync(path.join(pluginDirectory, "contentflow.plugin.json"), "utf8"),
) as PluginManifest;

function registered(entrypoint: string): RegisteredPlugin {
  return {
    id: manifest.id,
    source: "installed",
    directory: "plugins/examples/community-reference",
    absoluteDirectory: pluginDirectory,
    entrypoint: path.join(pluginDirectory, entrypoint),
    manifest,
    executable: true,
  };
}

function request(configuration: Record<string, unknown> = {}): PluginExecutionRequest {
  return {
    executionId: "sandbox-smoke-execution",
    traceId: crypto.randomUUID(),
    blockId: "block-1",
    capabilityId: "save-text",
    attempt: 1,
    invocation: { mode: "start" },
    configuration,
    settings: {},
    inputs: { content: "Sandbox comunitária funcionando." },
    inputContract: [{ id: "content", portKey: "content", label: "Conteúdo", type: "text" }],
    outputContract: [
      {
        key: "result",
        portKey: "result",
        label: "Arquivo criado",
        type: "file",
        required: true,
      },
    ],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel-1", name: "Teste", language: "pt-BR", niche: "Teste" },
      project: { id: "project-1", title: "Teste" },
      processType: "script",
      block: { type: "CRIAR", name: "Teste", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

const result = await executeRegisteredPlugin(registered("handler.mjs"), request(), 30_000);
if (result.status !== "success") throw new Error("O plugin de referência não concluiu.");
const file = result.values.result;
if (!file || typeof file !== "object" || Array.isArray(file) || !("url" in file)) {
  throw new Error("O artifact não foi convertido em arquivo gerenciado.");
}
const url = String(file.url);
if (!url.startsWith("/api/files/")) throw new Error("A URL do artifact não foi importada.");
const uploadedPath = path.resolve(temporaryDataDirectory, "uploads", path.basename(url));
if (!existsSync(uploadedPath)) throw new Error("O arquivo importado não existe.");
if (readFileSync(uploadedPath, "utf8") !== "Sandbox comunitária funcionando.") {
  throw new Error("O conteúdo do artifact foi alterado.");
}
rmSync(uploadedPath, { force: true });

const probe = await executeRegisteredPlugin(
  registered("sandbox-probe.mjs"),
  request({ forbiddenPath: path.resolve(process.cwd(), "README.md") }),
  30_000,
);
if (probe.status !== "success" || !String(probe.values.result).includes("ERR_ACCESS_DENIED")) {
  throw new Error(`A sandbox não bloqueou a leitura externa: ${JSON.stringify(probe)}.`);
}

const localServer = createServer((_incoming, outgoing) => outgoing.end("reachable"));
await new Promise<void>((resolve) => localServer.listen(0, "127.0.0.1", resolve));
const address = localServer.address();
try {
  if (!address || typeof address === "string") throw new Error("Servidor de teste indisponível.");
  const networkProbe = await executeRegisteredPlugin(
    registered("network-probe.mjs"),
    request({ url: `http://127.0.0.1:${address.port}` }),
    30_000,
  );
  if (
    networkProbe.status !== "success" ||
    String(networkProbe.values.result) === "NETWORK_ALLOWED"
  ) {
    throw new Error(`A sandbox não bloqueou a rede: ${JSON.stringify(networkProbe)}.`);
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    localServer.close((error) => (error ? reject(error) : resolve())),
  );
}

const temporaryWorkspace = mkdtempSync(path.join(tmpdir(), "contentflow-workspace-"));
try {
  const workspaceProbe = await executeRegisteredPlugin(
    registered("workspace-probe.mjs"),
    request(),
    30_000,
    {},
    { workspaceDirectory: temporaryWorkspace },
  );
  const checkpoint = path.join(temporaryWorkspace, "checkpoints", "etapa-001.txt");
  if (
    workspaceProbe.status !== "success" ||
    readFileSync(checkpoint, "utf8") !== "checkpoint persistente"
  ) {
    throw new Error("A pasta de trabalho persistente não funcionou.");
  }
} finally {
  rmSync(temporaryWorkspace, { recursive: true, force: true });
}

rmSync(temporaryDataDirectory, { recursive: true, force: true });
console.log(
  "Sandbox comunitária: execução, artifacts, workspace e bloqueios de filesystem/rede aprovados.",
);
