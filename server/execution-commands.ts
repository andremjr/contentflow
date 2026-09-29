import { deriveProcessOutput } from "../src/lib/process-output";
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
import {
  captureProjectStrategy,
  completedProcessProgress,
  nextExecutableProcess,
  projectProcessOrder,
} from "../src/lib/process-order";
import {
  createProcessOutputFields,
  getMethodConfigurationIssue,
  isEmptyRuntimeValue,
  normalizeMethodBlocks,
} from "../src/lib/human-workflow";
import { getPresentationRestrictionIssue } from "../src/lib/presentation";
import { resolveBlockInputs } from "../src/lib/runtime-contract";
import {
  invalidateBlockDeliveries,
  recordBlockDeliveries,
  recordProcessOutputDelivery,
} from "../src/lib/deliveries";
import {
  applyCompletedBlockTransition,
  applyHumanBlockCompletion,
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
}) {
  const touchExecution = (execution: ProcessExecution) => {
    execution.updatedAt = new Date().toISOString();
  };
  function completeProjectStage(project: Project, stage: ProcessId) {
    project.stages = { ...project.stages, [stage]: "done" };
    const order = projectProcessOrder(project);
    const next = nextExecutableProcess(order, project.stages, project.runFrom, project.runThrough);
    project.currentStage = next ?? stage;
    project.state = next ? project.stages[next] : "done";
    project.progress = completedProcessProgress(project.stages);
  }

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
    const method = project?.strategySnapshot?.methods[processType] ?? channel?.methods[processType];
    const normalizedMethod = method
      ? {
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
    project.stages = {
      ...project.stages,
      [processType]: execution.status === "awaiting_human" ? "awaiting_human" : "processing",
    };
    project.currentStage = processType;
    project.state = project.stages[processType];
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
      if (transition.outcome === "finish_blocks") {
        if (execution.status === "completed") {
          completeProjectStage(project, execution.processType);
          applyGeneratedProjectTitle(project, execution);
        } else {
          project.stages = { ...project.stages, [execution.processType]: "awaiting_human" };
          project.currentStage = execution.processType;
          project.state = "awaiting_human";
        }
      } else {
        project.stages = {
          ...project.stages,
          [execution.processType]:
            transition.decision.blockStatus === "awaiting_human" ? "awaiting_human" : "blocked",
        };
        project.currentStage = execution.processType;
        project.state = project.stages[execution.processType];
      }
    }
    touchExecution(execution);
    return execution;
  }

  function blockDeliveryIssues(block: ActionBlock, values: Record<string, RuntimeValue>) {
    const issues = (block.outputs ?? [])
      .filter((output) => output.required && isEmptyRuntimeValue(values[output.key]))
      .map((output) => output.label);
    for (const output of block.outputs ?? []) {
      const issue = getPresentationRestrictionIssue(output.presentation, values[output.key]);
      if (issue) issues.push(`${output.label}: ${issue}`);
    }
    for (const output of (block.outputs ?? []).filter((field) => field.type === "records")) {
      const storedRecords = values[output.key];
      const records = Array.isArray(storedRecords) ? storedRecords : [];
      records.forEach((record, index) => {
        if (!record || typeof record !== "object" || Array.isArray(record) || "url" in record)
          return;
        for (const recordField of (output.recordFields ?? []).filter((field) => field.required)) {
          if (isEmptyRuntimeValue(record[recordField.key] as RuntimeValue | undefined)) {
            issues.push(`${output.label} · registro ${index + 1} · ${recordField.label}`);
          }
        }
      });
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
        touchExecution(execution);
        return { ok: true, completedProcess: false, pausedValidation: true };
      }
      if (validation.outcome === "retry_target") {
        project.stages = {
          ...project.stages,
          [execution.processType]:
            execution.status === "awaiting_human" ? "awaiting_human" : "blocked",
        };
        project.currentStage = execution.processType;
        project.state = project.stages[execution.processType];
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
    if (project) {
      completeProjectStage(project, execution.processType);
      applyGeneratedProjectTitle(project, execution);
    }
    touchExecution(execution);
    return { ok: true };
  }

  function acceptBlockDelivery(executionId: string, blockId: string) {
    const execution = db.executions.find((item) => item.id === executionId);
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    if (
      !execution ||
      !blockExecution ||
      !block ||
      !["failed", "cancelled"].includes(blockExecution.status) ||
      block.type === "ESCOLHER" ||
      block.type === "VALIDAR"
    ) {
      return { ok: false as const, missing: ["Esta entrega não pode ser finalizada neste estado"] };
    }
    const missing = blockDeliveryIssues(block, blockExecution.values);
    if (missing.length) return { ok: false as const, missing };

    const now = new Date().toISOString();
    blockExecution.status = "completed";
    blockExecution.completedAt = now;
    blockExecution.error = undefined;
    blockExecution.progress = 1;
    blockExecution.progressMessage = undefined;
    blockExecution.itemProgress = undefined;
    blockExecution.itemRetryScope = undefined;
    recordBlockDeliveries(execution, block, blockExecution.values, "completed", now);
    execution.error = undefined;
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
    const blockExecution = execution?.blocks.find((item) => item.blockId === blockId);
    const block = execution?.methodSnapshot.blocks.find((item) => item.id === blockId);
    if (
      !execution ||
      !blockExecution ||
      !block ||
      (!["failed", "cancelled"].includes(blockExecution.status) &&
        !(retryScope === "selected" && blockExecution.status === "completed"))
    )
      return false;
    blockExecution.attempt = (blockExecution.attempt ?? 1) + 1;
    invalidateBlockDeliveries(execution, [blockId]);
    blockExecution.error = undefined;
    blockExecution.pluginConversation = undefined;
    blockExecution.jobId = undefined;
    blockExecution.traceId = undefined;
    if (retryScope === "selected" && !blockExecution.items?.some((item) => item.id === itemId)) {
      return false;
    }
    blockExecution.itemRetryScope = retryScope;
    blockExecution.itemRetryId = retryScope === "selected" ? itemId : undefined;
    blockExecution.completedAt = undefined;
    if (retryScope === "all") {
      blockExecution.values = {};
      blockExecution.itemProgress = undefined;
      blockExecution.progress = undefined;
    } else if (blockExecution.itemProgress?.total) {
      blockExecution.progress =
        blockExecution.itemProgress.completed / blockExecution.itemProgress.total;
    }
    blockExecution.progressMessage = undefined;
    blockExecution.status =
      block.operator === "Humano" && !block.plugin ? "awaiting_human" : "blocked_executor";
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
    acceptBlockDelivery,
    saveHumanBlockDraft,
    retryBlockExecution,
  };
}
