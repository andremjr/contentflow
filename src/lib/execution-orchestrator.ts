import { PROCESS_ORDER, type UniversalProcess } from "@/lib/domain";

export type ExecutionOrchestratorMode = "end_to_end" | "batch";

export type ExecutionOrchestratorStatus =
  "running" | "awaiting_human" | "blocked" | "failed" | "completed" | "cancelled";

export const AGGREGATED_BATCH_PROCESSES = [
  "theme",
  "title",
  "thumbnail",
] as const satisfies readonly UniversalProcess[];

export type ExecutionOrchestratorProjectStep = {
  kind?: "project";
  projectId: string;
  processType: UniversalProcess;
};

export type ExecutionOrchestratorAggregateStep = {
  kind: "aggregate";
  projectIds: string[];
  processType: (typeof AGGREGATED_BATCH_PROCESSES)[number];
};

export type ExecutionOrchestratorStep =
  ExecutionOrchestratorProjectStep | ExecutionOrchestratorAggregateStep;

export type ExecutionOrchestrator = {
  id: string;
  channelId: string;
  /** Groups per-channel queues created by one global production request. */
  globalBatchId?: string;
  globalChannelCount?: number;
  mode: ExecutionOrchestratorMode;
  /** V1/V2 preserve historical queues; V3/V4 use a frozen project sequence. */
  strategyVersion?: 1 | 2 | 3 | 4;
  processOrder?: UniversalProcess[];
  /** V4 persists the exact hybrid plan so restart never reinterprets the queue. */
  plannedSteps?: ExecutionOrchestratorStep[];
  quantity: number;
  projectPrefix: string;
  projectIds: string[];
  currentStep: number;
  totalSteps: number;
  status: ExecutionOrchestratorStatus;
  currentProjectId?: string;
  currentProcessType?: UniversalProcess;
  /** Posição dentro de uma etapa agregada do lote híbrido. */
  currentBatchItem?: number;
  currentBatchTotal?: number;
  message?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  stoppedAt?: string;
};

export const ACTIVE_ORCHESTRATOR_STATUSES = new Set<ExecutionOrchestratorStatus>([
  "running",
  "awaiting_human",
  "blocked",
]);

export const STOPPABLE_ORCHESTRATOR_STATUSES = new Set<ExecutionOrchestratorStatus>([
  ...ACTIVE_ORCHESTRATOR_STATUSES,
  "failed",
]);

export function buildOrchestratorSteps(
  projectIds: string[],
  mode: ExecutionOrchestratorMode,
  strategyVersion: 1 | 2 | 3 | 4 = 2,
  order: readonly UniversalProcess[] = PROCESS_ORDER,
): ExecutionOrchestratorStep[] {
  if (strategyVersion === 3 && mode === "end_to_end")
    return projectIds.flatMap((projectId) =>
      order.map((processType) => ({ projectId, processType })),
    );
  if (mode === "batch" && strategyVersion === 2) {
    const aggregateSteps = AGGREGATED_BATCH_PROCESSES.map(
      (processType) =>
        ({
          kind: "aggregate",
          projectIds: [...projectIds],
          processType,
        }) satisfies ExecutionOrchestratorAggregateStep,
    );
    const individualProcesses = PROCESS_ORDER.filter(
      (processType) => !AGGREGATED_BATCH_PROCESSES.includes(processType as never),
    );
    return [
      ...aggregateSteps,
      ...individualProcesses.flatMap((processType) =>
        projectIds.map((projectId) => ({ projectId, processType })),
      ),
    ];
  }
  if (mode === "batch" && strategyVersion === 4) {
    const steps: ExecutionOrchestratorStep[] = [];
    for (const processType of order) {
      if (AGGREGATED_BATCH_PROCESSES.includes(processType as never)) {
        steps.push({
          kind: "aggregate",
          projectIds: [...projectIds],
          processType: processType as (typeof AGGREGATED_BATCH_PROCESSES)[number],
        });
        continue;
      }
      steps.push(...projectIds.map((projectId) => ({ projectId, processType })));
    }
    return steps;
  }

  if (mode === "batch") {
    return PROCESS_ORDER.flatMap((processType) =>
      projectIds.map((projectId) => ({ projectId, processType })),
    );
  }

  return projectIds.flatMap((projectId) =>
    PROCESS_ORDER.map((processType) => ({ projectId, processType })),
  );
}

export function isAggregateOrchestratorStep(
  step: ExecutionOrchestratorStep,
): step is ExecutionOrchestratorAggregateStep {
  return step.kind === "aggregate";
}

export function orchestratorProgress(orchestrator: ExecutionOrchestrator) {
  if (orchestrator.totalSteps <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((orchestrator.currentStep / orchestrator.totalSteps) * 100)),
  );
}
