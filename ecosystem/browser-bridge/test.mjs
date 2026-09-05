import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

export async function testExtensionBridge(source) {
  const storage = {};
  const debuggerCalls = [];
  let focusedText = "";
  let failNextMousePress = false;
  let attachGate;
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
            windowId: 70,
            url: "https://flow.google.com/project/project-1",
          },
        ];
      },
      async get(tabId) {
        assert.equal(tabId, 7);
        return { id: 7, windowId: 70 };
      },
      async sendMessage() {
        assert.fail("ações de UI não podem mais usar chrome.tabs.sendMessage");
      },
    },
    windows: {
      async update(windowId, updateInfo) {
        debuggerCalls.push({ operation: "windowUpdate", windowId, updateInfo });
        return { id: windowId, ...updateInfo };
      },
    },
    debugger: {
      async attach(target, version) {
        debuggerCalls.push({ operation: "attach", target: structuredClone(target), version });
        if (attachGate) await attachGate;
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
          if (params.expression.includes("function clickPageTarget")) {
            return { result: { value: { clicked: true, text: "generate" } } };
          }
          if (params.expression.includes("function readFocusedText")) {
            return { result: { value: focusedText } };
          }
          return {
            result: {
              value: {
                url: "https://flow.google.com/project/project-1",
                origin: "https://flow.google.com",
                title: "Flow",
              },
            },
          };
        }
        if (
          method === "Input.dispatchMouseEvent" &&
          params.type === "mousePressed" &&
          failNextMousePress
        ) {
          failNextMousePress = false;
          throw new Error("CDP input unavailable");
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
  assert.equal(
    bridge.connect({
      ...handshake,
      sessionToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    }).ok,
    true,
  );

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
      expectedUrl: "https://flow.google.com/project/project-1",
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
    command(5, { expectedUrl: "https://flow.google.com/project/other-project" }),
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
  assert.equal(clickResult.mechanism, "cdp-input");
  assert.equal(Object.keys(storage.contentflowCommandCacheV2).length, 301);
  assert.equal(debuggerCalls.filter((entry) => entry.operation === "attach").length, 301);
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    301,
    "cada attach precisa do detach correspondente",
  );
  assert.ok(
    !debuggerCalls.some(
      (entry) =>
        entry.method === "Runtime.evaluate" &&
        entry.params.expression.includes("function clickPageTarget"),
    ),
    "o fallback DOM não deve rodar quando o clique CDP confiável foi aceito",
  );
  assert.ok(
    !debuggerCalls.some((entry) => entry.method === "Page.bringToFront"),
    "a ponte não deve trazer a janela minimizada para frente",
  );
  assert.ok(
    !debuggerCalls.some((entry) => entry.operation === "windowUpdate"),
    "a ponte não deve restaurar a janela minimizada",
  );
  assert.ok(debuggerCalls.some((entry) => entry.method === "Input.dispatchKeyEvent"));
  assert.ok(debuggerCalls.some((entry) => entry.method === "Input.insertText"));
  assert.ok(
    debuggerCalls.some(
      (entry) =>
        entry.method === "Input.dispatchMouseEvent" && entry.params.type === "mousePressed",
    ),
    "o clique CDP deve funcionar sem ativar a janela do Chrome",
  );

  failNextMousePress = true;
  const fallbackClick = await bridge.dispatch(
    command(302, {
      executionKey: "execution-key-click-fallback",
      action: "click",
      payload: { selectors: ["button"], textIncludes: ["generate"] },
    }),
  );
  assert.equal(fallbackClick.ok, true);
  assert.equal(fallbackClick.mechanism, "dom-fallback");

  let releaseAttach;
  attachGate = new Promise((resolve) => {
    releaseAttach = resolve;
  });
  const queuedFirst = bridge.dispatch(command(303));
  const queuedExpired = bridge.dispatch(
    command(304, { issuedAt: Date.now(), expiresAt: Date.now() + 10 }),
  );
  setTimeout(() => {
    attachGate = undefined;
    releaseAttach();
  }, 30);
  assert.equal((await queuedFirst).ok, true);
  assert.equal((await queuedExpired).code, "COMMAND_EXPIRED");

  const cancelResult = await bridge.cancel({
    pluginId: handshake.pluginId,
    protocolVersion: handshake.protocolVersion,
    sessionToken: handshake.sessionToken,
    profileId: handshake.profileId,
    executionKey: "execution-key-volume-test",
    commandId: createHash("sha256").update("cancel").digest("hex"),
  });
  assert.equal(cancelResult.ok, true);
  assert.ok(storage.contentflowCancelledExecutionsV2["execution-key-volume-test"] > Date.now());
  assert.equal(
    (
      await bridge.cancel({
        pluginId: "local.contentflow.gemini-browser-studio",
        protocolVersion: handshake.protocolVersion,
        sessionToken: handshake.sessionToken,
        profileId: handshake.profileId,
        executionKey: "execution-key-volume-test",
      })
    ).code,
    "SESSION_MISMATCH",
    "outro plugin não pode cancelar uma execução usando a sessão alheia",
  );

  const disconnected = bridge.disconnect({
    pluginId: handshake.pluginId,
    protocolVersion: handshake.protocolVersion,
    sessionToken: handshake.sessionToken,
    profileId: handshake.profileId,
  });
  assert.equal(disconnected.ok, true);
  assert.equal((await bridge.dispatch(command(302))).code, "SESSION_MISMATCH");

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

  const anchorToken = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.equal(bridge.connect({ ...handshake, sessionToken: anchorToken }).ok, true);
  for (let index = 0; index < 128; index += 1) {
    const suffix = String(index).padStart(12, "0");
    assert.equal(
      bridge.connect({
        ...handshake,
        sessionToken: `00000000-0000-4000-8000-${suffix}`,
      }).ok,
      true,
    );
  }
  assert.equal(
    (
      await bridge.dispatch(
        command(305, {
          sessionToken: anchorToken,
          executionKey: "execution-key-evicted-session",
        }),
      )
    ).code,
    "SESSION_MISMATCH",
    "a ponte precisa limitar sessões abandonadas sem crescer indefinidamente",
  );
}
