import assert from "node:assert/strict";
import test from "node:test";
import { createPersistentPluginJob } from "./plugin-job-store";
import type { PluginExecutionRequest } from "../src/lib/plugin-contract";

const request: PluginExecutionRequest = {
  executionId: "execution-v44",
  traceId: "trace-v44",
  blockId: "block-v44",
  capabilityId: "browser",
  attempt: 1,
  invocation: { mode: "start" },
  configuration: { accountProfile: "principal" },
  settings: {},
  inputs: {},
  inputContract: [],
  outputContract: [],
  context: {
    locale: "pt-BR",
    timeZone: "America/Sao_Paulo",
    channel: { id: "channel", name: "", language: "", niche: "" },
    project: { id: "project", title: "" },
    processType: "script",
    block: { type: "CRIAR", name: "Criar", instructions: "" },
  },
};

test("pacote 4.4 persiste profileId opaco e alias no snapshot do job", () => {
  const job = createPersistentPluginJob({
    pluginId: "plugin.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    browserProfile: { profileId: "profile-opaque", alias: "principal" },
  });
  assert.deepEqual(job.browserProfile, { profileId: "profile-opaque", alias: "principal" });
  assert.equal(JSON.stringify(job.request).includes("profile-opaque"), false);
});

test("pacote 4.4 mantém a identidade física ao atualizar retries do mesmo job", () => {
  const job = createPersistentPluginJob({
    pluginId: "plugin.browser",
    pluginVersion: "1.0.0",
    request,
    timeoutMs: 60_000,
    browserProfile: { profileId: "profile-opaque", alias: "principal" },
  });
  const retried = { ...job, retryCount: job.retryCount + 1 };
  assert.deepEqual(retried.browserProfile, job.browserProfile);
});
