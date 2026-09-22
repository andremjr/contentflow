import assert from "node:assert/strict";
import test from "node:test";

import { pluginRequirementReadiness } from "./method-transfer-readiness";

const plugin = {
  enabled: true,
  executable: true,
  manifest: { capabilities: [{ id: "generate" }] },
};

test("distingue plugin, capability, disponibilidade e conexão na prontidão do pacote", () => {
  assert.equal(
    pluginRequirementReadiness({
      capabilityId: "generate",
      connectionRequired: false,
      hasBoundConnection: false,
    }),
    "missing_plugin",
  );
  assert.equal(
    pluginRequirementReadiness({
      plugin,
      capabilityId: "other",
      connectionRequired: false,
      hasBoundConnection: false,
    }),
    "missing_capability",
  );
  assert.equal(
    pluginRequirementReadiness({
      plugin: { ...plugin, enabled: false },
      capabilityId: "generate",
      connectionRequired: false,
      hasBoundConnection: false,
    }),
    "unavailable_plugin",
  );
  assert.equal(
    pluginRequirementReadiness({
      plugin,
      capabilityId: "generate",
      connectionRequired: true,
      hasBoundConnection: false,
    }),
    "missing_connection",
  );
  assert.equal(
    pluginRequirementReadiness({
      plugin,
      capabilityId: "generate",
      connectionRequired: true,
      hasBoundConnection: true,
    }),
    "ready",
  );
});
