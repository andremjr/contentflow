import type { ProcessExecution, Project } from "./domain";

/**
 * Promotes the official completed Title output to the visible Project name.
 * Other process outputs and incomplete executions intentionally leave it unchanged.
 */
export function applyGeneratedProjectTitle(project: Project, execution: ProcessExecution): boolean {
  if (
    execution.projectId !== project.id ||
    execution.processType !== "title" ||
    execution.status !== "completed" ||
    execution.outputStatus !== "completed"
  ) {
    return false;
  }

  const value = execution.output?.values.title;
  if (typeof value !== "string") return false;
  const title = value.trim();
  if (!title || title === project.title) return false;

  project.title = title;
  return true;
}

/** Reconciles Projects created before title promotion was introduced. */
export function reconcileGeneratedProjectTitles(
  projects: Project[],
  executions: ProcessExecution[],
): Project[] {
  const changed: Project[] = [];
  for (const project of projects) {
    const titleExecution = executions.find(
      (execution) => execution.projectId === project.id && execution.processType === "title",
    );
    if (titleExecution && applyGeneratedProjectTitle(project, titleExecution)) {
      changed.push(project);
    }
  }
  return changed;
}
