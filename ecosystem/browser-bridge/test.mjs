import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

export async function testExtensionBridge(source) {
  const storage = {};
  const debuggerCalls = [];
  let focusedText = "";
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
      async sendMessage() {
        assert.fail("ações de UI não podem mais usar chrome.tabs.sendMessage");
      },
    },
    debugger: {
      async attach(target, version) {
        debuggerCalls.push({ operation: "attach", target: structuredClone(target), version });
      },
      async detach(target) {
        debuggerCalls.push({ operation: "detach", target: structuredClone(target) });
      },
      async sendCommand(target, method, params = {}) {
        debuggerCalls.push({
          operation: "sendCommand",
          target: structuredClone(target),
          method,
          params: structuredClone(params),
        });
        if (method === "Runtime.evaluate") {
          if (params.expression.includes("function resolvePageTarget")) {
            const clickable = params.expression.includes(',"clickable",');
            return {
              result: {
                value: {
                  found: true,
                  x: 320,
                  y: 240,
                  absoluteX: 320,
                  absoluteY: 640,
                  text: clickable ? "generate" : "",
                },
              },
            };
          }
          if (params.expression.includes("function readFocusedText")) {
            return { result: { value: focusedText } };
          }
          return {
            result: {
              value: {
                url: "https://labs.google/fx/pt/tools/flow/project/project-1",
                origin: "https://labs.google",
                title: "Flow",
              },
            },
          };
        }
        if (method === "Input.insertText") focusedText = params.text;
        if (method === "Input.dispatchKeyEvent" && params.key === "Backspace") focusedText = "";
        return {};
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
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "attach").length,
    1,
    "comando repetido não pode repetir o efeito na página",
  );
  assert.ok(
    !debuggerCalls.some(
      (entry) =>
        entry.method === "Runtime.evaluate" && entry.params.expression.includes("prompt 1"),
    ),
    "o texto do usuário só deve trafegar em Input.insertText",
  );

  const wrongOrigin = await bridge.dispatch(
    command(2, { expectedUrl: "https://example.com/tools/flow" }),
  );
  assert.equal(wrongOrigin.code, "ORIGIN_NOT_ALLOWED");
  const wrongTab = await bridge.dispatch(
    command(5, { expectedUrl: "https://labs.google/fx/pt/tools/flow/project/other-project" }),
  );
  assert.equal(wrongTab.code, "PLUGIN_TAB_NOT_FOUND");
  const wrongProfile = await bridge.dispatch(command(3, { profileId: "outra-conta" }));
  assert.equal(wrongProfile.code, "PROFILE_MISMATCH");
  const expired = await bridge.dispatch(command(4, { expiresAt: Date.now() - 1 }));
  assert.equal(expired.code, "COMMAND_EXPIRED");

  for (let ordinal = 2; ordinal <= 300; ordinal += 1) {
    const response = await bridge.dispatch(command(ordinal));
    assert.equal(response.ok, true);
  }
  const clickResult = await bridge.dispatch(
    command(301, {
      executionKey: "execution-key-click-test",
      action: "clickGenerate",
      payload: { selectors: ["button"], textIncludes: ["generate"] },
    }),
  );
  assert.equal(clickResult.ok, true);
  assert.equal(clickResult.text, "generate");
  assert.equal(Object.keys(storage.contentflowCommandCacheV2).length, 301);
  assert.equal(debuggerCalls.filter((entry) => entry.operation === "attach").length, 301);
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    301,
    "cada attach precisa do detach correspondente",
  );
  assert.ok(
    debuggerCalls.some(
      (entry) =>
        entry.method === "Input.dispatchMouseEvent" && entry.params.type === "mousePressed",
    ),
  );
  assert.ok(
    debuggerCalls.some(
      (entry) =>
        entry.method === "Input.dispatchMouseEvent" && entry.params.type === "mouseReleased",
    ),
  );
  assert.ok(debuggerCalls.some((entry) => entry.method === "Input.dispatchKeyEvent"));
  assert.ok(debuggerCalls.some((entry) => entry.method === "Input.insertText"));

  const cancelResult = await bridge.cancel({
    sessionToken: handshake.sessionToken,
    profileId: handshake.profileId,
    executionKey: "execution-key-volume-test",
    commandId: createHash("sha256").update("cancel").digest("hex"),
  });
  assert.equal(cancelResult.ok, true);
  assert.ok(storage.contentflowCancelledExecutionsV2["execution-key-volume-test"] > Date.now());

  for (const provider of [
    ["local.contentflow.chatgpt-browser-studio", "https://chatgpt.com/"],
    ["local.contentflow.claude-browser-text", "https://claude.ai/new"],
    ["local.contentflow.gemini-browser-studio", "https://gemini.google.com/app"],
    ["local.contentflow.grok-browser-studio", "https://grok.com/"],
    ["local.contentflow.meta-ai-browser-studio", "https://www.meta.ai/"],
  ]) {
    const result = bridge.connect({ ...handshake, pluginId: provider[0] });
    assert.equal(result.ok, true, `${provider[0]} deve estar na allowlist da ponte v2`);
  }
}
