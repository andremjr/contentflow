import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateBlockDeliveries,
  normalizeExecutionDeliveries,
  recordBlockDeliveries,
} from "../src/lib/deliveries";
import type { ActionBlock, ProcessExecution, Project } from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";

function executionFor(
  processType: ProcessExecution["processType"],
  block: ActionBlock,
): ProcessExecution {
  return {
    id: `execution-${processType}`,
    projectId: "project-1",
    channelId: "channel-1",
    processType,
    methodSnapshot: { processType, blocks: [block] },
    blocks: [{ blockId: block.id, status: "completed", values: {}, attempt: 1 }],
    status: "completed",
    outputStatus: "completed",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
  };
}

const project = {
  id: "project-1",
  title: "Vídeo",
  channelId: "channel-1",
  currentStage: "title",
  state: "processing",
  progress: 0,
  deadline: "",
  duration: "",
  updatedAt: "Agora",
  stages: {
    theme: "done",
    title: "processing",
    thumbnail: "not_started",
    script: "not_started",
    narration: "not_started",
    assets: "not_started",
    editing: "not_started",
    publishing: "not_started",
  },
  assignee: { name: "", initials: "" },
  thumbHue: 0,
  createdAt: "2026-08-11T00:00:00.000Z",
} satisfies Project;

test("materializa uma entrega e um ID universal por item", () => {
  const block: ActionBlock = {
    id: "generate-titles",
    type: "CRIAR",
    operator: "Humano",
    name: "Gerar títulos",
    inputs: [],
    outputs: [
      {
        id: "titles-output",
        label: "Opções de título",
        key: "title_options",
        type: "list",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("theme", block);
  execution.blocks[0].values = { title_options: ["A", "B", "C"] };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");

  assert.equal(execution.deliveries?.length, 1);
  assert.equal(execution.deliveries?.[0].items.length, 3);
  assert.equal(new Set(execution.deliveries?.[0].items.map((item) => item.id)).size, 3);
  const normalized = normalizeExecutionDeliveries(structuredClone(execution));
  assert.deepEqual(
    normalized.deliveries?.[0].items.map((item) => item.id),
    execution.deliveries?.[0].items.map((item) => item.id),
  );
});

test("resolve uma entrega específica de bloco de processo anterior", () => {
  const sourceBlock: ActionBlock = {
    id: "transcribe",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      {
        id: "cues-output",
        label: "Cues da legenda",
        key: "subtitle_cues",
        type: "records",
        required: true,
        recordFields: [{ id: "text", label: "Texto", key: "text", type: "text", required: true }],
      },
    ],
    parameters: [],
    order: 0,
  };
  const narration = executionFor("narration", sourceBlock);
  narration.blocks[0].values = {
    subtitle_cues: [
      { id: "cue-1", text: "Primeiro" },
      { id: "cue-2", text: "Segundo" },
    ],
  };
  recordBlockDeliveries(narration, sourceBlock, narration.blocks[0].values, "completed");

  const targetBlock: ActionBlock = {
    id: "search-assets",
    type: "BUSCAR",
    operator: "Humano",
    inputs: [
      {
        id: "cues-input",
        label: "Cues",
        type: "records",
        source: "previous_process",
        sourceProcessType: "narration",
        blockId: "transcribe",
        sourceKey: "subtitle_cues",
      },
    ],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const assets = executionFor("assets", targetBlock);
  assets.blocks[0].status = "blocked_executor";
  const [resolved] = resolveBlockInputs({
    block: targetBlock,
    execution: assets,
    project,
    projectExecutions: [narration, assets],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.equal(resolved.sourceDeliveryId, narration.deliveries?.[0].id);
  assert.deepEqual(
    resolved.sourceDeliveryItemIds,
    narration.deliveries?.[0].items.map((item) => item.id),
  );
});

test("invalida a revisão anterior e cria novos IDs em outra tentativa", () => {
  const block: ActionBlock = {
    id: "create-script",
    type: "CRIAR",
    operator: "IA",
    outputs: [
      { id: "script-output", label: "Roteiro", key: "script", type: "textarea", required: true },
    ],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("script", block);
  execution.blocks[0].values = { script: "Versão 1" };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");
  const firstId = execution.deliveries?.[0].id;
  invalidateBlockDeliveries(execution, [block.id]);
  execution.blocks[0].attempt = 2;
  execution.blocks[0].values = { script: "Versão 2" };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");

  assert.equal(execution.deliveries?.find((item) => item.id === firstId)?.status, "invalidated");
  assert.notEqual(execution.deliveries?.find((item) => item.status === "completed")?.id, firstId);
});

test("resolve campos diferentes do mesmo item escolhido sem repetir o primeiro", () => {
  const chooseBlock: ActionBlock = {
    id: "choose-angle",
    type: "ESCOLHER",
    operator: "IA",
    collectionId: "angles",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const createBlock: ActionBlock = {
    id: "create-theme",
    type: "CRIAR",
    operator: "IA",
    inputs: [
      {
        id: "angle-name",
        label: "Ângulo",
        type: "text",
        source: "previous_block",
        blockId: chooseBlock.id,
      },
      {
        id: "angle-description",
        label: "Descrição",
        type: "textarea",
        source: "previous_block",
        blockId: chooseBlock.id,
      },
    ],
    outputs: [],
    parameters: [],
    order: 1,
  };
  const execution = executionFor("theme", chooseBlock);
  execution.methodSnapshot.blocks.push(createBlock);
  execution.blocks[0].values = { selectedItemId: "angle-1" };
  execution.blocks.push({ blockId: createBlock.id, status: "blocked_executor", values: {} });

  const resolved = resolveBlockInputs({
    block: createBlock,
    execution,
    project,
    projectExecutions: [execution],
    collections: [
      {
        id: "angles",
        channelId: "channel-1",
        name: "Ângulos",
        fields: [
          { id: "name", label: "Ângulo", type: "text", required: true },
          { id: "description", label: "Descrição", type: "textarea", required: true },
        ],
        createdAt: "2026-08-30T00:00:00.000Z",
      },
    ],
    libraryItems: [
      {
        id: "angle-1",
        channelId: "channel-1",
        collectionId: "angles",
        values: { name: "Imersivo", description: "Coloca o espectador dentro do evento." },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(
    resolved.map((item) => item.value),
    ["Imersivo", "Coloca o espectador dentro do evento."],
  );
  assert.deepEqual(
    resolved.map((item) => item.resolvedSourceKey),
    ["name", "description"],
  );
});
