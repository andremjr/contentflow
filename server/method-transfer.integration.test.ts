import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Channel,
  type ChannelLibraryItem,
  type ProcessExecution,
  type Project,
  type StoredFile,
  type StrategicCollection,
} from "../src/lib/domain";
import { createProcessOutputFields } from "../src/lib/human-workflow";
import {
  parseMethodImportFile,
  planPortableMethodTransfer,
  serializePortableMethodTransfer,
} from "../src/lib/method-file";

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  server.close();
  await once(server, "close");
  return address.port;
}

async function api<T>(base: string, route: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await response.json()) as T & { error?: string };
  assert.ok(response.ok, `${method} ${route}: ${response.status} ${payload.error ?? ""}`);
  return payload;
}

async function waitForApi(base: string, child: ChildProcess, logs: () => string) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`API exited before startup:\n${logs()}`);
    try {
      const response = await fetch(`${base}/api/health`);
      if (response.ok) return;
    } catch {
      // startup in progress
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API did not start:\n${logs()}`);
}

function startApi(directory: string, port: number) {
  let output = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: String(port),
      CONTENTFLOW_DATA_DIR: directory,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout?.on("data", (chunk) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk) => (output += chunk.toString()));
  return { child, logs: () => output, base: `http://127.0.0.1:${port}` };
}

async function stopApi(child: ChildProcess) {
  child.kill();
  if (child.exitCode === null) {
    await Promise.race([once(child, "exit"), new Promise((resolve) => setTimeout(resolve, 3000))]);
  }
}

