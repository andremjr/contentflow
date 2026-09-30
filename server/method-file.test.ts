import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessMethod, StrategicCollection, ValueShape } from "../src/lib/domain";
import {
  collectMethodRequirements,
  copyImportedBlocks,
  copyImportedMethods,
  parseMethodFile,
  parseMethodImportFile,
  planPortableMethodTransfer,
  serializeMethodFile,
  serializeMethodPackFile,
  serializePortableMethodTransfer,
} from "../src/lib/method-file";

const textOne: ValueShape = { kind: "content", family: "text", cardinality: "one", representation: "inline" };
const textMany: ValueShape = { kind: "content", family: "text", cardinality: "many", representation: "inline" };
const imageMany: ValueShape = { kind: "content", family: "image", cardinality: "many", representation: "artifact" };

function method(blocks: ActionBlock[], processType: ProcessMethod["processType"] = "script"): ProcessMethod {
  return { contractVersion: 3, name: `Método ${processType}`, processType, blocks };
}

function humanBlock(): ActionBlock {
  return {
    id: "create", type: "CRIAR", operator: "Humano", name: "Criar", order: 0, parameters: [],
    inputs: [{ id: "runtime", label: "Referências", shape: imageMany, binding: { kind: "runtime" } }],
    outputs: [{ id: "script", key: "script", label: "Roteiro", shape: textOne, required: true }],
  };
}

test("round-trip individual preserva somente o contrato canônico v3", () => {
  const source = method([humanBlock()]);
  const json = serializeMethodFile(source.name, source);
  const parsed = parseMethodFile(json);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.method.contractVersion, 3);
  assert.deepEqual(parsed.method.blocks[0].inputs?.[0].shape, imageMany);
  assert.deepEqual(parsed.method.blocks[0].inputs?.[0].binding, { kind: "runtime" });
  assert.deepEqual(parsed.method.blocks[0].outputs?.[0].shape, textOne);
});

test("arquivo v1 é inválido e não recebe adapter", () => {
  assert.throws(
    () => parseMethodFile(JSON.stringify({ format: "contentflow-method", version: 1, name: "Antigo", method: { processType: "script", blocks: [] } })),
    /não é um arquivo de método válido/i,
  );
});

test("exportação de plugin remove vínculo e política locais sem alterar capability", () => {
  const source = method([{
    ...humanBlock(),
    operator: "IA",
    plugin: {
      pluginId: "com.example.writer", pluginVersion: "2.0.0", capabilityId: "write",
      configuration: { model: "best" }, connectionId: "local-account", connectionRequired: true,
      profileExecution: { mode: "single", profileIds: ["private-profile"] },
    },
  }]);
  const parsed = parseMethodFile(serializeMethodFile(source.name, source));
  const plugin = parsed.method.blocks[0].plugin!;
  assert.equal(plugin.pluginId, "com.example.writer");
  assert.equal(plugin.capabilityId, "write");
  assert.equal(plugin.connectionId, undefined);
  assert.equal(plugin.profileExecution, undefined);
  assert.equal(plugin.connectionRequired, true);
});

test("cópia remapeia IDs e bindings entre blocos", () => {
  const first = humanBlock();
  const second: ActionBlock = {
    id: "review", type: "VALIDAR", operator: "Humano", name: "Revisar", order: 1, parameters: [],
    inputs: [{ id: "review-input", label: "Roteiro", shape: textOne, binding: { kind: "previous_block", blockId: first.id, outputKey: "script" } }],
    outputs: [{ id: "decision", key: "decision", label: "Decisão", shape: { kind: "control", control: "approval", cardinality: "one" }, required: true }],
    validation: { mode: "approval", onReject: "retry_target", targetBlockId: first.id, maxAttempts: 3, retryMode: "full" },
  };
  let sequence = 0;
  const copied = copyImportedBlocks("script", [first, second], (prefix) => `${prefix}-${++sequence}`);
  const sourceId = copied[0].id;
  assert.notEqual(sourceId, first.id);
  assert.deepEqual(copied[1].inputs?.[0].binding, { kind: "previous_block", blockId: sourceId, outputKey: "script" });
  assert.equal(copied[1].validation?.targetBlockId, sourceId);
});

