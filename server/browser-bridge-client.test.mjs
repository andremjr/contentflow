import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

test("reconecta a sessão e despacha atomicamente sem confundir execuções no mesmo perfil", async () => {
  const paths = [
    "chatgpt-browser-studio",
    "claude-browser-text",
    "gemini-browser-studio",
    "grok-browser-studio",
    "mai-playground-browser",
    "meta-ai-browser-studio",
  ];
  const sources = await Promise.all(
    paths.map((plugin) =>
      readFile(`ecosystem/plugins/reference/${plugin}/browser-bridge-client.mjs`, "utf8"),
    ),
  );
  for (const source of sources)
    assert.equal(source, sources[0], "As cópias do transporte precisam continuar idênticas.");
  const { attachContentFlowBridge } =
    await import("../ecosystem/plugins/reference/gemini-browser-studio/browser-bridge-client.mjs");
  let activeToken;
  const received = [];
  const identity = {
    bridgeId: "com.contentflow.browser-bridge",
    protocolVersion: 2,
    protocol: { min: 2, max: 2 },
    capabilities: [
      "idempotent-replay.v1",
      "lifecycle-events.v1",
      "snapshot.v1",
      "condition-observer.v1",
      "reload.v1",
    ],
    bridgeVersion: "0.4.0",
    extensionVersion: "0.4.0",
  };
  const context = vm.createContext({
    setTimeout: (callback) => {
      const timer = setTimeout(callback, 50);
      timer.unref();
      return timer;
    },
    contentFlowBridge: {
      identity,
      connect: (handshake) => {
        activeToken = handshake.sessionToken;
        return { ok: true, protocolVersion: 2, capabilities: identity.capabilities };
      },
      dispatch: (command) => {
        if (activeToken !== command.sessionToken) return { ok: false, code: "SESSION_MISMATCH" };
        received.push(command.expectedUrl);
        return { ok: true, ...identity };
      },
      events: ({ afterSequence }) => ({
        ok: true,
        events:
          Number(afterSequence) < 4 ? [{ sequence: 4, type: "worker_reconnected", at: 1 }] : [],
        lastSequence: 4,
        snapshotRequired: false,
      }),
      snapshot: () => ({
        ok: true,
        sequence: 4,
        snapshot: {
          state: "reconnected",
          location: { origin: "https://gemini.google.com", pathname: "/app" },
          debuggerAttached: false,
          leaseActive: false,
        },
      }),
    },
  });
  const client = {
    async send(method, params = {}, session) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://test/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.evaluate") {
        const value = session?.startsWith("page-")
          ? { url: `https://gemini.google.com/app#${session}`, origin: "https://gemini.google.com" }
          : await vm.runInContext(String(params.expression), context);
        return { result: { value } };
      }
      return {};
    },
  };
  const common = {
    client,
    pluginId: "local.contentflow.gemini-browser-studio",
    profileId: "default",
    allowedOrigins: ["https://gemini.google.com"],
    signal: new AbortController().signal,
  };
  const first = await attachContentFlowBridge({
    ...common,
    pageSessionId: "page-a",
    request: { executionId: "a" },
  });
  const second = await attachContentFlowBridge({
    ...common,
    pageSessionId: "page-b",
    request: { executionId: "b" },
  });
  activeToken = undefined; // Worker suspendido/recriado ou outra sessão conectada.
  await first.dispatch("inspect", {}, "first");
  await second.dispatch("inspect", {}, "second");
  assert.deepEqual(received.slice(-2), [
    "https://gemini.google.com/app#page-a",
    "https://gemini.google.com/app#page-b",
  ]);
  const lifecycle = await first.readLifecycleEvents(3);
  assert.equal(lifecycle.lastSequence, 4);
  assert.equal(lifecycle.events[0].type, "worker_reconnected");
  const snapshot = await first.getRecoverySnapshot();
  assert.equal(snapshot.sequence, 4);
  assert.deepEqual(snapshot.snapshot.location, {
    origin: "https://gemini.google.com",
    pathname: "/app",
  });
  const observed = await first.observeCondition(
    {
      selectors: ["[data-testid='ready']"],
      state: "visible",
      timeoutMs: 5000,
      debounceMs: 100,
    },
    "ready",
  );
  assert.equal(observed.ok, true);
  first.dispose();
  second.dispose();
});

test("cliente novo rejeita Bridge antiga antes de conectar ou produzir efeito", async () => {
  const { attachContentFlowBridge } =
    await import("../ecosystem/plugins/reference/gemini-browser-studio/browser-bridge-client.mjs");
  let connectCalls = 0;
  let dispatchCalls = 0;
  const context = vm.createContext({
    contentFlowBridge: {
      identity: {
        bridgeId: "com.contentflow.browser-bridge",
        protocolVersion: 2,
        extensionVersion: "0.3.3",
      },
      connect() {
        connectCalls += 1;
        return { ok: true, protocolVersion: 2 };
      },
      dispatch() {
        dispatchCalls += 1;
        return { ok: true, protocolVersion: 2 };
      },
    },
  });
  const client = {
    async send(method, params = {}, sessionId) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://legacy/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.enable" || method === "Target.detachFromTarget") return {};
      if (method === "Runtime.evaluate") {
        return {
          result: {
            value: await vm.runInContext(String(params.expression), context),
          },
        };
      }
      throw new Error(`Comando inesperado: ${method} (${sessionId || "browser"})`);
    },
  };

  await assert.rejects(
    attachContentFlowBridge({
      client,
      pageTargetId: "page",
      expectedUrl: "https://gemini.google.com/app",
      pluginId: "local.contentflow.gemini-browser-studio",
      profileId: "default",
      request: { executionId: "legacy-matrix" },
      signal: new AbortController().signal,
      allowedOrigins: ["https://gemini.google.com"],
      waitMs: 100,
    }),
    (error) => error?.code === "BRIDGE_INCOMPATIBLE",
  );
  assert.equal(connectCalls, 0);
  assert.equal(dispatchCalls, 0);
});

