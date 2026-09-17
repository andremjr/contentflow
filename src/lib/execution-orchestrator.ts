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
  mode: ExecutionOrchestratorMode;
  /** V1 preserva filas antigas; V2 ativa o planejamento híbrido dos três primeiros processos. */
  strategyVersion?: 1 | 2;
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
  strategyVersion: 1 | 2 = 2,
): ExecutionOrchestratorStep[] {
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
