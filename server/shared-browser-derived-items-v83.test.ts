import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";
import { registerDerivedWorkItems } from "./work-unit-registration";

function request(): PluginExecutionRequest {
  return {
    executionId: "execution-v83",
    traceId: "trace-v83",
    blockId: "block-v83",
    capabilityId: "capability-v83",
    attempt: 1,
    invocation: { mode: "start" },
    configuration: {},
    settings: {},
    inputs: { text: "primeiro|segundo|terceiro" },
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "", language: "", niche: "" },
      project: { id: "project", title: "" },
      processType: "script",
      block: { type: "CRIAR", name: "Teste", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

function parentItem(): BlockExecutionItem {
  return {
    id: "parent-v83",
    kind: "scalar",
    provenance: { origin: "block_input", inputPort: "text" },
    order: 0,
    input: "primeiro|segundo|terceiro",
    status: "pending",
    attempt: 1,
    attempts: [],
  };
}

function job() {
  return createPersistentPluginJob({
    pluginId: "v83.fixture",
    pluginVersion: "1.0.0",
    request: request(),
    timeoutMs: 30_000,
  });
}

test("registra filhos e reaproveita IDs pela chave semântica na mesma tentativa", () => {
  const plan = [
    { key: "chunk-0", order: 0, input: "primeiro" },
    { key: "chunk-1", order: 1, input: "segundo" },
  ];
  const first = registerDerivedWorkItems({
    job: job(),
    existingItems: [parentItem()],
    parentItemId: "parent-v83",
    plannedItems: plan,
  });
  const repeated = registerDerivedWorkItems({
    job: first.job,
    existingItems: [parentItem(), ...(first.job.registeredItems ?? [])],
    parentItemId: "parent-v83",
    plannedItems: plan,
  });

  assert.deepEqual(
    repeated.claimed.map((item) => item.itemId),
    first.claimed.map((item) => item.itemId),
  );
  assert.deepEqual(
    repeated.job.registeredItems?.map((item) => [item.parentItemId, item.semanticKey, item.input]),
    [
      ["parent-v83", "chunk-0", "primeiro"],
      ["parent-v83", "chunk-1", "segundo"],
    ],
  );
  assert.throws(
    () =>
      registerDerivedWorkItems({
        job: first.job,
        existingItems: [parentItem(), ...(first.job.registeredItems ?? [])],
        parentItemId: "parent-v83",
        plannedItems: [{ key: "chunk-0", order: 0, input: "conteúdo alterado" }],
      }),
    /mudou de ordem ou entrada/,
  );
});

test("plugin divide texto em trechos e só continua depois que o núcleo devolve IDs persistidos", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-v83-"));
  const entrypoint = path.join(root, "handler.mjs");
  const effectPath = path.join(root, "effect.json");
  await writeFile(
    entrypoint,
    `import { writeFile } from "node:fs/promises";
export async function execute(request, services) {
  const chunks = String(request.inputs.text).split("|");
  const items = await services.registerItems("parent-v83", chunks.map((chunk, order) => ({
    key: \`chunk-\${order}\`,
    order,
    input: chunk
  })));
  await writeFile(services.getWorkspacePath("effect.json"), JSON.stringify(items), "utf8");
  return { status: "success", values: { ids: items.map((item) => item.itemId) } };
}`,
    "utf8",
  );
  const manifest = {
    id: "v83.fixture",
    version: "1.0.0",
    permissions: ["filesystem:write"],
    capabilities: [],
  } as unknown as PluginManifest;
  const plugin: RegisteredPlugin = {
    id: manifest.id,
    source: "local",
    directory: root,
    absoluteDirectory: root,
    entrypoint,
    manifest,
    executable: true,
  };
  let currentJob = job();
  let persistenceCount = 0;
  try {
    const response = await executeRegisteredPlugin(
      plugin,
      request(),
      10_000,
      {},
      {
        workspaceDirectory: root,
        artifactDirectory: path.join(root, "artifacts"),
        onRegisterItems: async (parentItemId, plannedItems) => {
          const registered = registerDerivedWorkItems({
            job: currentJob,
            existingItems: [parentItem(), ...(currentJob.registeredItems ?? [])],
            parentItemId,
            plannedItems,
          });
          currentJob = registered.job;
          persistenceCount += 1;
          assert.equal(existsSync(effectPath), false);
          return registered.claimed;
        },
      },
    );

    assert.equal(response.status, "success");
    assert.equal(persistenceCount, 1);
    assert.equal(currentJob.registeredItems?.length, 3);
    const effect = JSON.parse(await readFile(effectPath, "utf8")) as Array<{ itemId: string }>;
    assert.deepEqual(
      effect.map((item) => item.itemId),
      currentJob.registeredItems?.map((item) => item.id),
    );
  } finally {
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("rejeita pai estranho e chaves repetidas sem criar filhos", () => {
  assert.throws(
    () =>
      registerDerivedWorkItems({
        job: job(),
        existingItems: [parentItem()],
        parentItemId: "outro-parent",
        plannedItems: [{ key: "chunk-0", order: 0, input: "texto" }],
      }),
    /não pertence a este bloco/,
  );
  assert.throws(
    () =>
      registerDerivedWorkItems({
        job: job(),
        existingItems: [parentItem()],
        parentItemId: "parent-v83",
        plannedItems: [
          { key: "chunk", order: 0, input: "a" },
          { key: "chunk", order: 1, input: "b" },
        ],
      }),
    /foi repetida/,
  );
});
