import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActionBlock,
  ProcessExecution,
  Project,
  RuntimeValue,
  UniversalProcess,
} from "../src/lib/domain";
import { recordBlockDeliveries, recordProcessOutputDelivery } from "../src/lib/deliveries";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { createChannelHistoryRecordFields } from "../src/lib/channel-history";
import { createProcessOutputFields, getMethodConfigurationIssue } from "../src/lib/human-workflow";

const now = "2026-08-22T12:00:00.000Z";

function project(id: string, channelId = "channel-a"): Project {
  return {
    id,
    channelId,
    title: `Projeto ${id}`,
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: "",
    duration: "",
    updatedAt: now,
    stages: {
      theme: "not_started",
      title: "not_started",
      thumbnail: "not_started",
      script: "not_started",
      narration: "not_started",
      assets: "not_started",
      editing: "not_started",
      publishing: "not_started",
    },
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: now,
  };
}

function execution({
  id,
  projectId,
  channelId = "channel-a",
  processType = "script",
  block,
  values = {},
  status = "completed",
}: {
  id: string;
  projectId: string;
  channelId?: string;
  processType?: UniversalProcess;
  block: ActionBlock;
  values?: Record<string, RuntimeValue>;
  status?: ProcessExecution["status"];
}): ProcessExecution {
  const result: ProcessExecution = {
    id,
    projectId,
    channelId,
    processType,
    methodSnapshot: { processType, blocks: [block] },
    blocks: [
      {
        blockId: block.id,
        status: "completed",
        values,
        attempt: 1,
        completedAt: now,
      },
    ],
    status,
    outputStatus: status === "completed" ? "completed" : "pending",
    createdAt: now,
    updatedAt: now,
  };
  recordBlockDeliveries(result, block, values, "completed", now);
  return result;
}

const sizeBlock: ActionBlock = {
  id: "define-target-size",
  type: "CRIAR",
  operator: "Código",
  name: "Definir tamanho alvo",
  inputs: [],
  outputs: [
    {
      id: "target-size-output",
      label: "Tamanho alvo",
      key: "target_chars",
      type: "number",
      required: true,
    },
  ],
  parameters: [],
  order: 0,
};

function choiceBlockWithHistory(input: NonNullable<ActionBlock["inputs"]>[number]): ActionBlock {
  return {
    id: "choose-next-option",
    type: "ESCOLHER",
    operator: "Humano",
    name: "Escolher próxima opção",
    collectionId: "strategic-options",
    inputs: [input],
    outputs: [],
    parameters: [],
    order: 0,
  };
}

test("histórico do canal só pode ser configurado nos blocos ESCOLHER e CRIAR", () => {
  const invalidBlock: ActionBlock = {
    ...sizeBlock,
    type: "BUSCAR",
    inputs: [
      {
        id: "invalid-history",
        label: "Histórico inválido",
        type: "records",
        source: "channel_history",
        sourceProcessType: "script",
        blockId: sizeBlock.id,
        sourceKey: "target_chars",
        recordFields: createChannelHistoryRecordFields("number"),
      },
    ],
  };

  assert.match(
    getMethodConfigurationIssue({ processType: "script", blocks: [invalidBlock] }) ?? "",
    /só pode orientar um bloco “Escolher” ou “Criar”/,
  );

  assert.equal(
    getMethodConfigurationIssue({
      processType: "script",
      blocks: [{ ...invalidBlock, type: "CRIAR" }],
    }),
    undefined,
  );
});

test("ESCOLHER materializa o item selecionado como entrega histórica", () => {
  const chooseBlock: ActionBlock = {
    id: "choose-title-structure",
    type: "ESCOLHER",
    operator: "Humano",
    collectionId: "title-structures",
    inputs: [],
    outputs: [],
    parameters: [],
    order: 0,
  };
  const result = execution({
    id: "choice-execution",
    projectId: "project-choice",
    block: chooseBlock,
    processType: "title",
    values: { selectedItemId: "structure-4" },
  });

  assert.equal(result.deliveries?.length, 1);
  assert.equal(result.deliveries?.[0].outputKey, "selectedItemId");
  assert.equal(result.deliveries?.[0].items[0].value, "structure-4");
});

