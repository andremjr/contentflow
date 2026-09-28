import { randomUUID } from "node:crypto";
import type { BlockExecutionItem, BlockExecutionItemValue } from "../src/lib/domain";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { normalizeBlockExecutionItem } from "../src/lib/work-units";

/**
 * Materializa, antes do executor, toda entrada efetivamente recebida pelo plugin.
 *
 * A identidade vem do núcleo. A ordem descreve somente a posição dentro da
 * porta e nunca é usada como identidade. Quando a entrada veio de uma delivery,
 * o ID do item de origem é preservado em sourceItemId.
 */
export function materializeReceivedInputWorkUnits(
  request: Pick<PluginExecutionRequest, "inputs" | "inputDeliveries" | "attempt">,
  previousItems: BlockExecutionItem[] | undefined,
) {
  const previous = previousItems ?? [];
  const claimedPreviousIds = new Set<string>();
  const materialized: BlockExecutionItem[] = [];

  for (const [inputPort, receivedValue] of Object.entries(request.inputs)) {
    const values = Array.isArray(receivedValue) ? receivedValue : [receivedValue];
    const kind = Array.isArray(receivedValue) ? ("list_item" as const) : ("scalar" as const);
    const deliveryCandidates = (request.inputDeliveries ?? []).filter(
      (delivery) => delivery.portKey === inputPort,
    );
    const delivery = deliveryCandidates.length === 1 ? deliveryCandidates[0] : undefined;
    const alignedSourceItemIds =
      delivery?.itemIds.length === values.length ? delivery.itemIds : undefined;

    values.forEach((value, order) => {
      const sourceItemId = alignedSourceItemIds?.[order];
      const reusable = findReusableInputUnit({
        previous,
        claimedPreviousIds,
        inputPort,
        kind,
        value: value as BlockExecutionItemValue,
        sourceDeliveryId: delivery?.deliveryId,
        sourceItemId,
      });
      const id = reusable?.id ?? randomUUID();
      if (reusable) claimedPreviousIds.add(reusable.id);

      materialized.push(
        normalizeBlockExecutionItem({
          id,
          kind,
          ...(sourceItemId ? { sourceItemId } : {}),
          provenance: {
            origin: "block_input",
            inputPort,
            ...(delivery?.deliveryId ? { sourceDeliveryId: delivery.deliveryId } : {}),
            ...(sourceItemId ? { sourceDeliveryItemId: sourceItemId } : {}),
          },
          order,
          input: structuredClone(value) as BlockExecutionItemValue,
          status: "pending",
          attempt: request.attempt,
          attempts: reusable?.attempts ? structuredClone(reusable.attempts) : [],
        }),
      );
    });
  }

  return materialized;
}

function findReusableInputUnit(input: {
  previous: BlockExecutionItem[];
  claimedPreviousIds: ReadonlySet<string>;
  inputPort: string;
  kind: "scalar" | "list_item";
  value: BlockExecutionItemValue;
  sourceDeliveryId?: string;
  sourceItemId?: string;
}) {
  const candidates = input.previous.filter(
    (item) =>
      !input.claimedPreviousIds.has(item.id) &&
      !item.parentItemId &&
      item.provenance?.origin === "block_input" &&
      item.provenance.inputPort === input.inputPort &&
      (item.kind ?? "list_item") === input.kind,
  );

  if (input.sourceItemId) {
    const bySourceIdentity = candidates.find(
      (item) =>
        item.sourceItemId === input.sourceItemId &&
        (!input.sourceDeliveryId ||
          !item.provenance?.sourceDeliveryId ||
          item.provenance.sourceDeliveryId === input.sourceDeliveryId),
    );
    if (bySourceIdentity) return bySourceIdentity;
  }

  return candidates.find((item) => JSON.stringify(item.input) === JSON.stringify(input.value));
}
