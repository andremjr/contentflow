import { deriveProcessOutput } from "../src/lib/process-output";
import {
  PROCESS_ORDER,
  type ActionBlock,
  type Channel,
  type ChannelLibraryItem,
  type ProcessExecution,
  type ProcessId,
  type ProcessMethod,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
} from "../src/lib/domain";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeMethodBlocks,
} from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { attemptAfterRetryInvalidation } from "../src/lib/retry-attempt";
import {
  pluginConversationFallbackAttachments,
  pluginConversationFallbackContext,
} from "../src/lib/conversation-context";
import {
  invalidateBlockDeliveries,
  recordBlockDeliveries,
  recordProcessOutputDelivery,
} from "../src/lib/deliveries";

/** Synchronous domain transitions. The caller owns the SQLite transaction. */
export function executionCommands(db: {
  channels: Channel[];
  projects: Project[];
  executions: ProcessExecution[];
  libraryItems: ChannelLibraryItem[];
  libraryCollections: StrategicCollection[];
}) {
  const touchExecution = (execution: ProcessExecution) => {
    execution.updatedAt = new Date().toISOString();
  };
  function completeProjectStage(project: Project, stage: ProcessId) {
    project.stages = { ...project.stages, [stage]: "done" };
    const next = PROCESS_ORDER.find(
      (process) => project.stages[process] !== "done" && project.stages[process] !== "approved",
    );
    project.currentStage = next ?? "publishing";
    project.state = next ? project.stages[next] : "done";
    const completed = PROCESS_ORDER.filter(
      (process) => project.stages[process] === "done" || project.stages[process] === "approved",
    ).length;
    project.progress = Math.round((completed / PROCESS_ORDER.length) * 100);
  }

  function startProcessExecution(projectId: string, processType: ProcessId) {
    const existing = db.executions.find(
      (item) => item.projectId === projectId && item.processType === processType,
    );
    if (existing) return existing;
    const project = db.projects.find((item) => item.id === projectId);
    const channel = project ? db.channels.find((item) => item.id === project.channelId) : undefined;
    const method = channel?.methods[processType];
    const normalizedMethod = method
      ? { processType, blocks: normalizeMethodBlocks(method.blocks, processType) }
      : undefined;
    if (
      !project ||
      !channel ||
      !normalizedMethod ||
      getMethodConfigurationIssue(normalizedMethod)
    ) {
      return undefined;
    }
    const now = new Date().toISOString();
    const methodSnapshot: ProcessMethod = {
      processType,
      blocks: structuredClone(normalizedMethod.blocks),
    };
    const execution: ProcessExecution = {
      id: crypto.randomUUID(),
      projectId,
      channelId: channel.id,
      processType,
      methodSnapshot,
      blocks: methodSnapshot.blocks.map((block, index) => ({
        blockId: block.id,
        status:
          index === 0
            ? block.operator === "Humano"
              ? "awaiting_human"
              : "blocked_executor"
            : "pending",
        values: {},
        attempt: 1,
        startedAt: index === 0 ? now : undefined,
      })),
      status:
        methodSnapshot.blocks[0]?.operator === "Humano" ? "awaiting_human" : "blocked_executor",
      outputStatus: "pending",
      createdAt: now,
      updatedAt: now,
    };
    db.executions.unshift(execution);
    project.stages = {
      ...project.stages,
      [processType]: execution.status === "awaiting_human" ? "awaiting_human" : "processing",
    };
    project.currentStage = processType;
    project.state = project.stages[processType];
    touchExecution(execution);
    return execution;
  }

  function finalizeOrRequestOutput(execution: ProcessExecution) {
    const project = db.projects.find((item) => item.id === execution.projectId);
    const output = deriveProcessOutput(execution);
    if (output) {
      execution.output = output;
      recordProcessOutputDelivery(execution, output.values, output.createdAt);
      execution.outputStatus = "completed";
      execution.status = "completed";
      if (project) completeProjectStage(project, execution.processType);
    } else {
      execution.outputStatus = "awaiting_human";
      execution.status = "awaiting_output";
      if (project) {
        project.stages = { ...project.stages, [execution.processType]: "awaiting_human" };
        project.currentStage = execution.processType;
        project.state = "awaiting_human";
      }
    }
    touchExecution(execution);
    return execution;
  }

  function activateNextBlock(execution: ProcessExecution, completedIndex: number) {
    const nextExecution = execution.blocks[completedIndex + 1];
    const nextBlock = execution.methodSnapshot.blocks[completedIndex + 1];
    if (!nextExecution || !nextBlock) return finalizeOrRequestOutput(execution);

    const now = new Date().toISOString();
    nextExecution.startedAt = now;
    nextExecution.attempt = Math.max(1, nextExecution.attempt ?? 1);
    nextExecution.error = undefined;
    nextExecution.status = nextBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
    execution.status =
      nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
    const project = db.projects.find((item) => item.id === execution.projectId);
    if (project) {
      project.stages = {
        ...project.stages,
        [execution.processType]:
          nextExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
      };
      project.currentStage = execution.processType;
      project.state = project.stages[execution.processType];
    }
    touchExecution(execution);
    return execution;
  }

  function chooseCollectionItem(executionId: string, blockId: string, itemId: string) {
    const execution = db.executions.find((item) => item.id === executionId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    const item = db.libraryItems.find((candidate) => candidate.id === itemId);
    if (
      !execution ||
      !block ||
      !blockExecution ||
      blockExecution.status !== "awaiting_human" ||
      block.type !== "ESCOLHER" ||
      block.operator !== "Humano" ||
      !block.collectionId ||
      item?.collectionId !== block.collectionId
    ) {
      return false;
    }

    const project = db.projects.find((candidate) => candidate.id === execution.projectId);
    if (!project) return false;
    const unresolvedInputs = resolveBlockInputs({
      block,
      execution,
      project,
      projectExecutions: db.executions.filter((candidate) => candidate.projectId === project.id),
      channelExecutions: db.executions.filter(
        (candidate) => candidate.channelId === execution.channelId,
      ),
      channelProjects: db.projects.filter(
        (candidate) => candidate.channelId === execution.channelId,
      ),
      collections: db.libraryCollections.filter(
        (candidate) => candidate.channelId === execution.channelId,
      ),
      libraryItems: db.libraryItems.filter(
        (candidate) => candidate.channelId === execution.channelId,
      ),
    }).filter((candidate) => !candidate.resolved);
    if (unresolvedInputs.length) return false;

    const now = new Date().toISOString();
    blockExecution.values = { selectedItemId: itemId };
    blockExecution.status = "completed";
    blockExecution.completedAt = now;
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    activateNextBlock(execution, execution.blocks.indexOf(blockExecution));
    return true;
  }

  function saveHumanBlockDraft(
    executionId: string,
    blockId: string,
    values: Record<string, RuntimeValue>,
  ) {
    const execution = db.executions.find((item) => item.id === executionId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    if (
      !execution ||
      !blockExecution ||
      execution.status !== "awaiting_human" ||
      blockExecution.status !== "awaiting_human"
    )
      return false;
    blockExecution.values = structuredClone(values);
    blockExecution.status = "awaiting_human";
    execution.status = "awaiting_human";
    touchExecution(execution);
    return true;
  }

  function retryValidatedBlock(
    execution: ProcessExecution,
    validationBlock: ActionBlock,
    validationValues: Record<string, RuntimeValue>,
  ) {
    const targetBlockId = validationBlock.validation?.targetBlockId;
    const targetIndex = execution.methodSnapshot.blocks.findIndex(
      (candidate) => candidate.id === targetBlockId,
    );
    const validationIndex = execution.methodSnapshot.blocks.findIndex(
      (candidate) => candidate.id === validationBlock.id,
    );
    if (targetIndex < 0 || targetIndex >= validationIndex) {
      return {
        ok: false as const,
        message: "O bloco validado não está disponível para nova tentativa.",
      };
    }

    const targetBlock = execution.methodSnapshot.blocks[targetIndex];
    const targetExecution = execution.blocks[targetIndex];
    const maxAttempts = Math.max(1, validationBlock.validation?.maxAttempts ?? 3);
    // Provider retries before the first review must not consume editorial
    // validation rounds. The validator's own attempt tracks those rounds.
    if ((execution.blocks[validationIndex].attempt ?? 1) >= maxAttempts) {
      return {
        ok: false as const,
        message: `O limite de ${maxAttempts} tentativas foi atingido. Revise o método ou aprove manualmente o resultado atual.`,
      };
    }

    const now = new Date().toISOString();
    const retryMode = validationBlock.validation?.retryMode ?? "full";
    const retryConversationContext = pluginConversationFallbackContext(
      targetBlock,
      targetExecution.values,
    );
    const retryConversationAttachments = pluginConversationFallbackAttachments(
      targetExecution.values,
    );
    for (let index = targetIndex; index < execution.blocks.length; index += 1) {
      const blockExecution = execution.blocks[index];
      const preserveConversation = index === targetIndex && retryMode === "conversation_feedback";
      blockExecution.attempt = attemptAfterRetryInvalidation(blockExecution);
      blockExecution.values = {};
      blockExecution.error = undefined;
      blockExecution.logs = undefined;
      blockExecution.completedAt = undefined;
      blockExecution.jobId = undefined;
      blockExecution.progress = undefined;
      blockExecution.progressMessage = undefined;
      blockExecution.retryFeedback = undefined;
      blockExecution.retryMode = undefined;
      blockExecution.retryConversationContext = undefined;
      blockExecution.retryConversationAttachments = undefined;
      if (!preserveConversation) blockExecution.pluginConversation = undefined;
      if (index === targetIndex) {
        blockExecution.startedAt = now;
        blockExecution.retryFeedback = structuredClone(validationValues);
        blockExecution.retryMode = retryMode;
        blockExecution.retryConversationContext = retryConversationContext;
        blockExecution.retryConversationAttachments = retryConversationAttachments;
        blockExecution.status =
          targetBlock.operator === "Humano" ? "awaiting_human" : "blocked_executor";
      } else {
        blockExecution.startedAt = undefined;
        blockExecution.status = "pending";
      }
    }
    invalidateBlockDeliveries(
      execution,
      [
        ...execution.methodSnapshot.blocks.slice(targetIndex).map((item) => item.id),
        "__process_output__",
      ],
      now,
    );

    execution.output = undefined;
    execution.outputStatus = "pending";
    execution.error = undefined;
    execution.status =
      targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
    const project = db.projects.find((candidate) => candidate.id === execution.projectId);
    if (project) {
      project.stages = {
        ...project.stages,
        [execution.processType]:
          targetExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
      };
      project.currentStage = execution.processType;
      project.state = project.stages[execution.processType];
    }
    touchExecution(execution);
    return { ok: true as const, blockName: targetBlock.name ?? targetBlock.type };
  }

  function completeHumanBlock(
    executionId: string,
    blockId: string,
    values: Record<string, RuntimeValue>,
  ):
    | { ok: true; completedProcess: boolean; retriedBlock?: string; pausedValidation?: boolean }
    | { ok: false; missing: string[] } {
    const execution = db.executions.find((item) => item.id === executionId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    if (
      !execution ||
      !block ||
      !blockExecution ||
      block.operator !== "Humano" ||
      block.type === "ESCOLHER" ||
      blockExecution.status !== "awaiting_human"
    ) {
      return { ok: false, missing: ["Executor humano indisponível"] };
    }
    const project = db.projects.find((item) => item.id === execution.projectId);
    if (!project) return { ok: false, missing: ["Projeto não encontrado"] };
    const unresolvedInputs = resolveBlockInputs({
      block,
      execution,
      project,
      projectExecutions: db.executions.filter((item) => item.projectId === execution.projectId),
      channelExecutions: db.executions.filter((item) => item.channelId === execution.channelId),
      channelProjects: db.projects.filter((item) => item.channelId === execution.channelId),
      collections: db.libraryCollections.filter((item) => item.channelId === execution.channelId),
      libraryItems: db.libraryItems.filter((item) => item.channelId === execution.channelId),
    }).filter((item) => !item.resolved);
    if (unresolvedInputs.length) {
      return {
        ok: false,
        missing: unresolvedInputs.map((item) => `Entrada: ${item.input.label}`),
      };
    }
    const missing = (block.outputs ?? [])
      .filter((output) => output.required && isEmptyRuntimeValue(values[output.key]))
      .map((output) => output.label);
    for (const output of block.outputs ?? []) {
      const issue = getPresentationRestrictionIssue(output.presentation, values[output.key]);
      if (issue) missing.push(`${output.label}: ${issue}`);
    }
    for (const output of (block.outputs ?? []).filter((field) => field.type === "records")) {
      const storedRecords = values[output.key];
      const records = Array.isArray(storedRecords) ? storedRecords : [];
      records.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record) || "url" in record)
          return;
        for (const recordField of (output.recordFields ?? []).filter((field) => field.required)) {
          if (isEmptyRuntimeValue(record[recordField.key] as RuntimeValue | undefined)) {
            missing.push(`${output.label} · registro ${index + 1} · ${recordField.label}`);
          }
        }
      });
    }
    if (missing.length) return { ok: false, missing };
    const rejected = (block.outputs ?? []).some(
      (output) => output.type === "approval" && values[output.key] === "rejected",
    );
    if (rejected) {
      blockExecution.values = structuredClone(values);
      recordBlockDeliveries(execution, block, blockExecution.values, "completed");
      if (block.type === "VALIDAR" && block.validation?.onReject === "retry_target") {
        const retry = retryValidatedBlock(execution, block, values);
        if (!retry.ok) return { ok: false, missing: [retry.message] };
        return { ok: true, completedProcess: false, retriedBlock: retry.blockName };
      }
      touchExecution(execution);
      return { ok: true, completedProcess: false, pausedValidation: true };
    }
    const now = new Date().toISOString();
    blockExecution.values = structuredClone(values);
    blockExecution.status = "completed";
    blockExecution.completedAt = now;
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    const updated = activateNextBlock(execution, execution.blocks.indexOf(blockExecution));
    return { ok: true, completedProcess: updated.status === "completed" };
  }

  function completeProcessOutput(
    executionId: string,
    values: Record<string, RuntimeValue>,
  ): { ok: true } | { ok: false; missing: string[] } {
    const execution = db.executions.find((item) => item.id === executionId);
    if (!execution || execution.status !== "awaiting_output") {
      return { ok: false, missing: ["Execução indisponível para receber o resultado final"] };
    }
    const missing = createProcessOutputFields(execution.processType)
      .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
      .map((field) => field.label);
    if (missing.length) return { ok: false, missing };

    execution.output = {
      processType: execution.processType,
      values: structuredClone(values),
      createdAt: new Date().toISOString(),
    };
    recordProcessOutputDelivery(execution, execution.output.values, execution.output.createdAt);
    execution.outputStatus = "completed";
    execution.status = "completed";
    const project = db.projects.find((item) => item.id === execution.projectId);
    if (project) completeProjectStage(project, execution.processType);
    touchExecution(execution);
    return { ok: true };
  }

  function retryBlockExecution(executionId: string, blockId: string) {
    const execution = db.executions.find((item) => item.id === executionId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    if (!execution || !blockExecution || !block || blockExecution.status !== "failed") return false;
    blockExecution.attempt = (blockExecution.attempt ?? 1) + 1;
    invalidateBlockDeliveries(execution, [blockId]);
    blockExecution.error = undefined;
    blockExecution.pluginConversation = undefined;
    blockExecution.status = block.operator === "Humano" ? "awaiting_human" : "blocked_executor";
    execution.error = undefined;
    execution.status =
      blockExecution.status === "awaiting_human" ? "awaiting_human" : "blocked_executor";
    const project = db.projects.find((item) => item.id === execution.projectId);
    if (project) {
      project.stages = {
        ...project.stages,
        [execution.processType]:
          blockExecution.status === "awaiting_human" ? "awaiting_human" : "blocked",
      };
      project.currentStage = execution.processType;
      project.state = project.stages[execution.processType];
    }
    touchExecution(execution);
    return true;
  }

  return {
    startProcessExecution,
    chooseCollectionItem,
    completeHumanBlock,
    completeProcessOutput,
    saveHumanBlockDraft,
    retryBlockExecution,
  };
}
