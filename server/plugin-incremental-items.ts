import { randomUUID } from "node:crypto";
import type {
  BlockExecutionItem,
  BlockExecutionItemStatus,
  HumanFieldType,
  RuntimeValue,
} from "../src/lib/domain";
import type { PluginFieldContract, PluginIncrementalItemUpdate } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";

const MANY_TYPES = new Set<HumanFieldType>(["list", "multiselect", "records", "files"]);
const TERMINAL_STATUSES = new Set<BlockExecutionItemStatus>(["completed", "failed", "cancelled"]);

export function applyPluginIncrementalItemUpdates(input: {
  job: PersistentPluginJob;
  updates: PluginIncrementalItemUpdate[] | undefined;
  outputContract: PluginFieldContract[];
  now?: string;
  createId?: () => string;
}) {
  if (!input.updates?.length) {
    return {
      items: structuredClone(input.job.incrementalItems ?? []),
      values: incrementalItemValues(input.job.incrementalItems, input.outputContract),
    };
  }
  if (input.updates.length > 500) {
    throw new Error("A entrega parcial excede o limite de 500 atualizações de item.");
  }

  const now = input.now ?? new Date().toISOString();
  const createId = input.createId ?? randomUUID;
  const items = structuredClone(input.job.incrementalItems ?? []);
  for (const update of input.updates) {
    validateUpdate(update);
    const batchItemId = activeBatchItemId(input.job);
    const variantKey = update.variantKey ?? update.key;
    const contract = input.outputContract.find((field) => field.portKey === update.outputPort);
    if (!contract) {
      throw new Error(`O item incremental referencia a porta desconhecida ${update.outputPort}.`);
    }
    const existing = items.find(
      (item) =>
        item.pluginCorrelation?.outputPort === update.outputPort &&
        item.pluginCorrelation.batchItemId === batchItemId &&
        (item.pluginCorrelation.variantKey ?? item.pluginCorrelation.key) === variantKey,
    );
    const status = itemStatus(update.state);
    if (existing && TERMINAL_STATUSES.has(existing.status) && existing.status !== status) {
      throw new Error(`O item incremental ${update.key} tentou sair do estado terminal.`);
    }
    if (
      existing?.status === "completed" &&
      status === "completed" &&
      update.value !== undefined &&
      existing.output !== undefined &&
      JSON.stringify(existing.output) !== JSON.stringify(update.value)
    ) {
      throw new Error(`O item incremental ${update.key} mudou depois de concluído.`);
    }
    if (status === "completed" && update.value === undefined && existing?.output === undefined) {
      throw new Error(`O item incremental ${update.key} foi concluído sem valor.`);
    }
    if (update.value !== undefined && !isCompatiblePluginItemValue(contract.type, update.value)) {
      throw new Error(
        `O item incremental ${update.key} é incompatível com a saída ${contract.label}.`,
      );
    }

    const error =
      status === "failed"
        ? (safeDiagnostic(update.message) ?? safeDiagnostic(update.errorCode) ?? "O item falhou.")
        : undefined;
    if (!existing) {
      const itemInput = structuredClone(update.input ?? null);
      const attempt = {
        attempt: input.job.attempt,
        status,
        input: itemInput,
        ...(update.value !== undefined ? { output: structuredClone(update.value) } : {}),
        ...(error ? { error } : {}),
        startedAt: now,
        ...(TERMINAL_STATUSES.has(status) ? { completedAt: now } : {}),
      };
      items.push({
        id: `item:${createId()}`,
        pluginCorrelation: {
          key: update.key,
          ...(batchItemId ? { batchItemId } : {}),
          ...(update.variantKey ? { variantKey } : {}),
          outputPort: update.outputPort,
          outputKey: contract.key,
        },
        order: items.length,
        input: itemInput,
        status,
        attempt: input.job.attempt,
        ...(update.value !== undefined ? { output: structuredClone(update.value) } : {}),
        ...(error ? { error } : {}),
        attempts: [attempt],
      });
      continue;
    }

    const attempts = existing.attempts.map((attempt) =>
      attempt.attempt === input.job.attempt
        ? {
            ...attempt,
            status,
            ...(update.value !== undefined ? { output: structuredClone(update.value) } : {}),
            error,
            ...(TERMINAL_STATUSES.has(status) ? { completedAt: now } : {}),
          }
        : attempt,
    );
    if (!attempts.some((attempt) => attempt.attempt === input.job.attempt)) {
      attempts.push({
        attempt: input.job.attempt,
        status,
        input: structuredClone(update.input ?? existing.input),
        ...(update.value !== undefined ? { output: structuredClone(update.value) } : {}),
        ...(error ? { error } : {}),
        startedAt: now,
        ...(TERMINAL_STATUSES.has(status) ? { completedAt: now } : {}),
      });
    }
    Object.assign(existing, {
      ...(update.input !== undefined ? { input: structuredClone(update.input) } : {}),
      status,
      attempt: input.job.attempt,
      ...(update.value !== undefined ? { output: structuredClone(update.value) } : {}),
      error,
      attempts,
    });
  }

  return { items, values: incrementalItemValues(items, input.outputContract) };
}

