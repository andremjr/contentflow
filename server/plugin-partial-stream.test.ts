import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { PluginExecutionRequest, PluginManifest } from "../src/lib/plugin-contract";
import { executeRegisteredPlugin, type RegisteredPlugin } from "./plugin-runner";

test("imports and forwards partial plugin snapshots before the final response", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-partial-stream-"));
  const entrypoint = path.join(root, "handler.mjs");
  await writeFile(
    entrypoint,
    `import { writeFile } from "node:fs/promises";
    export async function execute(_request, services) {
      await writeFile(services.getOutputPath("partial.txt"), "arquivo parcial", "utf8");
      const file = { id: "partial-file", name: "partial.txt", mimeType: "text/plain", size: 15, url: "artifact://partial-file" };
      const artifact = { ...file, source: { kind: "path", path: "partial.txt" } };
      await services.publishPartial({ values: { result: "primeira", files: [file] }, artifacts: [artifact], itemUpdates: [{ key: "slot-1", outputPort: "files", state: "completed", value: file }], progress: 0.5, message: "1/2" });
      await services.publishPartial({ values: { result: "segunda" }, progress: 0.9, message: "2/2" });
      return { status: "success", values: { result: "final" } };
    }`,
    "utf8",
  );
  const manifest = {
    id: "partial-stream-test",
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
  const updates: string[] = [];
  let importedPartialUrl = "";
  let importedItemUrl = "";
  try {
    const response = await executeRegisteredPlugin(
      plugin,
      {
        pluginId: plugin.id,
        capabilityId: "test",
        executionId: "execution",
        blockId: "block",
        attempt: 1,
        traceId: "trace",
        invocation: { mode: "start" },
        inputs: {},
        configuration: {},
        settings: {},
        inputContract: [],
        outputContract: [],
        context: {
          project: { id: "project", title: "Project" },
          processType: "script",
          blockType: "CRIAR",
          operator: "IA",
        },
      } as unknown as PluginExecutionRequest,
      10_000,
      {},
      {
        workspaceDirectory: path.join(root, "workspace"),
        artifactDirectory: path.join(root, "artifacts"),
        onPartial: async (update) => {
          updates.push(String(update.values.result));
          if (Array.isArray(update.values.files)) {
            const file = update.values.files[0];
            if (file && typeof file === "object" && "url" in file && typeof file.url === "string") {
              importedPartialUrl = file.url;
            }
          }
          const itemValue = update.itemUpdates?.[0]?.value;
          if (
            itemValue &&
            typeof itemValue === "object" &&
            !Array.isArray(itemValue) &&
            "url" in itemValue &&
            typeof itemValue.url === "string"
          ) {
            importedItemUrl = itemValue.url;
          }
        },
      },
    );
    assert.deepEqual(updates, ["primeira", "segunda"]);
    assert.match(importedPartialUrl, /^\/api\/files\//);
    assert.match(importedItemUrl, /^\/api\/files\//);
    assert.equal(response.status, "success");
    assert.equal(response.status === "success" ? response.values.result : undefined, "final");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
