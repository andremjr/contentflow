import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyMethods,
  PROCESS_ORDER,
  type ActionBlock,
  type Channel,
  type ProcessExecution,
  type Project,
  type RuntimeValue,
  type StoredFile,
} from "../src/lib/domain";
import { recordBlockDeliveries, recordProcessOutputDelivery } from "../src/lib/deliveries";
import {
  applyExecutorBlockCompletion,
  applyValidationOutcome,
  validationOutcomeFromValues,
} from "../src/lib/execution-core";
import { executionCommands } from "./execution-commands";

const initialStages = () =>
  Object.fromEntries(
    PROCESS_ORDER.map((processType) => [processType, "not_started"]),
  ) as Project["stages"];

function createBlock(
  id: string,
  order: number,
  operator: ActionBlock["operator"] = "Humano",
  outputKey = `${id}_value`,
  outputShape: NonNullable<ActionBlock["outputs"]>[number]["shape"] = { kind: "content", family: "text", cardinality: "one", representation: "inline" },
): ActionBlock {
  return {
    id,
    type: "CRIAR",
    operator,
    name: id,
    instructions: `Produza ${id}.`,
    inputs: [],
    outputs: [
      {
        id: `${id}-output`,
        key: outputKey,
        label: `Saída ${id}`,
        shape: outputShape,
        required: true,
      },
    ],
    plugin:
      operator === "Humano"
        ? undefined
        : {
            pluginId: "com.contentflow.characterization",
            capabilityId: "characterize",
            configuration: {},
          },
    parameters: [],
    order,
  };
}

function validationBlock(
  id: string,
  order: number,
  targetBlockId: string,
  options: {
    onReject?: "retry_target" | "pause";
    maxAttempts?: number;
    retryMode?: "full" | "conversation_feedback";
    mode?: "approval" | "select_one" | "select_many";
    targetOutputKey?: string;
    operator?: ActionBlock["operator"];
  } = {},
): ActionBlock {
  const mode = options.mode ?? "approval";
  const outputKey =
    mode === "approval"
      ? "decision"
      : mode === "select_many"
        ? "selected_values"
        : "selected_value";
  return {
    id,
    type: "VALIDAR",
    operator: options.operator ?? "Humano",
    name: id,
    inputs: [],
    outputs: [
      {
        id: `${id}-output`,
        key: outputKey,
        label: `Decisão ${id}`,
        shape: mode === "approval"
          ? { kind: "control", control: "approval", cardinality: "one" }
          : mode === "select_many"
            ? { kind: "control", control: "selection", cardinality: "many" }
            : { kind: "control", control: "selection", cardinality: "one" },
        required: true,
      },
      ...(mode === "approval"
        ? [
            {
              id: `${id}-feedback`,
              key: "feedback",
              label: `Feedback ${id}`,
              shape: { kind: "content" as const, family: "text" as const, cardinality: "one" as const, representation: "inline" as const },
              required: false,
            },
          ]
        : []),
    ],
    validation: {
      mode,
      onReject: options.onReject ?? "retry_target",
      targetBlockId,
      targetOutputKey: options.targetOutputKey,
      maxAttempts: options.maxAttempts ?? 3,
      retryMode: options.retryMode ?? "full",
    },
    plugin:
      options.operator && options.operator !== "Humano"
        ? {
            pluginId: "com.contentflow.characterization",
            capabilityId: "validate",
            configuration: {},
          }
        : undefined,
    parameters: [],
    order,
  };
}

function fixture(blocks: ActionBlock[]) {
  const methods = createEmptyMethods();
  methods.theme = { contractVersion: 3, name: "Validação caracterizada", processType: "theme", blocks };
  const channel: Channel = {
    id: "channel-validation",
    name: "Canal de validação",
    handle: "",
    color: "#6366f1",
    subscribers: "—",
    niche: "Teste",
    language: "pt-BR",
    activeProjects: 1,
    frequency: "Semanal",
    nextPublish: "",
    currentProjectProgress: 0,
    status: "healthy",
    trend: [],
    methods,
    createdAt: "2026-09-28T00:00:00.000Z",
  };
  const project: Project = {
    id: "project-validation",
    title: "Projeto de validação",
    channelId: channel.id,
    currentStage: "theme",
    state: "not_started",
    progress: 0,
    deadline: "Sem prazo",
    duration: "—",
    updatedAt: "Agora",
    stages: initialStages(),
    assignee: { name: "Teste", initials: "T" },
    thumbHue: 0,
    createdAt: "2026-09-28T00:00:00.000Z",
  };
  const db = {
    channels: [channel],
    projects: [project],
    executions: [] as ProcessExecution[],
    libraryItems: [],
    libraryCollections: [],
  };
  const commands = executionCommands(db);
  const execution = commands.startProcessExecution(project.id, "theme")!;
  return { db, project, execution, commands };
}

