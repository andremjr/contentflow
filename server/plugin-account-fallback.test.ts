import assert from "node:assert/strict";
import test from "node:test";
import type { PluginManifest } from "../src/lib/plugin-contract";
import { createPersistentPluginJob } from "./plugin-job-store";
import { canAdvanceProfileFallback, orderedProfileCandidates } from "./plugin-account-fallback";

const manifest = {
  profileSetup: {
    configurationKey: "accountProfile",
    fallbackConfigurationKey: "fallbackAccountProfiles",
    label: "Salvar perfil",
  },
} as Pick<PluginManifest, "profileSetup">;

function jobWithFallback() {
  const profileFallback = orderedProfileCandidates(manifest, {
    accountProfile: "primary",
    fallbackAccountProfiles: "backup-a\nbackup-b, backup-a; inválido!",
  });
  return createPersistentPluginJob({
    pluginId: "test.browser",
    pluginVersion: "1.0.0",
    timeoutMs: 60_000,
    profileFallback,
    request: {
      executionId: "execution",
      traceId: "trace",
      blockId: "block",
      capabilityId: "capability",
      attempt: 1,
      invocation: { mode: "start" },
      configuration: {},
      settings: {},
      inputs: {},
      inputContract: [],
      outputContract: [],
      context: {
        locale: "pt-BR",
        timeZone: "America/Sao_Paulo",
        channel: { id: "channel", name: "Canal", language: "pt-BR", niche: "" },
        project: { id: "project", title: "Projeto" },
        processType: "assets",
        block: { type: "CRIAR", name: "Gerar", instructions: "" },
        previousProcessOutputs: [],
        previousBlockOutputs: [],
      },
    },
  });
}

test("normaliza aliases ordenados e remove duplicatas ou valores inválidos", () => {
  assert.deepEqual(jobWithFallback().profileFallback?.candidates, [
    "primary",
    "backup-a",
    "backup-b",
  ]);
});

for (const code of ["UPSTREAM_UNAVAILABLE", "TIMEOUT", "JOB_FAILED"]) {
  test(`avança em erro técnico ${code}`, () => {
    assert.equal(
      canAdvanceProfileFallback(jobWithFallback(), {
        status: "error",
        code,
        message: "Falha técnica",
        retryable: true,
      }),
      true,
    );
  });
}

for (const code of ["AUTHENTICATION_FAILED", "RATE_LIMIT", "PERMISSION_DENIED"]) {
  test(`não troca identidade em ${code}`, () => {
    assert.equal(
      canAdvanceProfileFallback(jobWithFallback(), {
        status: "error",
        code,
        message: "Intervenção necessária",
        retryable: true,
      }),
      false,
    );
  });
}
