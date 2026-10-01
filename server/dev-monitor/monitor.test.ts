import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import net from "node:net";
import { once } from "node:events";
import { DevCollector } from "./collector";
import { eventSchema, sanitizePayload, type Scenario, type CollectedEvent } from "./contract";
import { NoopDevEventSink, devProbe } from "./client";
import { projectEvents } from "./projectors";
import { evaluateChecks } from "./checks";
import {
  evidenceSlice,
  normalizedEntities,
  readTrace,
  verdictFor,
  writeReport,
  diffRuns,
} from "./report";

const scenario: Scenario = {
  name: "test",
  intent: "synthetic infrastructure",
  expectedDomains: ["core"],
  expectedProducers: [{ domain: "core", component: "test" }],
  requiredEventFamilies: ["core:execution.snapshot"],
  timeoutMs: 1000,
};
const source = { domain: "core" as const, component: "test", processId: "test-process" };
function event(seq = 1, status = "completed"): CollectedEvent {
  return {
    schemaVersion: 1,
    eventId: `event-${seq}`,
    runId: "test-run",
    source: { ...source, sourceSeq: seq },
    observedAt: "2026-10-01T00:00:00.000Z",
    kind: "execution.snapshot",
    entity: { type: "execution", id: "execution-uuid" },
    correlation: { executionId: "execution-uuid" },
    payload: { status, outputStatus: "completed", invariantCount: 0 },
    collectorSeq: seq,
    receivedAt: "2026-10-01T00:00:00.000Z",
  };
}
function rawEvent(seq = 1, status = "completed") {
  const { collectorSeq: _, receivedAt: __, ...raw } = event(seq, status);
  return raw;
}
async function fixture(run: (collector: DevCollector, send: (message: object) => void) => void) {
  const directory = mkdtempSync(path.join(tmpdir(), "contentflow-monitor-test-"));
  const collector = new DevCollector("test-run", scenario, directory);
  await collector.start();
  const send = (message: object) =>
    collector.accept({ ...message, runId: collector.runId, token: collector.token });
  try {
    run(collector, send);
  } finally {
    await collector.stop();
    rmSync(directory, { recursive: true, force: true });
  }
}
test("event schema and central payload allowlist reject sensitive content", () => {
  assert.equal(eventSchema.safeParse(rawEvent()).success, true);
  assert.equal(eventSchema.safeParse({ ...rawEvent(), schemaVersion: 2 }).success, false);
  assert.equal(
    eventSchema.safeParse({ ...rawEvent(), correlation: { token: "secret" } }).success,
    false,
  );
  assert.deepEqual(
    sanitizePayload({
      status: "running",
      token: "secret",
      prompt: "private",
      code: "Bearer secret",
    }),
    { status: "running" },
  );
});
test("inactive sink is frozen noop", () => {
  assert.equal(NoopDevEventSink.enabled, false);
  assert.equal(devProbe("core", "test"), NoopDevEventSink);
});
test("registered and flushed producer produces valid trace", async () =>
  fixture((c, send) => {
    send({ type: "register", source });
    send({ type: "event", event: rawEvent() });
    send({ type: "flush", source, finalSeq: 1, dropped: 0 });
    assert.equal(c.integrity().valid, true);
    assert.equal(verdictFor(c.integrity(), evaluateChecks(projectEvents(c.events)), "ok"), "PASS");
  }));
for (const [name, messages] of Object.entries({
  duplicate: [
    { type: "event", event: rawEvent() },
    { type: "event", event: rawEvent() },
  ],
  gap: [{ type: "event", event: rawEvent(2) }],
  reordered: [
    { type: "event", event: rawEvent(2) },
    { type: "event", event: rawEvent(1) },
  ],
  incompatible: [{ type: "event", event: { ...rawEvent(), schemaVersion: 2 } }],
  missingFlush: [{ type: "event", event: rawEvent() }],
  noEvents: [],
  dropped: [
    { type: "event", event: rawEvent() },
    { type: "flush", source, finalSeq: 1, dropped: 1 },
  ],
  unregistered: [
    {
      type: "event",
      event: { ...rawEvent(), source: { ...source, component: "missing", sourceSeq: 1 } },
    },
  ],
}))
  test(`integrity rejects ${name}`, async () =>
    fixture((c, send) => {
      send({ type: "register", source });
      messages.forEach(send);
      assert.equal(c.integrity().valid, false);
      assert.equal(
        verdictFor(c.integrity(), evaluateChecks(projectEvents(c.events)), "ok"),
        "INVALID_INSTRUMENTATION",
      );
    }));