function completeHuman(
  commands: ReturnType<typeof executionCommands>,
  execution: ProcessExecution,
  blockId: string,
  values: Record<string, RuntimeValue>,
) {
  const result = commands.completeHumanBlock(execution.id, blockId, values);
  assert.equal(result.ok, true);
  return result;
}

function activeDelivery(execution: ProcessExecution, blockId: string, outputKey?: string) {
  return execution.deliveries?.find(
    (delivery) =>
      delivery.blockId === blockId &&
      (!outputKey || delivery.outputKey === outputKey) &&
      delivery.status !== "invalidated",
  );
}

function completeExecutorValidation(
  execution: ProcessExecution,
  block: ActionBlock,
  values: Record<string, RuntimeValue>,
) {
  const blockExecution = execution.blocks.find((candidate) => candidate.blockId === block.id)!;
  blockExecution.status = "in_progress";
  execution.status = "running";
  const now = "2026-09-28T03:00:00.000Z";
  const completion = applyExecutorBlockCompletion(execution, {
    type: "executor_block_completed",
    blockId: block.id,
    values,
    now,
  });
  assert.equal(completion.ok, true);
  recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
  return applyValidationOutcome(
    execution,
    block.id,
    validationOutcomeFromValues(block, blockExecution.values),
    now,
  );
}

test("V01 — aprovação conclui VALIDAR, persiste delivery e ativa o próximo Bloco", () => {
  const target = createBlock("target", 0);
  const review = validationBlock("review", 1, target.id);
  const next = createBlock("next", 2);
  const { commands, execution, project } = fixture([target, review, next]);
  completeHuman(commands, execution, target.id, { target_value: "primeira versão" });

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "approved",
    feedback: "Aprovado",
  });

  assert.deepEqual(result, { ok: true, completedProcess: false });
  assert.deepEqual(execution.blocks[1].values, {
    decision: "approved",
    feedback: "Aprovado",
  });
  assert.equal(execution.blocks[1].status, "completed");
  assert.ok(execution.blocks[1].completedAt);
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(activeDelivery(execution, review.id, "decision")?.status, "completed");
  assert.equal(execution.blocks[2].status, "awaiting_human");
  assert.equal(execution.status, "awaiting_human");
  assert.equal(project.stages.theme, "awaiting_human");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "awaiting_human");
  assert.equal(execution.blocks[0].attempt, 1);
});

test("V02 — rejeição configurada para pausa preserva decisão sem reabrir o alvo", () => {
  const target = createBlock("target", 0);
  const review = validationBlock("review", 1, target.id, { onReject: "pause" });
  const next = createBlock("next", 2);
  const { commands, execution, project } = fixture([target, review, next]);
  completeHuman(commands, execution, target.id, { target_value: "versão em revisão" });
  const targetBefore = structuredClone(execution.blocks[0]);

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
    feedback: "Pausar para decisão editorial",
  });

  assert.deepEqual(result, { ok: true, completedProcess: false, pausedValidation: true });
  assert.deepEqual(execution.blocks[0], targetBefore);
  assert.deepEqual(execution.blocks[1].values, {
    decision: "rejected",
    feedback: "Pausar para decisão editorial",
  });
  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.equal(execution.blocks[1].completedAt, undefined);
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(activeDelivery(execution, review.id, "decision")?.status, "completed");
  assert.equal(execution.blocks[2].status, "pending");
  assert.equal(execution.status, "awaiting_human");
  assert.equal(project.state, "awaiting_human");
});

