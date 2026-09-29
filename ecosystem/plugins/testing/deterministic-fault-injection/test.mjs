import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { execute } from "./handler.mjs";

const pluginDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  await readFile(path.join(pluginDirectory, "fixtures", "execution.json"), "utf8"),
);
const manifest = JSON.parse(
  await readFile(path.join(pluginDirectory, "contentflow.plugin.json"), "utf8"),
);

function requestFor(scenario, overrides = {}) {
  return {
    ...structuredClone(fixture),
    configuration: { scenario },
    ...overrides,
  };
}

function services(signal = new AbortController().signal) {
  return {
    signal,
    getSecret: async () => undefined,
    resolveInputFile: async () => {
      throw new Error("filesystem is not available to this fixture");
    },
    getOutputPath: () => {
      throw new Error("filesystem is not available to this fixture");
    },
    getWorkspacePath: () => {
      throw new Error("filesystem is not available to this fixture");
    },
    publishPartial: async () => undefined,
  };
}

test("declares PT-BR, English, and Spanish text for every scenario", () => {
  const expectedValues = manifest.capabilities[0].blockConfigSchema.properties.scenario.enum;
  for (const locale of ["pt-BR", "en", "es"]) {
    const options =
      manifest.localizations[locale].capabilities.fault.blockConfigSchema.properties.scenario
        .options;
    assert.deepEqual(
      options.map((option) => option.value),
      expectedValues,
    );
    assert.ok(options.every((option) => option.label.length > 0));
  }
});

test("F01 success is deterministic and preserves the input payload", async () => {
  const first = await execute(requestFor("success"), services());
  const second = await execute(requestFor("success"), services());
  assert.deepEqual(first, { status: "success", values: { result: "HELLO" } });
  assert.deepEqual(second, first);
  assert.equal("recovery" in first, false);
});

test("rejects missing content and unknown scenarios without retry", async () => {
  const missing = await execute(requestFor("success", { inputs: {} }), services());
  assert.equal(missing.code, "INVALID_INPUT");
  assert.equal(missing.retryable, false);
  assert.deepEqual(missing.recovery, { stage: "before_effect", externalEffect: "none" });

  const unknown = await execute(requestFor("not-a-scenario"), services());
  assert.equal(unknown.code, "INVALID_CONFIGURATION");
  assert.equal(unknown.retryable, false);
});

test("F02 technical_retryable returns safe technical recovery facts", async () => {
  const response = await execute(requestFor("technical_retryable"), services());
  assert.equal(response.status, "error");
  assert.equal(response.code, "UPSTREAM_UNAVAILABLE");
  assert.equal(response.retryable, true);
  assert.deepEqual(response.recovery, { stage: "before_effect", externalEffect: "none" });
});

test("F04 rate_limit returns a fixed retry delay", async () => {
  const response = await execute(requestFor("rate_limit"), services());
  assert.equal(response.code, "RATE_LIMIT");
  assert.equal(response.retryAfterMs, 1000);
  assert.deepEqual(response.recovery, { stage: "before_effect", externalEffect: "none" });
});

test("F05 intervention reports CAPTCHA without a possible external effect", async () => {
  const response = await execute(requestFor("intervention"), services());
  assert.equal(response.code, "CAPTCHA_REQUIRED");
  assert.equal(response.retryable, false);
  assert.deepEqual(response.recovery, {
    stage: "before_effect",
    externalEffect: "none",
    intervention: "captcha",
  });
});

test("F06 uncertain external effect carries a stable reconciliation receipt", async () => {
  const response = await execute(requestFor("external_effect_uncertain"), services());
  assert.equal(response.code, "JOB_FAILED");
  assert.equal(response.retryable, false);
  assert.deepEqual(response.recovery, {
    stage: "effect_submitted",
    externalEffect: "possible",
    externalReceipt: "fault-receipt-001",
  });
});

test("F07 confirmed-effect failure uses existing facts and remains terminal", async () => {
  const response = await execute(requestFor("external_effect_confirmed_failure"), services());
  assert.equal(response.code, "FAULT_CONFIRMED_EFFECT_FAILURE");
  assert.equal(response.retryable, false);
  assert.deepEqual(response.recovery, {
    stage: "effect_confirmed",
    externalEffect: "confirmed",
  });
});

test("F08 observes AbortSignal when invoked in-process", async () => {
  const controller = new AbortController();
  const pending = execute(requestFor("cancel_aware"), services(controller.signal));
  controller.abort();
  const response = await pending;
  assert.equal(response.code, "CANCELLED");
  assert.equal(response.retryable, false);
  assert.deepEqual(response.recovery, { stage: "before_effect", externalEffect: "none" });
});