test("projections deterministic; missing terminal state fails invariant", () => {
  const trace = [event(1, "running"), event(2)];
  assert.deepEqual(projectEvents(trace), projectEvents([...trace].reverse()));
  const integrity = {
    valid: true,
    expectedDomains: 1,
    observedDomains: 1,
    droppedEvents: 0,
    sequenceGaps: 0,
    allSourcesFlushed: true,
    problems: [],
  };
  assert.equal(
    verdictFor(integrity, evaluateChecks(projectEvents([event(1, "running")])), "ok"),
    "FAIL_INVARIANT",
  );
  assert.equal(
    verdictFor(integrity, evaluateChecks(projectEvents(trace)), "error"),
    "FAIL_SCENARIO",
  );
  assert.equal(verdictFor(integrity, evaluateChecks(projectEvents(trace)), "timeout"), "TIMEOUT");
  assert.equal(
    verdictFor(integrity, evaluateChecks(projectEvents([])), "ok"),
    "INVALID_INSTRUMENTATION",
  );
});
test("bounded evidence excludes unrelated entities and includes causal parents", () => {
  const parent = { ...event(1), entity: { type: "invocation", id: "parent" } };
  const failure = {
    ...event(2),
    causation: { parentEventId: parent.eventId },
    correlation: { commandId: "command" },
  };
  const unrelated = { ...event(3), correlation: { executionId: "other" } };
  const slice = evidenceSlice([parent, failure, unrelated], {
    checkId: "x",
    version: 1,
    status: "FAIL",
    entity: "x",
    eventIds: [failure.eventId],
  });
  assert.deepEqual(
    slice.events.map((e) => e.eventId),
    [parent.eventId, failure.eventId],
  );
});
test("normalization ignores ephemeral identities and preserves relations", () => {
  const before = projectEvents([event()]);
  const after = projectEvents([
    {
      ...event(),
      entity: { type: "execution", id: "different" },
      correlation: { executionId: "different" },
    },
  ]);
  assert.deepEqual(normalizedEntities(before), normalizedEntities(after));
});
test("diff distinguishes resolved from new invariant violations", async () =>
  fixture((c) => {
    const integrity = {
      valid: true,
      expectedDomains: 1,
      observedDomains: 1,
      droppedEvents: 0,
      sequenceGaps: 0,
      allSourcesFlushed: true,
      problems: [],
    };
    const before = [event(1, "running")];
    const after = [
      {
        ...event(),
        entity: { type: "execution", id: "new-uuid" },
        correlation: { executionId: "new-uuid" },
      },
    ];
    const afterDirectory = path.join(c.directory, "after");
    writeReport({
      directory: c.directory,
      runId: "before",
      scenario,
      events: before,
      integrity,
      functional: "ok",
    });
    writeReport({
      directory: afterDirectory,
      runId: "after",
      scenario,
      events: after,
      integrity,
      functional: "ok",
    });
    const resolved = diffRuns(c.directory, afterDirectory);
    assert.equal(resolved.comparable, true);
    assert.equal(resolved.resolved.length, 1);
    assert.equal(resolved.newViolations.length, 0);
    writeReport({
      directory: afterDirectory,
      runId: "after",
      scenario,
      events: [{ ...after[0], payload: { ...after[0].payload, outputStatus: "pending" } }],
      integrity,
      functional: "ok",
    });
    assert.equal(diffRuns(c.directory, afterDirectory).newViolations.length, 1);
  }));
