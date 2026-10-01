import { z } from "zod";

export const domains = ["core", "profiles", "browser_bridge", "method", "plugin"] as const;
export type Domain = (typeof domains)[number];
const id = z
  .string()
  .min(1)
  .max(180)
  .regex(/^[A-Za-z0-9._:#/@-]+$/);
export const correlationSchema = z
  .object({
    executionId: id.optional(),
    blockId: id.optional(),
    itemId: id.optional(),
    attemptId: id.optional(),
    profileId: id.optional(),
    instanceId: id.optional(),
    sessionId: id.optional(),
    commandId: id.optional(),
    pluginId: id.optional(),
    pluginJobId: id.optional(),
    invocationId: id.optional(),
    deliveryId: id.optional(),
  })
  .strict();
export const eventSchema = z
  .object({
    schemaVersion: z.literal(1),
    eventId: id,
    runId: id,
    source: z
      .object({
        domain: z.enum(domains),
        component: id,
        processId: id,
        sourceSeq: z.number().int().positive(),
      })
      .strict(),
    observedAt: z.string().datetime(),
    kind: id,
    entity: z.object({ type: id, id }).strict(),
    correlation: correlationSchema,
    causation: z
      .object({ parentEventId: id.optional(), triggerEventId: id.optional() })
      .strict()
      .optional(),
    phase: z.enum(["begin", "point", "end"]).optional(),
    outcome: z.enum(["ok", "error", "cancelled", "timeout", "unknown"]).optional(),
    payload: z
      .record(z.union([z.string().max(180), z.number().finite(), z.boolean(), z.null()]))
      .optional(),
  })
  .strict();
export type DevEvent = z.infer<typeof eventSchema>;
export type EventInput = Omit<
  DevEvent,
  "schemaVersion" | "eventId" | "runId" | "source" | "observedAt"
>;
export type CollectedEvent = DevEvent & { collectorSeq: number; receivedAt: string };
export interface DevEventSink {
  readonly enabled: boolean;
  emit(event: EventInput): void;
}
export type Scenario = {
  name: string;
  intent: string;
  expectedDomains: Domain[];
  requiredEventFamilies: string[];
  expectedProducers: Array<{ domain: Domain; component: string }>;
  timeoutMs: number;
  requiredChecks?: string[];
};
export type Verdict =
  "PASS" | "FAIL_SCENARIO" | "FAIL_INVARIANT" | "INVALID_INSTRUMENTATION" | "TIMEOUT";

// Metadata is allowlisted, never recursively copied from functional objects.
const metadataKeys = new Set([
  "invariantCount",
  "status",
  "previousStatus",
  "attempt",
  "revision",
  "order",
  "ownerId",
  "ownerType",
  "outputCount",
  "requiredOutputCount",
  "missingRequiredOutputs",
  "outputStatus",
  "contractVersion",
  "effect",
  "action",
  "code",
  "terminal",
  "snapshot",
  "expiresAt",
  "sourceItemId",
  "parentItemId",
  "bindingReady",
  "protocolVersion",
  "reconciled",
  "receiptHash",
]);
export function sanitizePayload(payload: EventInput["payload"]) {
  if (!payload) return undefined;
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) =>
        metadataKeys.has(key) &&
        (typeof value !== "string" ||
          (value.length <= 180 && !/Bearer |[\\]|https?:|data:|<[^>]+>/i.test(value))),
    ),
  );
}
