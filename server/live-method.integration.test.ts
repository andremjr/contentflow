import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type ProcessExecution,
  type ProcessMethod,
} from "../src/lib/domain";

test("saving a Method immediately changes open executions and accepts preserved images with recovered text", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "contentflow-live-method-"));
  const base = "http://127.0.0.1:8876";
  const api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
    cwd: process.cwd(),
    windowsHide: true,
    env: {
      ...process.env,
      CONTENTFLOW_API_PORT: "8876",
      CONTENTFLOW_DATA_DIR: root,
      CONTENTFLOW_APP_ROOT: process.cwd(),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  api.stdout.on("data", (chunk) => {
    logs += String(chunk);
  });
  api.stderr.on("data", (chunk) => {
    logs += String(chunk);
  });
  const request = async (route: string, body?: unknown, method = "POST") => {
    const response = await fetch(
      base + route,
      body === undefined
        ? undefined
        : { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
    );
    const result = await response.json();
    assert.equal(response.ok, true, `${route}: ${JSON.stringify(result)}\n${logs}`);
    return result;
  };
  try {
    let ready = false;
    const readyDeadline = Date.now() + 60_000;
    while (Date.now() < readyDeadline && api.exitCode === null) {
      try {
        await request("/api/health");
        ready = true;
        break;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.equal(ready, true, `API startup failed: ${logs}`);
    const now = new Date().toISOString();
    const methods = createEmptyMethods();
    const method: ProcessMethod = {
      ...methods.assets,
      blocks: [
        {
          id: "images",
          type: "CRIAR",
          operator: "Humano",
          name: "Images",
          order: 0,
          inputs: [],
          instructions: "Generate images",
          parameters: [],
          outputs: [
            {
              id: "images-output",
              label: "Images",
              key: "images",
              required: true,
              shape: {
                kind: "content",
                family: "image",
                cardinality: "many",
                representation: "artifact",
              },
            },
          ],
        },
        {
          id: "scenes",
          type: "CRIAR",
          operator: "Humano",
          name: "Scenes",
          order: 1,
          inputs: [],
          instructions: "old",
          parameters: [],
          outputs: [
            {
              id: "scene-output",
              label: "Scene",
              key: "scene",
              required: true,
              shape: {
                kind: "content",
                family: "text",
                cardinality: "one",
                representation: "inline",
              },
            },
          ],
        },
      ],
    };
    methods.assets = method;
    await request("/api/channels", { id: "live-channel", createdAt: now, methods });
    await request("/api/projects", {
      id: "live-project",
      channelId: "live-channel",
      title: "Test",
      currentStage: "assets",
      state: "error",
      progress: 0,
      stages: Object.fromEntries(
        PROCESS_ORDER.map((process) => [process, process === "assets" ? "error" : "not_started"]),
      ),
      createdAt: now,
      updatedAt: now,
    });
    const images = [1, 2].map((index) => ({
      id: `image-${index}`,
      name: `${index}.jpg`,
      mimeType: "image/jpeg",
      size: 20,
      url: `/api/files/${index}.jpg`,
    }));
    const execution: ProcessExecution = {
      id: "live-exec",
      projectId: "live-project",
      channelId: "live-channel",
      processType: "assets",
      methodSnapshot: method,
      status: "failed",
      outputStatus: "pending",
      createdAt: now,
      updatedAt: now,
      error: "old output contract",
      blocks: [
        {
          blockId: "images",
          status: "failed",
          values: { images },
          attempt: 1,
          items: images.map((image, index) => ({
            id: `unit-${index}`,
            order: index,
            input: `prompt-${index}`,
            status: "completed",
            attempt: 1,
            attempts: [],
            output: image,
          })),
        },
        { blockId: "scenes", status: "pending", values: {}, attempt: 1 },
      ],
    };
    await request("/api/executions", execution);
    const current = (await request("/api/executions/live-exec/state"))
      .execution as ProcessExecution;
    const preserved = structuredClone(current.blocks[0]);
    const next = structuredClone(method);
    next.blocks[0].outputs!.push({
      id: "context-output",
      label: "Provider context",
      key: "provider_context",
      required: false,
      shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
    });
    next.blocks[1].inputs = [
      {
        id: "context-input",
        label: "Provider context",
        shape: { kind: "content", family: "text", cardinality: "one", representation: "inline" },
        binding: { kind: "previous_block", blockId: "images", outputKey: "provider_context" },
      },
    ];
    next.blocks[1].instructions = "new";
    await request("/api/channels/live-channel/methods/assets", next, "PUT");
    const saved = (await request("/api/executions/live-exec/state")).execution as ProcessExecution;
    assert.equal(saved.methodSnapshot.blocks[1].instructions, "new");
    assert.deepEqual(saved.blocks[0], preserved);
    const command = {
      id: randomUUID(),
      action: "acceptBlockDelivery",
      executionId: "live-exec",
      blockId: "images",
      attempt: 1,
      values: { provider_context: "https://example.com/project/abc" },
    };
    await request("/api/commands", command);
    await request("/api/commands", command); // Receipt replay cannot repeat an effect.
    const accepted = (await request("/api/executions/live-exec/state"))
      .execution as ProcessExecution;
    assert.equal(accepted.blocks[0].status, "completed");
    assert.deepEqual(accepted.blocks[0].values.images, images);
    assert.deepEqual(accepted.blocks[0].items, preserved.items);
    assert.equal(accepted.blocks[1].status, "awaiting_human");
    assert.equal(accepted.blocks[0].values.provider_context, "https://example.com/project/abc");
    assert.ok(
      accepted.deliveries?.some(
        (delivery) =>
          delivery.outputKey === "provider_context" && delivery.shape.kind === "content",
      ),
    );
    next.blocks[1].instructions = "latest";
    await request("/api/channels/live-channel/methods", { methods: { assets: next } }, "PUT");
    const final = (await request("/api/executions/live-exec/state")).execution as ProcessExecution;
    assert.equal(final.methodSnapshot.blocks[1].instructions, "latest");
    assert.equal(final.blocks[1].status, "awaiting_human");
    assert.deepEqual(final.blocks[0].values.images, images);
    assert.equal(final.methodSnapshotHistory, undefined);
  } finally {
    api.kill();
    await new Promise<void>((resolve) => api.once("exit", () => resolve()));
    assert.ok(path.resolve(root).startsWith(path.resolve(tmpdir()) + path.sep));
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
