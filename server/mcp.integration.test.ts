import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function availablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

async function waitForApi(url: string, diagnostics: () => string) {
  for (let attempt = 0; attempt < 250; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/state`);
      if (response.ok) return;
    } catch {
      // The child API is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`A API de teste não iniciou.\n${diagnostics()}`);
}

test(
  "exposes a universal stdio MCP that validates and applies a manual Method",
  { timeout: 45_000 },
  async () => {
    const testDirectory = mkdtempSync(path.join(os.tmpdir(), "contentflow-builder-mcp-"));
    const port = await availablePort();
    const apiUrl = `http://127.0.0.1:${port}`;
    const tsxEntry = path.resolve("node_modules", "tsx", "dist", "cli.mjs");
    const apiProcess = spawn(process.execPath, [tsxEntry, path.resolve("server", "index.ts")], {
      cwd: process.cwd(),
      windowsHide: true,
      env: {
        ...process.env,
        CONTENTFLOW_API_PORT: String(port),
        CONTENTFLOW_APP_ROOT: process.cwd(),
        CONTENTFLOW_DATA_DIR: testDirectory,
        CONTENTFLOW_LOCAL_PLUGINS_DIR: path.join(testDirectory, "plugins", "local"),
        CONTENTFLOW_INSTALLED_PLUGINS_DIR: path.join(testDirectory, "plugins", "installed"),
        CONTENTFLOW_DEVELOPMENT_LINKS_DIR: path.join(testDirectory, "plugins", "development"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let diagnostics = "";
    apiProcess.stdout.on("data", (chunk) => (diagnostics += chunk.toString("utf8")));
    apiProcess.stderr.on("data", (chunk) => (diagnostics += chunk.toString("utf8")));
    let client: Client | undefined;
    try {
      await waitForApi(apiUrl, () => diagnostics);
      const channel = {
        id: "channel-mcp-test",
        name: "Canal MCP",
        handle: "@mcp",
        niche: "Educação",
        language: "pt-BR",
        methods: {},
        createdAt: new Date().toISOString(),
      };
      const created = await fetch(`${apiUrl}/api/channels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(channel),
      });
      assert.equal(created.status, 201);

      const infoResponse = await fetch(`${apiUrl}/api/builder/mcp-info?channelId=${channel.id}`);
      assert.equal(infoResponse.status, 200);
      const info = (await infoResponse.json()) as { config: string };
      const launch = JSON.parse(info.config).mcpServers.contentflow as {
        command: string;
        args: string[];
      };
      client = new Client({ name: "contentflow-mcp-test", version: "1.0.0" });
      await client.connect(new StdioClientTransport({ ...launch, stderr: "pipe" }));

      const tools = await client.listTools();
      assert.deepEqual(tools.tools.map((tool) => tool.name).sort(), [
        "apply_contentflow_methods",
        "create_contentflow_strategic_collection",
        "create_contentflow_strategic_item",
        "delete_contentflow_strategic_collection",
        "delete_contentflow_strategic_item",
        "get_contentflow_method_contract",
        "get_contentflow_strategic_library",
        "inspect_contentflow_channel",
        "list_contentflow_channels",
        "set_contentflow_process_order",
        "update_contentflow_strategic_collection",
        "update_contentflow_strategic_item",
        "validate_contentflow_methods",
      ]);

      const inspected = await client.callTool({
        name: "inspect_contentflow_channel",
        arguments: {},
      });
      assert.match(JSON.stringify(inspected.content), /Canal MCP/);

      const processOrder = [
        "title",
        "theme",
        "thumbnail",
        "script",
        "narration",
        "assets",
        "editing",
        "publishing",
      ];
      const reordered = await client.callTool({
        name: "set_contentflow_process_order",
        arguments: { processOrder },
      });
      assert.equal(reordered.isError, undefined);
      const reorderContent = reordered.content as Array<{ type: "text"; text: string }>;
      assert.deepEqual(JSON.parse(reorderContent[0].text).processOrder, processOrder);

      const createdCollection = await client.callTool({
        name: "create_contentflow_strategic_collection",
        arguments: {
          name: "CTAs",
          fields: [
            { label: "Nome", type: "text", required: true },
            { label: "Texto", type: "textarea", required: true },
          ],
        },
      });
      assert.equal(createdCollection.isError, undefined);
      const collectionPayload = JSON.parse(
        (createdCollection.content as Array<{ type: "text"; text: string }>)[0].text,
      ) as { collection: { id: string; fields: Array<{ id: string; label: string }> } };
      assert.equal(collectionPayload.collection.fields.length, 2);

      const createdItem = await client.callTool({
        name: "create_contentflow_strategic_item",
        arguments: {
          collectionId: collectionPayload.collection.id,
          values: { Nome: "Inscrição", Texto: "Inscreva-se no canal." },
        },
      });
      assert.equal(createdItem.isError, undefined);
      const itemPayload = JSON.parse(
        (createdItem.content as Array<{ type: "text"; text: string }>)[0].text,
      ) as { item: { id: string } };

      const library = await client.callTool({
        name: "get_contentflow_strategic_library",
        arguments: {},
      });
      assert.match(JSON.stringify(library.content), /Inscreva-se no canal/);

      const updatedItem = await client.callTool({
        name: "update_contentflow_strategic_item",
        arguments: {
          collectionId: collectionPayload.collection.id,
          itemId: itemPayload.item.id,
          values: { Nome: "Comentário", Texto: "Deixe sua opinião nos comentários." },
        },
      });
      assert.equal(updatedItem.isError, undefined);
      assert.match(JSON.stringify(updatedItem.content), /Deixe sua opinião/);

      const updatedCollection = await client.callTool({
        name: "update_contentflow_strategic_collection",
        arguments: {
          collectionId: collectionPayload.collection.id,
          name: "Chamadas para ação",
          fields: collectionPayload.collection.fields.map((field) => ({
            id: field.id,
            label: field.label,
            type: field.label === "Nome" ? "text" : "textarea",
            required: true,
          })),
        },
      });
      assert.equal(updatedCollection.isError, undefined);
      assert.match(JSON.stringify(updatedCollection.content), /Chamadas para ação/);

      const deletedItem = await client.callTool({
        name: "delete_contentflow_strategic_item",
        arguments: {
          collectionId: collectionPayload.collection.id,
          itemId: itemPayload.item.id,
        },
      });
      assert.equal(deletedItem.isError, undefined);

      const deletedCollection = await client.callTool({
        name: "delete_contentflow_strategic_collection",
        arguments: { collectionId: collectionPayload.collection.id },
      });
      assert.equal(deletedCollection.isError, undefined);

      const methods = {
        theme: {
          name: "Tema manual",
          processType: "theme",
          blocks: [
            {
              id: "manual-theme",
              type: "CRIAR",
              operator: "Humano",
              name: "Inserir tema",
              instructions: "Insira o tema criado externamente.",
              inputs: [],
              outputs: [
                {
                  id: "theme-output",
                  label: "Tema final",
                  key: "theme",
                  type: "textarea",
                  required: true,
                },
              ],
              parameters: [],
              order: 0,
            },
          ],
        },
      };
      const validated = await client.callTool({
        name: "validate_contentflow_methods",
        arguments: { methods },
      });
      assert.equal(validated.isError, undefined);
      const validationContent = validated.content as Array<{ type: "text"; text: string }>;
      const validationPayload = JSON.parse(validationContent[0].text) as { ok: boolean };
      assert.equal(validationPayload.ok, true);

      const applied = await client.callTool({
        name: "apply_contentflow_methods",
        arguments: { methods },
      });
      assert.equal(applied.isError, undefined);
      const applyContent = applied.content as Array<{ type: "text"; text: string }>;
      const applyPayload = JSON.parse(applyContent[0].text) as {
        methods: Record<string, unknown>;
      };
      assert.match(JSON.stringify(applyPayload.methods), /manual-theme/);

      const channels = (await (await fetch(`${apiUrl}/api/channels`)).json()) as Array<{
        processOrder?: string[];
        methods: Record<string, { name: string }>;
      }>;
      assert.equal(channels[0].methods.theme.name, "Tema manual");
      assert.deepEqual(channels[0].processOrder, processOrder);
    } finally {
      await client?.close().catch(() => undefined);
      if (process.platform === "win32" && apiProcess.pid) {
        spawnSync("taskkill", ["/PID", String(apiProcess.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        apiProcess.kill();
      }
      await new Promise<void>((resolve) => {
        if (apiProcess.exitCode !== null) resolve();
        else apiProcess.once("exit", () => resolve());
      });
      const resolvedTestDirectory = path.resolve(testDirectory);
      if (resolvedTestDirectory.startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) {
        rmSync(resolvedTestDirectory, {
          recursive: true,
          force: true,
          maxRetries: 30,
          retryDelay: 100,
        });
      }
    }
  },
);
