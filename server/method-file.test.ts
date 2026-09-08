import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessMethod, StrategicCollection } from "../src/lib/domain";
import {
  copyImportedBlocks,
  copyImportedMethods,
  parseMethodFile,
  parseMethodImportFile,
  serializeMethodFile,
  serializeMethodPackFile,
} from "../src/lib/method-file";

const method: ProcessMethod = {
  name: "Roteiro",
  processType: "script",
  blocks: [
    {
      id: "write-script",
      type: "CRIAR",
      operator: "IA",
      name: "Escrever roteiro",
      parameters: [],
      order: 0,
      plugin: {
        pluginId: "official-openai-gpt",
        pluginVersion: "1.1.1",
        capabilityId: "generate-text",
        configuration: { model: "gpt-5.4" },
        connectionId: "local-account-id",
      },
    },
  ],
};

test("exporta o requisito do plugin sem expor o connectionId local", () => {
  const contents = serializeMethodFile("Roteiro", method);
  assert.doesNotMatch(contents, /local-account-id/);
  const parsed = parseMethodFile(contents);
  assert.deepEqual(parsed.method.blocks[0].plugin, {
    pluginId: "official-openai-gpt",
    pluginVersion: "1.1.1",
    capabilityId: "generate-text",
    configuration: { model: "gpt-5.4" },
    connectionRequired: true,
  });
});

test("importação nunca materializa um identificador de conexão externo", () => {
  const parsed = parseMethodFile(serializeMethodFile("Roteiro", method));
  const [copied] = copyImportedBlocks("script", parsed.method.blocks, (prefix) => `${prefix}-new`);
  assert.equal(copied.plugin?.connectionId, undefined);
  assert.equal(copied.plugin?.connectionRequired, true);
});

test("cópia interna pode preservar a referência local sem copiar secrets", () => {
  const [copied] = copyImportedBlocks("script", method.blocks, (prefix) => `${prefix}-new`, {
    preserveLocalConnections: true,
  });
  assert.equal(copied.plugin?.connectionId, "local-account-id");
});

test("exporta e remapeia continuidade de conversa sem expor a conta local", () => {
  const continued: ProcessMethod = {
    name: "Roteiro contínuo",
    processType: "script",
    blocks: [
      method.blocks[0],
      {
        ...structuredClone(method.blocks[0]),
        id: "revise-script",
        order: 1,
        plugin: {
          ...structuredClone(method.blocks[0].plugin!),
          conversation: {
            mode: "reuse",
            sourceProcessType: "script",
            sourceBlockId: "write-script",
          },
        },
      },
    ],
  };
  const parsed = parseMethodFile(serializeMethodFile("Roteiro contínuo", continued));
  assert.equal(parsed.method.blocks[1].plugin?.conversation?.mode, "reuse");
  const copied = copyImportedBlocks("script", parsed.method.blocks, (prefix) => `${prefix}-new`);
  assert.equal(copied[1].plugin?.conversation?.mode, "reuse");
  if (copied[1].plugin?.conversation?.mode === "reuse")
    assert.equal(copied[1].plugin.conversation.sourceBlockId, copied[0].id);
  assert.equal(copied[1].plugin?.connectionId, undefined);
});

test("exporta requisito de ESCOLHER sem expor collectionId local", () => {
  const choosing: ProcessMethod = {
    name: "Estrutura de título",
    processType: "title",
    blocks: [
      {
        id: "choose-structure",
        type: "ESCOLHER",
        operator: "Humano",
        collectionId: "local-title-structures",
        parameters: [],
        order: 0,
      },
    ],
  };

  const collections: StrategicCollection[] = [
    {
      id: "local-title-structures",
      channelId: "channel",
      name: "Estruturas de título",
      fields: [
        { id: "formula", label: "Fórmula", type: "textarea", required: true },
        { id: "example", label: "Exemplo", type: "text", required: false },
      ],
      createdAt: "2026-09-08T00:00:00.000Z",
    },
  ];
  const contents = serializeMethodFile("Estrutura de título", choosing, collections);
  assert.doesNotMatch(contents, /local-title-structures/);
  const parsed = parseMethodFile(contents);
  assert.equal(parsed.method.blocks[0].collectionId, undefined);
  assert.deepEqual(parsed.requirements?.[0], {
    kind: "collection",
    name: "Estruturas de título",
    blockName: "ESCOLHER",
    fields: [
      { key: "formula", label: "Fórmula", type: "textarea", required: true },
      { key: "example", label: "Exemplo", type: "text", required: false },
    ],
  });
});

test("arquivo individual antigo ganha nome persistente ao importar", () => {
  const legacy = JSON.parse(serializeMethodFile("Roteiro legado", method));
  delete legacy.method.name;
  const parsed = parseMethodFile(JSON.stringify(legacy));
  assert.equal(parsed.method.name, "Roteiro legado");
});

test("pacote preserva nomes e remapeia referências entre processos", () => {
  const title: ProcessMethod = {
    name: "Títulos fortes",
    processType: "title",
    blocks: [
      {
        id: "create-title",
        type: "CRIAR",
        operator: "Humano",
        parameters: [],
        outputs: [
          { id: "title-output", label: "Título", key: "title", type: "text", required: true },
        ],
        order: 0,
      },
    ],
  };
  const script: ProcessMethod = {
    name: "Roteiro conectado",
    processType: "script",
    blocks: [
      {
        id: "write-script",
        type: "CRIAR",
        operator: "Humano",
        parameters: [],
        inputs: [
          {
            id: "title-input",
            label: "Título",
            type: "text",
            source: "previous_process",
            sourceProcessType: "title",
            sourceKey: "title",
            blockId: "create-title",
          },
        ],
        order: 0,
      },
    ],
  };
  const contents = serializeMethodPackFile("Kit", "Canal de origem", [title, script]);
  const parsed = parseMethodImportFile(contents);
  assert.equal(parsed.format, "contentflow-method-pack");
  if (parsed.format !== "contentflow-method-pack") return;
  assert.deepEqual(
    parsed.methods.map((item) => item.name),
    ["Títulos fortes", "Roteiro conectado"],
  );
  const copied = copyImportedMethods(parsed.methods, (prefix) => `${prefix}-new`);
  assert.equal(copied[1].blocks[0].inputs?.[0].blockId, copied[0].blocks[0].id);
});
