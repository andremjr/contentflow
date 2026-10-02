import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { PluginCapability, PluginProfileSetup } from "../src/lib/plugin-contract";
import { translate } from "../src/lib/app-preferences";
import { buildPluginConfigurationRendererModel } from "../src/lib/plugin-configuration-renderer";

const fixture = JSON.parse(
  readFileSync(
    new URL("../tests/fixtures/shared-browser-v121/renderer.json", import.meta.url),
    "utf8",
  ),
) as {
  capability: PluginCapability;
  configuration: Record<string, string | number | boolean>;
  profileSetup: PluginProfileSetup;
};

test("package 12.1 derives the declarative renderer from fixture data without a Block card", () => {
  const model = buildPluginConfigurationRendererModel(fixture);

  assert.deepEqual(
    model.capabilityEntries.map(([key]) => key),
    ["model", "generationMode", "productionMode", "temperature"],
  );
});

test("package 12.1 keeps profile keys and invisible schema fields outside generic field rendering", () => {
  const model = buildPluginConfigurationRendererModel(fixture);
  const renderedKeys = model.capabilityEntries.map(([key]) => key);

  assert.equal(renderedKeys.includes("profileAlias"), false);
  assert.equal(renderedKeys.includes("fallbackAliases"), false);
  assert.equal(renderedKeys.includes("generationMode"), true);
  assert.equal(renderedKeys.includes("hiddenUnlessSimple"), false);
});

test("package 12.1 composes connection, profile and schema through the reusable renderer", () => {
  const rendererSource = readFileSync(
    new URL("../src/components/plugin-configuration-renderer.tsx", import.meta.url),
    "utf8",
  );
  const builderSource = readFileSync(
    new URL("../src/components/method-builder.tsx", import.meta.url),
    "utf8",
  );

  assert.match(rendererSource, /export function PluginConfigurationRenderer/);
  assert.match(rendererSource, /connectionSection/);
  assert.match(rendererSource, /profileSection/);
  assert.match(rendererSource, /buildPluginConfigurationRendererModel/);
  assert.match(rendererSource, /data-testid="plugin-capability-interface"/);
  assert.doesNotMatch(rendererSource, /Configurações avançadas do executor/);
  assert.match(builderSource, /<PluginConfigurationRenderer/);
  assert.match(builderSource, /connectionSection=/);
  assert.match(builderSource, /profileSection=/);
  assert.doesNotMatch(builderSource, /function PluginConfigurationField/);
});

test("package 12.1 translates the ContentFlow frame around the plugin-declared interface", () => {
  for (const phrase of [
    "Interface do plugin",
    "Defina como esta capacidade deve trabalhar neste bloco.",
  ]) {
    assert.notEqual(translate(phrase, "en"), phrase, `missing English translation: ${phrase}`);
    assert.notEqual(translate(phrase, "es"), phrase, `missing Spanish translation: ${phrase}`);
  }
});
