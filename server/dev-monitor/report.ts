import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { eventSchema, type CollectedEvent, type Scenario, type Verdict } from "./contract";
import { evaluateChecks, type CheckResult } from "./checks";
import { projectEvents, type EntityProjection, type ProjectionContext } from "./projectors";
import type { MonitorIntegrity } from "./collector";
import { createHash } from "node:crypto";

export function evidenceSlice(events: CollectedEvent[], check: CheckResult, limit = 64) {
  const selected = new Set(check.eventIds);
  const failures = events.filter((e) => selected.has(e.eventId));
  const correlations = new Set(
    failures.flatMap((e) =>
      Object.entries(e.correlation)
        .filter(([key]) => !["executionId", "pluginId"].includes(key))
        .map(([key, value]) => `${key}:${value}`),
    ),
  );
  const related = events.filter(
    (e) =>
      selected.has(e.eventId) ||
      Object.entries(e.correlation).some(([key, value]) => correlations.has(`${key}:${value}`)),
  );
  const byId = new Map(events.map((event) => [event.eventId, event]));
  const pending = [...related];
  const visited = new Set<string>();
  while (pending.length && visited.size < 1024) {
    const event = pending.pop()!;
    if (visited.has(event.eventId)) continue;
    visited.add(event.eventId);
    for (const parent of [event.causation?.parentEventId, event.causation?.triggerEventId])
      if (parent) {
        selected.add(parent);
        const parentEvent = byId.get(parent);
        if (parentEvent) pending.push(parentEvent);
      }
  }
  const candidates = events.filter((e) => related.includes(e) || selected.has(e.eventId));
  const chosen =
    candidates.length > limit
      ? [...failures.slice(0, Math.floor(limit / 2)), ...candidates.slice(-Math.floor(limit / 2))]
      : candidates;
  return {
    truncated: candidates.length > limit,
    totalRelated: candidates.length,
    events: [...new Map(chosen.map((e) => [e.eventId, e])).values()].sort(
      (a, b) => a.collectorSeq - b.collectorSeq,
    ),
  };
}
export function verdictFor(
  integrity: MonitorIntegrity,
  checks: CheckResult[],
  functional: "ok" | "error" | "timeout",
): Verdict {
  if (!integrity.valid) return "INVALID_INSTRUMENTATION";
  if (functional === "timeout") return "TIMEOUT";
  if (functional === "error") return "FAIL_SCENARIO";
  if (checks.some((c) => c.status === "FAIL")) return "FAIL_INVARIANT";
  if (!checks.some((c) => c.status === "PASS")) return "INVALID_INSTRUMENTATION";
  return "PASS";
}
export function writeReport(input: {
  directory: string;
  runId: string;
  scenario: Scenario;
  events: CollectedEvent[];
  integrity: MonitorIntegrity;
  functional: "ok" | "error" | "timeout";
  commit?: string;
  startedAt?: string;
}) {
  const projections = projectEvents(input.events);
  const checks = evaluateChecks(projections);
  for (const checkId of input.scenario.requiredChecks ?? []) {
    if (!checks.some((c) => c.checkId === checkId && c.status !== "NOT_OBSERVED")) {
      input.integrity = {
        ...input.integrity,
        valid: false,
        problems: [...input.integrity.problems, `MISSING_REQUIRED_CHECK:${checkId}`],
      };
    }
  }
  mkdirSync(path.join(input.directory, "evidence"), { recursive: true });
  for (const [index, check] of checks.entries())
    if (check.status === "FAIL") {
      check.evidence = `evidence/${check.checkId}-${index}.json`;
      writeFileSync(
        path.join(input.directory, check.evidence),
        JSON.stringify(evidenceSlice(input.events, check), null, 2),
      );
    }
  const digest = {
    runId: input.runId,
    scenario: input.scenario.name,
    verdict: verdictFor(input.integrity, checks, input.functional),
    monitorIntegrity: input.integrity,
    functional: input.functional,
    checks: {
      passed: checks.filter((c) => c.status === "PASS").length,
      failed: checks.filter((c) => c.status === "FAIL").length,
      notObserved: checks.filter((c) => c.status === "NOT_OBSERVED").length,
    },
    failures: checks
      .filter((c) => c.status === "FAIL")
      .slice(0, 20)
      .map(({ checkId, entity, evidence }) => ({ checkId, entity, evidence })),
    failuresTruncated: checks.filter((c) => c.status === "FAIL").length > 20,
  };
  const files = {
    "run.json": {
      runId: input.runId,
      scenario: input.scenario,
      schemaVersion: 1,
      complete: true,
      startedAt: input.startedAt ?? input.events[0]?.observedAt,
      finishedAt: new Date().toISOString(),
      eventCount: input.events.length,
      traceHash: createHash("sha256")
        .update(input.events.map((event) => JSON.stringify(event) + "\n").join(""))
        .digest("hex"),
      commit: input.commit,
      monitorIntegrity: input.integrity,
    },
    "projections.json": projections,
    "checks.json": checks,
    "ai-digest.json": digest,
  };
  for (const [file, content] of Object.entries(files))
    writeFileSync(path.join(input.directory, file), JSON.stringify(content, null, 2) + "\n");
  return digest;
}
// Normalize by first observation, preserving structural parent/correlation topology.
export function normalizedEntities(context: ProjectionContext) {
  const ids = new Map<string, string>();
  const counts = new Map<string, number>();
  function normalize(type: string, id: string) {
    const key = `${type}:${id}`;
    if (!ids.has(key)) {
      const count = (counts.get(type) ?? 0) + 1;
      counts.set(type, count);
      ids.set(key, `${type}#${count}`);
    }
    return ids.get(key)!;
  }
  return [...context.entities]
    .sort((a, b) => a.firstSeq - b.firstSeq || a.key.localeCompare(b.key))
    .map((e) => ({
      domain: e.domain,
      type: e.type,
      id: normalize(e.type, e.id),
      status: e.status,
      correlation: Object.fromEntries(
        Object.entries(e.correlation).map(([key, value]) => [key, normalize(key, value!)]),
      ),
    }));
}
export function diffRuns(beforeDirectory: string, afterDirectory: string) {
  const read = (directory: string, file: string) =>
    JSON.parse(readFileSync(path.join(directory, file), "utf8"));
  const before = read(beforeDirectory, "ai-digest.json");
  const after = read(afterDirectory, "ai-digest.json");
  const signatures = (directory: string) => {
    const context = read(directory, "projections.json") as ProjectionContext;
    const normalized = normalizedEntities(context);
    const ordered = [...context.entities].sort(
      (a, b) => a.firstSeq - b.firstSeq || a.key.localeCompare(b.key),
    );
    return new Set(
      (read(directory, "checks.json") as CheckResult[])
        .filter((c) => c.status === "FAIL")
        .map((c) => {
          const index = ordered.findIndex((e) => e.key === c.entity);
          return `${c.checkId}:${JSON.stringify(normalized[index])}`;
        }),
    );
  };
  const oldFailures = signatures(beforeDirectory);
  const newFailures = signatures(afterDirectory);
  return {
    comparable:
      before.scenario === after.scenario &&
      before.monitorIntegrity.valid &&
      after.monitorIntegrity.valid,
    before: { verdict: before.verdict, checks: before.checks },
    after: { verdict: after.verdict, checks: after.checks },
    resolved: [...oldFailures].filter((s) => !newFailures.has(s)).sort(),
    newViolations: [...newFailures].filter((s) => !oldFailures.has(s)).sort(),
  };
}
export function readTrace(directory: string): CollectedEvent[] {
  const raw = readFileSync(path.join(directory, "events.jsonl"), "utf8");
  if (!raw.endsWith("\n") || !raw.length) throw new Error("TRUNCATED_TRACE");
  return raw
    .trimEnd()
    .split("\n")
    .map((line, index) => {
      const event = JSON.parse(line);
      const { collectorSeq, receivedAt, ...source } = event;
      eventSchema.parse(source);
      if (collectorSeq !== index + 1 || !Number.isFinite(Date.parse(receivedAt)))
        throw new Error("INVALID_COLLECTOR_SEQUENCE");
      return event;
    });
}
