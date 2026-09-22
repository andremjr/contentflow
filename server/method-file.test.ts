import assert from "node:assert/strict";
import test from "node:test";
import type {
  ChannelLibraryItem,
  ProcessMethod,
  StrategicCollection,
  UniversalProcess,
} from "../src/lib/domain";
import { PROCESS_ORDER } from "../src/lib/domain";
import {
  copyImportedBlocks,
  copyImportedMethods,
  parseMethodFile,
  parseMethodImportFile,
  planPortableMethodTransfer,
  serializeMethodFile,
  serializeMethodPackFile,
  serializePortableMethodTransfer,
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

test("plano local v2 preserva conexão em memória e a serialização portátil a remove", () => {
  const plan = planPortableMethodTransfer({
    name: "Roteiro",
    channelName: "Canal",
    sourceMethods: [method],
    processOrder: [...PROCESS_ORDER],
    primaryProcessTypes: ["script"],
    preserveLocalConnections: true,
  });
  assert.equal(plan.methods[0].method.blocks[0].plugin?.connectionId, "local-account-id");
  assert.doesNotMatch(serializePortableMethodTransfer(plan), /local-account-id/);
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
  if (parsed.format !== "contentflow-method-pack" || parsed.version !== 1) return;
  assert.deepEqual(
    parsed.methods.map((item) => item.name),
    ["Títulos fortes", "Roteiro conectado"],
  );
  const copied = copyImportedMethods(parsed.methods, (prefix) => `${prefix}-new`);
  assert.equal(copied[1].blocks[0].inputs?.[0].blockId, copied[0].blocks[0].id);
});

test("v2 inclui dependências transitivas e usa chaves portáteis", () => {
  const script: ProcessMethod = {
    name: "Roteiro-base",
    processType: "script",
    blocks: [
      {
        id: "local-script-block",
        type: "CRIAR",
        operator: "Humano",
        parameters: [],
        outputs: [
          {
            id: "local-script-output",
            label: "Roteiro",
            key: "script",
            type: "textarea",
            required: true,
          },
        ],
        order: 0,
      },
    ],
  };
  const thumbnail: ProcessMethod = {
    name: "Thumbnail com roteiro",
    processType: "thumbnail",
    blocks: [
      {
        id: "local-thumbnail-block",
        type: "CRIAR",
        operator: "Humano",
        parameters: [],
        inputs: [
          {
            id: "local-thumbnail-input",
            label: "Roteiro",
            type: "textarea",
            source: "previous_process",
            sourceProcessType: "script",
            sourceKey: "script",
            blockId: "local-script-block",
          },
        ],
        order: 0,
      },
    ],
  };
  const plan = planPortableMethodTransfer({
    name: "Thumbnail com dependência",
    channelName: "Canal",
    sourceMethods: [script, thumbnail],
    processOrder: [
      "theme",
      "script",
      "title",
      "thumbnail",
      "narration",
      "assets",
      "editing",
      "publishing",
    ],
    primaryProcessTypes: ["thumbnail"],
  });
  assert.deepEqual(
    plan.methods.map((entry) => [entry.method.processType, entry.role]),
    [
      ["script", "dependency"],
      ["thumbnail", "primary"],
    ],
  );
  assert.equal(plan.itemsIncluded, false);
  assert.equal(plan.methods[0].method.blocks[0].id, "script:block:1");
  assert.equal(plan.methods[1].method.blocks[0].inputs?.[0].blockId, "script:block:1");
  assert.doesNotMatch(serializePortableMethodTransfer(plan), /local-script-block/);

  const parsed = parseMethodImportFile(serializePortableMethodTransfer(plan));
  assert.equal(parsed.version, 2);
  if (parsed.version !== 2) return;
  assert.equal(parsed.primaryProcessType, "thumbnail");
  assert.deepEqual(
    parsed.methods.map((entry) => entry.role),
    ["dependency", "primary"],
  );
});

test("v2 leva coleções vazias com schema e chave portátil", () => {
  const choosing: ProcessMethod = {
    name: "Escolher estrutura",
    processType: "title",
    blocks: [
      {
        id: "local-choose",
        type: "ESCOLHER",
        operator: "Humano",
        collectionId: "local-collection-id",
        parameters: [],
        order: 0,
      },
    ],
  };
  const collections: StrategicCollection[] = [
    {
      id: "local-collection-id",
      channelId: "channel-local",
      name: "Estruturas de título",
      fields: [{ id: "local-field-id", label: "Fórmula", type: "textarea", required: true }],
      createdAt: "2026-09-20T00:00:00.000Z",
    },
  ];
  const plan = planPortableMethodTransfer({
    name: "Estruturas",
    sourceMethods: [choosing],
    collections,
    processOrder: [
      "theme",
      "title",
      "thumbnail",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ],
    primaryProcessTypes: ["title"],
  });
  assert.equal(plan.collections.length, 1);
  assert.match(plan.collections[0].key, /^collection:/);
  assert.notEqual(plan.collections[0].fields[0].key, "local-field-id");
  assert.equal(plan.methods[0].method.blocks[0].collectionId, plan.collections[0].key);
  const serialized = serializePortableMethodTransfer(plan);
  assert.doesNotMatch(serialized, /local-collection-id|channel-local|local-field-id/);
});

test("v2 inclui itens somente quando solicitado e remove IDs locais do payload", () => {
  const choosing: ProcessMethod = {
    name: "Escolher estrutura",
    processType: "title",
    blocks: [
      {
        id: "local-choose",
        type: "ESCOLHER",
        operator: "Humano",
        collectionId: "local-collection-id",
        parameters: [],
        order: 0,
      },
    ],
  };
  const collections: StrategicCollection[] = [
    {
      id: "local-collection-id",
      channelId: "channel-local",
      name: "Estruturas de título",
      fields: [{ id: "local-field-id", label: "Fórmula", type: "textarea", required: true }],
      createdAt: "2026-09-20T00:00:00.000Z",
    },
  ];
  const items: ChannelLibraryItem[] = [
    {
      id: "local-item-id",
      channelId: "channel-local",
      collectionId: "local-collection-id",
      values: { "local-field-id": "Como X mudou Y" },
      createdAt: "2026-09-20T00:01:00.000Z",
    },
  ];
  const base = {
    name: "Estruturas",
    sourceMethods: [choosing],
    collections,
    items,
    processOrder: [
      "theme",
      "title",
      "thumbnail",
      "script",
      "narration",
      "assets",
      "editing",
      "publishing",
    ] as UniversalProcess[],
    primaryProcessTypes: ["title"] as UniversalProcess[],
  };
  const withoutItems = planPortableMethodTransfer(base);
  assert.equal(withoutItems.itemsIncluded, false);
  assert.deepEqual(withoutItems.items, []);

  const withItems = planPortableMethodTransfer({ ...base, includeItems: true });
  assert.equal(withItems.itemsIncluded, true);
  assert.equal(withItems.items.length, 1);
  assert.equal(withItems.items[0].collectionKey, withItems.collections[0].key);
  assert.equal(Object.keys(withItems.items[0].values)[0], withItems.collections[0].fields[0].key);
  const serialized = serializePortableMethodTransfer(withItems);
  assert.doesNotMatch(serialized, /local-item-id|local-collection-id|local-field-id|channel-local/);
});

test("parser continua aceitando JSON v1 após introdução do v2", () => {
  const legacy = serializeMethodFile("Roteiro legado", method);
  const parsed = parseMethodImportFile(legacy);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.format, "contentflow-method");
});