test("diretiva do Core recarrega de forma controlada antes de validar a Bridge", async () => {
  const { attachContentFlowBridge } =
    await import("../ecosystem/plugins/reference/gemini-browser-studio/browser-bridge-client.mjs");
  const actions = [];
  const identity = {
    bridgeId: "com.contentflow.browser-bridge",
    protocolVersion: 2,
    protocol: { min: 2, max: 2 },
    capabilities: [
      "idempotent-replay.v1",
      "lifecycle-events.v1",
      "snapshot.v1",
      "condition-observer.v1",
      "reload.v1",
    ],
    bridgeVersion: "0.4.0",
    extensionVersion: "0.4.0",
  };
  const context = vm.createContext({
    setTimeout,
    contentFlowBridge: {
      identity,
      connect: () => ({ ok: true, protocolVersion: 2, capabilities: identity.capabilities }),
      dispatch: (command) => {
        actions.push({ action: command.action, payload: command.payload });
        return { ok: true, ...identity };
      },
      disconnect: () => ({ ok: true }),
    },
  });
  const client = {
    async send(method, params = {}, sessionId) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://current/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.enable" || method === "Target.detachFromTarget") return {};
      if (method === "Runtime.evaluate") {
        const value =
          sessionId === "page-session"
            ? { url: "https://gemini.google.com/app", origin: "https://gemini.google.com" }
            : await vm.runInContext(String(params.expression), context);
        return { result: { value } };
      }
      throw new Error(`Comando inesperado: ${method}`);
    },
  };

  const bridge = await attachContentFlowBridge({
    client,
    pageSessionId: "page-session",
    pluginId: "local.contentflow.gemini-browser-studio",
    profileId: "default",
    request: {
      executionId: "reload-test",
      recoveryDirective: { action: "reload_page", reasonCode: "BRIDGE_PAGE_UNAVAILABLE" },
    },
    signal: new AbortController().signal,
    allowedOrigins: ["https://gemini.google.com"],
  });

  assert.deepEqual(
    actions.map(({ action }) => action),
    ["reload", "ping"],
  );
  assert.deepEqual(JSON.parse(JSON.stringify(actions[0].payload)), {
    reconciliationState: "safe",
    bypassCache: true,
    reasonCode: "BRIDGE_PAGE_UNAVAILABLE",
  });
  bridge.dispose();
});

test("timeout distingue leitura repetível de comando com efeito incerto", async () => {
  const { attachContentFlowBridge } =
    await import("../ecosystem/plugins/reference/gemini-browser-studio/browser-bridge-client.mjs");
  const identity = {
    bridgeId: "com.contentflow.browser-bridge",
    protocolVersion: 2,
    protocol: { min: 2, max: 2 },
    capabilities: [
      "idempotent-replay.v1",
      "lifecycle-events.v1",
      "snapshot.v1",
      "condition-observer.v1",
      "reload.v1",
    ],
    bridgeVersion: "0.4.0",
    extensionVersion: "0.4.0",
  };
  const context = vm.createContext({
    setTimeout,
    contentFlowBridge: {
      identity,
      connect: () => ({ ok: true, protocolVersion: 2, capabilities: identity.capabilities }),
      dispatch: (command) =>
        command.action === "ping"
          ? { ok: true, ...identity }
          : { ok: false, code: "COMMAND_TIMEOUT", message: "timeout" },
      disconnect: () => ({ ok: true }),
    },
  });
  const client = {
    async send(method, params = {}, sessionId) {
      if (method === "Target.getTargets")
        return {
          targetInfos: [
            {
              type: "service_worker",
              targetId: "worker",
              url: "chrome-extension://current/service-worker.js",
            },
          ],
        };
      if (method === "Target.attachToTarget") return { sessionId: "worker-session" };
      if (method === "Runtime.enable" || method === "Target.detachFromTarget") return {};
      if (method === "Runtime.evaluate") {
        const value =
          sessionId === "page-session"
            ? { url: "https://gemini.google.com/app", origin: "https://gemini.google.com" }
            : await vm.runInContext(String(params.expression), context);
        return { result: { value } };
      }
      throw new Error(`Comando inesperado: ${method}`);
    },
  };
  const bridge = await attachContentFlowBridge({
    client,
    pageSessionId: "page-session",
    pluginId: "local.contentflow.gemini-browser-studio",
    profileId: "default",
    request: { executionId: "timeout-classification" },
    signal: new AbortController().signal,
    allowedOrigins: ["https://gemini.google.com"],
  });

  await assert.rejects(
    bridge.dispatch("inspect"),
    (error) => error?.code === "BRIDGE_PAGE_UNAVAILABLE",
  );
  await assert.rejects(
    bridge.dispatch("click"),
    (error) => error?.code === "COMMAND_OUTCOME_UNKNOWN",
  );
  bridge.dispose();
});
