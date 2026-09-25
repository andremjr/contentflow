import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const repositoryRoot = path.resolve(pluginRoot, "..", "..", "..", "..");
const fixture = JSON.parse(
  await readFile(new URL("../fixtures/p24-real-method.contentflow-method.json", import.meta.url)),
);
const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-p24-"));
const port = Number(process.env.CONTENTFLOW_P24_PORT || 8794);
const apiRoot = `http://127.0.0.1:${port}`;
const output = [];
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  cwd: repositoryRoot,
  env: {
    ...process.env,
    CONTENTFLOW_API_PORT: String(port),
    CONTENTFLOW_APP_ROOT: repositoryRoot,
    CONTENTFLOW_DATA_DIR: dataDirectory,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
server.stdout.on("data", (chunk) => output.push(String(chunk)));
server.stderr.on("data", (chunk) => output.push(String(chunk)));

try {
  await waitForServer();
  await request("/api/plugins/link-development-folder", {
    method: "POST",
    body: { path: pluginRoot },
  });
  await request(`/api/plugins/${fixture.method.blocks[0].plugin.pluginId}/consent`, {
    method: "PUT",
    body: { enabled: true },
  });

  const reports = [];
  for (const locale of fixture.p24.locales) reports.push(await runMethod(locale));
  console.log(JSON.stringify({ status: "success", reports }));
} finally {
  server.kill();
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(dataDirectory, { recursive: true, force: true });
}

async function runMethod(locale) {
  const suffix = `${locale.toLowerCase()}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const channelId = `p24-channel-${suffix}`;
  const projectId = `p24-project-${suffix}`;
  const executionId = `p24-execution-${suffix}`;
  const now = new Date().toISOString();
  const blocks = structuredClone(fixture.method.blocks);

  await request("/api/channels", {
    method: "POST",
    body: {
      id: channelId,
      name: `P24 ${locale}`,
      language: locale,
      niche: "Validation",
      createdAt: now,
    },
  });
  await request("/api/projects", {
    method: "POST",
    body: {
      id: projectId,
      title: `P24 Free Stock ${locale}`,
      channelId,
      currentStage: "assets",
      state: "processing",
      progress: 0,
      deadline: "",
      duration: "",
      updatedAt: "Agora",
      createdAt: now,
      stages: Object.fromEntries(
        [
          "theme",
          "title",
          "thumbnail",
          "script",
          "narration",
          "assets",
          "editing",
          "publishing",
        ].map((processType) => [
          processType,
          processType === "assets" ? "processing" : "not_started",
        ]),
      ),
      assignee: { name: "P24", initials: "P24" },
      thumbHue: 190,
    },
  });
  await request("/api/executions", {
    method: "POST",
    body: {
      id: executionId,
      projectId,
      channelId,
      processType: "assets",
      methodSnapshot: { ...fixture.method, blocks },
      blocks: blocks.map((block, index) => ({
        blockId: block.id,
        status: index === 0 ? "blocked_executor" : "pending",
        values: {},
        ...(index === 0
          ? { runtimeInputs: { "p24-query": fixture.p24.query }, startedAt: now }
          : {}),
        attempt: 1,
      })),
      status: "blocked_executor",
      outputStatus: "pending",
      createdAt: now,
      updatedAt: now,
    },
  });

  let state = await waitForExecution(
    executionId,
    (execution) => execution.status === "awaiting_human",
  );
  const candidates = state.execution.blocks.find((block) => block.blockId === "p24-search")?.values
    ?.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0)
    throw new Error(`${locale}: a busca real não produziu candidatos.`);
  const selected = candidates.find(
    (candidate) => hasCompleteProvenance(candidate) && hasCommerciallySafeLicense(candidate),
  );
  if (!selected)
    throw new Error(`${locale}: nenhum candidato possui proveniência e licença comercial seguras.`);

  await request("/api/commands", {
    method: "POST",
    body: {
      id: randomUUID(),
      action: "completeHuman",
      executionId,
      blockId: "p24-validate",
      attempt: 1,
      values: { selected_value: [selected], feedback: `P24 ${locale}` },
    },
  });
  state = await waitForExecution(executionId, (execution) =>
    ["completed", "failed", "cancelled"].includes(execution.status),
  );
  if (state.execution.status !== "completed") {
    const diagnostics = state.execution.blocks.map((block) => ({
      blockId: block.blockId,
      status: block.status,
      error: block.error,
      logs: block.logs,
    }));
    throw new Error(
      `${locale}: ${state.execution.error || "execução incompleta"} ${JSON.stringify({
        diagnostics,
        jobs: state.jobs?.map((job) => ({
          id: job.id,
          capabilityId: job.capabilityId,
          status: job.status,
          error: job.error,
          itemStates: job.incrementalItems?.map((item) => ({
            status: item.status,
            error: item.error,
          })),
        })),
      })}\n${output.join("\n")}`,
    );
  }
  const download = state.execution.blocks.find((block) => block.blockId === "p24-download");
  const assets = download?.values?.assets;
  if (!Array.isArray(assets) || assets.length !== 1)
    throw new Error(`${locale}: a materialização não produziu exatamente um arquivo.`);
  const asset = assets[0];
  if (!asset?.sha256 || !asset?.mimeType?.startsWith("image/") || !asset?.url)
    throw new Error(`${locale}: artifact local sem hash, MIME ou URL gerenciada.`);
  const provenance = download.items?.[0]?.output;
  if (!hasCompleteProvenance(provenance))
    throw new Error(
      `${locale}: proveniência não sobreviveu à materialização ${JSON.stringify({ assetKeys: Object.keys(asset || {}), itemOutputKeys: provenance && typeof provenance === "object" ? Object.keys(provenance) : [], deliveryKeys: state.execution.deliveries?.filter((delivery) => delivery.blockId === "p24-download").map((delivery) => ({ outputKey: delivery.outputKey, itemKeys: delivery.items?.map((item) => (item.value && typeof item.value === "object" ? Object.keys(item.value) : [])) })) })}`,
    );

  return {
    locale,
    projectId,
    executionId,
    provider: selected.provider,
    candidateAssetId: selected.asset_id,
    artifactId: asset.id,
    mimeType: asset.mimeType,
    size: asset.size,
    sha256: asset.sha256,
    licenseName: selected.license_name,
    attributionPresent: Boolean(selected.attribution),
    deliveries: state.execution.deliveries?.filter((delivery) => delivery.status === "completed")
      .length,
  };
}

function hasCompleteProvenance(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return Boolean(
    candidate &&
    candidate.asset_id &&
    candidate.provider &&
    candidate.source_url &&
    candidate.attribution &&
    candidate.license_name &&
    candidate.license_url,
  );
}

function hasCommerciallySafeLicense(value) {
  const license = String(value?.license_name || "").toUpperCase();
  return Boolean(license) && !/(^|[-_ ])NC($|[-_ ])|(^|[-_ ])ND($|[-_ ])/.test(license);
}

async function waitForExecution(executionId, predicate) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const state = await request(`/api/executions/${executionId}/state`);
    if (predicate(state.execution)) return state;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`A execução ${executionId} não atingiu o estado esperado.`);
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      await request("/api/plugins");
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`A API isolada não iniciou.\n${output.join("\n")}`);
}

async function request(route, options = {}) {
  const response = await fetch(`${apiRoot}${route}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const payload = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(`${response.status} ${route}: ${JSON.stringify(payload)}`);
  return payload;
}