test("V03 — retry_target reativa o alvo e reprojeta execução e Projeto", () => {
  const target = createBlock("target", 0, "Código");
  const review = validationBlock("review", 1, target.id);
  const { execution, project, commands } = fixture([target, review]);
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { target_value: "resultado antigo" },
    attempt: 1,
    completedAt: "2026-09-28T01:00:00.000Z",
  });
  Object.assign(execution.blocks[1], {
    status: "awaiting_human",
    attempt: 1,
    startedAt: "2026-09-28T01:01:00.000Z",
  });
  execution.status = "awaiting_human";
  execution.output = {
    processType: "theme",
    values: { theme: "resultado antigo" },
    createdAt: "2026-09-28T01:00:00.000Z",
  };
  execution.outputStatus = "completed";
  execution.error = "erro antigo";

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
    feedback: "Refazer",
  });

  assert.deepEqual(result, { ok: true, completedProcess: false, retriedBlock: "target" });
  assert.equal(execution.blocks[0].status, "blocked_executor");
  assert.equal(execution.blocks[0].attempt, 2);
  assert.deepEqual(execution.blocks[0].values, {});
  assert.equal(execution.blocks[1].status, "pending");
  assert.equal(execution.blocks[1].attempt, 2);
  assert.deepEqual(execution.blocks[1].values, {});
  assert.equal(execution.output, undefined);
  assert.equal(execution.outputStatus, "pending");
  assert.equal(execution.error, undefined);
  assert.equal(execution.status, "blocked_executor");
  assert.equal(project.stages.theme, "blocked");
  assert.equal(project.currentStage, "theme");
  assert.equal(project.state, "blocked");
});

test("V04 — attempt do VALIDAR, e não retries técnicos do alvo, limita rodadas editoriais", () => {
  const target = createBlock("target", 0, "Código");
  const review = validationBlock("review", 1, target.id, { maxAttempts: 3 });
  const { execution, commands } = fixture([target, review]);
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { target_value: "resultado da nona tentativa técnica" },
    attempt: 9,
    completedAt: "2026-09-28T01:00:00.000Z",
  });
  Object.assign(execution.blocks[1], { status: "awaiting_human", attempt: 1 });
  execution.status = "awaiting_human";

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
    feedback: "Nova rodada editorial",
  });

  assert.equal(result.ok, true);
  assert.equal(execution.blocks[0].attempt, 10);
  assert.equal(execution.blocks[1].attempt, 2);
  assert.equal(execution.blocks[0].status, "blocked_executor");
});

test("V05 — maxAttempts bloqueia retry, mas a rejeição já foi persistida no VALIDAR", () => {
  const target = createBlock("target", 0, "Código");
  const review = validationBlock("review", 1, target.id, { maxAttempts: 3 });
  const { execution, project, commands } = fixture([target, review]);
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { target_value: "resultado atual" },
    attempt: 8,
    completedAt: "2026-09-28T01:00:00.000Z",
  });
  Object.assign(execution.blocks[1], {
    status: "awaiting_human",
    values: { decision: "approved" },
    attempt: 3,
  });
  execution.status = "awaiting_human";
  project.stages.theme = "awaiting_human";
  project.state = "awaiting_human";
  const targetBefore = structuredClone(execution.blocks[0]);
  const projectBefore = structuredClone(project);

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
    feedback: "Tentativa além do limite",
  });

  assert.deepEqual(result, {
    ok: false,
    missing: [
      "O limite de 3 tentativas foi atingido. Revise o método ou aprove manualmente o resultado atual.",
    ],
  });
  assert.deepEqual(execution.blocks[0], targetBefore);
  assert.deepEqual(project, projectBefore);
  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.equal(execution.blocks[1].attempt, 3);
  assert.deepEqual(execution.blocks[1].values, {
    decision: "rejected",
    feedback: "Tentativa além do limite",
  });
  assert.equal(activeDelivery(execution, review.id, "decision")?.attempt, 3);
  assert.equal(activeDelivery(execution, review.id, "decision")?.status, "completed");
});

