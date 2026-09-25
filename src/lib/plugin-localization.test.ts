import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "./plugin-contract";
import { localizePluginManifest } from "./plugin-localization";

function manifest(): PluginManifest {
  return {
    apiVersion: "1",
    id: "com.example.neutral",
    name: "Estúdio neutro",
    version: "1.0.0",
    description: "Cria um resultado de exemplo.",
    author: "Example",
    license: "MIT",
    runtime: { kind: "node", version: ">=26 <27", module: "esm" },
    entrypoint: "handler.mjs",
    permissions: [],
    profileSetup: { configurationKey: "profile", label: "Perfil da conta" },
    capabilities: [
      {
        id: "generate",
        name: "Gerar mídia",
        description: "Gera um resultado.",
        operator: "IA",
        blockTypes: ["CRIAR"],
        inputPorts: [{ key: "prompt", label: "Prompt", acceptedTypes: ["text"], required: true }],
        outputPorts: [{ key: "media", label: "Mídia", producedTypes: ["image"], required: true }],
        execution: { mode: "immediate" },
        sideEffects: [],
        cost: { model: "free", estimateSupported: false },
        dataPolicy: { sendsDataToThirdParties: false },
        blockConfigSchema: {
          type: "object",
          properties: {
            profile: { type: "string" },
            quality: { type: "string", title: "Qualidade", enum: ["fast", "best"] },
          },
        },
        itemActions: [{ action: "regenerate", label: "Gerar novamente" }],
        outputSchema: { type: "object" },
      },
    ],
    localizations: {
      en: {
        name: "Neutral Studio",
        description: "Creates an example result.",
        profileSetup: { label: "Account profile" },
        capabilities: {
          generate: {
            name: "Generate media",
            description: "Generates a result.",
            inputPorts: { prompt: { label: "Prompt" } },
            outputPorts: { media: { label: "Media" } },
            itemActions: { regenerate: { label: "Generate again" } },
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
      "en-US": {
        description: "Creates a US English example result.",
      },
      es: {
        name: "Estudio neutro",
        description: "Crea un resultado de ejemplo.",
        capabilities: {
          generate: {
            name: "Generar contenido",
            outputPorts: { media: { label: "Contenido" } },
            blockConfigSchema: {
              properties: {
                quality: {
                  title: "Calidad",
                  options: [
                    { value: "fast", label: "Rápida" },
                    { value: "best", label: "Mejor" },
                  ],
                },
              },
            },
          },
        },
      },
    },
  };
}

test("localiza moldura do plugin com fallback exato, idioma-base e texto-base", () => {
  const source = manifest();
  const us = localizePluginManifest(source, "en-US");
  assert.equal(us.name, "Neutral Studio");
  assert.equal(us.description, "Creates a US English example result.");
  assert.equal(us.capabilities[0]?.name, "Generate media");
  assert.equal(us.capabilities[0]?.blockConfigSchema.properties?.quality?.title, "Quality");
  assert.deepEqual(us.capabilities[0]?.blockConfigSchema.properties?.quality?.enum, [
    "fast",
    "best",
  ]);
  assert.deepEqual(
    us.capabilities[0]?.blockConfigSchema.properties?.quality?.oneOf?.map((option) => [
      option.const,
      option.title,
    ]),
    [
      ["fast", "Fast"],
      ["best", "Best"],
    ],
  );

  const spanish = localizePluginManifest(source, "es-MX");
  assert.equal(spanish.name, "Estudio neutro");
  assert.equal(spanish.capabilities[0]?.outputPorts[0]?.label, "Contenido");
  assert.equal(spanish.capabilities[0]?.inputPorts[0]?.key, "prompt");
  assert.equal(spanish.capabilities[0]?.blockConfigSchema.properties?.quality?.enum?.[0], "fast");

  const french = localizePluginManifest(source, "fr-FR");
  assert.equal(french.name, "Estúdio neutro");
  assert.equal(french.capabilities[0]?.outputPorts[0]?.label, "Mídia");
});

test("manifesto antigo sem localizations permanece intacto", () => {
  const source = manifest();
  delete source.localizations;
  assert.equal(localizePluginManifest(source, "en").name, source.name);
  assert.strictEqual(localizePluginManifest(source, "en"), source);
});
