import assert from "node:assert/strict";
import test from "node:test";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";
import { exportBrowserDiagnostics } from "./browser-diagnostics";
import { appendPluginDiagnostic, createPersistentPluginJob } from "./plugin-job-store";

const request: PluginExecutionRequest = {
  executionId: "exec-v58",
  blockId: "block-v58",
  capabilityId: "browser-capability",
  attempt: 1,
  traceId: "trace-v58",
  inputs: {},
  inputContract: [],
  inputDeliveries: [],
  outputContract: [],
  configuration: { accountProfile: "private-alias", prompt: "private content" },
  settings: {},
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel-v58", name: "Canal", language: "pt-BR", niche: "teste" },
    project: { id: "project-v58", title: "Projeto" },
    processType: "theme",
    block: { type: "CRIAR", name: "Criar", instructions: "" },
  },
  invocation: { mode: "start" as const },
};

test("5.8 exporta somente metadados allowlisted", () => {
  let job = createPersistentPluginJob({
    pluginId: "local.contentflow.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 30_000,
    browserProfile: { profileId: "legacy:profile-a", alias: "private-alias" },
    now: new Date("2026-09-26T12:00:00.000Z"),
  });
  job = appendPluginDiagnostic(job, {
    code: "PROFILE_SWITCH",
    reasonCode: "UPSTREAM_UNAVAILABLE",
    previousProfileId: "legacy:profile-a",
    profileId: "legacy:profile-b",
    attempt: 1,
    at: "2026-09-26T12:00:01.000Z",
  });
  const serialized = JSON.stringify(exportBrowserDiagnostics("exec-v58", [job]));
  assert.match(serialized, /PROFILE_SWITCH/);
  assert.match(serialized, /UPSTREAM_UNAVAILABLE/);
  assert.doesNotMatch(serialized, /private-alias|private content|accountProfile|prompt/i);
});

test("5.8 descarta metadado que tenta carregar caminho ou token", () => {
  const job = createPersistentPluginJob({
    pluginId: "local.contentflow.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 30_000,
  });
  job.diagnosticTimeline = [
    {
      at: "2026-09-26T12:00:00.000Z",
      code: "JOB_FAILED",
      reasonCode: "C:\\Users\\andre\\token=secret",
    },
  ];
  assert.deepEqual(exportBrowserDiagnostics("exec-v58", [job]).jobs[0].timeline, []);
});

test("5.8 não persiste metadado não allowlisted", () => {
  let job = createPersistentPluginJob({
    pluginId: "local.contentflow.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 30_000,
  });
  job = appendPluginDiagnostic(job, {
    code: "JOB_FAILED",
    reasonCode: "token=secret",
    profileId: "C:\\Users\\andre",
  });
  assert.equal(job.diagnosticTimeline?.length, 1);
  assert.deepEqual(job.diagnosticTimeline?.[0].code, "JOB_CREATED");
});

test("5.8 exporta códigos estruturais de reload e restart", () => {
  let job = createPersistentPluginJob({
    pluginId: "local.contentflow.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 30_000,
  });
  job = appendPluginDiagnostic(job, { code: "BRIDGE_CONTROLLED_RELOAD" });
  job = appendPluginDiagnostic(job, { code: "BRIDGE_WORKER_RESTART" });
  assert.deepEqual(
    exportBrowserDiagnostics("exec-v58", [job]).jobs[0].timeline.map((event) => event.code),
    ["JOB_CREATED", "BRIDGE_CONTROLLED_RELOAD", "BRIDGE_WORKER_RESTART"],
  );
});