test("V06/V07/V08/V09 — retry invalida exatamente o trecho downstream e seu output", () => {
  const upstream = createBlock("upstream", 0);
  const target = createBlock("target", 1);
  const middle = createBlock("middle", 2);
  const review = validationBlock("review", 3, target.id);
  const { execution, project, commands } = fixture([upstream, target, middle, review]);
  completeHuman(commands, execution, upstream.id, { upstream_value: "preservar" });
  completeHuman(commands, execution, target.id, { target_value: "invalidar" });
  completeHuman(commands, execution, middle.id, { middle_value: "invalidar também" });

  const upstreamDelivery = activeDelivery(execution, upstream.id)!;
  const upstreamDeliveryBefore = structuredClone(upstreamDelivery);
  const image: StoredFile = {
    id: "image-old",
    name: "old.png",
    mimeType: "image/png",
    size: 10,
    url: "contentflow://old.png",
  };
  for (const [index, blockExecution] of execution.blocks.entries()) {
    blockExecution.error = `erro-${index}`;
    blockExecution.logs = [`log-${index}`];
    blockExecution.jobId = `job-${index}`;
    blockExecution.progress = 0.75;
    blockExecution.progressMessage = `progresso-${index}`;
    blockExecution.retryFeedback = { feedback: `anterior-${index}` };
    blockExecution.retryMode = "conversation_feedback";
    blockExecution.retryConversationContext = `contexto-${index}`;
    blockExecution.retryConversationAttachments = [image];
    blockExecution.pluginConversation = {
      pluginId: "com.contentflow.characterization",
      id: `conversation-${index}`,
    };
  }
  const upstreamBefore = structuredClone(execution.blocks[0]);
  execution.blocks[3].error = "erro da validação";
  execution.output = {
    processType: "theme",
    values: { theme: "output antigo" },
    createdAt: "2026-09-28T01:30:00.000Z",
  };
  execution.outputStatus = "completed";
  recordProcessOutputDelivery(execution, execution.output.values, execution.output.createdAt);
  const downstreamIds = new Set(
    execution.deliveries
      ?.filter((delivery) => delivery.blockId !== upstream.id)
      .map((delivery) => delivery.id),
  );
  const identitiesBefore = new Map(
    execution.deliveries?.map((delivery) => [delivery.id, structuredClone(delivery.items)]),
  );

  const result = commands.completeHumanBlock(execution.id, review.id, {
    decision: "rejected",
    feedback: "Refazer trecho",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(execution.blocks[0], upstreamBefore);
  assert.deepEqual(
    execution.deliveries?.find((delivery) => delivery.id === upstreamDelivery.id),
    upstreamDeliveryBefore,
  );
  assert.deepEqual(
    execution.blocks.slice(1).map((block) => ({
      status: block.status,
      values: block.values,
      attempt: block.attempt,
      completedAt: block.completedAt,
      jobId: block.jobId,
      error: block.error,
      logs: block.logs,
      progress: block.progress,
      progressMessage: block.progressMessage,
      pluginConversation: block.pluginConversation,
    })),
    [
      {
        status: "awaiting_human",
        values: {},
        attempt: 2,
        completedAt: undefined,
        jobId: undefined,
        error: undefined,
        logs: undefined,
        progress: undefined,
        progressMessage: undefined,
        pluginConversation: undefined,
      },
      {
        status: "pending",
        values: {},
        attempt: 2,
        completedAt: undefined,
        jobId: undefined,
        error: undefined,
        logs: undefined,
        progress: undefined,
        progressMessage: undefined,
        pluginConversation: undefined,
      },
      {
        status: "pending",
        values: {},
        attempt: 2,
        completedAt: undefined,
        jobId: undefined,
        error: undefined,
        logs: undefined,
        progress: undefined,
        progressMessage: undefined,
        pluginConversation: undefined,
      },
    ],
  );
  assert.deepEqual(execution.blocks[1].retryFeedback, {
    decision: "rejected",
    feedback: "Refazer trecho",
  });
  assert.equal(execution.blocks[1].retryMode, "full");
  assert.match(execution.blocks[1].retryConversationContext ?? "", /invalidar/);
  assert.deepEqual(execution.blocks[1].retryConversationAttachments, []);
  for (const resetBlock of execution.blocks.slice(2)) {
    assert.equal(resetBlock.retryFeedback, undefined);
    assert.equal(resetBlock.retryMode, undefined);
    assert.equal(resetBlock.retryConversationContext, undefined);
    assert.equal(resetBlock.retryConversationAttachments, undefined);
  }
  for (const delivery of execution.deliveries ?? []) {
    if (delivery.blockId === upstream.id) assert.equal(delivery.status, "completed");
    if (downstreamIds.has(delivery.id) || delivery.blockId === review.id) {
      assert.equal(delivery.status, "invalidated");
      assert.deepEqual(delivery.items, identitiesBefore.get(delivery.id) ?? delivery.items);
    }
  }
  assert.equal(
    execution.deliveries?.find((delivery) => delivery.blockId === "__process_output__")?.status,
    "invalidated",
  );
  assert.equal(execution.output, undefined);
  assert.equal(execution.outputStatus, "pending");
  assert.equal(execution.status, "awaiting_human");
  assert.equal(project.state, "awaiting_human");
});

test("V10 — retryMode full limpa conversa e materializa feedback/contexto/attachments", () => {
  const target = createBlock("target", 0, "Código", "asset", { kind: "content", family: "image", cardinality: "one", representation: "artifact" });
  const review = validationBlock("review", 1, target.id, { retryMode: "full" });
  const { execution, commands } = fixture([target, review]);
  const image: StoredFile = {
    id: "image-full",
    name: "full.png",
    mimeType: "image/png",
    size: 42,
    url: "contentflow://full.png",
  };
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { asset: image },
    attempt: 1,
    completedAt: "2026-09-28T02:00:00.000Z",
    pluginConversation: {
      pluginId: "com.contentflow.characterization",
      id: "conversation-full",
      fallbackContext: "fallback persistido",
    },
  });
  Object.assign(execution.blocks[1], { status: "awaiting_human", attempt: 1 });
  execution.status = "awaiting_human";

  completeHuman(commands, execution, review.id, {
    decision: "rejected",
    feedback: "Trocar composição",
  });

  assert.equal(execution.blocks[0].attempt, 2);
  assert.deepEqual(execution.blocks[0].values, {});
  assert.deepEqual(execution.blocks[0].retryFeedback, {
    decision: "rejected",
    feedback: "Trocar composição",
  });
  assert.equal(execution.blocks[0].retryMode, "full");
  assert.match(execution.blocks[0].retryConversationContext ?? "", /Resultado anterior/);
  assert.deepEqual(execution.blocks[0].retryConversationAttachments, [image]);
  assert.equal(execution.blocks[0].pluginConversation, undefined);
  assert.equal(execution.blocks[1].status, "pending");
});

