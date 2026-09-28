import assert from "node:assert/strict";
import test from "node:test";
import { invocationRequestForJob } from "./plugin-item-orchestration";
import { createPersistentPluginJob } from "./plugin-job-store";
import { resolveProfileExecutionSnapshot } from "./profile-execution-policy";

function request() {
  return {
    executionId: "execution",
    traceId: "trace",
    blockId: "block",
    capabilityId: "capability",
    attempt: 1,
    invocation: { mode: "start" as const },
    configuration: { model: "model-x" },
    settings: {},
    inputs: {},
    inputContract: [],
    outputContract: [],
    context: {
      locale: "pt-BR",
      timeZone: "America/Sao_Paulo",
      channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
      project: { id: "project", title: "Projeto" },
      processType: "assets" as const,
      block: { type: "CRIAR" as const, name: "Gerar", instructions: "" },
      previousProcessOutputs: [],
      previousBlockOutputs: [],
    },
  };
}

test("9.2 resolve todos os vínculos preparados antes de criar o job e preserva a ordem", () => {
  const known = new Map([
    ["profile-1", { alias: "Principal", readinessState: "ready" }],
    ["profile-2", { alias: "Backup", readinessState: "ready" }],
  ]);
  const snapshot = resolveProfileExecutionSnapshot({
    policy: { mode: "fallback", profileIds: ["profile-1", "profile-2"] },
    configurationKey: "accountProfile",
    resolveProfile: (profileId) => {
      const profile = known.get(profileId);
      return profile ? { profileId, ...profile } : undefined;
    },
  });
  assert.deepEqual(snapshot, {
    mode: "fallback",
    profileIds: ["profile-1", "profile-2"],
    configurationKey: "accountProfile",
    profiles: [
      { profileId: "profile-1", alias: "Principal" },
      { profileId: "profile-2", alias: "Backup" },
    ],
  });
});

test("9.2 falha fechado quando vínculo foi revogado ou preparação não está pronta", () => {
  assert.throws(
    () =>
      resolveProfileExecutionSnapshot({
        policy: { mode: "single", profileIds: ["revoked"] },
        configurationKey: "accountProfile",
        resolveProfile: () => undefined,
      }),
    /não está mais vinculado/,
  );
  assert.throws(
    () =>
      resolveProfileExecutionSnapshot({
        policy: { mode: "single", profileIds: ["profile-1"] },
        configurationKey: "accountProfile",
        resolveProfile: () => ({
          profileId: "profile-1",
          alias: "Principal",
          readinessState: "not_ready",
        }),
      }),
    /ainda não está preparado/,
  );
});

test("9.2 congela a política no job e injeta somente o alias do perfil ativo na chamada", () => {
  const profileExecution = resolveProfileExecutionSnapshot({
    policy: { mode: "fallback", profileIds: ["profile-1", "profile-2"] },
    configurationKey: "accountProfile",
    resolveProfile: (profileId) => ({
      profileId,
      alias: profileId === "profile-1" ? "Principal" : "Backup",
      readinessState: "ready",
    }),
  })!;
  const job = createPersistentPluginJob({
    pluginId: "plugin.browser",
    pluginVersion: "1.0.0",
    timeoutMs: 60_000,
    request: request(),
    profileExecution,
    browserProfile: { profileId: "profile-1", alias: "Principal" },
    profileFallback: {
      configurationKey: "accountProfile",
      candidates: ["Principal", "Backup"],
      activeIndex: 0,
      history: [],
    },
  });

  profileExecution.profiles[0].alias = "Alterado depois";
  assert.equal(job.profileExecution?.profiles[0].alias, "Principal");
  assert.equal(job.request.configuration.accountProfile, undefined);
  assert.equal(
    invocationRequestForJob(job, { mode: "start" }).configuration.accountProfile,
    "Principal",
  );
  assert.equal(job.request.configuration.accountProfile, undefined);

  job.profileFallback!.activeIndex = 1;
  assert.equal(
    invocationRequestForJob(job, { mode: "resume", jobId: "provider-job" }).configuration
      .accountProfile,
    "Backup",
  );
  assert.equal(job.request.configuration.accountProfile, undefined);
});