test(
  "round trip entre instalações isoladas copia item e asset e executa Projeto controlado",
  { timeout: 90_000 },
  async () => {
    const sourceDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-transfer-source-"));
    const targetDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-transfer-target-"));
    const sourceServer = startApi(sourceDirectory, await availablePort());
    const targetServer = startApi(targetDirectory, await availablePort());
    try {
      await Promise.all([
        waitForApi(sourceServer.base, sourceServer.child, sourceServer.logs),
        waitForApi(targetServer.base, targetServer.child, targetServer.logs),
      ]);

      const collection: StrategicCollection = {
        id: "source-collection",
        channelId: "source-channel",
        name: "Referências visuais",
        fields: [{ id: "source-image", label: "Imagem", type: "image", required: true }],
        createdAt: new Date().toISOString(),
      };
      const methods = createEmptyMethods();
      const titleOutput = createProcessOutputFields("title")[0];
      methods.title = {
        name: "Título portátil controlado",
        processType: "title",
        blocks: [
          {
            id: "choose-reference",
            name: "Escolher referência",
            type: "ESCOLHER",
            operator: "Humano",
            collectionId: collection.id,
            parameters: [],
            order: 0,
          },
          {
            id: "write-title",
            name: "Escrever título",
            type: "CRIAR",
            operator: "Humano",
            parameters: [],
            outputs: [{ ...titleOutput, id: "title-output" }],
            order: 1,
          },
        ],
      };
      const sourceChannel: Channel = {
        id: "source-channel",
        name: "Canal de origem",
        handle: "",
        color: "#2563EB",
        subscribers: "—",
        description: "",
        niche: "Teste",
        language: "pt-BR",
        activeProjects: 0,
        frequency: "1x / semana",
        nextPublish: "",
        currentProjectProgress: 0,
        status: "healthy",
        trend: [],
        methods,
        processOrder: [...PROCESS_ORDER],
        definitionRevision: 0,
        createdAt: new Date().toISOString(),
      };
      await api(sourceServer.base, "/api/channels", "POST", sourceChannel);
      await api(sourceServer.base, "/api/library/collections", "POST", collection);

      const assetBytes = Buffer.from("asset-round-trip-isolado");
      const uploadResponse = await fetch(`${sourceServer.base}/api/uploads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "X-File-Name": encodeURIComponent("referencia.png"),
          "X-File-Type": "image/png",
        },
        body: assetBytes,
      });
      assert.equal(uploadResponse.status, 201);
      const sourceFile = (await uploadResponse.json()) as StoredFile;
      const sourceItem: ChannelLibraryItem = {
        id: "source-item",
        channelId: sourceChannel.id,
        collectionId: collection.id,
        values: { "source-image": sourceFile },
        createdAt: new Date().toISOString(),
      };
      await api(sourceServer.base, "/api/library", "POST", sourceItem);

      const plan = planPortableMethodTransfer({
        name: methods.title.name,
        channelName: sourceChannel.name,
        sourceMethods: PROCESS_ORDER.map((processType) => methods[processType]),
        collections: [collection],
        items: [sourceItem],
        includeItems: true,
        processOrder: [...PROCESS_ORDER],
        primaryProcessTypes: ["title"],
      });
      const exportResponse = await fetch(`${sourceServer.base}/api/method-packages/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest: serializePortableMethodTransfer(plan) }),
      });
      assert.equal(exportResponse.status, 200);
      const archive = Buffer.from(await exportResponse.arrayBuffer());
      assert.equal(archive.subarray(0, 2).toString(), "PK");

      const importResponse = await fetch(`${targetServer.base}/api/method-packages/import`, {
        method: "POST",
        headers: { "Content-Type": "application/zip" },
        body: archive,
      });
      assert.equal(importResponse.status, 200);
      const importedPayload = (await importResponse.json()) as { manifest: string };
      const imported = parseMethodImportFile(importedPayload.manifest);
      assert.equal(imported.version, 2);
      if (imported.version !== 2) return;
      const importedItems = imported.items ?? [];
      assert.equal(imported.itemsIncluded, true);
      assert.equal(importedItems.length, 1);

      const targetChannelId = "target-channel";
      const applied = await api<{
        channel: Channel;
        collections: StrategicCollection[];
        items: ChannelLibraryItem[];
      }>(targetServer.base, "/api/method-transfers/apply", "POST", {
        newChannel: { id: targetChannelId, name: "Canal importado" },
        methods: imported.methods.map((entry) => entry.method),
        collections: imported.collections,
        itemsIncluded: imported.itemsIncluded,
        items: importedItems,
        preferredOrder: imported.processOrder,
        selectedProcesses: imported.methods.map((entry) => entry.method.processType),
        preserveLocalConnections: false,
      });
      assert.equal(applied.collections.length, 1);
      assert.equal(applied.items.length, 1);
      assert.equal(applied.channel.methods.title.blocks[0].collectionId, applied.collections[0].id);
      assert.equal(applied.items[0].collectionId, applied.collections[0].id);
      const importedFile = Object.values(applied.items[0].values)[0] as StoredFile;
      assert.notEqual(importedFile.url, sourceFile.url);
      assert.match(importedFile.sha256 ?? "", /^[a-f0-9]{64}$/);
      const copiedAsset = await fetch(`${targetServer.base}${importedFile.url}`);
      assert.equal(copiedAsset.status, 200);
      assert.deepEqual(Buffer.from(await copiedAsset.arrayBuffer()), assetBytes);

      const project: Project = {
        id: randomUUID(),
        channelId: targetChannelId,
        title: "Projeto controlado do round trip",
        createdAt: new Date().toISOString(),
        stages: Object.fromEntries(
          PROCESS_ORDER.map((process) => [process, "not_started"]),
        ) as Project["stages"],
        currentStage: "title",
        state: "not_started",
        progress: 0,
        deadline: "Sem prazo",
        duration: "—",
        updatedAt: "Agora",
        assignee: { name: "Não atribuído", initials: "—" },
        thumbHue: 0,
      };
      await api(targetServer.base, "/api/projects", "POST", project);
      const started = await api<{ result: ProcessExecution }>(
        targetServer.base,
        "/api/commands",
        "POST",
        { id: randomUUID(), action: "start", projectId: project.id, processType: "title" },
      );
      assert.equal(started.result.status, "awaiting_human");
      const chosen = await api<{ result: boolean }>(targetServer.base, "/api/commands", "POST", {
        id: randomUUID(),
        action: "choose",
        executionId: started.result.id,
        blockId: started.result.blocks[0].blockId,
        attempt: 1,
        itemId: applied.items[0].id,
      });
      assert.equal(chosen.result, true);
      const afterChoice = await api<{ execution: ProcessExecution }>(
        targetServer.base,
        `/api/executions/${started.result.id}/state`,
      );
      assert.equal(afterChoice.execution.blocks[1].status, "awaiting_human");
      const completed = await api<{
        result: { ok: boolean; completedProcess?: boolean; missing?: string[] };
      }>(targetServer.base, "/api/commands", "POST", {
        id: randomUUID(),
        action: "completeHuman",
        executionId: started.result.id,
        blockId: afterChoice.execution.blocks[1].blockId,
        attempt: 1,
        values: { [titleOutput.key]: "Título validado após round trip" },
      });
      assert.equal(completed.result.ok, true, JSON.stringify(completed.result));
      const finalState = await api<{ execution: ProcessExecution }>(
        targetServer.base,
        `/api/executions/${started.result.id}/state`,
      );
      assert.equal(finalState.execution.status, "completed");
      assert.equal(
        finalState.execution.output?.values[titleOutput.key],
        "Título validado após round trip",
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\nSOURCE:\n${sourceServer.logs()}\nTARGET:\n${targetServer.logs()}`,
      );
    } finally {
      await Promise.all([stopApi(sourceServer.child), stopApi(targetServer.child)]);
      rmSync(sourceDirectory, { recursive: true, force: true });
      rmSync(targetDirectory, { recursive: true, force: true });
    }
  },
);