test("CRIAR recebe os resultados finais anteriores do mesmo processo", () => {
  const [officialOutput] = createProcessOutputFields("script");
  const currentProject = project("current-create");
  const createBlock: ActionBlock = {
    id: "create-script",
    type: "CRIAR",
    operator: "IA",
    name: "Criar roteiro",
    inputs: [
      {
        id: "creation-history",
        label: "Histórico de criações",
        type: "records",
        source: "channel_history",
        sourceProcessType: "script",
        blockId: "__process_output__",
        sourceKey: officialOutput.key,
        historyLimit: 10,
        historyEligibility: "completed",
        recordFields: createChannelHistoryRecordFields(officialOutput.type),
      },
    ],
    outputs: [officialOutput],
    parameters: [],
    order: 0,
  };
  const currentExecution = execution({
    id: "current-create-execution",
    projectId: currentProject.id,
    block: createBlock,
    values: {},
    status: "blocked_executor",
  });
  const previousExecution = execution({
    id: "previous-create-execution",
    projectId: "previous-create",
    block: createBlock,
    values: { [officialOutput.key]: "Roteiro anterior" },
  });
  recordProcessOutputDelivery(previousExecution, {
    [officialOutput.key]: "Roteiro anterior",
  });

  const [resolved] = resolveBlockInputs({
    block: createBlock,
    execution: currentExecution,
    project: currentProject,
    projectExecutions: [currentExecution],
    channelExecutions: [currentExecution, previousExecution],
    channelProjects: [currentProject, project("previous-create")],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.equal(Array.isArray(resolved.value), true);
  const [historyRecord] = resolved.value as Array<Record<string, unknown>>;
  assert.equal(historyRecord.value, "Roteiro anterior");
  assert.equal(historyRecord.project_id, "previous-create");
  assert.equal(historyRecord.project_title, "Projeto previous-create");
  assert.equal(typeof historyRecord.recorded_at, "string");
});

test("histórico consulta somente outros projetos do mesmo canal e respeita o limite", () => {
  const currentProject = project("current");
  const currentBlock = choiceBlockWithHistory({
    id: "history-input",
    label: "Últimos tamanhos",
    type: "records",
    source: "channel_history",
    sourceProcessType: "script",
    blockId: sizeBlock.id,
    sourceKey: "target_chars",
    historyLimit: 1,
    historyEligibility: "completed",
    recordFields: createChannelHistoryRecordFields("number"),
  });
  const currentExecution = execution({
    id: "current-execution",
    projectId: currentProject.id,
    block: currentBlock,
    values: {},
    status: "awaiting_human",
  });
  const previous = execution({
    id: "previous-execution",
    projectId: "previous",
    block: sizeBlock,
    values: { target_chars: 17_000 },
  });
  const older = execution({
    id: "older-execution",
    projectId: "older",
    block: sizeBlock,
    values: { target_chars: 21_000 },
  });
  older.deliveries![0].updatedAt = "2026-08-20T12:00:00.000Z";
  const otherChannel = execution({
    id: "other-channel-execution",
    projectId: "other-channel-project",
    channelId: "channel-b",
    block: sizeBlock,
    values: { target_chars: 99_999 },
  });

  const [resolved] = resolveBlockInputs({
    block: currentBlock,
    execution: currentExecution,
    project: currentProject,
    projectExecutions: [currentExecution],
    channelExecutions: [currentExecution, previous, older, otherChannel],
    channelProjects: [
      currentProject,
      project("previous"),
      project("older"),
      project("other-channel-project", "channel-b"),
    ],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, [
    {
      value: 17_000,
      project_id: "previous",
      project_title: "Projeto previous",
      recorded_at: now,
    },
  ]);
});

test("histórico vazio não bloqueia o primeiro projeto", () => {
  const currentProject = project("first");
  const block = choiceBlockWithHistory({
    id: "history-input",
    label: "Últimos tamanhos",
    type: "records",
    source: "channel_history",
    sourceProcessType: "script",
    blockId: sizeBlock.id,
    sourceKey: "target_chars",
    recordFields: createChannelHistoryRecordFields("number"),
  });
  const currentExecution = execution({
    id: "first-execution",
    projectId: currentProject.id,
    block,
    values: {},
    status: "awaiting_human",
  });

  const [resolved] = resolveBlockInputs({
    block,
    execution: currentExecution,
    project: currentProject,
    projectExecutions: [currentExecution],
    channelExecutions: [currentExecution],
    channelProjects: [currentProject],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, []);
});

test("execuções de projetos excluídos deixam de contribuir para o histórico", () => {
  const currentProject = project("current-after-deletion");
  const block = choiceBlockWithHistory({
    id: "history-after-deletion",
    label: "Últimos tamanhos existentes",
    type: "records",
    source: "channel_history",
    sourceProcessType: "script",
    blockId: sizeBlock.id,
    sourceKey: "target_chars",
    recordFields: createChannelHistoryRecordFields("number"),
  });
  const currentExecution = execution({
    id: "current-after-deletion-execution",
    projectId: currentProject.id,
    block,
    values: {},
    status: "awaiting_human",
  });
  const orphanExecution = execution({
    id: "deleted-project-execution",
    projectId: "deleted-project",
    block: sizeBlock,
    values: { target_chars: 24_000 },
  });

  const [resolved] = resolveBlockInputs({
    block,
    execution: currentExecution,
    project: currentProject,
    projectExecutions: [currentExecution],
    channelExecutions: [currentExecution, orphanExecution],
    channelProjects: [currentProject],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, []);
});

test("filtro de publicados inclui somente projetos com Publicação concluída", () => {
  const currentProject = project("current-published-filter");
  const historyBlock = choiceBlockWithHistory({
    id: "published-history",
    label: "Tamanhos publicados",
    type: "records",
    source: "channel_history",
    sourceProcessType: "script",
    blockId: sizeBlock.id,
    sourceKey: "target_chars",
    historyEligibility: "published",
    recordFields: createChannelHistoryRecordFields("number"),
  });
  const currentExecution = execution({
    id: "current-published-execution",
    projectId: currentProject.id,
    block: historyBlock,
    values: {},
    status: "awaiting_human",
  });
  const publishedSize = execution({
    id: "published-size",
    projectId: "published-project",
    block: sizeBlock,
    values: { target_chars: 18_500 },
  });
  const unpublishedSize = execution({
    id: "unpublished-size",
    projectId: "unpublished-project",
    block: sizeBlock,
    values: { target_chars: 22_000 },
  });
  const publishingBlock: ActionBlock = {
    id: "publish",
    type: "CRIAR",
    operator: "Humano",
    inputs: [],
    outputs: [{ id: "url", label: "URL", key: "url", type: "url", required: true }],
    parameters: [],
    order: 0,
  };
  const published = execution({
    id: "published-output",
    projectId: "published-project",
    processType: "publishing",
    block: publishingBlock,
    values: { url: "https://example.com/video" },
  });

  const [resolved] = resolveBlockInputs({
    block: historyBlock,
    execution: currentExecution,
    project: currentProject,
    projectExecutions: [currentExecution],
    channelExecutions: [currentExecution, publishedSize, unpublishedSize, published],
    channelProjects: [currentProject, project("published-project"), project("unpublished-project")],
    collections: [],
    libraryItems: [],
  });

  assert.deepEqual(resolved.value, [
    {
      value: 18_500,
      project_id: "published-project",
      project_title: "Projeto published-project",
      recorded_at: now,
    },
  ]);
});
