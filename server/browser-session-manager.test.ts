import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import type { ChildProcess } from "node:child_process";
import {
  BrowserSessionManager,
  shouldAutoCloseCoreBrowserSession,
} from "./browser-session-manager";

function fakeChild() {
  const emitter = new EventEmitter() as EventEmitter & {
    exitCode: number | null;
    killed: boolean;
    kill: () => boolean;
  };
  emitter.exitCode = null;
  emitter.killed = false;
  emitter.kill = () => {
    emitter.killed = true;
    emitter.exitCode = 0;
    emitter.emit("exit", 0);
    return true;
  };
  return emitter as unknown as ChildProcess;
}

test("abre uma única sessão com a porta reservada e devolve somente o endpoint efêmero", async () => {
  const child = fakeChild();
  const launches: Array<{ executable: string; args: string[] }> = [];
  let probes = 0;
  const manager = new BrowserSessionManager({
    reservePort: async () => 45678,
    browserVersion: async () =>
      ++probes >= 2 ? "ws://127.0.0.1:45678/devtools/browser/test" : undefined,
    closeThroughCdp: async () => true,
    spawnChrome: ((executable: string, args: readonly string[]) => {
      launches.push({ executable, args: [...args] });
      return child;
    }) as never,
    startupTimeoutMs: 100,
    pollIntervalMs: 1,
  });

  const session = await manager.open({
    profileDirectory: "C:\\contentflow-test-profile",
    browserBridgeDirectory: "C:\\contentflow-browser-bridge",
    chromeExecutable: process.execPath,
    visible: false,
  });

  assert.equal(session.port, 45678);
  assert.equal(session.webSocketDebuggerUrl, "ws://127.0.0.1:45678/devtools/browser/test");
  assert.equal(launches.length, 1);
  assert.ok(launches[0]!.args.includes("--remote-debugging-port=45678"));
  assert.ok(launches[0]!.args.includes("--user-data-dir=C:\\contentflow-test-profile"));
  assert.ok(launches[0]!.args.includes("--load-extension=C:\\contentflow-browser-bridge"));
  assert.ok(launches[0]!.args.includes("--start-minimized"));
});

test("permite a inicialização fria da Bridge sem reduzir o polling", () => {
  const manager = new BrowserSessionManager();
  assert.equal(
    (manager as unknown as { dependencies: { startupTimeoutMs: number } }).dependencies
      .startupTimeoutMs,
    45_000,
  );
});

test("cancelamento durante startup encerra o processo e não devolve sessão", async () => {
  const child = fakeChild();
  const controller = new AbortController();
  const manager = new BrowserSessionManager({
    reservePort: async () => 45679,
    browserVersion: async () => undefined,
    closeThroughCdp: async () => false,
    spawnChrome: (() => child) as never,
    startupTimeoutMs: 100,
    pollIntervalMs: 1,
  });
  controller.abort();

  await assert.rejects(
    manager.open({
      profileDirectory: "C:\\contentflow-test-profile",
      chromeExecutable: process.execPath,
      signal: controller.signal,
    }),
    (error: unknown) => (error as { code?: string }).code === "CANCELLED",
  );
  assert.equal(child.killed, true);
});

test("fechamento tenta CDP primeiro e força kill somente se o Chrome continuar vivo", async () => {
  const child = fakeChild();
  const closed: string[] = [];
  const manager = new BrowserSessionManager({
    closeThroughCdp: async (url) => {
      closed.push(url);
      return false;
    },
  });

  await manager.close({
    port: 45680,
    webSocketDebuggerUrl: "ws://127.0.0.1:45680/devtools/browser/test",
    child,
  });

  assert.deepEqual(closed, ["ws://127.0.0.1:45680/devtools/browser/test"]);
  assert.equal(child.killed, true);
});

test("configuração de perfil deixa o fechamento do navegador com o usuário", () => {
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "configure", action: "prepare" }), false);
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "configure", action: "status" }), false);
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "start" }), true);
});