test("V11 — conversation_feedback preserva conversa e fallback da tentativa rejeitada", () => {
  const target = createBlock("target", 0, "Código", "asset", { kind: "content", family: "image", cardinality: "one", representation: "artifact" });
  const review = validationBlock("review", 1, target.id, {
    retryMode: "conversation_feedback",
  });
  const { execution, commands } = fixture([target, review]);
  const image: StoredFile = {
    id: "image-conversation",
    name: "conversation.png",
    mimeType: "image/png",
    size: 84,
    url: "contentflow://conversation.png",
  };
  const conversation = {
    pluginId: "com.contentflow.characterization",
    connectionId: "local-connection",
    id: "conversation-feedback",
    fallbackContext: "fallback anterior",
  };
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { asset: image },
    attempt: 1,
    completedAt: "2026-09-28T02:00:00.000Z",
    pluginConversation: conversation,
  });
  Object.assign(execution.blocks[1], { status: "awaiting_human", attempt: 1 });
  execution.status = "awaiting_human";

  completeHuman(commands, execution, review.id, {
    decision: "rejected",
    feedback: "Ajustar na mesma conversa",
  });

  assert.deepEqual(execution.blocks[0].pluginConversation, conversation);
  assert.deepEqual(execution.blocks[0].retryFeedback, {
    decision: "rejected",
    feedback: "Ajustar na mesma conversa",
  });
  assert.equal(execution.blocks[0].retryMode, "conversation_feedback");
  assert.match(execution.blocks[0].retryConversationContext ?? "", /conversation\.png/);
  assert.deepEqual(execution.blocks[0].retryConversationAttachments, [image]);
  assert.equal(execution.blocks[1].pluginConversation, undefined);
  assert.equal(execution.blocks[1].status, "pending");
});

