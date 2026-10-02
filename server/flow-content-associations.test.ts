import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  BUILDER_METHOD_CONTRACT,
  validateBuilderMethods,
  type BuilderPluginContext,
} from "./builder-methods";
import { validatePluginManifest } from "./plugin-validation";
import { localizePluginManifest } from "../src/lib/plugin-localization";
import { parseProcessMethodV3 } from "../src/lib/method-contract-v3";
import type { Channel } from "../src/lib/domain";

const method = parseProcessMethodV3(
  JSON.parse(
    readFileSync(
      new URL("../tests/fixtures/flow-content-associations/method.json", import.meta.url),
      "utf8",
    ),
  ),
);
const manifests = ["chatgpt-browser-studio", "google-flow-browser-images"].map((name) =>
  validatePluginManifest(
    JSON.parse(
      readFileSync(
        new URL(`../ecosystem/plugins/reference/${name}/contentflow.plugin.json`, import.meta.url),
        "utf8",
      ),
    ),
  ),
);

test("script → characters → references → scene associations uses real plugin ports and only content", () => {
  assert.match(BUILDER_METHOD_CONTRACT.strategicFields.associations, /plugin produtor/);
  assert.match(BUILDER_METHOD_CONTRACT.strategicFields.associations, /Core não decide/);
  const contexts = manifests.map((manifest) => ({
    plugin: {
      id: manifest.id,
      manifest,
      executable: true,
      source: "local",
      directory: "fixture",
      absoluteDirectory: process.cwd(),
      entrypoint: "handler.mjs",
    },
    enabled: true,
    connections: [],
    profiles: [],
  })) as BuilderPluginContext[];
  const result = validateBuilderMethods({
    channel: { id: "test", methods: {} } as Channel,
    methods: { assets: structuredClone(method) },
    plugins: contexts,
    collections: [],
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.warnings, []);
  const ids = method.blocks.map((block) => block.id);
  assert.ok(ids.indexOf("assets-definir-personagens") < ids.indexOf("assets-criar-prompts"));
  const scenes = method.blocks.find((block) => block.id === "assets-criar-prompts")!;
  assert.deepEqual(JSON.parse(String(scenes.plugin!.configuration.textItemFields)), {
    prompt: "string",
    characterNames: "string[]",
    referenceItemIds: "string[]",
  });
  for (const block of method.blocks)
    for (const field of [...(block.inputs ?? []), ...(block.outputs ?? [])])
      assert.equal(field.shape.kind, "content");
});

test("plugin text format and reference controls render with localized labels in Portuguese, English and Spanish", () => {
  for (const manifest of manifests) {
    const id = manifest.id.includes("chatgpt")
      ? "generate-text-in-browser"
      : "generate-images-in-browser";
    const keys = manifest.id.includes("chatgpt")
      ? ["textItemFormat", "textItemFields", "textItemReferenceInputs"]
      : ["promptFormat", "referenceMode"];
    for (const locale of ["pt-BR", "en", "es"]) {
      const capability = localizePluginManifest(manifest, locale).capabilities.find(
        (item) => item.id === id,
      )!;
      for (const key of keys) {
        const field = capability.blockConfigSchema.properties![key];
        assert.ok(field.title);
        if (locale !== "pt-BR")
          assert.equal(
            field.title,
            manifest.localizations![locale].capabilities![id].blockConfigSchema!.properties![key]
              .title,
          );
      }
    }
  }
});
