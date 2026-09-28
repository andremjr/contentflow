import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PluginManifest } from "../src/lib/plugin-contract";
import { PluginValidationError, validatePluginManifest } from "./plugin-validation";

function fixture(name: "valid-manifest.json" | "invalid-manifest.json") {
  return JSON.parse(
    readFileSync(`tests/fixtures/item-orchestration-v03/${name}`, "utf8"),
  ) as unknown;
}

test("pacote 0.3 aceita estratégias contínua/per-item e associações declaradas", () => {
  const parsed = validatePluginManifest(fixture("valid-manifest.json"));
  const orchestration = parsed.capabilities[0]?.execution.itemOrchestration;

  assert.deepEqual(orchestration?.strategies, ["continuous_session", "per_item"]);
  assert.equal(orchestration?.preferredStrategy, "continuous_session");
  assert.equal(orchestration?.profileParallelism?.maxProfiles, 4);
  assert.equal(orchestration?.collectionAssociations?.[0]?.key, "brief-summaries");
});

test("pacote 0.3 rejeita estratégia preferida e associações inconsistentes", () => {
  assert.throws(
    () => validatePluginManifest(fixture("invalid-manifest.json")),
    (error: unknown) => {
      assert.ok(error instanceof PluginValidationError);
      assert.match(error.message, /preferredStrategy/);
      assert.match(error.message, /maxProfiles exige supported=true/);
      assert.match(error.message, /collectionAssociations/);
      return true;
    },
  );
});

test("API v1 continua válida sem itemOrchestration", () => {
  const value = fixture("valid-manifest.json") as PluginManifest;
  delete value.capabilities[0]!.execution.itemOrchestration;
  assert.doesNotThrow(() => validatePluginManifest(value));
});

test("schema JSON público expõe os campos aditivos do pacote 0.3", () => {
  const schema = JSON.parse(
    readFileSync("docs/ecosystem/schemas/contentflow-plugin-v1.schema.json", "utf8"),
  ) as {
    $defs: {
      capability: {
        properties: {
          execution: {
            properties: {
              itemOrchestration: { properties: Record<string, unknown> };
            };
          };
        };
      };
    };
  };
  const fields =
    schema.$defs.capability.properties.execution.properties.itemOrchestration.properties;
  for (const key of [
    "strategies",
    "preferredStrategy",
    "profileParallelism",
    "collectionAssociations",
  ]) {
    assert.ok(key in fields, `schema sem ${key}`);
  }
});