test("V12 — nova rodada limpa integralmente o estado antigo do VALIDAR", () => {
  const target = createBlock("target", 0);
  const review = validationBlock("review", 1, target.id);
  const { execution, commands } = fixture([target, review]);
  completeHuman(commands, execution, target.id, { target_value: "resultado" });
  Object.assign(execution.blocks[1], {
    values: { decision: "approved", feedback: "feedback velho" },
    error: "erro velho",
    logs: ["log velho"],
    completedAt: "2026-09-28T02:30:00.000Z",
    jobId: "job-validation",
    progress: 0.5,
    progressMessage: "progresso velho",
    pluginConversation: {
      pluginId: "com.contentflow.characterization",
      id: "conversation-validation",
    },
  });

  completeHuman(commands, execution, review.id, {
    decision: "rejected",
    feedback: "Nova rodada",
  });

  assert.deepEqual(execution.blocks[1], {
    blockId: review.id,
    status: "pending",
    values: {},
    attempt: 2,
    startedAt: undefined,
    error: undefined,
    logs: undefined,
    completedAt: undefined,
    jobId: undefined,
    progress: undefined,
    progressMessage: undefined,
    retryFeedback: undefined,
    retryMode: undefined,
    retryConversationContext: undefined,
    retryConversationAttachments: undefined,
    pluginConversation: undefined,
  });
});

test("V13 — aprovação após retry avança sem invalidar novamente a nova tentativa", () => {
  const target = createBlock("target", 0);
  const review = validationBlock("review", 1, target.id);
  const next = createBlock("next", 2);
  const { execution, commands } = fixture([target, review, next]);
  completeHuman(commands, execution, target.id, { target_value: "resultado antigo" });
  const oldTargetDeliveryId = activeDelivery(execution, target.id)!.id;
  completeHuman(commands, execution, review.id, {
    decision: "rejected",
    feedback: "Refazer",
  });
  completeHuman(commands, execution, target.id, { target_value: "resultado novo" });
  const newTargetDelivery = activeDelivery(execution, target.id)!;

  const approved = commands.completeHumanBlock(execution.id, review.id, {
    decision: "approved",
    feedback: "Agora aprovado",
  });

  assert.deepEqual(approved, { ok: true, completedProcess: false });
  assert.equal(execution.blocks[0].attempt, 2);
  assert.equal(execution.blocks[1].attempt, 2);
  assert.equal(execution.blocks[1].status, "completed");
  assert.equal(execution.blocks[2].status, "awaiting_human");
  assert.equal(
    execution.deliveries?.find((delivery) => delivery.id === oldTargetDeliveryId)?.status,
    "invalidated",
  );
  assert.equal(newTargetDelivery.attempt, 2);
  assert.equal(newTargetDelivery.status, "completed");
  assert.equal(activeDelivery(execution, review.id, "decision")?.attempt, 2);
});

test("V14 — select_one persiste a seleção e avança sem retry editorial", () => {
  const target = createBlock("options", 0, "Humano", "options", { kind: "content", family: "text", cardinality: "many", representation: "inline" });
  const review = validationBlock("review", 1, target.id, {
    mode: "select_one",
    targetOutputKey: "options",
  });
  const next = createBlock("next", 2);
  const { execution, commands } = fixture([target, review, next]);
  completeHuman(commands, execution, target.id, { options: ["A", "B"] });

  const result = commands.completeHumanBlock(execution.id, review.id, { selected_value: "B" });

  assert.deepEqual(result, { ok: true, completedProcess: false });
  assert.deepEqual(execution.blocks[1].values, { selected_value: "B" });
  assert.equal(execution.blocks[1].status, "completed");
  assert.equal(execution.blocks[1].attempt, 1);
  assert.equal(execution.blocks[0].attempt, 1);
  assert.equal(activeDelivery(execution, review.id, "selected_value")?.status, "completed");
  assert.equal(execution.blocks[2].status, "awaiting_human");
});

test("P01 — plugin rejected + pause materializa a decisão sem avançar", () => {
  const target = createBlock("target", 0);
  const review = validationBlock("review", 1, target.id, {
    onReject: "pause",
    operator: "Código",
  });
  const next = createBlock("next", 2);
  const { execution, commands } = fixture([target, review, next]);
  completeHuman(commands, execution, target.id, { target_value: "versão em revisão" });

  const result = completeExecutorValidation(execution, review, {
    decision: "rejected",
    feedback: "Aguardar intervenção",
  });

  assert.deepEqual(result, { ok: true, outcome: "paused" });
  assert.equal(execution.blocks[1].status, "awaiting_human");
  assert.equal(execution.blocks[1].completedAt, undefined);
  assert.equal(execution.blocks[2].status, "pending");
  assert.equal(execution.status, "awaiting_human");
  assert.equal(activeDelivery(execution, review.id, "decision")?.status, "completed");
});

