import type { EntityProjection, ProjectionContext } from "./projectors";

export type CheckResult = {
  checkId: string;
  version: number;
  status: "PASS" | "FAIL" | "NOT_OBSERVED";
  entity: string;
  eventIds: string[];
  reason?: string;
  evidence?: string;
};
export interface DevCheck {
  id: string;
  version: number;
  reference: string;
  entityType: string;
  domain: string;
  evaluate(entity: EntityProjection, context: ProjectionContext): boolean;
}
const terminal = new Set(["completed", "failed", "cancelled", "abandoned"]);
const ref = "docs/reliability-program/01-TARGET-ARCHITECTURE.md";
export const checkRegistry: DevCheck[] = [
  {
    id: "CORE.EXECUTION.STRUCTURAL_INVARIANTS",
    version: 1,
    reference: `${ref}#2`,
    domain: "core",
    entityType: "execution",
    evaluate: (e) => e.metadata.invariantCount === 0,
  },
  {
    id: "CORE.EXECUTION.HAS_TERMINAL_STATE",
    version: 1,
    reference: `${ref}#3`,
    domain: "core",
    entityType: "execution",
    evaluate: (e) => terminal.has(e.status ?? ""),
  },
  {
    id: "CORE.BLOCK.HAS_TERMINAL_STATE",
    version: 1,
    reference: `${ref}#3`,
    domain: "core",
    entityType: "block_attempt",
    evaluate: (e) => terminal.has(e.status ?? ""),
  },
  {
    id: "CORE.ITEM.HAS_TERMINAL_STATE",
    version: 1,
    reference: `${ref}#9`,
    domain: "core",
    entityType: "item",
    evaluate: (e) => terminal.has(e.status ?? ""),
  },
  {
    id: "CORE.ATTEMPT.HAS_TERMINAL_STATE",
    version: 1,
    reference: `${ref}#9`,
    domain: "core",
    entityType: "attempt",
    evaluate: (e) => terminal.has(e.status ?? ""),
  },
  {
    id: "CORE.BLOCK.REQUIRED_OUTPUTS",
    version: 1,
    reference: "docs/CONTENT_CONTRACT.md",
    domain: "core",
    entityType: "block_attempt",
    evaluate: (e) => e.status !== "completed" || e.metadata.missingRequiredOutputs === 0,
  },
  {
    id: "CORE.EXECUTION.OFFICIAL_OUTPUT",
    version: 1,
    reference: "docs/ARCHITECTURE.md#11",
    domain: "core",
    entityType: "execution",
    evaluate: (e) => e.status !== "completed" || e.metadata.outputStatus === "completed",
  },
  {
    id: "METHOD.BLOCK.CORE_EXECUTION_MATCH",
    version: 1,
    reference: `${ref}#1`,
    domain: "method",
    entityType: "block_attempt",
    evaluate: (e, c) =>
      c.entities.some(
        (other) =>
          other.domain === "core" &&
          other.type === e.type &&
          other.id === e.id &&
          other.correlation.executionId === e.correlation.executionId &&
          other.correlation.blockId === e.correlation.blockId &&
          other.status === e.status,
      ),
  },
  {
    id: "METHOD.SNAPSHOT.CANONICAL",
    version: 1,
    reference: "docs/CONTENT_CONTRACT.md",
    domain: "method",
    entityType: "method",
    evaluate: (e) => e.metadata.contractVersion === 3,
  },
  {
    id: "PLUGIN.INVOCATION.HAS_TERMINAL_RESULT",
    version: 1,
    reference: `${ref}#4`,
    domain: "plugin",
    entityType: "invocation",
    evaluate: (e) => e.begins > 0 && e.ends === e.begins,
  },
  {
    id: "PLUGIN.INVOCATION.CORE_ORIGIN",
    version: 1,
    reference: `${ref}#9`,
    domain: "plugin",
    entityType: "invocation",
    evaluate: (e) =>
      Boolean(
        e.correlation.executionId &&
        e.correlation.blockId &&
        e.correlation.pluginId &&
        e.correlation.invocationId,
      ),
  },
  {
    id: "PLUGIN.JOB.HAS_TERMINAL_STATE",
    version: 1,
    reference: `${ref}#6`,
    domain: "plugin",
    entityType: "job",
    evaluate: (e) => terminal.has(e.status ?? ""),
  },
  {
    id: "PROFILE.LEASE.RELEASED",
    version: 1,
    reference: `${ref}#14`,
    domain: "profiles",
    entityType: "lease",
    evaluate: (e) => e.status === "released",
  },
  {
    id: "PROFILE.LEASE.EXCLUSIVE",
    version: 1,
    reference: "docs/ARCHITECTURE.md#13",
    domain: "profiles",
    entityType: "lease",
    evaluate: (e, c) =>
      !c.entities.some(
        (other) =>
          other !== e &&
          other.domain === "profiles" &&
          other.type === "lease" &&
          other.correlation.profileId === e.correlation.profileId &&
          other.firstSeq < e.firstSeq &&
          (other.status !== "released" || other.lastSeq > e.firstSeq),
      ),
  },
  {
    id: "RUN.NO_DANGLING_INSTANCE",
    version: 1,
    reference: `${ref}#14`,
    domain: "profiles",
    entityType: "instance",
    evaluate: (e) => e.status === "closed" || e.status === "crashed",
  },
  {
    id: "PROFILE.INSTANCE.REQUIRES_VALID_LEASE",
    version: 1,
    reference: `${ref}#14`,
    domain: "profiles",
    entityType: "instance",
    evaluate: (e, c) =>
      c.entities.some(
        (lease) =>
          lease.type === "lease" &&
          lease.correlation.profileId === e.correlation.profileId &&
          lease.firstSeq < e.firstSeq &&
          lease.lastSeq >= e.lastSeq,
      ),
  },
  {
    id: "BRIDGE.COMMAND.HAS_TERMINAL_RESULT",
    version: 1,
    reference: "docs/ARCHITECTURE.md#12",
    domain: "browser_bridge",
    entityType: "command",
    evaluate: (e) => e.begins > 0 && e.ends === e.begins,
  },
  {
    id: "BRIDGE.COMMAND.NO_DUPLICATE_TERMINAL_RESULT",
    version: 1,
    reference: "docs/ARCHITECTURE.md#12",
    domain: "browser_bridge",
    entityType: "command",
    evaluate: (e) => e.ends <= e.begins,
  },
  {
    id: "BRIDGE.COMMAND.INSTANCE_READY_AND_OWNED",
    version: 1,
    reference: "docs/ARCHITECTURE.md#12",
    domain: "browser_bridge",
    entityType: "command",
    evaluate: (e, c) =>
      c.entities.some(
        (instance) =>
          instance.type === "instance" &&
          instance.correlation.instanceId === e.correlation.instanceId &&
          instance.correlation.executionId === e.correlation.executionId &&
          instance.readySeq !== undefined &&
          instance.readySeq < e.firstSeq &&
          (instance.closedSeq === undefined || instance.closedSeq > e.lastSeq),
      ),
  },
  {
    id: "BRIDGE.COMMAND.SESSION_ORIGIN",
    version: 1,
    reference: "docs/ARCHITECTURE.md#12",
    domain: "browser_bridge",
    entityType: "command",
    evaluate: (e, c) =>
      c.entities.some(
        (s) =>
          s.type === "bridge_session" &&
          s.correlation.sessionId === e.correlation.sessionId &&
          s.correlation.executionId === e.correlation.executionId &&
          s.firstSeq < e.firstSeq,
      ),
  },
];
export function evaluateChecks(context: ProjectionContext): CheckResult[] {
  return checkRegistry.flatMap<CheckResult>((check) => {
    const entities = context.entities.filter(
      (e) => e.domain === check.domain && e.type === check.entityType,
    );
    if (!entities.length)
      return [
        {
          checkId: check.id,
          version: check.version,
          status: "NOT_OBSERVED" as const,
          entity: "",
          eventIds: [],
        },
      ];
    return entities.map((entity) => {
      const passed = check.evaluate(entity, context);
      return {
        checkId: check.id,
        version: check.version,
        status: passed ? ("PASS" as const) : ("FAIL" as const),
        entity: entity.key,
        eventIds: entity.eventIds,
        ...(passed ? {} : { reason: check.reference }),
      };
    });
  });
}
