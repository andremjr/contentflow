import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock } from "../src/lib/domain";
import {
  materializeLocalProfileExecution,
  normalizeStoredProfileExecution,
} from "./profile-execution-policy";

const block: ActionBlock = {
  id: "browser-block",
  type: "CRIAR",
  operator: "IA",
  parameters: [],
  order: 0,
  plugin: {
    pluginId: "plugin.browser",
    capabilityId: "generate",
    configuration: {
      accountProfile: "Principal",
      fallbackAccountProfiles: "Backup A\nbackup-b\nBACKUP A",
      model: "model-x",
    },
  },
};

test("pacote 9.1 materializa principal/fallback legado em IDs locais preservando a configuração funcional", () => {
  const ids = new Map([
    ["principal", "profile-1"],
    ["backup a", "profile-2"],
    ["backup-b", "profile-3"],
  ]);
  const [normalized] = materializeLocalProfileExecution({
    blocks: [block],
    profileSetupForPlugin: () => ({
      configurationKey: "accountProfile",
      fallbackConfigurationKey: "fallbackAccountProfiles",
      label: "Conta",
    }),
    resolveAlias: (_pluginId, alias) => {
      const profileId = ids.get(alias.toLocaleLowerCase());
      return profileId ? { profileId } : undefined;
    },
  });
  assert.deepEqual(normalized.plugin?.profileExecution, {
    mode: "fallback",
    profileIds: ["profile-1", "profile-2", "profile-3"],
  });
  assert.equal(normalized.plugin?.configuration.accountProfile, "Principal");
  assert.equal(normalized.plugin?.configuration.model, "model-x");
});

test("pacote 9.1 não grava política parcial quando algum alias legado não resolve", () => {
  const [normalized] = materializeLocalProfileExecution({
    blocks: [block],
    profileSetupForPlugin: () => ({
      configurationKey: "accountProfile",
      fallbackConfigurationKey: "fallbackAccountProfiles",
      label: "Conta",
    }),
    resolveAlias: (_pluginId, alias) =>
      alias.toLocaleLowerCase() === "principal" ? { profileId: "profile-1" } : undefined,
  });
  assert.equal(normalized.plugin?.profileExecution, undefined);
});

test("pacote 9.1 normaliza política local existente sem perder ordem", () => {
  assert.deepEqual(
    normalizeStoredProfileExecution({
      mode: "parallel",
      profileIds: [" profile-1 ", "profile-2", "profile-1", ""],
      maxParallel: 99,
    }),
    { mode: "parallel", profileIds: ["profile-1", "profile-2"], maxParallel: 2 },
  );
});

test("políticas legadas de perfil único são normalizadas para fallback ordenado", () => {
  assert.deepEqual(normalizeStoredProfileExecution({ mode: "single", profileIds: ["profile-1"] }), {
    mode: "fallback",
    profileIds: ["profile-1"],
  });
  assert.deepEqual(
    normalizeStoredProfileExecution({ mode: "parallel", profileIds: ["profile-1"] }),
    { mode: "fallback", profileIds: ["profile-1"] },
  );
});
