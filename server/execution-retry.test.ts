import assert from "node:assert/strict";
import test from "node:test";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";
import { executionCommands } from "./execution-commands";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type Project,
  type ProcessExecution,
} from "../src/lib/domain";

test("tentativas técnicas não esgotam as rodadas da validação humana", () => {
  const project: Project = {
    id: "project",
    channelId: "channel",
    title: "Isolated retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "theme",
    state: "awaiting_human",
    progress: 0,
  };
  const method = createEmptyMethods().theme;
  method.blocks = [
    {
      id: "create",
      type: "CRIAR",
      operator: "Humano",
      name: "Create",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "review",
      type: "VALIDAR",
      operator: "Humano",
      name: "Review",
      inputs: [],
      outputs: [
        { id: "decision", key: "decision", label: "Decision", type: "approval", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
      validation: {
        mode: "approval",
        onReject: "retry_target",
        targetBlockId: "create",
        maxAttempts: 3,
        retryMode: "full",
      },
    },
  ];
  const execution: ProcessExecution = {
    id: "execution",
    projectId: project.id,
    channelId: project.channelId,
    processType: "theme",
    methodSnapshot: method,
    status: "awaiting_human",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "create", status: "completed", values: {}, attempt: 9 },
      { blockId: "review", status: "awaiting_human", values: {}, attempt: 1 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    true,
  );
  assert.equal(execution.blocks[0].attempt, 10);
  assert.equal(execution.blocks[1].attempt, 2);
  execution.blocks[0].status = "completed";
  execution.blocks[1].status = "awaiting_human";
  execution.blocks[1].attempt = 3;
  assert.equal(
    commands.completeHumanBlock(execution.id, "review", { decision: "rejected" }).ok,
    false,
  );
});

test("invalida a identidade dos jobs já executados ao repetir um trecho validado", () => {
  assert.equal(
    attemptAfterRetryInvalidation({
      status: "completed",
      attempt: 1,
      completedAt: "2026-08-24T00:00:00.000Z",
    }),
    2,
  );
  assert.equal(attemptAfterRetryInvalidation({ status: "blocked_executor", attempt: 2 }), 3);
  assert.equal(attemptAfterRetryInvalidation({ status: "pending", attempt: 1 }), 1);
});

test("retry manual preserva somente o lote pendente quando solicitado", () => {
  const project: Project = {
    id: "project-batch",
    channelId: "channel",
    title: "Batch retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, "not_started"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "error",
    progress: 0,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "batch",
      type: "CRIAR",
      operator: "Código",
      name: "Batch",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-batch",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "failed",
    outputStatus: "pending",
    error: "Falha no item 3",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "batch",
        status: "failed",
        values: { images: ["a", "b"] },
        attempt: 1,
        itemProgress: { total: 4, completed: 2, pending: 2, currentIndex: 2, failedIndex: 2 },
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "batch", "remaining"), true);
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[0].itemRetryScope, "remaining");
  assert.deepEqual(execution.blocks[0].values, { images: ["a", "b"] });
  assert.equal(execution.blocks[0].itemProgress?.completed, 2);
  assert.equal(execution.blocks[0].progress, 0.5);

  execution.blocks[0].status = "failed";
  assert.equal(commands.retryBlockExecution(execution.id, "batch", "all"), true);
  assert.equal(execution.blocks[0].attempt, 3);
  assert.equal(execution.blocks[0].itemRetryScope, "all");
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.blocks[0].itemProgress, undefined);
  assert.equal(execution.blocks[0].progress, undefined);
});

test("regenera um único item de um bloco já concluído sem apagar os demais", () => {
  const project: Project = {
    id: "project-selected-item",
    channelId: "channel",
    title: "Selected item retry",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "done" : "not_started"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "done",
    progress: 75,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "images",
      type: "CRIAR",
      operator: "Código",
      name: "Imagens",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-selected-item",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "completed",
    outputStatus: "completed",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      {
        blockId: "images",
        status: "completed",
        values: { images: ["a", "b"] },
        attempt: 1,
        items: [
          {
            id: "item-a",
            order: 0,
            input: "prompt-a",
            status: "completed",
            attempt: 1,
            output: "a",
            attempts: [],
          },
          {
            id: "item-b",
            order: 1,
            input: "prompt-b",
            status: "completed",
            attempt: 1,
            output: "b",
            attempts: [],
          },
        ],
        itemProgress: { total: 2, completed: 2, pending: 0 },
      },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "images", "selected", "item-b"), true);
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[0].itemRetryScope, "selected");
  assert.equal(execution.blocks[0].itemRetryId, "item-b");
  assert.deepEqual(execution.blocks[0].values, { images: ["a", "b"] });
  assert.equal(execution.blocks[0].items?.[0].output, "a");
  assert.equal(execution.blocks[0].items?.[1].output, "b");
});

