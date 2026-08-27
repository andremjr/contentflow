import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

export async function testExtensionBridge(source) {
  const storage = {};
  const sentMessages = [];
  let runtimeListener;
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "2.0.0" }),
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        },
      },
    },
    storage: {
      session: {
        async get(key) {
          return { [key]: storage[key] };
        },
        async set(values) {
          Object.assign(storage, structuredClone(values));
        },
      },
    },
    tabs: {
      async query() {
        return [
          {
            id: 7,
            url: "https://labs.google/fx/pt/tools/flow/project/project-1",
          },
        ];
      },
      async sendMessage(tabId, message) {
        sentMessages.push({ tabId, message: structuredClone(message) });
        return { ok: true, action: message.action, ordinal: sentMessages.length };
      },
    },
  };
  const context = {
    chrome,
    URL,
    Promise,
    Date,
    Set,
    Map,
    Object,
    String,
    Number,
    JSON,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  runInNewContext(source, context, { filename: "service-worker.js" });

  const bridge = context.contentFlowBridge;
  assert.ok(bridge);
  assert.equal(bridge.identity.bridgeId, "com.contentflow.browser-bridge");
  assert.equal(bridge.identity.protocolVersion, 2);
  assert.equal(typeof runtimeListener, "function");

  const handshake = {
    pluginId: "local.contentflow.google-flow-batch-images",
    protocolVersion: 2,
    profileId: "conta-principal",
    sessionToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  assert.equal(bridge.connect(handshake).ok, true);

  const command = (ordinal, overrides = {}) => {
    const issuedAt = Date.now();
    return {
      pluginId: handshake.pluginId,
      protocolVersion: handshake.protocolVersion,
      profileId: handshake.profileId,
      sessionToken: handshake.sessionToken,
      executionKey: "execution-key-volume-test",
      commandId: createHash("sha256").update(`volume:${ordinal}`).digest("hex"),
      issuedAt,
      expiresAt: issuedAt + 30000,
      expectedUrl: "https://labs.google/fx/pt/tools/flow/project/project-1",
      action: "setPrompt",
      payload: { text: `prompt ${ordinal}` },
      ...overrides,
    };
  };

  const first = command(1);
  assert.equal((await bridge.dispatch(first)).ok, true);
  const replay = await bridge.dispatch(first);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(sentMessages.length, 1, "comando repetido não pode repetir o efeito na página");

  const wrongOrigin = await bridge.dispatch(
    command(2, { expectedUrl: "https://example.com/tools/flow" }),
  );
  assert.equal(wrongOrigin.code, "ORIGIN_NOT_ALLOWED");
  const wrongTab = await bridge.dispatch(
    command(5, { expectedUrl: "https://labs.google/fx/pt/tools/flow/project/other-project" }),
  );
  assert.equal(wrongTab.code, "FLOW_TAB_NOT_FOUND");
  const wrongProfile = await bridge.dispatch(command(3, { profileId: "outra-conta" }));
  assert.equal(wrongProfile.code, "PROFILE_MISMATCH");
  const expired = await bridge.dispatch(command(4, { expiresAt: Date.now() - 1 }));
  assert.equal(expired.code, "COMMAND_EXPIRED");

  for (let ordinal = 2; ordinal <= 300; ordinal += 1) {
    const response = await bridge.dispatch(command(ordinal));
    assert.equal(response.ok, true);
  }
  assert.equal(sentMessages.filter((entry) => entry.message.action === "setPrompt").length, 300);
  assert.equal(Object.keys(storage.contentflowCommandCacheV2).length, 300);

  const cancelResult = await bridge.cancel({
    sessionToken: handshake.sessionToken,
    profileId: handshake.profileId,
    executionKey: "execution-key-volume-test",
    commandId: createHash("sha256").update("cancel").digest("hex"),
  });
  assert.equal(cancelResult.ok, true);
  assert.equal(sentMessages.at(-1).message.action, "cancel");
}
