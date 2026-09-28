import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { runInNewContext } from "node:vm";

export async function testExtensionBridge(source) {
  const storage = {};
  const debuggerCalls = [];
  let focusedText = "";
  let currentTabUrl = "https://flow.google.com/project/project-1";
  let failNextMousePress = false;
  let conditionObserverResult = {
    ok: true,
    matched: true,
    state: "visible",
    selectorIndex: 0,
  };
  let conditionObserverResolve;
  let attachGate;
  let mousePressGate;
  let runtimeListener;
  let runtimePortListener;
  let alarmListener;
  let tabRemovedListener;
  let tabUpdatedListener;
  let debuggerDetachListener;
  const powerCalls = [];
  const tabUpdates = [];
  const tabReloads = [];
  const chrome = {
    runtime: {
      getManifest: () => ({ version: "2.0.0" }),
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        },
      },
      onConnect: {
        addListener(listener) {
          runtimePortListener = listener;
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
            url: currentTabUrl,
          },
        ];
      },
      async get(tabId) {
        assert.equal(tabId, 7);
        return { id: 7, windowId: 70, url: currentTabUrl, status: "complete" };
      },
      async reload(tabId, reloadProperties) {
        assert.equal(tabId, 7);
        tabReloads.push({ tabId, reloadProperties: structuredClone(reloadProperties) });
      },
      async update(tabId, updateInfo) {
        tabUpdates.push({ tabId, updateInfo: structuredClone(updateInfo) });
        return { id: tabId, ...updateInfo };
      },
      onRemoved: {
        addListener(listener) {
          tabRemovedListener = listener;
        },
      },
      onUpdated: {
        addListener(listener) {
          tabUpdatedListener = listener;
        },
      },
      async sendMessage() {
        assert.fail("ações de UI não podem mais usar chrome.tabs.sendMessage");
      },
    },
    alarms: {
      create() {},
      onAlarm: {
        addListener(listener) {
          alarmListener = listener;
        },
      },
    },
    power: {
      requestKeepAwake(level) {
        powerCalls.push({ operation: "request", level });
      },
      releaseKeepAwake() {
        powerCalls.push({ operation: "release" });
      },
    },
    windows: {
      async update(windowId, updateInfo) {
        debuggerCalls.push({ operation: "windowUpdate", windowId, updateInfo });
        return { id: windowId, ...updateInfo };
      },
    },
    debugger: {
      onDetach: {
        addListener(listener) {
          debuggerDetachListener = listener;
        },
      },
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
          if (
            params.expression.includes("__contentFlowConditionObserversV1?.get") &&
            !params.expression.includes("function observePageCondition")
          ) {
            conditionObserverResolve?.({
              ok: false,
              code: "CANCELLED",
              message: "Observação cancelada.",
            });
            conditionObserverResolve = undefined;
            return { result: { value: true } };
          }
          if (params.expression.includes("function observePageCondition")) {
            if (conditionObserverResult === "pending") {
              return {
                result: {
                  value: await new Promise((resolve) => {
                    conditionObserverResolve = resolve;
                  }),
                },
              };
            }
            return { result: { value: structuredClone(conditionObserverResult) } };
          }
          if (params.expression.includes("function resolveFileInput")) {
            return { result: { objectId: "file-input-object" } };
          }
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
                url: currentTabUrl,
                origin: new URL(currentTabUrl).origin,
                title: "Flow",
              },
            },
          };
        }
        if (method === "DOM.describeNode") {
          return {
            node: {
              nodeName: "INPUT",
              backendNodeId: 77,
              attributes: ["type", "file", "accept", "image/png,image/jpeg,image/webp"],
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
        if (
          method === "Input.dispatchMouseEvent" &&
          params.type === "mousePressed" &&
          mousePressGate
        ) {
          await mousePressGate;
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
  assert.equal(bridge.identity.protocol.min, 2);
  assert.equal(bridge.identity.protocol.max, 2);
  assert.equal(bridge.identity.bridgeVersion, "2.0.0");
  assert.deepEqual(Array.from(bridge.identity.capabilities), [
    "idempotent-replay.v1",
    "lifecycle-events.v1",
    "snapshot.v1",
    "condition-observer.v1",
    "reload.v1",
  ]);
  assert.equal(typeof runtimeListener, "function");
  assert.equal(typeof runtimePortListener, "function");
  assert.equal(typeof alarmListener, "function");
  assert.equal(typeof tabRemovedListener, "function");
  assert.equal(typeof tabUpdatedListener, "function");
  assert.equal(typeof debuggerDetachListener, "function");

  const handshake = {
    pluginId: "local.contentflow.google-flow-batch-images",
    protocolVersion: 2,
    profileId: "conta-principal",
    sessionToken: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
  assert.equal((await bridge.connect(handshake)).ok, true);
  const negotiated = await bridge.connect({
    ...handshake,
    protocol: { min: 1, max: 2 },
    requestedCapabilities: ["idempotent-replay.v1"],
    sessionToken: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  });
  assert.equal(negotiated.ok, true);
  assert.equal(negotiated.protocolVersion, 2);
  assert.deepEqual(Array.from(negotiated.capabilities), [
    "idempotent-replay.v1",
    "lifecycle-events.v1",
    "snapshot.v1",
    "condition-observer.v1",
    "reload.v1",
  ]);
  assert.equal(negotiated.bridgeVersion, "2.0.0");
  assert.equal(
    (
      await bridge.connect({
        ...handshake,
        protocol: { min: 3, max: 4 },
        sessionToken: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      })
    ).code,
    "PROTOCOL_MISMATCH",
  );
  assert.equal(
    (
      await bridge.connect({
        ...handshake,
        protocol: { min: 2, max: 2 },
        requestedCapabilities: ["missing-capability.v1"],
        sessionToken: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      })
    ).code,
    "CAPABILITY_MISMATCH",
  );
  assert.equal(
    (
      await bridge.connect({
        ...handshake,
        sessionToken: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })
    ).ok,
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

  const observed = await bridge.dispatch(
    command(2, {
      executionKey: "execution-key-condition-observer",
      action: "observeCondition",
      payload: {
        selectors: ["[data-testid='ready']"],
        state: "visible",
        timeoutMs: 5000,
        debounceMs: 100,
      },
    }),
  );
  assert.deepEqual(observed, {
    ok: true,
    matched: true,
    state: "visible",
    selectorIndex: 0,
  });
  const observerEvents = await bridge.events({ ...handshake, afterSequence: 0 });
  const reached = observerEvents.events.find((event) => event.type === "condition_reached");
  assert.equal(reached?.state, "visible");
  assert.equal(
    JSON.stringify(reached).includes("data-testid"),
    false,
    "evento de condição não deve carregar selector ou conteúdo da página",
  );

  const reloadCommand = command(20, {
    executionKey: "execution-key-controlled-reload",
    action: "reload",
    payload: { reconciliationState: "safe", bypassCache: true },
  });
  const reloaded = await bridge.dispatch(reloadCommand);
  assert.equal(reloaded.ok, true);
  assert.equal(reloaded.reconciliationState, "safe");
  assert.equal(reloaded.location.origin, "https://flow.google.com");
  assert.equal(reloaded.location.pathname, "/project/project-1");
  assert.equal(tabReloads.length, 1);
  assert.equal(tabReloads[0].reloadProperties.bypassCache, true);
  const replayedReload = await bridge.dispatch(reloadCommand);
  assert.equal(replayedReload.replayed, true);
  assert.equal(tabReloads.length, 1, "replay não pode disparar uma segunda recarga");
  const blockedReload = await bridge.dispatch(
    command(21, {
      executionKey: "execution-key-uncertain-reload",
      action: "reload",
      payload: { reconciliationState: "uncertain" },
    }),
  );
  assert.equal(blockedReload.code, "RELOAD_BLOCKED_UNCERTAIN_EFFECT");
  assert.equal(tabReloads.length, 1, "efeito incerto deve bloquear recarga");
  const reloadEvents = await bridge.events({ ...handshake, afterSequence: 0 });
  const controlledReloadEvent = reloadEvents.events.find(
    (event) => event.type === "reload" && event.controlled === true,
  );
  assert.equal(controlledReloadEvent.commandId, reloadCommand.commandId);
  assert.equal(controlledReloadEvent.diagnosticCode, "BRIDGE_CONTROLLED_RELOAD");
  assert.equal(JSON.stringify(controlledReloadEvent).includes("prompt"), false);
  assert.equal(
    (
      await bridge.dispatch(
        command(3, {
          executionKey: "execution-key-condition-invalid",
          action: "observeCondition",
          payload: {
            selectors: ["x".repeat(300)],
            state: "visible",
            timeoutMs: 5000,
            debounceMs: 100,
          },
        }),
      )
    ).code,
    "INVALID_COMMAND",
  );

  conditionObserverResult = "pending";
  const cancelledObservation = bridge.dispatch(
    command(4, {
      executionKey: "execution-key-condition-cancel",
      action: "observeCondition",
      payload: {
        selectors: ["#long-running-condition"],
        state: "visible",
        timeoutMs: 5000,
        debounceMs: 100,
      },
    }),
  );
  while (!conditionObserverResolve) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(
    (
      await bridge.cancel({
        ...handshake,
        executionKey: "execution-key-condition-cancel",
      })
    ).ok,
    true,
  );
  assert.equal((await cancelledObservation).code, "CANCELLED");
  const cancelledEvents = await bridge.events({ ...handshake, afterSequence: 0 });
  assert.ok(cancelledEvents.events.some((event) => event.type === "session_cancelled"));

  const disconnectToken = "abababab-abab-4bab-8bab-abababababab";
  const disconnectHandshake = { ...handshake, sessionToken: disconnectToken };
  assert.equal((await bridge.connect(disconnectHandshake)).ok, true);
  const disconnectedObservation = bridge.dispatch(
    command(5, {
      sessionToken: disconnectToken,
      executionKey: "execution-key-condition-disconnect",
      action: "observeCondition",
      payload: {
        selectors: ["#disconnect-condition"],
        state: "visible",
        timeoutMs: 5000,
        debounceMs: 100,
      },
    }),
  );
  while (!conditionObserverResolve) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal((await bridge.disconnect(disconnectHandshake)).ok, true);
  assert.equal((await disconnectedObservation).code, "CANCELLED");
  conditionObserverResult = {
    ok: true,
    matched: true,
    state: "visible",
    selectorIndex: 0,
  };

  const attachCountBeforeVolume = debuggerCalls.filter(
    (entry) => entry.operation === "attach",
  ).length;
  const detachCountBeforeVolume = debuggerCalls.filter(
    (entry) => entry.operation === "detach",
  ).length;
  const first = command(1);
  assert.equal((await bridge.dispatch(first)).ok, true);
  const attachCountAfterFirst = debuggerCalls.filter(
    (entry) => entry.operation === "attach",
  ).length;
  const replay = await bridge.dispatch(first);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "attach").length,
    attachCountAfterFirst,
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
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "attach").length,
    attachCountBeforeVolume + 1,
    "o depurador do Flow deve permanecer anexado durante o job inteiro",
  );
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    detachCountBeforeVolume,
    "o depurador do Flow não deve ser removido entre ações do mesmo job",
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

  assert.equal(
    (
      await bridge.disconnect({
        pluginId: handshake.pluginId,
        protocolVersion: handshake.protocolVersion,
        sessionToken: handshake.sessionToken,
        profileId: handshake.profileId,
      })
    ).ok,
    true,
  );
  assert.equal((await bridge.connect(handshake)).ok, true);
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
  assert.ok(
    storage.contentflowCancelledExecutionsV2[
      "local.contentflow.google-flow-batch-images:conta-principal:execution-key-volume-test"
    ] > Date.now(),
  );
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

  const disconnected = await bridge.disconnect({
    pluginId: handshake.pluginId,
    protocolVersion: handshake.protocolVersion,
    sessionToken: handshake.sessionToken,
    profileId: handshake.profileId,
  });
  assert.equal(disconnected.ok, true);
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    detachCountBeforeVolume + 2,
    "o depurador do Flow deve ser removido somente no encerramento do job",
  );
  assert.equal((await bridge.dispatch(command(302))).code, "SESSION_MISMATCH");

  for (const provider of [
    ["local.contentflow.chatgpt-browser-studio", "https://chatgpt.com/"],
    ["local.contentflow.claude-browser-text", "https://claude.ai/new"],
    ["local.contentflow.gemini-browser-studio", "https://gemini.google.com/app"],
    ["local.contentflow.grok-browser-studio", "https://grok.com/"],
    ["local.contentflow.meta-ai-browser-studio", "https://www.meta.ai/"],
    ["local.contentflow.mai-playground-browser", "https://playground.microsoft.ai/chat"],
    ["local.contentflow.vibes-browser-studio", "https://vibes.ai/projects/project-1"],
  ]) {
    const result = await bridge.connect({ ...handshake, pluginId: provider[0] });
    assert.equal(result.ok, true, `${provider[0]} deve estar na allowlist da ponte v2`);
  }

  currentTabUrl = "https://chatgpt.com/";
  const chatGptSessionToken = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  assert.equal(
    (
      await bridge.connect({
        ...handshake,
        pluginId: "local.contentflow.chatgpt-browser-studio",
        sessionToken: chatGptSessionToken,
      })
    ).ok,
    true,
  );
  const debuggerAttachCount = debuggerCalls.filter((entry) => entry.operation === "attach").length;
  const debuggerDetachCount = debuggerCalls.filter((entry) => entry.operation === "detach").length;
  const chatGptCommand = (ordinal, action) => ({
    ...command(400 + ordinal),
    pluginId: "local.contentflow.chatgpt-browser-studio",
    sessionToken: chatGptSessionToken,
    executionKey: "execution-key-chatgpt-persistent-debugger",
    commandId: createHash("sha256").update(`chatgpt:${ordinal}`).digest("hex"),
    expectedUrl: currentTabUrl,
    action,
    payload:
      action === "setText"
        ? { selectors: ["#prompt-textarea"], text: "prompt do ChatGPT" }
        : { selectors: ['button[data-testid="send-button"]'] },
  });
  assert.equal((await bridge.dispatch(chatGptCommand(1, "setText"))).ok, true);
  const enterResult = await bridge.dispatch({
    ...chatGptCommand(2, "pressEnter"),
    payload: { selectors: ["#prompt-textarea"] },
  });
  assert.equal(enterResult.ok, true);
  assert.equal(enterResult.mechanism, "cdp-keyboard-enter");
  assert.ok(
    debuggerCalls.some(
      (entry) =>
        entry.operation === "sendCommand" &&
        entry.method === "Input.dispatchKeyEvent" &&
        entry.params?.key === "Enter" &&
        entry.params?.type === "keyDown" &&
        entry.params?.text === "\r" &&
        entry.params?.unmodifiedText === "\r",
    ),
    "o envio por Enter deve usar um keyDown completo no canal de teclado CDP",
  );
  const mouseEventsBeforeDomClick = debuggerCalls.filter(
    (entry) => entry.operation === "sendCommand" && entry.method === "Input.dispatchMouseEvent",
  ).length;
  const domClickResult = await bridge.dispatch({
    ...chatGptCommand(3, "click"),
    payload: {
      selectors: ['button[data-testid="send-button"]'],
      preferDomActivation: true,
    },
  });
  assert.equal(domClickResult.ok, true);
  assert.equal(domClickResult.mechanism, "dom");
  assert.equal(
    debuggerCalls.filter(
      (entry) => entry.operation === "sendCommand" && entry.method === "Input.dispatchMouseEvent",
    ).length,
    mouseEventsBeforeDomClick,
    "a ativação DOM explícita não deve depender do mouse CDP",
  );
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "attach").length,
    debuggerAttachCount + 1,
    "o ChatGPT deve manter um único depurador durante toda a sessão",
  );
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    debuggerDetachCount,
    "o ChatGPT não deve remover o depurador entre preencher e enviar",
  );
  assert.equal(
    (
      await bridge.disconnect({
        pluginId: "local.contentflow.chatgpt-browser-studio",
        protocolVersion: handshake.protocolVersion,
        sessionToken: chatGptSessionToken,
        profileId: handshake.profileId,
      })
    ).ok,
    true,
  );
  assert.equal(
    debuggerCalls.filter((entry) => entry.operation === "detach").length,
    debuggerDetachCount + 1,
    "o depurador do ChatGPT deve ser removido ao encerrar a sessão",
  );
  currentTabUrl = "https://flow.google.com/project/project-1";

  currentTabUrl = "https://vibes.ai/projects/project-1";
  const vibesToken = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const vibesHandshake = {
    ...handshake,
    pluginId: "local.contentflow.vibes-browser-studio",
    sessionToken: vibesToken,
  };
  assert.equal((await bridge.connect(vibesHandshake)).ok, true);
  const vibesCommand = (ordinal, action, payload = {}) => ({
    ...command(500 + ordinal),
    ...vibesHandshake,
    executionKey: "execution-key-vibes-authorized-job",
    commandId: createHash("sha256").update(`vibes:${ordinal}`).digest("hex"),
    expectedUrl: currentTabUrl,
    action,
    payload,
  });
  assert.equal((await bridge.dispatch(vibesCommand(1, "ping"))).ok, true);
  assert.equal(
    (
      await bridge.dispatch({
        ...vibesCommand(2, "ping"),
        expectedUrl: "https://vibes.ai/explore",
      })
    ).code,
    "ORIGIN_NOT_ALLOWED",
    "Vibes deve aceitar somente rotas de projeto",
  );

  const acquired = await bridge.dispatch(vibesCommand(3, "leaseAcquire", { ttlMs: 60_000 }));
  assert.equal(acquired.ok, true);
  assert.ok(acquired.expiresAt > Date.now());
  assert.equal(powerCalls.at(-1).operation, "request");
  assert.deepEqual(tabUpdates.at(-1), { tabId: 7, updateInfo: { autoDiscardable: false } });
  const replayedLease = await bridge.dispatch(vibesCommand(3, "leaseAcquire", { ttlMs: 60_000 }));
  assert.equal(replayedLease.replayed, true);

  const renewed = await bridge.dispatch(vibesCommand(4, "leaseRenew", { ttlMs: 60_000 }));
  assert.equal(renewed.ok, true);
  assert.ok(renewed.expiresAt >= acquired.expiresAt);

  const upload = await bridge.dispatch(
    vibesCommand(5, "setFiles", {
      selectors: ['input[type="file"]'],
      files: ["C:\\staging\\frame.png"],
    }),
  );
  assert.equal(upload.ok, true);
  assert.equal(upload.fileCount, 1);
  assert.ok(
    debuggerCalls.some(
      (entry) =>
        entry.method === "DOM.setFileInputFiles" &&
        entry.params.backendNodeId === 77 &&
        entry.params.files[0] === "C:\\staging\\frame.png",
    ),
  );
  assert.equal(
    (
      await bridge.dispatch(
        vibesCommand(6, "setFiles", {
          selectors: ['input[type="file"]'],
          files: ["..\\secrets.txt"],
        }),
      )
    ).code,
    "INVALID_COMMAND",
  );

  storage.contentflowLeasesV1[acquired.leaseId].expiresAt = Date.now() - 1;
  alarmListener({ name: "contentflow-lease-cleanup" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(Object.keys(storage.contentflowLeasesV1).length, 0);
  const leaseEvents = await bridge.events({
    ...vibesHandshake,
    afterSequence: 0,
  });
  assert.ok(leaseEvents.events.some((event) => event.type === "lease_expired"));
  assert.deepEqual(tabUpdates.at(-1), { tabId: 7, updateInfo: { autoDiscardable: true } });
  assert.equal(powerCalls.at(-1).operation, "release");

  const reacquired = await bridge.dispatch(vibesCommand(7, "leaseAcquire", { ttlMs: 60_000 }));
  assert.equal(reacquired.ok, true);
  tabUpdatedListener(7, { url: "https://vibes.ai/explore" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(Object.keys(storage.contentflowLeasesV1).length, 0);

  assert.equal((await bridge.dispatch(vibesCommand(8, "leaseAcquire"))).ok, true);
  assert.equal(
    (
      await bridge.cancel({
        ...vibesHandshake,
        executionKey: "execution-key-vibes-authorized-job",
      })
    ).ok,
    true,
  );
  assert.equal(Object.keys(storage.contentflowLeasesV1).length, 0);
  assert.equal(
    debuggerCalls.at(-1).operation,
    "detach",
    "cancelar Vibes deve liberar o depurador da sessão",
  );
  currentTabUrl = "https://flow.google.com/project/project-1";

  const lifecycleConnect = await bridge.connect(handshake);
  assert.ok(lifecycleConnect.lastSequence > 0);
  const lifecycleCommand = command(900, {
    executionKey: "execution-key-lifecycle-events",
  });
  assert.equal((await bridge.dispatch(lifecycleCommand)).ok, true);
  const initialSnapshot = await bridge.snapshot(handshake);
  assert.equal(initialSnapshot.ok, true);
  assert.equal(initialSnapshot.snapshot.state, "active");
  assert.deepEqual(initialSnapshot.snapshot.location, {
    origin: "https://flow.google.com",
    pathname: "/project/project-1",
  });

  tabUpdatedListener(7, { status: "loading" });
  tabUpdatedListener(7, { url: "https://flow.google.com/project/project-2?secret=never#fragment" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  debuggerDetachListener({ tabId: 7 }, "target_closed");
  await new Promise((resolve) => setTimeout(resolve, 0));
  const lifecycleEvents = await bridge.events({ ...handshake, afterSequence: 0 });
  assert.equal(lifecycleEvents.ok, true);
  assert.ok(lifecycleEvents.events.some((event) => event.type === "worker_reconnected"));
  assert.ok(lifecycleEvents.events.some((event) => event.type === "reload"));
  assert.ok(
    lifecycleEvents.events.some(
      (event) =>
        event.type === "worker_reconnected" && event.diagnosticCode === "BRIDGE_WORKER_RESTART",
    ),
  );
  assert.ok(lifecycleEvents.events.some((event) => event.type === "navigation"));
  assert.ok(lifecycleEvents.events.some((event) => event.type === "debugger_lost"));
  assert.ok(
    !JSON.stringify(lifecycleEvents.events).includes("secret=never"),
    "eventos não podem carregar query, hash ou conteúdo privado da página",
  );
  assert.ok(lifecycleEvents.lastSequence >= lifecycleConnect.lastSequence);

  assert.equal(
    (await bridge.dispatch(command(901, { executionKey: "execution-key-tab-close" }))).ok,
    true,
  );
  tabRemovedListener(7);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const afterClose = await bridge.events({
    ...handshake,
    afterSequence: lifecycleEvents.lastSequence,
  });
  assert.ok(afterClose.events.some((event) => event.type === "tab_closed"));
  const closedSnapshot = await bridge.snapshot(handshake);
  assert.equal(closedSnapshot.snapshot.state, "tab_closed");
  assert.equal(closedSnapshot.snapshot.debuggerAttached, false);

  const anchorToken = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  assert.equal((await bridge.connect({ ...handshake, sessionToken: anchorToken })).ok, true);
  for (let index = 0; index < 128; index += 1) {
    const suffix = String(index).padStart(12, "0");
    assert.equal(
      (
        await bridge.connect({
          ...handshake,
          sessionToken: `00000000-0000-4000-8000-${suffix}`,
        })
      ).ok,
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

  const reconnectToken = "abababab-abab-4bab-8bab-abababababab";
  const reconnectHandshake = { ...handshake, sessionToken: reconnectToken };
  assert.equal((await bridge.connect(reconnectHandshake)).ok, true);
  let releaseReconnectClick;
  mousePressGate = new Promise((resolve) => {
    releaseReconnectClick = resolve;
  });
  const reconnectCommand = command(999, {
    sessionToken: reconnectToken,
    executionKey: "execution-key-worker-reconnect",
    action: "click",
    payload: { selectors: ["button"], textIncludes: ["generate"] },
  });
  const firstReconnectAttempt = bridge.dispatch(reconnectCommand);
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (storage.contentflowCommandCacheV2?.[reconnectCommand.commandId]?.status === "in_flight") {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.equal(
    storage.contentflowCommandCacheV2?.[reconnectCommand.commandId]?.status,
    "in_flight",
    "efeito potencial precisa ser marcado antes da ação sair para a página",
  );

  const restartedContext = {
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
  restartedContext.globalThis = restartedContext;
  runInNewContext(source, restartedContext, { filename: "service-worker-restarted.js" });
  const restartedBridge = restartedContext.contentFlowBridge;
  assert.equal((await restartedBridge.connect(reconnectHandshake)).ok, true);
  const mousePressesBeforeReplay = debuggerCalls.filter(
    (entry) => entry.method === "Input.dispatchMouseEvent" && entry.params?.type === "mousePressed",
  ).length;
  const uncertainReplay = await restartedBridge.dispatch(reconnectCommand);
  assert.equal(uncertainReplay.code, "COMMAND_OUTCOME_UNKNOWN");
  assert.equal(uncertainReplay.reconciliationRequired, true);
  assert.equal(
    debuggerCalls.filter(
      (entry) =>
        entry.method === "Input.dispatchMouseEvent" && entry.params?.type === "mousePressed",
    ).length,
    mousePressesBeforeReplay,
    "worker reiniciado não pode repetir clique cujo resultado ficou incerto",
  );

  mousePressGate = undefined;
  releaseReconnectClick();
  assert.equal((await firstReconnectAttempt).ok, true);
  const completedReplay = await restartedBridge.dispatch(reconnectCommand);
  assert.equal(completedReplay.ok, true);
  assert.equal(completedReplay.replayed, true);
  assert.equal(
    debuggerCalls.filter(
      (entry) =>
        entry.method === "Input.dispatchMouseEvent" && entry.params?.type === "mousePressed",
    ).length,
    mousePressesBeforeReplay,
    "resposta perdida deve ser recuperada do recibo sem repetir o efeito",
  );

  const now = Date.now();
  storage.contentflowCommandCacheV2 = Object.fromEntries(
    Array.from({ length: 520 }, (_, index) => {
      const commandId = index.toString(16).padStart(64, "0");
      return [
        commandId,
        {
          pluginId: handshake.pluginId,
          profileId: handshake.profileId,
          executionKey: "execution-key-cache-bound",
          action: "ping",
          status: "completed",
          response: { ok: true },
          storedAt: now + index,
          expiresAt: now + 60_000,
        },
      ];
    }),
  );
  const cacheBoundCommand = command(1000, {
    sessionToken: reconnectToken,
    executionKey: "execution-key-cache-bound",
    action: "ping",
    payload: {},
  });
  assert.equal((await restartedBridge.dispatch(cacheBoundCommand)).ok, true);
  assert.equal(
    Object.keys(storage.contentflowCommandCacheV2).length,
    500,
    "cache deve permanecer limitado mesmo depois de restart/replay",
  );
  assert.equal(
    storage.contentflowCommandCacheV2["0".repeat(64)],
    undefined,
    "limpeza determinística deve remover primeiro a entrada mais antiga",
  );
}
