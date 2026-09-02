import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import path from "node:path";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import type { RegisteredPlugin } from "./plugin-runner";

const temporaryDataDirectory = mkdtempSync(path.join(tmpdir(), "contentflow-sandbox-data-"));
process.env.CONTENTFLOW_DATA_DIR = temporaryDataDirectory;
const executableDiscoveryRoot = path.join(temporaryDataDirectory, "LocalAppData");
process.env.LOCALAPPDATA = executableDiscoveryRoot;
const { executeRegisteredPlugin } = await import("./plugin-runner");

const pluginDirectory = realpathSync(
  path.resolve(process.cwd(), "ecosystem", "plugins", "examples", "community-reference"),
);
const manifest = JSON.parse(
  readFileSync(path.join(pluginDirectory, "contentflow.plugin.json"), "utf8"),
) as PluginManifest;

function registered(entrypoint: string, permissions = manifest.permissions): RegisteredPlugin {
  return {
    id: manifest.id,
    source: "installed",
    directory: "ecosystem/plugins/examples/community-reference",
    absoluteDirectory: pluginDirectory,
    entrypoint: path.join(pluginDirectory, entrypoint),
    manifest: { ...manifest, permissions },
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
if (typeof file.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(file.sha256)) {
  throw new Error("O SHA-256 do artifact local não foi registrado.");
}
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

const chromeExecutable = path.join(
  executableDiscoveryRoot,
  "Google",
  "Chrome",
  "Application",
  "chrome.exe",
);
mkdirSync(path.dirname(chromeExecutable), { recursive: true });
writeFileSync(chromeExecutable, "probe", "utf8");
const executableProbe = await executeRegisteredPlugin(
  registered("executable-read-probe.mjs", ["process"]),
  request({ executablePath: chromeExecutable }),
  30_000,
);
if (
  executableProbe.status !== "success" ||
  executableProbe.values.result !== "EXECUTABLE_READ_ALLOWED"
) {
  throw new Error(
    `A sandbox bloqueou a descoberta autorizada do executável: ${JSON.stringify(executableProbe)}.`,
  );
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
    workspaceProbe.values.workspaceRoot !== realpathSync(temporaryWorkspace) ||
    readFileSync(checkpoint, "utf8") !== "checkpoint persistente"
  ) {
    throw new Error("A pasta de trabalho persistente não funcionou.");
  }
} finally {
  rmSync(temporaryWorkspace, { recursive: true, force: true });
}

rmSync(temporaryDataDirectory, { recursive: true, force: true });
console.log(
  "Sandbox comunitária: execução, artifacts, descoberta de executável, workspace e bloqueios de filesystem/rede aprovados.",
);
