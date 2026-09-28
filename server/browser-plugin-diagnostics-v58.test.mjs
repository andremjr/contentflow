import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const PLUGINS = [
  "chatgpt-browser-studio",
  "google-flow-browser-images",
  "gemini-browser-studio",
  "claude-browser-text",
  "grok-browser-studio",
  "meta-ai-browser-studio",
  "mai-playground-browser",
  "vibes-browser-studio",
];

const lifecycleEvents = [
  { sequence: 1, diagnosticCode: "BRIDGE_CONTROLLED_RELOAD", url: "https://private.invalid" },
  { sequence: 2, diagnosticCode: "BRIDGE_WORKER_RESTART", token: "private-token" },
  { sequence: 3, diagnosticCode: "UNSAFE_PRIVATE_EVENT", selector: "#private" },
  { sequence: 4, diagnosticCode: "BRIDGE_CONTROLLED_RELOAD", text: "private page text" },
];

for (const plugin of PLUGINS) {
  test(`5.8 ${plugin} filtra reload/restart e preserva o cursor no resume`, async () => {
    const root = await mkdtemp(join(tmpdir(), `contentflow-v58-${plugin}-`));
    const services = { getWorkspacePath: (relative) => join(root, relative) };
    const request = {
      executionId: "execution-v58",
      blockId: "block-v58",
      capabilityId: "browser-capability",
      attempt: 1,
    };
    const { createBridgeDiagnostics } = await import(
      `../ecosystem/plugins/reference/${plugin}/bridge-diagnostics.mjs`
    );
    const bridge = {
      async events({ afterSequence }) {
        return {
          events: lifecycleEvents.filter(
            (event) => event.sequence > afterSequence && event.sequence <= 3,
          ),
          lastSequence: 3,
        };
      },
    };

    const first = await createBridgeDiagnostics(request, services);
    await first.capture(bridge);
    assert.deepEqual(first.bridgeDiagnostics, [
      { code: "BRIDGE_CONTROLLED_RELOAD" },
      { code: "BRIDGE_WORKER_RESTART" },
    ]);
    assert.doesNotMatch(
      JSON.stringify(first.bridgeDiagnostics),
      /private|url|selector|token|text/i,
    );

    const resumed = await createBridgeDiagnostics(request, services);
    let observedAfterSequence = -1;
    await resumed.capture({
      async events({ afterSequence }) {
        observedAfterSequence = afterSequence;
        return {
          events: lifecycleEvents.filter((event) => event.sequence > afterSequence),
          lastSequence: 4,
        };
      },
    });
    assert.equal(observedAfterSequence, 3);
    assert.deepEqual(resumed.bridgeDiagnostics, [{ code: "BRIDGE_CONTROLLED_RELOAD" }]);

    const persisted = JSON.parse(
      await readFile(
        join(root, "bridge-lifecycle", `${await cursorFileName(request)}.json`),
        "utf8",
      ),
    );
    assert.deepEqual(persisted, { lastSequence: 4 });
  });
}

async function cursorFileName(request) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256")
    .update([request.executionId, request.blockId, request.capabilityId, request.attempt].join(":"))
    .digest("hex");
}
