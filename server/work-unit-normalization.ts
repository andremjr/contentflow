import type { BlockExecution, BlockExecutionItem, RuntimeValue } from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";
import { normalizeBlockExecutionItem, workUnitAttemptIdFor } from "../src/lib/work-units";

/**
 * Converge o estado duplicado de jobs antigos para o modelo persistente do bloco.
 * ProjectDelivery continua sendo a representação da entrega; este normalizador
 * só materializa unidades de trabalho e sua linhagem.
 */
export function normalizeBlockExecutionWorkUnits(
  blockExecution: BlockExecution,
  jobs: PersistentPluginJob[],
) {
  const units = new Map<string, BlockExecutionItem>();
  for (const item of blockExecution.items ?? []) {
    units.set(item.id, normalizeBlockExecutionItem(item));
  }

  for (const job of [...jobs].sort((left, right) => left.attempt - right.attempt)) {
    for (const item of workItemsForJob(job)) mergeUnit(units, item);
    for (const item of job.incrementalItems ?? []) {
      mergeUnit(
        units,
        normalizeBlockExecutionItem(item, {
          kind: "derived",
          parentItemId: item.pluginCorrelation?.batchItemId,
          provenance: { origin: "plugin_derived" },
        }),
      );
    }
    for (const item of job.registeredItems ?? []) {
      mergeUnit(
        units,
        normalizeBlockExecutionItem(item, {
          kind: "derived",
          parentItemId: item.parentItemId,
          provenance: { origin: "plugin_derived" },
        }),
      );
    }
  }

  return [...units.values()].sort((left, right) => {
    if (left.parentItemId && left.parentItemId === right.id) return 1;
    if (right.parentItemId && right.parentItemId === left.id) return -1;
    return left.order - right.order || left.id.localeCompare(right.id);
  });
}

function workItemsForJob(job: PersistentPluginJob) {
  const orchestration = job.itemOrchestration;
  if (!orchestration) return [];
  if (orchestration.workItems?.length) {
    return orchestration.workItems.map((item) =>
      normalizeBlockExecutionItem(item, {
        kind: "list_item",
        provenance: provenanceForBatchItem(job, item.sourceItemId),
      }),
    );
  }

  const source = job.request.inputDeliveries?.find(
    (delivery) => delivery.portKey === orchestration.inputPort,
  );
  return orchestration.itemIds.flatMap((id, order) => {
    const input = orchestration.items[order];
    if (input === undefined) return [];
    const output = orchestration.accumulatedItems?.[order] as RuntimeValue | undefined;
    const status = output === undefined ? "pending" : "completed";
    const attempt = Math.max(1, job.attempt);
    return [
      normalizeBlockExecutionItem(
        {
          id,
          kind: "list_item",
          sourceItemId: source?.itemIds[order],
          order,
          input: structuredClone(input),
          status,
          attempt,
          ...(output !== undefined ? { output: structuredClone(output) } : {}),
          attempts:
            output === undefined
              ? []
              : [
                  {
                    id: workUnitAttemptIdFor(id, attempt),
                    attempt,
                    status: "completed",
                    input: structuredClone(input),
                    output: structuredClone(output),
                  },
                ],
        },
        { provenance: provenanceForBatchItem(job, source?.itemIds[order]) },
      ),
    ];
  });
}

function provenanceForBatchItem(job: PersistentPluginJob, sourceItemId?: string) {
  const source = job.request.inputDeliveries?.find(
    (delivery) => delivery.portKey === job.itemOrchestration?.inputPort,
  );
  return {
    origin: "block_input" as const,
    inputPort: job.itemOrchestration!.inputPort,
    ...(source?.deliveryId ? { sourceDeliveryId: source.deliveryId } : {}),
    ...(sourceItemId ? { sourceDeliveryItemId: sourceItemId } : {}),
  };
}

function mergeUnit(units: Map<string, BlockExecutionItem>, incoming: BlockExecutionItem) {
  const current = units.get(incoming.id);
  if (!current) {
    units.set(incoming.id, incoming);
    return;
  }
  units.set(
    incoming.id,
    normalizeBlockExecutionItem({
      ...incoming,
      ...current,
      kind: current.kind ?? incoming.kind,
      parentItemId: current.parentItemId ?? incoming.parentItemId,
      sourceItemId: current.sourceItemId ?? incoming.sourceItemId,
      provenance: current.provenance ?? incoming.provenance,
      attempts: current.attempts.length ? current.attempts : incoming.attempts,
    }),
  );
}
