import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import { validatePluginDirectory } from "./plugin-validation";
import { decideExecutionRecovery } from "./execution-recovery-policy";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";
import type { RegisteredPlugin } from "./plugin-runner";

const repositoryRoot = process.cwd();
const pluginDirectory = path.join(
  repositoryRoot,
  "ecosystem",
  "plugins",
  "testing",
  "deterministic-fault-injection",
);
const dataDirectory = await mkdtemp(path.join(tmpdir(), "contentflow-fault-runner-"));
const previousDataDirectory = process.env.CONTENTFLOW_DATA_DIR;
process.env.CONTENTFLOW_DATA_DIR = dataDirectory;
const { executeRegisteredPlugin } = await import("./plugin-runner");
const validated = validatePluginDirectory(pluginDirectory);
const plugin: RegisteredPlugin = {
  id: validated.manifest.id,
  source: "local",
  directory: pluginDirectory,
  absoluteDirectory: validated.absoluteDirectory,
  entrypoint: validated.entrypoint,
  manifest: validated.manifest,
  executable: true,
};
const fixture = JSON.parse(
  await readFile(path.join(pluginDirectory, "fixtures", "execution.json"), "utf8"),
) as PluginExecutionRequest;

after(async () => {
  if (previousDataDirectory === undefined) delete process.env.CONTENTFLOW_DATA_DIR;
  else process.env.CONTENTFLOW_DATA_DIR = previousDataDirectory;
  await rm(dataDirectory, { recursive: true, force: true });
});

function requestFor(scenario: string, traceId: string): PluginExecutionRequest {
  return {
    ...structuredClone(fixture),
    traceId,
    configuration: { scenario },
  };
}

function recoveryJob(): PersistentPluginJob {
  return {
    cancelRequested: false,
    retryCount: 0,
    deadlineAt: "2030-01-01T00:10:00.000Z",
    partialValues: {},
    partialArtifacts: [],
  } as unknown as PersistentPluginJob;
}

test("validates the manifest, permissions, and public-catalog boundary", async () => {
  assert.equal(validated.manifest.id, "com.contentflow.test.deterministic-fault");
  assert.deepEqual(validated.manifest.permissions, []);
  assert.deepEqual(validated.manifest.capabilities[0]?.sideEffects, []);

  const referenceRoot = path.join(repositoryRoot, "ecosystem", "plugins", "reference");
  assert.equal(path.relative(referenceRoot, pluginDirectory).startsWith(".."), true);
  const packageScript = await readFile(
    path.join(repositoryRoot, "scripts", "package-ecosystem.mjs"),
    "utf8",
  );
  assert.match(packageScript, /"plugins", "reference"/);
  assert.doesNotMatch(packageScript, /"plugins", "testing"/);
});

test("maps fixture facts through the current recovery policy", async () => {
  const cases = [
    ["technical_retryable", "retry"],
    ["rate_limit", "retry"],
    ["intervention", "intervene"],
    ["external_effect_uncertain", "reconcile"],
    ["external_effect_confirmed_failure", "fail"],
  ] as const;
  for (const [scenario, expectedAction] of cases) {
    const response = await executeRegisteredPlugin(
      plugin,
      requestFor(scenario, `runner-policy-${scenario}`),
      5_000,
    );
    assert.equal(response.status, "error", scenario);
    if (response.status !== "error") continue;
    const decision = decideExecutionRecovery({
      job: recoveryJob(),
      failure: response,
      nowMs: Date.parse("2030-01-01T00:00:00.000Z"),
    });
    assert.equal(decision.action, expectedAction, scenario);
  }
});

test("executes F01 success through the real sandbox worker", async () => {
  const response = await executeRegisteredPlugin(
    plugin,
    requestFor("success", "runner-success"),
    5_000,
  );
  assert.equal(response.status, "success");
  if (response.status === "success") assert.deepEqual(response.values, { result: "HELLO" });
});

test("preserves structured recovery facts across worker and runner", async () => {
  const response = await executeRegisteredPlugin(
    plugin,
    requestFor("external_effect_uncertain", "runner-uncertain"),
    5_000,
  );
  assert.equal(response.status, "error");
  if (response.status === "error") {
    assert.equal(response.code, "JOB_FAILED");
    assert.deepEqual(response.recovery, {
      stage: "effect_submitted",
      externalEffect: "possible",
      externalReceipt: "fault-receipt-001",
    });
  }
});

test("F03 is terminated by the runner timeout", async () => {
  const startedAt = Date.now();
  await assert.rejects(
    executeRegisteredPlugin(plugin, requestFor("timeout", "runner-timeout"), 1_000),
    /excedeu o tempo máximo de execução/,
  );
  const elapsedMs = Date.now() - startedAt;
  assert.ok(elapsedMs >= 900, `runner returned too early: ${elapsedMs}ms`);
  assert.ok(elapsedMs < 5_000, `runner timeout was too slow: ${elapsedMs}ms`);
});

test("F08 caller cancellation terminates the real worker promptly", async () => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const execution = executeRegisteredPlugin(
    plugin,
    requestFor("cancel_aware", "runner-cancel"),
    10_000,
    {},
    { signal: controller.signal },
  );
  setTimeout(() => controller.abort(), 100);
  await assert.rejects(execution, /Execução de teste cancelada/);
  assert.ok(Date.now() - startedAt < 3_000);
});
