import { randomUUID } from "node:crypto";
import type {
  PluginCapability,
  PluginExecutionRequest,
  PluginInvocation,
} from "../src/lib/plugin-contract";
import type { RuntimeValue } from "../src/lib/domain";
import type { PersistentPluginJob } from "./plugin-job-store";

export function declaredItemOrchestration(
  capability: PluginCapability,
  request: PluginExecutionRequest,
) {
  const policy = capability.execution.itemOrchestration;
  const items = policy ? request.inputs[policy.inputPort] : undefined;
  if (!policy || !Array.isArray(items) || items.length < 2) return undefined;
  return {
    inputPort: policy.inputPort,
    outputPort: policy.outputPort,
    items: structuredClone(items) as RuntimeValue[],
    itemIds: items.map(() => randomUUID()),
    currentIndex: 0,
  } satisfies NonNullable<PersistentPluginJob["itemOrchestration"]>;
}

export function invocationRequestForJob(job: PersistentPluginJob, invocation: PluginInvocation) {
  const configuration = { ...job.request.configuration };
  const fallback = job.profileFallback;
  if (fallback)
    configuration[fallback.configurationKey] = fallback.candidates[fallback.activeIndex];
  const activeProfile = fallback?.candidates[fallback.activeIndex];
  const conversation =
    job.request.conversation?.mode === "reuse" &&
    job.request.conversation.sourceProfile &&
    activeProfile &&
    job.request.conversation.sourceProfile !== activeProfile
      ? {
          mode: "new" as const,
          fallbackContext: job.request.conversation.fallbackContext,
          continuationMessage: job.request.conversation.continuationMessage,
        }
      : job.request.conversation;
  const inputs = { ...job.request.inputs };
  const item = job.itemOrchestration;
  if (item) inputs[item.inputPort] = structuredClone(item.items[item.currentIndex]);
  return {
    ...job.request,
    // A retry explícita é uma nova tentativa lógica. Avançar o número impede
    // que bridges idempotentes reproduzam do cache os comandos da tentativa
    // anterior (por exemplo, "preencher" e "enviar" em uma nova aba vazia).
    attempt: job.request.attempt + job.retryCount,
    invocation,
    configuration,
    conversation,
    inputs,
    batch: item
      ? {
          itemId: item.itemIds[item.currentIndex],
          index: item.currentIndex,
          total: item.items.length,
        }
      : undefined,
  } satisfies PluginExecutionRequest;
}

export function appendOrchestratedOutput(
  current: Record<string, RuntimeValue>,
  incoming: Record<string, RuntimeValue>,
  outputKey: string,
) {
  const next = { ...current, ...incoming };
  const priorItems = Array.isArray(current[outputKey]) ? current[outputKey] : [];
  const incomingItems = Array.isArray(incoming[outputKey])
    ? incoming[outputKey]
    : incoming[outputKey] === undefined
      ? []
      : [incoming[outputKey]];
  next[outputKey] = [...priorItems, ...incomingItems] as RuntimeValue;
  return next;
}