test("aceita a entrega persistida de um bloco cancelado sem refazer blocos anteriores", () => {
  const project: Project = {
    id: "project-cancelled-assets",
    channelId: "channel",
    title: "Cancelled assets",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "not_started" : "done"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "not_started",
    progress: 63,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "srt",
      type: "CRIAR",
      operator: "Código",
      name: "Criar SRT",
      inputs: [],
      outputs: [{ id: "srt-output", key: "srt", label: "SRT", type: "text", required: true }],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "prompts",
      type: "CRIAR",
      operator: "IA",
      name: "Criar prompts",
      inputs: [],
      outputs: [
        { id: "prompts-output", key: "prompts", label: "Prompts", type: "list", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 1,
    },
    {
      id: "images",
      type: "CRIAR",
      operator: "IA",
      name: "Criar imagens",
      inputs: [],
      outputs: [
        { id: "assets-output", key: "assets", label: "Assets", type: "files", required: true },
      ],
      parameters: [],
      instructions: "",
      order: 2,
    },
  ];
  const images = Array.from({ length: 124 }, (_, index) => ({
    id: `image-${index + 1}`,
    name: `${index + 1}.jpg`,
    mimeType: "image/jpeg",
    size: 100,
    url: `/api/files/${index + 1}.jpg`,
  }));
  const execution: ProcessExecution = {
    id: "execution-cancelled-assets",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "cancelled",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "srt", status: "completed", values: { srt: "ok" }, attempt: 1 },
      { blockId: "prompts", status: "completed", values: { prompts: ["a", "b"] }, attempt: 1 },
      { blockId: "images", status: "cancelled", values: { assets: images }, attempt: 7 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  const result = commands.acceptBlockDelivery(execution.id, "images");
  assert.deepEqual(result, { ok: true, completedProcess: true });
  assert.equal(execution.blocks[0].status, "completed");
  assert.equal(execution.blocks[0].attempt, 1);
  assert.equal(execution.blocks[1].status, "completed");
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.blocks[2].status, "completed");
  assert.equal(execution.blocks[2].attempt, 7);
  assert.equal((execution.blocks[2].values.assets as typeof images).length, 124);
  assert.equal(execution.status, "completed");
  assert.equal(execution.outputStatus, "completed");
  assert.equal((execution.output?.values.assets as typeof images).length, 124);
  assert.equal(project.stages.assets, "done");
});

test("refaz somente o bloco cancelado e mantém os anteriores consolidados", () => {
  const project: Project = {
    id: "project-rerun-cancelled",
    channelId: "channel",
    title: "Rerun cancelled block",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deadline: "",
    duration: "",
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    stages: Object.fromEntries(
      PROCESS_ORDER.map((process) => [process, process === "assets" ? "not_started" : "done"]),
    ) as Project["stages"],
    currentStage: "assets",
    state: "not_started",
    progress: 63,
  };
  const method = createEmptyMethods().assets;
  method.blocks = [
    {
      id: "srt",
      type: "CRIAR",
      operator: "Código",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 0,
    },
    {
      id: "prompts",
      type: "CRIAR",
      operator: "IA",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 1,
    },
    {
      id: "images",
      type: "CRIAR",
      operator: "IA",
      inputs: [],
      outputs: [],
      parameters: [],
      instructions: "",
      order: 2,
    },
  ];
  const execution: ProcessExecution = {
    id: "execution-rerun-cancelled",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    methodSnapshot: method,
    status: "cancelled",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    blocks: [
      { blockId: "srt", status: "completed", values: { srt: "preservado" }, attempt: 1 },
      {
        blockId: "prompts",
        status: "completed",
        values: { prompts: ["preservado"] },
        attempt: 1,
      },
      { blockId: "images", status: "cancelled", values: { assets: ["parcial"] }, attempt: 7 },
    ],
  };
  const commands = executionCommands({
    channels: [],
    projects: [project],
    executions: [execution],
    libraryItems: [],
    libraryCollections: [],
  });

  assert.equal(commands.retryBlockExecution(execution.id, "images", "all"), true);
  assert.deepEqual(execution.blocks[0].values, { srt: "preservado" });
  assert.equal(execution.blocks[0].attempt, 1);
  assert.deepEqual(execution.blocks[1].values, { prompts: ["preservado"] });
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.blocks[2].status, "blocked_executor");
  assert.equal(execution.blocks[2].attempt, 8);
  assert.deepEqual(execution.blocks[2].values, {});
  assert.equal(execution.status, "blocked_executor");
  assert.equal(project.stages.assets, "blocked");
});
