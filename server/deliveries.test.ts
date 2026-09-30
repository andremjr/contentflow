import assert from "node:assert/strict";
import test from "node:test";
import {
  invalidateBlockDeliveries,
  normalizeExecutionDeliveries,
  recordBlockDeliveries,
  recordProcessOutputDelivery,
} from "../src/lib/deliveries";
import { deriveProcessOutput } from "../src/lib/process-output";
import type { ActionBlock, ProcessExecution, Project, ValueShape } from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { projectThumbnail } from "../src/lib/project-thumbnail";

const textShape = (cardinality: "one" | "many" = "one"): ValueShape => ({
  kind: "content",
  family: "text",
  cardinality,
  representation: "inline",
});

function executionFor(
  processType: ProcessExecution["processType"],
  block: ActionBlock,
): ProcessExecution {
  return {
    id: `execution-${processType}`,
    projectId: "project-1",
    channelId: "channel-1",
    processType,
    methodSnapshot: { contractVersion: 3, name: "Método de teste", processType, blocks: [block] },
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
        shape: textShape("many"),
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

test("promove a entrega existente quando ela já é o resultado oficial do processo", () => {
  const block: ActionBlock = {
    id: "create-script",
    type: "CRIAR",
    operator: "IA",
    name: "Criar roteiro",
    inputs: [],
    outputs: [
      { id: "script-output", label: "Roteiro", key: "script", shape: textShape(), required: true },
    ],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("script", block);
  execution.blocks[0].values = { script: "Roteiro final" };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");
  execution.output = deriveProcessOutput(execution);
  assert.ok(execution.output);

  const [promoted] = recordProcessOutputDelivery(
    execution,
    execution.output.values,
    execution.output.createdAt,
  );

  assert.equal(promoted.id, execution.deliveries?.[0].id);
  assert.equal(
    execution.deliveries?.filter((delivery) => delivery.status !== "invalidated").length,
    1,
  );
  assert.equal(
    execution.deliveries?.some(
      (delivery) => delivery.blockId === "__process_output__" && delivery.status === "completed",
    ),
    false,
  );
});

test("preserva a identidade da entrega quando itens operacionais mudam de posição", () => {
  const block: ActionBlock = {
    id: "generate-scenes",
    type: "CRIAR",
    operator: "IA",
    name: "Gerar cenas",
    inputs: [],
    outputs: [
      {
        id: "scenes-output",
        label: "Cenas",
        key: "scenes",
        shape: textShape("many"),
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("assets", block);
  execution.blocks[0].items = [
    {
      id: "work-a",
      order: 0,
      input: "A",
      output: "A",
      status: "completed",
      attempt: 1,
      attempts: [],
    },
    {
      id: "work-b",
      order: 1,
      input: "B",
      output: "B",
      status: "completed",
      attempt: 1,
      attempts: [],
    },
    {
      id: "work-c",
      order: 2,
      input: "C",
      output: "C",
      status: "completed",
      attempt: 1,
      attempts: [],
    },
  ];
  execution.blocks[0].values = { scenes: ["A", "B", "C"] };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");
  const idsBySource = new Map(
    execution.deliveries?.[0].items.map((item) => [item.sourceExecutionItemId, item.id]),
  );

  execution.blocks[0].items = [
    { ...execution.blocks[0].items[2], order: 0 },
    { ...execution.blocks[0].items[0], order: 1 },
    { ...execution.blocks[0].items[1], order: 2 },
  ];
  execution.blocks[0].values = { scenes: ["C", "A", "B"] };
  recordBlockDeliveries(execution, block, execution.blocks[0].values, "completed");

  assert.deepEqual(
    execution.deliveries?.[0].items.map((item) => item.sourceExecutionItemId),
    ["work-c", "work-a", "work-b"],
  );
  for (const item of execution.deliveries?.[0].items ?? []) {
    assert.equal(item.id, idsBySource.get(item.sourceExecutionItemId));
  }
});

test("usa a primeira imagem do output concluído como thumbnail do card", () => {
  const block: ActionBlock = {
    id: "create-thumbnails",
    type: "CRIAR",
    operator: "Humano",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const execution = executionFor("thumbnail", block);
  const first = {
    id: "thumbnail-1",
    name: "primeira.png",
    mimeType: "image/png",
    size: 10,
    url: "/api/files/primeira.png",
  };
  const second = {
    id: "thumbnail-2",
    name: "segunda.png",
    mimeType: "image/png",
    size: 10,
    url: "/api/files/segunda.png",
  };
  execution.output = {
    processType: "thumbnail",
    values: { thumbnail: [first, second] },
    createdAt: execution.updatedAt,
  };

  assert.equal(projectThumbnail([execution], project.id)?.id, first.id);
  execution.status = "running";
  assert.equal(projectThumbnail([execution], project.id), undefined);
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
        shape: {
          kind: "record",
          cardinality: "many",
          fields: [
            {
              id: "text",
              label: "Texto",
              key: "text",
              shape: textShape() as Extract<ValueShape, { kind: "content" }>,
              required: true,
            },
          ],
        },
        required: true,
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
        shape: sourceBlock.outputs![0].shape,
        binding: {
          kind: "previous_process",
          processType: "narration",
          blockId: "transcribe",
          outputKey: "subtitle_cues",
        },
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
      { id: "script-output", label: "Roteiro", key: "script", shape: textShape(), required: true },
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
        shape: textShape(),
        binding: { kind: "previous_block", blockId: chooseBlock.id, outputKey: "name" },
      },
      {
        id: "angle-description",
        label: "Descrição",
        shape: textShape(),
        binding: {
          kind: "previous_block",
          blockId: chooseBlock.id,
          outputKey: "description",
        },
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
          { id: "name", label: "Ângulo", shape: textShape(), required: true },
          { id: "description", label: "Descrição", shape: textShape(), required: true },
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

test("não infere itens escolhidos completos quando sourceKey está ausente", () => {
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
        shape: textShape(),
        binding: { kind: "previous_block", blockId: chooseCategory.id, outputKey: "" },
      },
      {
        id: "angle-input",
        label: "Nova entrada",
        shape: textShape(),
        binding: { kind: "previous_block", blockId: chooseAngle.id, outputKey: "" },
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
          { id: "category", label: "Categoria", shape: textShape(), required: true },
          { id: "description", label: "Descrição", shape: textShape(), required: true },
          { id: "period", label: "Período", shape: textShape(), required: false },
        ],
        createdAt: "2026-08-30T00:00:00.000Z",
      },
      {
        id: "angles",
        channelId: "channel-1",
        name: "Perspectiva do canal",
        fields: [
          { id: "angle", label: "Ângulo", shape: textShape(), required: true },
          { id: "approach", label: "Abordagem", shape: textShape(), required: true },
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
  assert.deepEqual(
    resolved.map((item) => item.resolved),
    [false, false],
  );
  assert.deepEqual(
    resolved.map((item) => item.value),
    [undefined, undefined],
  );
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
        shape: textShape("many"),
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

test("seleção de VALIDAR referencia somente a delivery do targetOutputKey explícito", () => {
  const target: ActionBlock = {
    id: "generate-options",
    type: "CRIAR",
    operator: "Humano",
    outputs: [
      { id: "other", label: "Outra", key: "other", shape: textShape("many"), required: true },
      {
        id: "candidates",
        label: "Candidatos",
        key: "candidates",
        shape: textShape("many"),
        required: true,
      },
    ],
    parameters: [],
    order: 0,
  };
  const validation: ActionBlock = {
    id: "select-option",
    type: "VALIDAR",
    operator: "Humano",
    outputs: [
      {
        id: "selected",
        label: "Selecionado",
        key: "selected_value",
        shape: textShape(),
        required: true,
      },
    ],
    validation: {
      targetBlockId: target.id,
      targetOutputKey: "candidates",
      mode: "select_one",
      onReject: "pause",
      maxAttempts: 3,
    },
    parameters: [],
    order: 1,
  };
  const execution = executionFor("theme", target);
  execution.methodSnapshot.blocks.push(validation);
  execution.blocks.push({
    blockId: validation.id,
    status: "completed",
    values: { selected_value: "B" },
    attempt: 1,
  });
  recordBlockDeliveries(execution, target, { other: ["B"], candidates: ["A", "B"] }, "completed");
  const candidateDelivery = execution.deliveries?.find(
    (delivery) => delivery.outputKey === "candidates",
  );
  const candidateItem = candidateDelivery?.items.find((item) => item.value === "B");
  assert.ok(candidateItem);

  const [selectionDelivery] = recordBlockDeliveries(
    execution,
    validation,
    { selected_value: "B" },
    "completed",
  );

  assert.deepEqual(selectionDelivery.items[0].references, [
    { itemId: candidateItem.id, role: "selected_from" },
  ]);
});
