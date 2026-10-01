import { createHash } from "node:crypto";
import type { ProcessExecution } from "../../src/lib/domain";
import { devProbe, monitorEnabled } from "./client";
import type { PersistentPluginJob } from "../plugin-job-store";
import { validateExecutionCoreInvariants } from "../../src/lib/execution-core/invariants";

export function observeJob(job: PersistentPluginJob) {
  if (!monitorEnabled()) return;
  devProbe("plugin", "plugin-job-persistence").emit({
    kind: "job.snapshot",
    entity: { type: "job", id: job.id },
    correlation: {
      executionId: job.executionId,
      blockId: job.blockId,
      pluginJobId: job.id,
      pluginId: job.pluginId,
      ...(job.browserProfile ? { profileId: job.browserProfile.profileId } : {}),
    },
    payload: { status: job.status, attempt: job.attempt },
  });
}

export function observeExecution(execution: ProcessExecution) {
  if (!monitorEnabled()) return;
  const core = devProbe("core", "execution-persistence");
  const method = devProbe("method", "method-snapshot");
  const correlation = { executionId: execution.id };
  core.emit({
    kind: "execution.snapshot",
    entity: { type: "execution", id: execution.id },
    correlation,
    payload: {
      status: execution.status,
      revision: execution.revision ?? 0,
      outputStatus: execution.outputStatus,
      invariantCount: validateExecutionCoreInvariants(execution).length,
    },
  });
  method.emit({
    kind: "method.snapshot",
    entity: { type: "method", id: execution.id },
    correlation,
    payload: { contractVersion: execution.methodSnapshot.contractVersion },
  });
  for (const block of execution.blocks) {
    const definition = execution.methodSnapshot.blocks.find((b) => b.id === block.blockId);
    const attempt = block.attempt ?? 1;
    const id = `${block.blockId}@${attempt}`;
    const input = {
      kind: "block.snapshot",
      entity: { type: "block_attempt", id },
      correlation: { ...correlation, blockId: block.blockId },
      payload: {
        status: block.status,
        attempt,
        missingRequiredOutputs: (definition?.outputs ?? []).filter(
          (o) => o.required && (block.values[o.key] === undefined || block.values[o.key] === null),
        ).length,
      },
    };
    core.emit(input);
    method.emit(input);
    for (const item of block.items ?? []) {
      core.emit({
        kind: "item.snapshot",
        entity: { type: "item", id: item.id },
        correlation: { ...correlation, blockId: block.blockId, itemId: item.id },
        payload: { status: item.status, order: item.order, attempt: item.attempt },
      });
      for (const itemAttempt of item.attempts)
        if (itemAttempt.id)
          core.emit({
            kind: "attempt.snapshot",
            entity: { type: "attempt", id: itemAttempt.id },
            correlation: {
              ...correlation,
              blockId: block.blockId,
              itemId: item.id,
              attemptId: itemAttempt.id,
            },
            payload: {
              status: itemAttempt.status,
              attempt: itemAttempt.attempt,
              ...(itemAttempt.externalReceipt
                ? {
                    receiptHash: createHash("sha256")
                      .update(itemAttempt.externalReceipt)
                      .digest("hex"),
                  }
                : {}),
            },
          });
    }
  }
  for (const delivery of execution.deliveries ?? [])
    core.emit({
      kind: "delivery.snapshot",
      entity: { type: "delivery", id: delivery.id },
      correlation: { ...correlation, deliveryId: delivery.id },
      payload: { status: delivery.status },
    });
}
