import { deriveProcessOutput } from "../src/lib/process-output";
import { captureCollectionSelection } from "../src/lib/strategic-library";
import { applyGeneratedProjectTitle } from "../src/lib/project-title";
import {
  PROCESS_META,
  type ActionBlock,
  type BlockItemRetryScope,
  type Channel,
  type ChannelLibraryItem,
  type ProcessExecution,
  type ProcessId,
  type ProcessMethod,
  type Project,
  type RuntimeValue,
  type StrategicCollection,
} from "../src/lib/domain";
import { captureProjectStrategy, refreshProjectProcessStrategy } from "../src/lib/process-order";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeMethodBlocks,
} from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import { validateRuntimeValueAgainstShape } from "../src/lib/runtime-value-validation";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import { recordBlockDeliveries, recordProcessOutputDelivery } from "../src/lib/deliveries";
import {
  applyCompletedBlockTransition,
  applyCurrentBlockDeliveryAcceptance,
  applyExecutionProjectProjection,
  applyHumanBlockCompletion,
  applyManualBlockRetry,
  applyValidationOutcome,
  createCanonicalProcessExecution,
  validationOutcomeFromValues,
} from "../src/lib/execution-core";

/** Synchronous domain transitions. The caller owns the SQLite transaction. */
export function executionCommands(db: {
  channels: Channel[];
  projects: Project[];
  executions: ProcessExecution[];
  libraryItems: ChannelLibraryItem[];
  libraryCollections: StrategicCollection[];
  adaptMethod?: (
    method: ProcessMethod,
    source: "strategy_snapshot" | "persisted_channel",
  ) => ProcessMethod | undefined;
}) {
  const touchExecution = (execution: ProcessExecution) => {
    execution.updatedAt = new Date().toISOString();
  };
  function startProcessExecution(projectId: string, processType: ProcessId) {
    const existing = db.executions.find(
      (item) => item.projectId === projectId && item.processType === processType,
    );
    if (existing) return existing;
    const project = db.projects.find((item) => item.id === projectId);
    const channel = project ? db.channels.find((item) => item.id === project.channelId) : undefined;
    if (project && channel)
      captureProjectStrategy(
        project,
        channel,
        db.executions.some((item) => item.projectId === projectId),
      );
    const snapshotMethod = project?.strategySnapshot?.methods?.[processType];
    const storedMethod = channel?.methods?.[processType] ?? snapshotMethod;
    const method = storedMethod
      ? db.adaptMethod
        ? db.adaptMethod(storedMethod, channel ? "persisted_channel" : "strategy_snapshot")
        : storedMethod
      : undefined;
    const normalizedMethod = method
      ? {
          contractVersion: method.contractVersion,
          name: method.name || `Método de ${PROCESS_META[processType].label}`,
          imageUrl: method.imageUrl,
          processType,
          blocks: normalizeMethodBlocks(method.blocks, processType),
        }
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
      contractVersion: normalizedMethod.contractVersion,
      name: normalizedMethod.name,
      imageUrl: normalizedMethod.imageUrl,
      processType,
      blocks: normalizedMethod.blocks,
    };
    const creation = createCanonicalProcessExecution({
      executionId: crypto.randomUUID(),
      projectId,
      channelId: channel.id,
      processType,
      methodSnapshot,
      now,
    });
    if (!creation.ok) return undefined;
    const execution = creation.execution;
    db.executions.unshift(execution);
    applyExecutionProjectProjection(project, execution);
    touchExecution(execution);
    return execution;
  }

  function activateNextBlock(execution: ProcessExecution, completedBlockId: string) {
    const now = new Date().toISOString();
    const transition = applyCompletedBlockTransition(execution, completedBlockId, now, {
      deriveProcessOutput,
      recordProcessOutputDelivery,
    });
    if (!transition.ok) {
      throw new Error(
        `Execution Core blocked transition: ${transition.decision.reason} (${transition.diagnostics
          .map((diagnostic) => diagnostic.code)
          .join(", ")})`,
      );
    }

    const project = db.projects.find((item) => item.id === execution.projectId);
    if (project) {
      applyExecutionProjectProjection(project, execution);
      if (execution.status === "completed") applyGeneratedProjectTitle(project, execution);
    }
    touchExecution(execution);
    return execution;
  }

  function blockDeliveryIssues(block: ActionBlock, values: Record<string, RuntimeValue>) {
    const outputs = block.outputs ?? [];
    const outputKeys = new Set(outputs.map((output) => output.key));
    const issues = Object.keys(values)
      .filter((key) => !outputKeys.has(key))
      .map((key) => `Output desconhecido: ${key}`);
    issues.push(
      ...outputs
        .filter((output) => output.required && isEmptyRuntimeValue(values[output.key]))
        .map((output) => output.label),
    );
    for (const output of outputs) {
      const value = values[output.key];
      if (!isEmptyRuntimeValue(value)) {
        const materialIssues = validateRuntimeValueAgainstShape(output.shape, value, output.key);
        if (materialIssues.length) {
          issues.push(`${output.label}: ${materialIssues[0].message}`);
          continue;
        }
      }
      const issue = getPresentationRestrictionIssue(
        output.shape,
        output.presentation,
        values[output.key],
      );
      if (issue) issues.push(`${output.label}: ${issue}`);
    }
    return issues;
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
    const collection = db.libraryCollections.find(
      (candidate) => candidate.id === block.collectionId,
    );
    if (!collection || !item) return false;
    captureCollectionSelection(execution, blockId, item, collection, db.executions);
    blockExecution.values = { selectedItemId: itemId };
    blockExecution.status = "completed";
    blockExecution.completedAt = now;
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    activateNextBlock(execution, blockExecution.blockId);
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
    const missing = blockDeliveryIssues(block, values);
    if (missing.length) return { ok: false, missing };
    const now = new Date().toISOString();
    const completion = applyHumanBlockCompletion(execution, {
      type: "human_block_completed",
      blockId,
      values,
      now,
    });
    if (!completion.ok) {
      return { ok: false, missing: ["Executor humano indisponível"] };
    }
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    if (block.type === "VALIDAR") {
      const validation = applyValidationOutcome(
        execution,
        block.id,
        validationOutcomeFromValues(block, blockExecution.values),
        now,
      );
      if (!validation.ok) {
        touchExecution(execution);
        return { ok: false, missing: [validation.message] };
      }
      if (validation.outcome === "paused") {
        applyExecutionProjectProjection(project, execution);
        touchExecution(execution);
        return { ok: true, completedProcess: false, pausedValidation: true };
      }
      if (validation.outcome === "retry_target") {
        applyExecutionProjectProjection(project, execution);
        touchExecution(execution);
        return {
          ok: true,
          completedProcess: false,
          retriedBlock: validation.targetBlockName,
        };
      }
    }
    const updated = activateNextBlock(execution, blockExecution.blockId);
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
    const outputFields = createProcessOutputFields(execution.processType);
    const outputKeys = new Set(outputFields.map((field) => field.key));
    const missing = Object.keys(values)
      .filter((key) => !outputKeys.has(key))
      .map((key) => `Output desconhecido: ${key}`);
    missing.push(
      ...outputFields
        .filter((field) => field.required && isEmptyRuntimeValue(values[field.key]))
        .map((field) => field.label),
    );
    for (const field of outputFields) {
      const value = values[field.key];
      if (isEmptyRuntimeValue(value)) continue;
      const issues = validateRuntimeValueAgainstShape(field.shape, value, field.key);
      if (issues.length) missing.push(`${field.label}: ${issues[0].message}`);
      const presentationIssue = getPresentationRestrictionIssue(
        field.shape,
        field.presentation,
        value,
      );
      if (presentationIssue) missing.push(`${field.label}: ${presentationIssue}`);
    }
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
    if (project) {
      applyExecutionProjectProjection(project, execution);
      applyGeneratedProjectTitle(project, execution);
    }
    touchExecution(execution);
    return { ok: true };
  }

  function acceptBlockDelivery(
    executionId: string,
    blockId: string,
    recoveredValues: Record<string, RuntimeValue> = {},
  ) {
    const execution = db.executions.find((item) => item.id === executionId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    if (!execution || !blockExecution || !block) {
      return { ok: false as const, missing: ["Esta entrega não pode ser finalizada neste estado"] };
    }
    // Explicitly recovering a missing declared output must never replace preserved work.
    if (
      Object.entries(recoveredValues).some(
        ([key, value]) =>
          !block.outputs?.some((field) => field.key === key) ||
          (blockExecution.values[key] !== undefined &&
            JSON.stringify(blockExecution.values[key]) !== JSON.stringify(value)),
      )
    ) {
      return { ok: false as const, missing: ["Esta entrega não pode ser finalizada neste estado"] };
    }
    const values = { ...blockExecution.values, ...recoveredValues };
    const missing = blockDeliveryIssues(block, values);
    if (missing.length) return { ok: false as const, missing };

    const now = new Date().toISOString();
    const acceptance = applyCurrentBlockDeliveryAcceptance(execution, {
      type: "current_block_delivery_accepted",
      blockId,
      now,
    });
    if (!acceptance.ok) {
      return { ok: false as const, missing: ["Esta entrega não pode ser finalizada neste estado"] };
    }
    blockExecution.values = values;
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    const updated = activateNextBlock(execution, blockExecution.blockId);
    return { ok: true as const, completedProcess: updated.status === "completed" };
  }

  function retryBlockExecution(
    executionId: string,
    blockId: string,
    retryScope: BlockItemRetryScope = "all",
    itemId?: string,
  ) {
    const execution = db.executions.find((item) => item.id === executionId);
    if (!execution) return false;
    const project = db.projects.find((item) => item.id === execution.projectId);
    const channel = db.channels.find((item) => item.id === execution.channelId);
    const storedCurrentMethod = channel?.methods?.[execution.processType];
    const currentMethod = storedCurrentMethod
      ? db.adaptMethod
        ? db.adaptMethod(storedCurrentMethod, "persisted_channel")
        : storedCurrentMethod
      : undefined;
    if (!project) return false;
    if (channel && (!currentMethod || getMethodConfigurationIssue(currentMethod))) return false;
    const result = applyManualBlockRetry(
      execution,
      { type: "manual_block_retry_requested", blockId, scope: retryScope, itemId },
      new Date().toISOString(),
      currentMethod,
    );
    if (!result.ok) return false;
    if (channel) refreshProjectProcessStrategy(project, channel, execution.processType);
    applyExecutionProjectProjection(project, execution);
    touchExecution(execution);
    return true;
  }

  return {
    startProcessExecution,
    chooseCollectionItem,
    completeHumanBlock,
    completeProcessOutput,
    acceptBlockDelivery,
    saveHumanBlockDraft,
    retryBlockExecution,
  };
}
