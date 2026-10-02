import { requestMonitorFlush } from "./dev-monitor/client";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PROCESS_ORDER,
  createEmptyMethods,
  type ActionBlock,
  type ChannelLibraryItem,
  type StrategicCollection,
  type Channel,
  type ProcessExecution,
  type Project,
} from "../src/lib/domain";

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  server.close();
  await once(server, "close");
  return port;
}

async function waitForApi(baseUrl: string, child: ChildProcess) {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API encerrou com código ${child.exitCode}.`);
    try {
      const response = await fetch(`${baseUrl}/api/channels`);
      if (response.ok) return;
    } catch {
      // Porta ainda iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("A API de teste não iniciou dentro do prazo.");
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const text = await response.text();
  return { response, body: (text ? JSON.parse(text) : undefined) as T & { error?: string } };
}

function humanBlock(): ActionBlock {
  return {
    id: "create-theme",
    type: "CRIAR",
    operator: "Humano",
    name: "Criar tema",
    inputs: [],
    outputs: [
      {
        id: "theme-output",
        label: "Tema",
        key: "theme",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
}

function channelFixture(id: string, block: ActionBlock): Channel {
  const methods = createEmptyMethods();
  methods.theme = {
    contractVersion: 3,
    name: "Método canônico",
    processType: "theme",
    blocks: [block],
  };
  return {
    id,
    name: "Canal",
    handle: "@canonical",
    color: "#2563eb",
    subscribers: "0",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 1,
    frequency: "Semanal",
    nextPublish: "—",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: "2026-09-30T12:00:00.000Z",
  };
}

function projectFixture(id: string, channelId: string): Project {
  return {
    id,
    title: "Projeto",
    channelId,
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: Object.fromEntries(
      PROCESS_ORDER.map((processType) => [
        processType,
        processType === "theme" ? "awaiting_human" : "not_started",
      ]),
    ) as Project["stages"],
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: "2026-09-30T12:00:00.000Z",
  };
}

import { randomUUID } from "node:crypto";
import { resolveBlockInputs } from "../src/lib/runtime-contract";

test(
  "strategic collections reserve, consume, preserve typed inputs and import atomically",
  { timeout: 120000 },
  async () => {
    const port = await availablePort();
    const directory = await mkdtemp(path.join(os.tmpdir(), "contentflow-strategic-library-"));
    const base = "http://127.0.0.1:" + port;
    let child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: { ...process.env, CONTENTFLOW_API_PORT: String(port), CONTENTFLOW_DATA_DIR: directory },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let logs = "";
    const attach = () => {
      child.stdout?.on("data", (c) => (logs = (logs + c).slice(-4000)));
      child.stderr?.on("data", (c) => (logs = (logs + c).slice(-4000)));
    };
    attach();
    const req = async (route: string, method = "GET", value?: unknown) =>
      jsonRequest<{
        result: ProcessExecution;
        items: ChannelLibraryItem[];
        executions: ProcessExecution[];
        libraryItems: ChannelLibraryItem[];
      }>(base + route, {
        method,
        headers: { "Content-Type": "application/json" },
        body: value === undefined ? undefined : JSON.stringify(value),
      });
    const post = async (route: string, value: unknown) => {
      const result = await req(route, "POST", value);
      assert.ok(result.response.ok, JSON.stringify(result.body) + logs);
      return result.body;
    };
    const command = async (value: Record<string, unknown>) =>
      post("/api/commands", { id: randomUUID(), ...value });
    const state = async () =>
      (await req("/api/state")).body as {
        executions: ProcessExecution[];
        libraryItems: ChannelLibraryItem[];
      };
    try {
      await waitForApi(base, child);
      const collection: StrategicCollection = {
        id: "consumable",
        channelId: "library-channel",
        name: "Consumíveis",
        usage: "consumable",
        createdAt: new Date().toISOString(),
        fields: [
          {
            id: "name",
            label: "Nome",
            shape: {
              kind: "content",
              family: "text",
              cardinality: "one",
              representation: "inline",
            },
            required: true,
          },
          {
            id: "link",
            label: "Link",
            shape: { kind: "control", control: "url", cardinality: "one" },
            required: true,
          },
        ],
      };
      const choose: ActionBlock = {
        id: "choose",
        type: "ESCOLHER",
        operator: "Humano",
        name: "Escolher",
        collectionId: collection.id,
        order: 0,
        inputs: [],
        outputs: [],
        parameters: [],
      };
      const create = humanBlock();
      create.order = 1;
      create.inputs = [
        {
          id: "chosen",
          label: "Nome escolhido",
          shape: collection.fields[0].shape,
          binding: { kind: "previous_block", blockId: choose.id, outputKey: "name" },
        },
      ];
      const channel = channelFixture(collection.channelId, choose);
      channel.methods.theme.blocks.push(create);
      await post("/api/channels", channel);
      await post("/api/library/collections", collection);
      const importId = randomUUID();
      const rows = [
        { name: "Primeiro", link: "https://example.com/1" },
        { name: "Segundo", link: "https://example.com/2" },
      ];
      assert.equal(
        (
          await req("/api/library/batch", "POST", {
            importId: randomUUID(),
            collectionId: collection.id,
            rows: [rows[0], { name: "Inválido", link: "javascript:bad" }],
          })
        ).response.status,
        422,
      );
      assert.equal((await state()).libraryItems.length, 0);
      const batch = await post("/api/library/batch", {
        importId,
        collectionId: collection.id,
        rows,
      });
      assert.deepEqual(
        batch.items.map((item: ChannelLibraryItem) => item.values.name),
        ["Primeiro", "Segundo"],
      );
      await post("/api/library/batch", { importId, collectionId: collection.id, rows });
      assert.equal((await state()).libraryItems.length, 2);
      const first = batch.items[0];
      for (const id of ["p1", "p2"]) await post("/api/projects", projectFixture(id, channel.id));
      const ex1 = (await command({ action: "start", projectId: "p1", processType: "theme" }))
        .result;
      const ex2 = (await command({ action: "start", projectId: "p2", processType: "theme" }))
        .result;
      assert.equal((await state()).libraryItems[0].reservation, undefined);
      const chooseId = randomUUID();
      await post("/api/commands", {
        id: chooseId,
        action: "choose",
        executionId: ex1.id,
        blockId: "choose",
        attempt: 1,
        itemId: first.id,
      });
      await post("/api/commands", {
        id: chooseId,
        action: "choose",
        executionId: ex1.id,
        blockId: "choose",
        attempt: 1,
        itemId: first.id,
      });
      let current = await state();
      assert.equal(current.libraryItems.length, 2);
      assert.equal(current.libraryItems[0].reservation?.executionId, ex1.id);
      assert.equal(
        (
          await req("/api/commands", "POST", {
            id: randomUUID(),
            action: "choose",
            executionId: ex2.id,
            blockId: "choose",
            attempt: 1,
            itemId: first.id,
          })
        ).response.status,
        409,
      );
      assert.equal((await req("/api/library/" + first.id, "DELETE")).response.status, 409);
      assert.equal(
        (await req("/api/library/collections/" + collection.id, "DELETE")).response.status,
        409,
      );
      assert.equal((await req("/api/library/" + first.id, "PUT", first)).response.status, 409);
      await post("/api/executions/" + ex1.id + "/cancel", {});
      assert.equal((await state()).libraryItems[0].reservation?.executionId, ex1.id);
      // A real API restart must retain the reservation without a destructive migration.
      if (!process.env.CONTENTFLOW_DEV_MONITOR_RUN) {
        child.kill("SIGTERM");
        if (child.exitCode === null) await once(child, "exit");
        child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
          env: {
            ...process.env,
            CONTENTFLOW_API_PORT: String(port),
            CONTENTFLOW_DATA_DIR: directory,
          },
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
        });
        attach();
        await waitForApi(base, child);
      }
      assert.equal((await state()).libraryItems[0].reservation?.executionId, ex1.id);
      await command({ action: "reset", projectId: "p1", processType: "theme" });
      assert.equal((await state()).libraryItems[0].reservation, undefined);
      await command({
        action: "choose",
        executionId: ex2.id,
        blockId: "choose",
        attempt: 1,
        itemId: first.id,
      });
      await command({
        action: "completeHuman",
        executionId: ex2.id,
        blockId: create.id,
        attempt: 1,
        values: { theme: "Tema produzido" },
      });
      current = await state();
      const completed = current.executions.find((item) => item.id === ex2.id)!;
      assert.equal(completed.status, "completed");
      assert.equal(current.libraryItems.length, 1);
      assert.equal(current.libraryItems[0].values.name, "Segundo");
      assert.equal(completed.blocks[0].collectionSelection?.item.values.name, "Primeiro");
      assert.equal(completed.output?.values.theme, "Tema produzido");
      assert.ok(completed.deliveries?.some((item) => item.outputKey === "selectedItemId"));
      const resolved = resolveBlockInputs({
        block: create,
        execution: completed,
        project: projectFixture("p2", channel.id),
        projectExecutions: [completed],
        collections: [],
        libraryItems: [],
      });
      assert.equal(resolved[0].resolved, true);
      assert.equal(resolved[0].value, "Primeiro");
      await post("/api/library/batch", { importId, collectionId: collection.id, rows });
      assert.equal(
        (await state()).libraryItems.length,
        1,
        "replaying an import must not recreate consumed items",
      );
      await post("/api/projects", projectFixture("p3", channel.id));
      const removable = (await command({ action: "start", projectId: "p3", processType: "theme" }))
        .result;
      await command({
        action: "choose",
        executionId: removable.id,
        blockId: "choose",
        attempt: 1,
        itemId: batch.items[1].id,
      });
      await post("/api/executions/" + removable.id + "/cancel", {});
      assert.ok((await req("/api/executions/" + removable.id, "DELETE")).response.ok);
      assert.equal((await state()).libraryItems[0].reservation, undefined);

      // A fixed collection (including existing collections with no usage flag) never consumes.
      const fixed = { ...collection, id: "fixed", usage: undefined };
      await post("/api/library/collections", fixed);
      const fixedItem = (
        await post("/api/library/batch", {
          importId: randomUUID(),
          collectionId: fixed.id,
          rows: [rows[0]],
        })
      ).items[0];
      const fixedChannel = channelFixture("fixed-channel", { ...choose, collectionId: fixed.id });
      // same-channel ownership: create the fixed collection in its actual channel.
      fixed.channelId = fixedChannel.id;
      assert.ok((await req("/api/library/collections/fixed", "PUT", fixed)).response.ok);
      await req("/api/library/" + fixedItem.id, "PUT", {
        ...fixedItem,
        channelId: fixed.channelId,
      });
      await post("/api/channels", fixedChannel);
      await post("/api/projects", projectFixture("fixed-project", fixedChannel.id));
      const fx = (
        await command({ action: "start", projectId: "fixed-project", processType: "theme" })
      ).result;
      await command({
        action: "choose",
        executionId: fx.id,
        blockId: "choose",
        attempt: 1,
        itemId: fixedItem.id,
      });
      assert.equal(
        (await state()).libraryItems.find((item) => item.id === fixedItem.id)?.reservation,
        undefined,
      );
      await command({
        action: "completeOutput",
        executionId: fx.id,
        values: { theme: "Resultado fixo" },
      });
      assert.ok((await state()).libraryItems.some((item) => item.id === fixedItem.id));
      // Real Plugin API v2 workers exercise the same selection authority for IA and Code.
      const pluginDirectory = path.join(directory, "selector-fixture");
      await mkdir(pluginDirectory);
      const pluginId = "com.contentflow.strategic-library-test";
      const capabilities = (["IA", "Código"] as const).map((operator, index) => ({
        id: "select-" + index,
        operator,
        instructionUsage: "required",
        blockTypes: ["ESCOLHER"],
        processTypes: ["theme"],
        inputPorts: [],
        outputPorts: [
          {
            key: "choice_result",
            label: "Choice",
            shape: { kind: "control", control: "identifier", cardinality: "one" },
            required: true,
          },
        ],
        execution: { mode: "immediate", defaultTimeoutMs: 30000, maxConcurrency: 1 },
        sideEffects: [],
        cost: { model: "free", estimateSupported: false },
        dataPolicy: { sendsDataToThirdParties: false },
        blockConfigSchema: { type: "object", additionalProperties: false, properties: {} },
        outputSchema: {
          type: "object",
          additionalProperties: false,
          properties: { choice_result: { type: "string" } },
          required: ["choice_result"],
        },
      }));
      await writeFile(
        path.join(pluginDirectory, "contentflow.plugin.json"),
        JSON.stringify({
          apiVersion: "2",
          id: pluginId,
          name: "Selection test",
          version: "1.0.0",
          description: "Isolated selection test",
          author: "ContentFlow Tests",
          license: "Proprietary",
          runtime: { kind: "node", version: ">=26 <27", module: "esm" },
          entrypoint: "handler.mjs",
          permissions: [],
          capabilities,
        }),
      );
      await writeFile(
        path.join(pluginDirectory, "handler.mjs"),
        'export async function execute(request) { return { status: "success", values: { choice_result: request.context.selectedCollection.items[0].id } }; }',
      );
      await post("/api/plugins/link-development-folder", { path: pluginDirectory });
      assert.ok(
        (await req("/api/plugins/" + pluginId + "/consent", "PUT", { enabled: true })).response.ok,
      );
      for (const [index, operator] of (["IA", "Código"] as const).entries()) {
        const autoCollection = {
          ...collection,
          id: "auto-collection-" + index,
          channelId: "auto-channel-" + index,
        };
        const autoChoose: ActionBlock = {
          ...choose,
          operator,
          collectionId: autoCollection.id,
          instructions: "Escolha o primeiro item",
          outputs: [
            {
              id: "selected",
              key: "selectedItemId",
              label: "Selected",
              shape: { kind: "control", control: "identifier", cardinality: "one" },
              required: true,
              portKey: "choice_result",
            },
          ],
          plugin: {
            pluginId,
            pluginVersion: "1.0.0",
            capabilityId: "select-" + index,
            configuration: {},
          },
        };
        const autoChannel = channelFixture(autoCollection.channelId, autoChoose);
        await post("/api/channels", autoChannel);
        await post("/api/library/collections", autoCollection);
        const autoItem = (
          await post("/api/library/batch", {
            importId: randomUUID(),
            collectionId: autoCollection.id,
            rows: [rows[0]],
          })
        ).items[0];
        const autoProject = projectFixture("auto-project-" + index, autoChannel.id);
        await post("/api/projects", autoProject);
        const autoExecution = (
          await command({ action: "start", projectId: autoProject.id, processType: "theme" })
        ).result;
        let done = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          const currentState = await state();
          const currentExecution = currentState.executions.find(
            (item) => item.id === autoExecution.id,
          )!;
          if (currentExecution.status === "failed") assert.fail(currentExecution.error);
          if (currentExecution.status === "awaiting_output") {
            assert.equal(
              currentState.libraryItems.find((item) => item.id === autoItem.id)?.reservation
                ?.executionId,
              autoExecution.id,
            );
            assert.equal(
              currentExecution.blocks[0].collectionSelection?.item.values.name,
              "Primeiro",
            );
            done = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.ok(done, "automatic selector did not finish");
        await command({
          action: "completeOutput",
          executionId: autoExecution.id,
          values: { theme: "Automatic " + operator },
        });
        assert.ok(!(await state()).libraryItems.some((item) => item.id === autoItem.id));
      }
    } finally {
      await requestMonitorFlush();
      child.kill("SIGTERM");
      if (child.exitCode === null) await once(child, "exit");
      await rm(directory, { recursive: true, force: true });
    }
  },
);
