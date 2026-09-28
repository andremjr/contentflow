import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ActionBlock } from "../src/lib/domain";
import {
  clearImportedProfileAssociations,
  validateLocalProfileExecution,
} from "./profile-execution-policy";

const profileSetup = {
  label: "Perfil",
  configurationKey: "accountProfile",
  fallbackConfigurationKey: "fallbackProfiles",
  setupCapabilityId: "prepare",
  checkCapabilityId: "check",
};

test("9.3 usa a mesma validação local para Builder MCP e salvamento da UI", () => {
  const builder = readFileSync(new URL("./builder-methods.ts", import.meta.url), "utf8");
  const server = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  assert.match(builder, /validateLocalProfileExecution\(/);
  assert.match(server, /validateLocalProfileExecution\(/);

  const valid = validateLocalProfileExecution({
    policy: { mode: "fallback", profileIds: ["profile-1", "profile-2"] },
    profileSetup,
    isBoundProfile: (profileId) => profileId === "profile-1" || profileId === "profile-2",
  });
  assert.deepEqual(valid.policy, {
    mode: "fallback",
    profileIds: ["profile-1", "profile-2"],
  });
  assert.equal(valid.error, undefined);

  const revoked = validateLocalProfileExecution({
    policy: { mode: "single", profileIds: ["revoked"] },
    profileSetup,
    isBoundProfile: () => false,
  });
  assert.match(revoked.error ?? "", /não está vinculado localmente/);
});

test("9.3 importação portátil remove aliases e política locais antes de exigir nova associação", () => {
  const blocks: ActionBlock[] = [
    {
      id: "block",
      type: "CRIAR",
      operator: "IA",
      parameters: [],
      order: 0,
      plugin: {
        pluginId: "browser.plugin",
        capabilityId: "generate",
        configuration: {
          accountProfile: "Mesmo nome local",
          fallbackProfiles: "Backup",
          model: "model-x",
        },
        profileExecution: { mode: "single", profileIds: ["foreign-profile"] },
      },
    },
  ];
  const [clean] = clearImportedProfileAssociations({
    blocks,
    profileSetupForPlugin: () => profileSetup,
  });
  assert.deepEqual(clean.plugin?.configuration, { model: "model-x" });
  assert.equal(clean.plugin?.profileExecution, undefined);
  assert.equal(blocks[0].plugin?.configuration.accountProfile, "Mesmo nome local");
});

test("9.3 considera política presente porém inválida como erro de validação", () => {
  const invalid = validateLocalProfileExecution({
    policy: null,
    profileSetup,
    isBoundProfile: () => true,
  });
  assert.match(invalid.error ?? "", /política local de perfis.*inválida/i);
});