test("P02 — plugin usa attempt editorial do VALIDAR e invalida output oficial", () => {
  const target = createBlock("target", 0, "Código");
  const review = validationBlock("review", 1, target.id, {
    maxAttempts: 3,
    operator: "Código",
  });
  const { execution } = fixture([target, review]);
  Object.assign(execution.blocks[0], {
    status: "completed",
    values: { target_value: "nona tentativa técnica" },
    attempt: 9,
    completedAt: "2026-09-28T02:50:00.000Z",
  });
  Object.assign(execution.blocks[1], { status: "blocked_executor", attempt: 1 });
  execution.status = "blocked_executor";
  recordBlockDeliveries(execution, target, execution.blocks[0].values, "completed");
  execution.output = {
    processType: "theme",
    values: { theme: "output antigo" },
    createdAt: "2026-09-28T02:50:00.000Z",
  };
  execution.outputStatus = "completed";
  recordProcessOutputDelivery(execution, execution.output.values, execution.output.createdAt);

  const result = completeExecutorValidation(execution, review, {
    decision: "rejected",
    feedback: "Nova rodada editorial",
  });

  assert.equal(result.ok, true);
  assert.equal(result.outcome, "retry_target");
  assert.equal(execution.blocks[0].attempt, 10);
  assert.equal(execution.blocks[1].attempt, 2);
  assert.equal(execution.output, undefined);
  assert.equal(execution.outputStatus, "pending");
  assert.equal(
    execution.deliveries?.find((delivery) => delivery.blockId === "__process_output__")?.status,
    "invalidated",
  );
});

test("P03 — humano e plugin aplicam os mesmos modos editoriais de conversa", () => {
  for (const retryMode of ["full", "conversation_feedback"] as const) {
    const humanTarget = createBlock("target", 0, "Código", "asset", { kind: "content", family: "image", cardinality: "one", representation: "artifact" });
    const humanReview = validationBlock("review", 1, humanTarget.id, { retryMode });
    const pluginTarget = createBlock("target", 0, "Código", "asset", { kind: "content", family: "image", cardinality: "one", representation: "artifact" });
    const pluginReview = validationBlock("review", 1, pluginTarget.id, {
      retryMode,
      operator: "Código",
    });
    const human = fixture([humanTarget, humanReview]);
    const plugin = fixture([pluginTarget, pluginReview]);
    const image: StoredFile = {
      id: `image-${retryMode}`,
      name: `${retryMode}.png`,
      mimeType: "image/png",
      size: 42,
      url: `contentflow://${retryMode}.png`,
    };
    const conversation = {
      pluginId: "com.contentflow.characterization",
      id: `conversation-${retryMode}`,
    };
    for (const execution of [human.execution, plugin.execution]) {
      Object.assign(execution.blocks[0], {
        status: "completed",
        values: { asset: image },
        attempt: 1,
        completedAt: "2026-09-28T02:50:00.000Z",
        pluginConversation: conversation,
      });
      Object.assign(execution.blocks[1], {
        status: execution === human.execution ? "awaiting_human" : "blocked_executor",
        attempt: 1,
      });
      execution.status = execution === human.execution ? "awaiting_human" : "blocked_executor";
    }

    const values = { decision: "rejected", feedback: `Refazer ${retryMode}` };
    completeHuman(human.commands, human.execution, humanReview.id, values);
    const pluginResult = completeExecutorValidation(plugin.execution, pluginReview, values);

    assert.equal(pluginResult.ok, true);
    assert.equal(pluginResult.outcome, "retry_target");
    for (const execution of [human.execution, plugin.execution]) {
      assert.equal(execution.blocks[0].retryMode, retryMode);
      assert.deepEqual(execution.blocks[0].retryFeedback, values);
      assert.deepEqual(execution.blocks[0].retryConversationAttachments, [image]);
      assert.equal(
        execution.blocks[0].pluginConversation?.id,
        retryMode === "conversation_feedback" ? conversation.id : undefined,
      );
      assert.equal(execution.blocks[1].status, "pending");
    }
  }
});