test("report/diff and persisted truncation detection", async () =>
  fixture((c, send) => {
    send({ type: "register", source });
    send({ type: "event", event: rawEvent(1, "running") });
    send({ type: "flush", source, finalSeq: 1, dropped: 0 });
    writeReport({
      directory: c.directory,
      runId: c.runId,
      scenario,
      events: c.events,
      integrity: c.integrity(),
      functional: "ok",
    });
    assert.equal(diffRuns(c.directory, c.directory).newViolations.length, 0);
    assert.ok(
      readFileSync(path.join(c.directory, "ai-digest.json"), "utf8").includes("FAIL_INVARIANT"),
    );

    writeFileSync(path.join(c.directory, "events.jsonl"), JSON.stringify(event()));
    assert.throws(() => readTrace(c.directory), /TRUNCATED_TRACE/);
  }));

test("authenticated transport rejects truncated frames and wrong token", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "contentflow-monitor-wire-"));
  const collector = new DevCollector("test-run", scenario, directory);
  const env = await collector.start();
  try {
    const socket = net.createConnection({
      host: "127.0.0.1",
      port: Number(env.CONTENTFLOW_DEV_MONITOR_ENDPOINT.split(":")[1]),
    });
    await once(socket, "connect");
    socket.end(
      JSON.stringify({ type: "register", source, runId: "test-run", token: "incorrect" }) +
        '\n{"unfinished":',
    );
    await once(socket, "close");
    assert.equal(collector.integrity().valid, false);
    assert.ok(collector.problems.includes("UNAUTHORIZED_FRAME"));
    assert.ok(collector.problems.includes("TRUNCATED_FRAME"));
  } finally {
    await collector.stop();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("cross-domain checks reject unready foreign instance and duplicate terminal", () => {
  const base = event();
  const command: CollectedEvent = {
    ...base,
    source: { ...base.source, domain: "browser_bridge" },
    entity: { type: "command", id: "command-1" },
    correlation: {
      executionId: "execution-uuid",
      sessionId: "session-1",
      instanceId: "instance-1",
    },
    kind: "command.sent",
    phase: "begin",
    payload: {},
  };
  const trace = [
    command,
    {
      ...command,
      collectorSeq: 2,
      eventId: "terminal-1",
      phase: "end" as const,
      outcome: "ok" as const,
    },
    {
      ...command,
      collectorSeq: 3,
      eventId: "terminal-2",
      phase: "end" as const,
      outcome: "ok" as const,
    },
  ];
  const failures = evaluateChecks(projectEvents(trace))
    .filter((c) => c.status === "FAIL")
    .map((c) => c.checkId);
  assert.ok(failures.includes("BRIDGE.COMMAND.INSTANCE_READY_AND_OWNED"));
  assert.ok(failures.includes("BRIDGE.COMMAND.SESSION_ORIGIN"));
  assert.ok(failures.includes("BRIDGE.COMMAND.NO_DUPLICATE_TERMINAL_RESULT"));
});
test("all five domains use one schema and gaps in required checks invalidate scenario", async () =>
  fixture((c, send) => {
    for (const domain of ["core", "profiles", "browser_bridge", "method", "plugin"] as const) {
      const producer = { ...source, domain };
      send({ type: "register", source: producer });
      send({
        type: "event",
        event: {
          ...rawEvent(),
          eventId: `domain-${domain}`,
          source: { ...producer, sourceSeq: 1 },
        },
      });
      send({ type: "flush", source: producer, finalSeq: 1, dropped: 0 });
    }
    assert.equal(c.events.length, 5);
    const report = writeReport({
      directory: c.directory,
      runId: c.runId,
      scenario: { ...scenario, requiredChecks: ["MISSING.CHECK"] },
      events: c.events,
      integrity: c.integrity(),
      functional: "ok",
    });
    assert.equal(report.verdict, "INVALID_INSTRUMENTATION");
  }));
