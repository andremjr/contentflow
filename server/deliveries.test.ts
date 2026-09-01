import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateBlockDeliveries,
  normalizeExecutionDeliveries,
  recordBlockDeliveries,
} from "../src/lib/deliveries";
import type { ActionBlock, ProcessExecution, Project } from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { composePluginPortValue } from "./plugin-input-values";

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

test("permite resolver campos específicos do mesmo item escolhido", () => {
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
        sourceKey: "name",
      },
      {
        id: "angle-description",
        label: "Descrição",
        type: "textarea",
        source: "previous_block",
        blockId: chooseBlock.id,
        sourceKey: "description",
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

test("envia completos todos os itens escolhidos ligados a um bloco Criar", () => {
  const chooseCategory: ActionBlock = {
    id: "choose-category",
    type: "ESCOLHER",
    operator: "IA",
    collectionId: "editorial-lines",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const chooseAngle: ActionBlock = {
    id: "choose-angle",
    type: "ESCOLHER",
    operator: "IA",
    collectionId: "angles",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 1,
  };
  const createTheme: ActionBlock = {
    id: "create-theme",
    type: "CRIAR",
    operator: "IA",
    inputs: [
      {
        id: "category-input",
        label: "Nova entrada",
        type: "text",
        source: "previous_block",
        blockId: chooseCategory.id,
      },
      {
        id: "angle-input",
        label: "Nova entrada",
        type: "text",
        source: "previous_block",
        blockId: chooseAngle.id,
      },
    ],
    outputs: [],
    parameters: [],
    order: 2,
  };
  const execution = executionFor("theme", chooseCategory);
  execution.methodSnapshot.blocks.push(chooseAngle, createTheme);
  execution.blocks[0].values = { selectedItemId: "line-1" };
  execution.blocks.push(
    {
      blockId: chooseAngle.id,
      status: "completed",
      values: { selectedItemId: "angle-1" },
      attempt: 1,
    },
    { blockId: createTheme.id, status: "blocked_executor", values: {} },
  );

  const resolved = resolveBlockInputs({
    block: createTheme,
    execution,
    project,
    projectExecutions: [execution],
    collections: [
      {
        id: "editorial-lines",
        channelId: "channel-1",
        name: "Linha Editorial",
        fields: [
          { id: "category", label: "Categoria", type: "text", required: true },
          { id: "description", label: "Descrição", type: "textarea", required: true },
          { id: "period", label: "Período", type: "text", required: false },
        ],
        createdAt: "2026-08-30T00:00:00.000Z",
      },
      {
        id: "angles",
        channelId: "channel-1",
        name: "Perspectiva do canal",
        fields: [
          { id: "angle", label: "Ângulo", type: "text", required: true },
          { id: "approach", label: "Abordagem", type: "textarea", required: true },
        ],
        createdAt: "2026-08-30T00:00:00.000Z",
      },
    ],
    libraryItems: [
      {
        id: "line-1",
        channelId: "channel-1",
        collectionId: "editorial-lines",
        values: {
          category: "Grandes conflitos",
          description: "Guerras e disputas decisivas.",
          period: "Antiguidade ao século XX",
        },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
      {
        id: "angle-1",
        channelId: "channel-1",
        collectionId: "angles",
        values: {
          angle: "Consequências humanas",
          approach: "Mostrar como pessoas comuns foram afetadas.",
        },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
      {
        id: "line-not-selected",
        channelId: "channel-1",
        collectionId: "editorial-lines",
        values: {
          category: "ITEM NÃO ESCOLHIDO",
          description: "Este registro não pode chegar ao prompt.",
          period: "Fora do contexto",
        },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
      {
        id: "angle-not-selected",
        channelId: "channel-1",
        collectionId: "angles",
        values: {
          angle: "ÂNGULO NÃO ESCOLHIDO",
          approach: "Este registro também não pode chegar ao prompt.",
        },
        createdAt: "2026-08-30T00:00:00.000Z",
      },
    ],
  });

  assert.equal(resolved.length, 2);
  assert.match(String(resolved[0].value), /ITEM ESCOLHIDO — Linha Editorial/);
  assert.match(String(resolved[0].value), /"Categoria": "Grandes conflitos"/);
  assert.match(String(resolved[0].value), /"Descrição": "Guerras e disputas decisivas\."/);
  assert.match(String(resolved[0].value), /"Período": "Antiguidade ao século XX"/);
  assert.match(String(resolved[1].value), /ITEM ESCOLHIDO — Perspectiva do canal/);
  assert.match(String(resolved[1].value), /"Ângulo": "Consequências humanas"/);
  assert.match(
    String(resolved[1].value),
    /"Abordagem": "Mostrar como pessoas comuns foram afetadas\."/,
  );

  const pluginContext = composePluginPortValue(
    resolved.map((item) => ({ label: item.input.label, value: item.value ?? null })),
  );
  assert.match(String(pluginContext), /ITEM ESCOLHIDO — Linha Editorial/);
  assert.match(String(pluginContext), /ITEM ESCOLHIDO — Perspectiva do canal/);
  assert.doesNotMatch(String(pluginContext), /ITEM NÃO ESCOLHIDO/);
  assert.doesNotMatch(String(pluginContext), /ÂNGULO NÃO ESCOLHIDO/);
});

test("materializa itens individuais em saídas do tipo list", () => {
  const block: ActionBlock = {
    id: "theme-options-block",
    type: "CRIAR",
    operator: "IA",
    outputs: [
      {
        id: "theme-options-output",
        label: "Opções de tema",
        key: "theme_options",
        type: "list",
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("theme", block);
  const themes = [
    "Como aeroportos decidem prioridade de voos",
    "O gargalo logístico dos supermercados",
    "O risco escondido das assistências técnicas",
  ];
  const deliveries = recordBlockDeliveries(
    execution,
    block,
    { theme_options: themes },
    "completed",
  );

  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].items.length, 3);
  assert.equal(deliveries[0].items[0].value, themes[0]);
  assert.equal(deliveries[0].items[1].value, themes[1]);
  assert.equal(deliveries[0].items[2].value, themes[2]);
});
