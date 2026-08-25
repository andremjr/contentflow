import { PROCESS_ORDER, type UniversalProcess } from "@/lib/domain";

export type ExecutionOrchestratorMode = "end_to_end" | "batch";

export type ExecutionOrchestratorStatus =
  "running" | "awaiting_human" | "blocked" | "failed" | "completed" | "cancelled";

export type ExecutionOrchestratorStep = {
  projectId: string;
  processType: UniversalProcess;
};

export type ExecutionOrchestrator = {
  id: string;
  channelId: string;
  mode: ExecutionOrchestratorMode;
  quantity: number;
  projectPrefix: string;
  projectIds: string[];
  currentStep: number;
  totalSteps: number;
  status: ExecutionOrchestratorStatus;
  currentProjectId?: string;
  currentProcessType?: UniversalProcess;
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
): ExecutionOrchestratorStep[] {
  if (mode === "batch") {
    return PROCESS_ORDER.flatMap((processType) =>
      projectIds.map((projectId) => ({ projectId, processType })),
    );
  }

  return projectIds.flatMap((projectId) =>
    PROCESS_ORDER.map((processType) => ({ projectId, processType })),
  );
}

export function orchestratorProgress(orchestrator: ExecutionOrchestrator) {
  if (orchestrator.totalSteps <= 0) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((orchestrator.currentStep / orchestrator.totalSteps) * 100)),
  );
}
