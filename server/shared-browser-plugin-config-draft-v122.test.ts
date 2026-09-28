import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { BlockPluginBinding } from "../src/lib/domain";
import type { PluginCapability } from "../src/lib/plugin-contract";
import {
  clonePluginConfigurationDraft,
  preparePluginConfigurationCommit,
  validatePluginConfigurationDraft,
} from "../src/lib/plugin-configuration-draft";

const capability: PluginCapability = {
  id: "generate",
  operator: "IA",
  blockTypes: ["CRIAR"],
  inputPorts: [],
  outputPorts: [],
  execution: { mode: "immediate" },
  sideEffects: [],
  cost: { model: "unknown", estimateSupported: false },
  dataPolicy: { sendsDataToThirdParties: false },
  blockConfigSchema: {
    type: "object",
    required: ["model"],
    properties: {
      model: { type: "string", minLength: 1 },
      temperature: { type: "number", minimum: 0, maximum: 2 },
    },
  },
  outputSchema: { type: "object" },
};

const saved: BlockPluginBinding = {
  pluginId: "example.plugin",
  capabilityId: "generate",
  configuration: { model: "stable", temperature: 0.5 },
  connectionId: "connection-a",
  profileExecution: { mode: "fallback", profileIds: ["profile-a", "profile-b"] },
  conversation: { mode: "new" },
};

test("package 12.2 opens an isolated snapshot and cancel can restore the saved binding", () => {
  const draft = clonePluginConfigurationDraft(saved);
  draft.configuration.model = "draft-only";
  draft.profileExecution!.profileIds.reverse();

  assert.equal(saved.configuration.model, "stable");
  assert.deepEqual(saved.profileExecution?.profileIds, ["profile-a", "profile-b"]);
  assert.deepEqual(clonePluginConfigurationDraft(saved), saved);
});

test("package 12.2 validates before preparing one atomic plugin binding commit", () => {
  const invalid = clonePluginConfigurationDraft(saved);
  invalid.configuration.model = "";
  invalid.configuration.temperature = 3;
  assert.deepEqual(
    validatePluginConfigurationDraft(capability, invalid).map((issue) => issue.code),
    ["required", "length", "maximum"],
  );
  assert.equal(preparePluginConfigurationCommit(capability, invalid).ok, false);

  const valid = clonePluginConfigurationDraft(saved);
  valid.configuration.model = "applied";
  const commit = preparePluginConfigurationCommit(capability, valid);
  assert.equal(commit.ok, true);
  if (commit.ok) {
    assert.equal(commit.value.configuration.model, "applied");
    assert.notEqual(commit.value, valid);
    assert.notEqual(commit.value.configuration, valid.configuration);
  }
});

test("package 12.2 keeps renderer edits local and applies through a single block patch", () => {
  const builderSource = readFileSync(
    new URL("../src/components/method-builder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(builderSource, /setPluginDraft\(\{ \.\.\.pluginDraft, configuration \}\)/);
  assert.match(builderSource, /onChange\(\{ plugin: commit\.value \}\)/);
  assert.match(builderSource, /clonePluginConfigurationDraft\(block\.plugin!\)/);
  assert.match(builderSource, /t\("Cancelar"\)/);
  assert.match(builderSource, /t\("Aplicar"\)/);
});
