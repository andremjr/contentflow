import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { PluginManifest } from "../src/lib/plugin-contract";
import { validatePluginManifest, PluginValidationError } from "./plugin-validation";

function manifest(): PluginManifest {
  return {
    apiVersion: "1",
    id: "com.example.dynamic-media",
    name: "Dynamic Media",
    version: "1.0.0",
    description: "Teste do contrato declarativo de configuração e itens.",
    author: "Example",
    license: "MIT",
    runtime: { kind: "node", version: ">=26 <27", module: "esm" },
    entrypoint: "handler.mjs",
    permissions: [],
    profileSetup: { configurationKey: "profile", label: "Perfil" },
    capabilities: [
      {
        id: "generate-media",
        operator: "IA",
        blockTypes: ["CRIAR"],
        inputPorts: [],
        outputPorts: [{ key: "media", label: "Mídia", producedTypes: ["files"], required: true }],
        execution: { mode: "immediate" },
        sideEffects: [],
        cost: { model: "free", estimateSupported: false },
        dataPolicy: { sendsDataToThirdParties: false },
        blockConfigSchema: {
          type: "object",
          properties: {
            profile: { type: "string" },
            model: { type: "string" },
            mode: { type: "string" },
          },
        },
        configurationOptions: [
          {
            property: "model",
            providerId: "models",
            dependsOn: ["profile", "mode"],
            cacheTtlMs: 60000,
          },
        ],
        itemActions: [
          { action: "regenerate" },
          { action: "replace" },
          { action: "select" },
          { action: "download" },
        ],
        outputSchema: { type: "object" },
      },
    ],
  };
}

test("aceita opções dinâmicas e ações por item declaradas pela capability", () => {
  const parsed = validatePluginManifest(manifest());
  assert.equal(parsed.capabilities[0]?.configurationOptions?.[0]?.providerId, "models");
  assert.deepEqual(
    parsed.capabilities[0]?.itemActions?.map((item) => item.action),
    ["regenerate", "replace", "select", "download"],
  );
});

test("rejeita provider que referencia campo de configuração inexistente", () => {
  const value = manifest();
  value.capabilities[0].configurationOptions![0].property = "missing";
  assert.throws(() => validatePluginManifest(value), PluginValidationError);
});

test("rejeita dependência dinâmica que não existe no schema do bloco", () => {
  const value = manifest();
  value.capabilities[0].configurationOptions![0].dependsOn = ["unknown"];
  assert.throws(() => validatePluginManifest(value), PluginValidationError);
});

test("aceita mapa portátil de localização com alvos existentes", () => {
  const value = manifest();
  value.capabilities[0].blockConfigSchema.properties!.quality = {
    type: "string",
    enum: ["fast", "best"],
  };
  value.localizations = {
    en: {
      name: "Dynamic Media",
      capabilities: {
        "generate-media": {
          outputPorts: { media: { label: "Media" } },
          blockConfigSchema: {
            properties: {
              quality: {
                title: "Quality",
                options: [
                  { value: "fast", label: "Fast" },
                  { value: "best", label: "Best" },
                ],
              },
            },
          },
        },
      },
    },
    es: {
      name: "Contenido dinámico",
    },
  };
  const parsed = validatePluginManifest(value);
  assert.equal(
    parsed.localizations?.en?.capabilities?.["generate-media"]?.outputPorts?.media?.label,
    "Media",
  );
});

test("valida a fixture neutra de localização em PT-BR, inglês e espanhol", () => {
  const fixture = JSON.parse(
    readFileSync("docs/ecosystem/examples/plugin-localization.example.json", "utf8"),
  ) as unknown;
  const parsed = validatePluginManifest(fixture);
  assert.equal(parsed.name, "Estúdio neutro");
  assert.equal(parsed.localizations?.en?.name, "Neutral Studio");
  assert.equal(parsed.localizations?.es?.name, "Estudio neutro");
});

test("rejeita locale malformado e alvo de tradução inexistente", () => {
  const invalidLocale = manifest();
  invalidLocale.localizations = {
    english_US: { name: "Invalid" },
  };
  assert.throws(() => validatePluginManifest(invalidLocale), PluginValidationError);

  const invalidTarget = manifest();
  invalidTarget.localizations = {
    en: {
      capabilities: {
        missing: { name: "Missing capability" },
      },
    },
  };
  assert.throws(() => validatePluginManifest(invalidTarget), PluginValidationError);
});

test("rejeita tradução de opção técnica que não existe no schema", () => {
  const value = manifest();
  value.capabilities[0].blockConfigSchema.properties!.mode = {
    type: "string",
    enum: ["single", "batch"],
  };
  value.localizations = {
    en: {
      capabilities: {
        "generate-media": {
          blockConfigSchema: {
            properties: {
              mode: {
                options: [{ value: "parallel", label: "Parallel" }],
              },
            },
          },
        },
      },
    },
  };
  assert.throws(() => validatePluginManifest(value), PluginValidationError);
});

test("aceita secrets opcionais somente quando também estão declarados", () => {
  const value = manifest();
  value.secretKeys = ["OPTIONAL_KEY"];
  value.optionalSecretKeys = ["OPTIONAL_KEY"];
  assert.doesNotThrow(() => validatePluginManifest(value));

  value.optionalSecretKeys = ["UNKNOWN_KEY"];
  assert.throws(() => validatePluginManifest(value), PluginValidationError);
});
