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
    extensionVersion: "0.3.3",
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
        return { ok: true };
      },
      dispatch: (command) => {
        if (activeToken !== command.sessionToken) return { ok: false, code: "SESSION_MISMATCH" };
        received.push(command.expectedUrl);
        return { ok: true, ...identity };
      },
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
  first.dispose();
  second.dispose();
});
