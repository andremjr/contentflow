import assert from "node:assert/strict";
import test from "node:test";

import {
  encodePluginConfigurationOptionValue,
  findPluginConfigurationOption,
  withSavedPluginConfigurationOption,
  pluginConfigurationDependencySignature,
  toPluginConfigurationRequest,
} from "./plugin-configuration-ui";

test("filters plugin configuration to scalar request values", () => {
  assert.deepEqual(
    toPluginConfigurationRequest({ profileId: "p1", count: 2, enabled: true, nested: {} }),
    { profileId: "p1", count: 2, enabled: true },
  );
});

test("uses only declared dependencies in the reload signature", () => {
  const first = pluginConfigurationDependencySignature(
    { profileId: "p1", mode: "fast", other: "a" },
    ["mode", "profileId"],
  );
  const same = pluginConfigurationDependencySignature(
    { profileId: "p1", mode: "fast", other: "b" },
    ["profileId", "mode"],
  );
  const changed = pluginConfigurationDependencySignature(
    { profileId: "p2", mode: "fast", other: "b" },
    ["profileId", "mode"],
  );
  assert.equal(first, same);
  assert.notEqual(first, changed);
});

test("preserves scalar types when selecting dynamic options", () => {
  const options = [
    { value: "1", label: "String" },
    { value: 1, label: "Number" },
    { value: true, label: "Boolean" },
  ];
  for (const option of options) {
    const encoded = encodePluginConfigurationOptionValue(option.value);
    assert.equal(findPluginConfigurationOption(options, encoded)?.value, option.value);
  }
});

test("preserves a disappeared saved option as disabled and explicitly unavailable", () => {
  assert.deepEqual(
    withSavedPluginConfigurationOption(
      [{ value: "current", label: "Current" }],
      "retired",
      "Saved option unavailable",
    ),
    [
      { value: "retired", label: "retired — Saved option unavailable", disabled: true },
      { value: "current", label: "Current" },
    ],
  );
  assert.deepEqual(
    withSavedPluginConfigurationOption(
      [{ value: "current", label: "Current" }],
      "current",
      "Saved option unavailable",
    ),
    [{ value: "current", label: "Current" }],
  );
});