export function incrementalItemValues(
  items: BlockExecutionItem[] | undefined,
  outputContract: PluginFieldContract[],
) {
  const values: Record<string, RuntimeValue> = {};
  for (const contract of outputContract) {
    const completed = (items ?? [])
      .filter(
        (item) =>
          item.status === "completed" &&
          item.pluginCorrelation?.outputPort === contract.portKey &&
          item.output !== undefined,
      )
      .sort((left, right) => left.order - right.order)
      .map((item) => structuredClone(item.output!));
    if (!completed.length) continue;
    if (MANY_TYPES.has(contract.type)) {
      values[contract.key] = completed as RuntimeValue;
      continue;
    }
    // O slot preserva todos os resultados observáveis, mas uma saída escalar
    // continua expondo somente o primeiro valor compatível pelo contrato do Bloco.
    values[contract.key] = completed[0] as RuntimeValue;
  }
  return values;
}

function validateUpdate(update: PluginIncrementalItemUpdate) {
  if (!update || typeof update !== "object") {
    throw new Error("A atualização incremental do plugin é inválida.");
  }
  for (const [name, value] of [
    ["key", update.key],
    ["variantKey", update.variantKey],
    ["outputPort", update.outputPort],
  ] as const) {
    if (value === undefined && name === "variantKey") continue;
    if (
      typeof value !== "string" ||
      !value.trim() ||
      value.length > 200 ||
      [...value].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      )
    ) {
      throw new Error(`O campo ${name} da atualização incremental é inválido.`);
    }
  }
  if (!["created", "running", "completed", "failed"].includes(update.state)) {
    throw new Error("O estado da atualização incremental é inválido.");
  }
}

function activeBatchItemId(job: PersistentPluginJob) {
  const orchestration = job.itemOrchestration;
  if (!orchestration) return undefined;
  const itemId = orchestration.itemIds[orchestration.currentIndex];
  if (!itemId) {
    throw new Error("A atualização incremental não possui um item de lote ativo.");
  }
  return itemId;
}

function itemStatus(state: PluginIncrementalItemUpdate["state"]): BlockExecutionItemStatus {
  return {
    created: "pending",
    running: "in_progress",
    completed: "completed",
    failed: "failed",
  }[state] as BlockExecutionItemStatus;
}

function safeDiagnostic(value: string | undefined) {
  if (typeof value !== "string") return undefined;
  const normalized = [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .trim();
  return normalized ? normalized.slice(0, 1_000) : undefined;
}

export function isCompatiblePluginItemValue(type: HumanFieldType, value: unknown) {
  if (value === null || value === undefined) return false;
  if (
    ["text", "textarea", "select", "multiselect", "list", "datetime", "url", "approval"].includes(
      type,
    )
  ) {
    return typeof value === "string";
  }
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (["file", "files", "image", "audio", "video"].includes(type)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const file = value as Record<string, unknown>;
    return (
      typeof file.id === "string" &&
      typeof file.name === "string" &&
      typeof file.mimeType === "string" &&
      typeof file.size === "number" &&
      Number.isFinite(file.size) &&
      typeof file.url === "string"
    );
  }
  if (type === "records") {
    return Boolean(
      value && typeof value === "object" && !Array.isArray(value) && !("url" in value),
    );
  }
  if (type === "thumbnail_layout") {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as { aspectRatio?: unknown }).aspectRatio === "16:9" &&
      Array.isArray((value as { boxes?: unknown }).boxes),
    );
  }
  return false;
}
