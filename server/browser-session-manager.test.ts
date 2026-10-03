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
    startupTimeoutMs: 1_000,
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
  assert.equal(child.killed, false);
});

test("failed graceful shutdown preserves Chrome instead of forcibly terminating its profile", async () => {
  const child = fakeChild();
  const closed: string[] = [];
  const manager = new BrowserSessionManager({
    closeThroughCdp: async (url) => {
      closed.push(url);
      return false;
    },
  });

  const result = await manager.close({
    port: 45680,
    webSocketDebuggerUrl: "ws://127.0.0.1:45680/devtools/browser/test",
    child,
  });

  assert.deepEqual(closed, ["ws://127.0.0.1:45680/devtools/browser/test"]);
  assert.equal(result, false);
  assert.equal(child.killed, false);
});

test("configuração de perfil deixa o fechamento do navegador com o usuário", () => {
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "configure", action: "prepare" }), false);
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "configure", action: "status" }), false);
  assert.equal(shouldAutoCloseCoreBrowserSession({ mode: "start" }), true);
});

function poolFixture(overrides = {}) {
  const children = new Map<number, ChildProcess>();
  let launches = 0;
  const manager = new BrowserSessionManager({
    reservePort: async () => 47000 + launches,
    browserVersion: async (port) =>
      children.get(port)?.exitCode === null ? `ws://localhost:${port}` : undefined,
    spawnChrome: ((_executable: string, args: string[]) => {
      const child = fakeChild();
      launches++;
      children.set(
        Number(args.find((arg) => arg.startsWith("--remote-debugging-port="))!.split("=")[1]),
        child,
      );
      return child;
    }) as never,
    closeThroughCdp: async (url) => {
      children.get(Number(new URL(url).port))?.kill();
      return true;
    },
    ...overrides,
  });
  const open = (profileDirectory: string) =>
    manager.open({ profileDirectory, chromeExecutable: process.execPath });
  return { manager, open, children, launches: () => launches };
}

test("reuses an idle physical profile and rejects a second active acquisition", async () => {
  const f = poolFixture();
  try {
    const first = await f.open("profile-a");
    await assert.rejects(() => f.open("profile-a"), { code: "LEASE_UNAVAILABLE" });
    await f.manager.release(first);
    assert.equal(await f.open("profile-a"), first);
    assert.equal(f.launches(), 1);
  } finally {
    await f.manager.dispose();
  }
});

test("evicts the oldest idle session but never an active profile", async () => {
  const f = poolFixture();
  try {
    const active = await f.open("profile-active");
    const oldest = await f.open("profile-oldest");
    await f.manager.release(oldest);
    const recent = await f.open("profile-recent");
    await f.manager.release(recent);
    assert.equal(oldest.child.exitCode, 0);
    assert.equal(active.child.exitCode, null);
    assert.equal(recent.child.exitCode, null);
  } finally {
    await f.manager.dispose();
  }
});

test("expires idle browsers, not active work, and disposes retained resources", async () => {
  const f = poolFixture({ idleTimeoutMs: 20 });
  const active = await f.open("active");
  const idle = await f.open("idle");
  await f.manager.release(idle);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(idle.child.exitCode, 0);
  assert.equal(active.child.exitCode, null);
  await f.manager.dispose();
  assert.equal(active.child.exitCode, 0);
});

test("a manually closed retained browser is replaced without reusing its stale endpoint", async () => {
  const f = poolFixture();
  try {
    const first = await f.open("profile");
    await f.manager.release(first);
    first.child.kill();
    const next = await f.open("profile");
    assert.notEqual(next.port, first.port);
    assert.equal(f.launches(), 2);
  } finally {
    await f.manager.dispose();
  }
});

test("interactive preparation remains user-owned and can be borrowed by later work", async () => {
  const f = poolFixture({ idleTimeoutMs: 10 });
  const session = await f.manager.open({
    profileDirectory: "interactive",
    chromeExecutable: process.execPath,
    reusable: false,
  });
  f.manager.releaseForConfiguration(session);
  assert.equal(await f.open("interactive"), session);
  await f.manager.release(session);
  await new Promise((resolve) => setTimeout(resolve, 40));
  await f.manager.dispose();
  assert.equal(session.child.exitCode, null);
  assert.equal(f.launches(), 1);
  await f.manager.close(session);
});

test("a transient probe failure never closes or replaces a retained physical profile", async () => {
  let responsive = true;
  const f = poolFixture({
    browserVersion: async (port: number) => (responsive ? `ws://localhost:${port}` : undefined),
  });
  try {
    const first = await f.open("profile");
    await f.manager.release(first);
    responsive = false;
    await assert.rejects(() => f.open("profile"), { code: "BRIDGE_DISCONNECTED" });
    assert.equal(first.child.exitCode, null);
    assert.equal(first.child.killed, false);
    assert.equal(f.launches(), 1);
    responsive = true;
    assert.equal(await f.open("profile"), first);
  } finally {
    await f.manager.dispose();
  }
});

test("unconfirmed shutdown retains ownership and does not evict or kill a live browser", async () => {
  const f = poolFixture({ closeThroughCdp: async () => false });
  const first = await f.open("profile");
  await f.manager.release(first);
  assert.equal(await f.manager.close(first), false);
  assert.equal(first.child.killed, false);
  assert.equal(await f.open("profile"), first);
  await f.manager.dispose();
  assert.equal(first.child.killed, false);
  first.child.kill();
});
