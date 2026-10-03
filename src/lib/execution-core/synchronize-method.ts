import type { ProcessExecution, ProcessMethod } from "../domain";
import { validateExecutionCoreInvariants } from "./invariants";

/** Method definitions are live. Results, attempts and deliveries remain execution facts. */
export function synchronizeExecutionMethod(
  execution: ProcessExecution,
  method: ProcessMethod,
  now: string,
) {
  if (execution.status === "completed" || execution.status === "cancelled") return false;
  if (method.contractVersion !== 3 || method.processType !== execution.processType) return false;
  if (JSON.stringify(execution.methodSnapshot) === JSON.stringify(method)) return false;
  const byId = new Map(execution.blocks.map((block) => [block.blockId, block]));
  // Never delete performed work or an invocation while synchronizing definitions.
  const removed = execution.blocks.filter(
    (block) => !method.blocks.some((definition) => definition.id === block.blockId),
  );
  if (removed.some((block) => block.status !== "pending" || Object.keys(block.values).length)) {
    throw new Error("Não é possível remover um bloco com trabalho já iniciado nesta execução.");
  }
  const blocks = method.blocks.map(
    (block) =>
      byId.get(block.id) ?? {
        blockId: block.id,
        status: "pending" as const,
        values: {},
        attempt: 1,
      },
  );
  const candidate = { ...execution, methodSnapshot: structuredClone(method), blocks };
  if (validateExecutionCoreInvariants(candidate).length) {
    throw new Error("A nova ordem do Método interrompe um bloco que já está em execução.");
  }
  execution.methodSnapshot = candidate.methodSnapshot;
  execution.blocks = blocks;
  execution.revision = (execution.revision ?? 0) + 1;
  execution.updatedAt = now;
  return true;
}
