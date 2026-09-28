import type {
  BlockExecutionItem,
  BlockExecutionItemAttempt,
  BlockExecutionItemKind,
  BlockExecutionItemProvenance,
} from "./domain";

export function workUnitAttemptIdFor(itemId: string, attempt: number) {
  return `work-unit-attempt:${encodeURIComponent(itemId)}:${attempt}`;
}

export function normalizeBlockExecutionItem(
  item: BlockExecutionItem,
  defaults: {
    kind?: BlockExecutionItemKind;
    provenance?: BlockExecutionItemProvenance;
    parentItemId?: string;
  } = {},
): BlockExecutionItem {
  const parentItemId =
    item.parentItemId ?? defaults.parentItemId ?? item.pluginCorrelation?.batchItemId;
  const kind = item.kind ?? defaults.kind ?? (item.pluginCorrelation ? "derived" : "list_item");
  const provenance = item.provenance ??
    defaults.provenance ?? {
      origin: item.pluginCorrelation ? "plugin_derived" : "legacy_job",
      ...(item.sourceItemId ? { sourceDeliveryItemId: item.sourceItemId } : {}),
    };
  const attempts = item.attempts.map((attempt) => normalizeAttempt(item.id, attempt));
  return {
    ...structuredClone(item),
    kind,
    ...(parentItemId ? { parentItemId } : {}),
    provenance: structuredClone(provenance),
    attempts,
  };
}

export function normalizeBlockExecutionItems(items: BlockExecutionItem[] | undefined) {
  return (items ?? []).map((item) => normalizeBlockExecutionItem(item));
}

function normalizeAttempt(
  itemId: string,
  attempt: BlockExecutionItemAttempt,
): BlockExecutionItemAttempt {
  return {
    ...structuredClone(attempt),
    id: attempt.id ?? workUnitAttemptIdFor(itemId, attempt.attempt),
  };
}