test("cópia multiprocesso remapeia continuidade de conversa", () => {
  const source = method([{
    ...humanBlock(), operator: "IA",
    plugin: { pluginId: "browser", capabilityId: "write", configuration: {}, conversation: { mode: "new" } },
  }]);
  const target = method([{
    ...humanBlock(), id: "validate", operator: "IA",
    plugin: { pluginId: "browser", capabilityId: "validate", configuration: {}, conversation: { mode: "reuse", sourceProcessType: "script", sourceBlockId: "create" } },
  }], "title");
  let sequence = 0;
  const copied = copyImportedMethods([source, target], (prefix) => `${prefix}-${++sequence}`);
  assert.equal(copied[1].blocks[0].plugin?.conversation?.mode, "reuse");
  if (copied[1].blocks[0].plugin?.conversation?.mode === "reuse") {
    assert.equal(copied[1].blocks[0].plugin?.conversation.sourceBlockId, copied[0].blocks[0].id);
  }
});

test("ESCOLHER exporta requisito de coleção sem ID local", () => {
  const collection: StrategicCollection = {
    id: "local-collection", channelId: "channel", name: "Ângulos",
    fields: [{ id: "angle", label: "Ângulo", shape: textOne, required: true }],
    createdAt: "2026-09-30T00:00:00.000Z",
  };
  const source = method([{
    id: "choose", type: "ESCOLHER", operator: "Humano", name: "Escolher", collectionId: collection.id,
    order: 0, parameters: [], outputs: [{ id: "selected", key: "selected", label: "Escolha", shape: textOne, required: true }],
  }], "title");
  const parsed = parseMethodFile(serializeMethodFile(source.name, source, [collection]));
  assert.equal(parsed.method.blocks[0].collectionId, undefined);
  assert.deepEqual(parsed.requirements, collectMethodRequirements(source, [collection]));
  assert.equal(parsed.requirements[0]?.kind, "collection");
});

test("pack v3 preserva nomes e contratos de todos os Métodos", () => {
  const script = method([humanBlock()]);
  const title = method([{ ...humanBlock(), id: "title", outputs: [{ id: "titles", key: "titles", label: "Títulos", shape: textMany, required: true }] }], "title");
  const parsed = parseMethodImportFile(serializeMethodPackFile("Pacote", "Canal", [script, title]));
  assert.equal(parsed.version, 3);
  assert.ok("methods" in parsed);
  if ("methods" in parsed) {
    const methods = parsed.methods.map((entry) => "method" in entry ? entry.method : entry);
    assert.deepEqual(methods.map((entry) => entry.processType), ["script", "title"]);
    assert.ok(methods.every((entry) => entry.contractVersion === 3));
  }
});

test("transferência portátil v3 inclui dependências e omite itens por padrão", () => {
  const script = method([humanBlock()]);
  const title = method([{
    ...humanBlock(), id: "title",
    inputs: [{ id: "script-input", label: "Roteiro", shape: textOne, binding: { kind: "previous_process", processType: "script", outputKey: "script" } }],
  }], "title");
  const plan = planPortableMethodTransfer({
    name: "Título", channelName: "Canal", primaryProcessTypes: ["title"], processOrder: ["script", "title", "thumbnail", "narration", "assets", "editing", "publishing", "theme"],
    sourceMethods: [script, title], collections: [], items: [], includeItems: false,
  });
  assert.deepEqual(plan.methods.map((entry) => entry.method.processType), ["script", "title"]);
  assert.equal(plan.itemsIncluded, false);
  assert.deepEqual(plan.items, []);
  const parsed = parseMethodImportFile(serializePortableMethodTransfer(plan));
  assert.equal(parsed.version, 3);
  assert.ok("methods" in parsed);
});
