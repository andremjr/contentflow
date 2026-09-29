import type { ProcessExecution, ProcessExecutionStatus, ProcessState, Project } from "../domain";
import {
  completedProcessProgress,
  nextExecutableProcess,
  projectProcessOrder,
} from "../process-order";

const EXECUTION_PROJECT_STATE: Record<ProcessExecutionStatus, ProcessState> = {
  not_started: "not_started",
  running: "processing",
  awaiting_human: "awaiting_human",
  awaiting_output: "awaiting_human",
  blocked_executor: "blocked",
  failed: "error",
  completed: "done",
  cancelled: "not_started",
};

/** Mutates only the Project fields derived from the current ProcessExecution state. */
export function applyExecutionProjectProjection(
  project: Project,
  execution: ProcessExecution,
): void {
  const projectedState = EXECUTION_PROJECT_STATE[execution.status];
  project.stages = {
    ...project.stages,
    [execution.processType]: projectedState,
  };

  if (execution.status !== "completed") {
    project.currentStage = execution.processType;
    project.state = projectedState;
    return;
  }

  const next = nextExecutableProcess(
    projectProcessOrder(project),
    project.stages,
    project.runFrom,
    project.runThrough,
  );
  project.currentStage = next ?? execution.processType;
  project.state = next ? project.stages[next] : "done";
  project.progress = completedProcessProgress(project.stages);
}
