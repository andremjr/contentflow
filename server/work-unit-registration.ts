import { randomUUID } from "node:crypto";
import type { BlockExecutionItem } from "../src/lib/domain";
import type { PluginClaimedWorkItem, PluginPlannedWorkItem } from "../src/lib/plugin-contract";
import type { PersistentPluginJob } from "./plugin-job-store";
import { normalizeBlockExecutionItem } from "../src/lib/work-units";

const MAX_DERIVED_ITEMS_PER_REGISTRATION = 1_000;
const MAX_SEMANTIC_KEY_LENGTH = 200;

export function registerDerivedWorkItems(input: {
  job: PersistentPluginJob;
  existingItems: BlockExecutionItem[] | undefined;
  parentItemId: string;
  plannedItems: PluginPlannedWorkItem[];
}) {
  const parent = (input.existingItems ?? []).find((item) => item.id === input.parentItemId);
  if (!parent) {
    throw new Error("O item pai informado pelo plugin não pertence a este bloco.");
  }
  validatePlan(input.plannedItems);

  const registered = new Map(
    (input.job.registeredItems ?? []).map((item) => [
      derivedIdentity(item.parentItemId, item.semanticKey),
      structuredClone(item),
    ]),
  );
  const claimed: PluginClaimedWorkItem[] = [];

  for (const planned of input.plannedItems) {
    const identity = derivedIdentity(input.parentItemId, planned.key);
    const previous = registered.get(identity);
    if (previous) {
      if (
        previous.order !== planned.order ||
        JSON.stringify(previous.input) !== JSON.stringify(planned.input)
      ) {
        throw new Error(
          `O item derivado ${planned.key} mudou de ordem ou entrada dentro da mesma tentativa lógica.`,
        );
      }
    }
    const item =
      previous ??
      normalizeBlockExecutionItem({
        id: randomUUID(),
        kind: "derived",
        parentItemId: input.parentItemId,
        semanticKey: planned.key,
        provenance: { origin: "plugin_derived" },
        order: planned.order,
        input: structuredClone(planned.input),
        status: "pending",
        attempt: input.job.attempt,
        attempts: [],
      });
    registered.set(identity, item);
    claimed.push({
      itemId: item.id,
      index: claimed.length,
      total: input.plannedItems.length,
      order: item.order,
      attempt: item.attempt,
      revision: 0,
      state: "pending",
      input: structuredClone(item.input),
      parentItemId: item.parentItemId,
      ...(parent.provenance?.sourceDeliveryId
        ? { sourceDeliveryId: parent.provenance.sourceDeliveryId }
        : {}),
      ...(parent.sourceItemId ? { sourceItemId: parent.sourceItemId } : {}),
    });
  }

  return {
    job: {
      ...input.job,
      registeredItems: [...registered.values()].sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id),
      ),
    },
    claimed,
  };
}

function validatePlan(plannedItems: PluginPlannedWorkItem[]) {
  if (!Array.isArray(plannedItems) || plannedItems.length === 0) {
    throw new Error("O plano de itens derivados precisa conter ao menos um item.");
  }
  if (plannedItems.length > MAX_DERIVED_ITEMS_PER_REGISTRATION) {
    throw new Error(
      `O plano de itens derivados excede o limite de ${MAX_DERIVED_ITEMS_PER_REGISTRATION} itens.`,
    );
  }
  const keys = new Set<string>();
  for (const planned of plannedItems) {
    if (
      !planned ||
      typeof planned !== "object" ||
      typeof planned.key !== "string" ||
      !planned.key.trim() ||
      planned.key.length > MAX_SEMANTIC_KEY_LENGTH
    ) {
      throw new Error("A chave semântica de um item derivado é inválida.");
    }
    if (!Number.isSafeInteger(planned.order) || planned.order < 0) {
      throw new Error(`A ordem do item derivado ${planned.key} é inválida.`);
    }
    if (planned.input === undefined) {
      throw new Error(`O item derivado ${planned.key} não possui entrada.`);
    }
    if (keys.has(planned.key)) {
      throw new Error(`A chave semântica ${planned.key} foi repetida no mesmo plano.`);
    }
    keys.add(planned.key);
  }
}

function derivedIdentity(parentItemId: string | undefined, semanticKey: string | undefined) {
  return `${parentItemId ?? ""}\u0000${semanticKey ?? ""}`;
}
