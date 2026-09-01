import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessMethod } from "../src/lib/domain";
import { copyImportedBlocks, parseMethodFile, serializeMethodFile } from "../src/lib/method-file";

const method: ProcessMethod = {
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

  const contents = serializeMethodFile("Estrutura de título", choosing);
  assert.doesNotMatch(contents, /local-title-structures/);
  const parsed = parseMethodFile(contents);
  assert.equal(parsed.method.blocks[0].collectionId, undefined);
});
