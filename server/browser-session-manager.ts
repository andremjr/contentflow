import { devProbe } from "./dev-monitor/client";
import type { DevEvent } from "./dev-monitor/contract";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";

export type CoreBrowserSession = {
  port: number;
  webSocketDebuggerUrl: string;
};

export function shouldAutoCloseCoreBrowserSession(invocation?: { mode?: string; action?: string }) {
  return invocation?.mode !== "configure";
}

type ManagedSession = CoreBrowserSession & {
  child: ChildProcess;
  monitorCorrelation?: DevEvent["correlation"];
};

export type BrowserSessionManagerDependencies = {
  reservePort: () => Promise<number>;
  browserVersion: (port: number) => Promise<string | undefined>;
  closeThroughCdp: (webSocketDebuggerUrl: string) => Promise<boolean>;
  spawnChrome: typeof spawn;
  startupTimeoutMs: number;
  pollIntervalMs: number;
};

async function reserveLoopbackPort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
  });
}

function chromeCandidates(explicit?: unknown) {
  const requested = typeof explicit === "string" ? explicit.trim() : "";
  const candidates = [
    requested,
    process.env.PROGRAMFILES
      ? path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    process.env["PROGRAMFILES(X86)"]
      ? path.join(
          process.env["PROGRAMFILES(X86)"]!,
          "Google",
          "Chrome",
          "Application",
          "chrome.exe",
        )
      : "",
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Google", "Chrome", "Application", "chrome.exe")
      : "",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return [...new Set(candidates)].filter((candidate) => existsSync(candidate));
}

async function browserVersion(port: number) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!response.ok) return undefined;
    const value = (await response.json()) as { webSocketDebuggerUrl?: string };
    return value.webSocketDebuggerUrl ? value.webSocketDebuggerUrl : undefined;
  } catch {
    return undefined;
  }
}

async function closeThroughCdp(webSocketDebuggerUrl: string) {
  if (typeof WebSocket !== "function") return false;
  return new Promise<boolean>((resolve) => {
    const socket = new WebSocket(webSocketDebuggerUrl);
    const timeout = setTimeout(() => {
      socket.close();
      resolve(false);
    }, 2_000);
    timeout.unref();
    socket.addEventListener("open", () =>
      socket.send(JSON.stringify({ id: 1, method: "Browser.close" })),
    );
    socket.addEventListener("message", () => {
      clearTimeout(timeout);
      socket.close();
      resolve(true);
    });
    socket.addEventListener("error", () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

export class BrowserSessionManager {
  private readonly dependencies: BrowserSessionManagerDependencies;

  constructor(dependencies: Partial<BrowserSessionManagerDependencies> = {}) {
    this.dependencies = {
      reservePort: reserveLoopbackPort,
      browserVersion,
      closeThroughCdp,
      spawnChrome: spawn,
      // A managed profile can cold-start Chrome and its shared Bridge extension
      // together. Fifteen seconds was short enough to classify a slow but
      // healthy profile as unavailable, especially after a Windows restart.
      startupTimeoutMs: 45_000,
      pollIntervalMs: 250,
      ...dependencies,
    };
  }

  async open(input: {
    monitorCorrelation?: DevEvent["correlation"];
    profileDirectory: string;
    browserBridgeDirectory?: string;
    chromeExecutable?: unknown;
    visible?: boolean;
    signal?: AbortSignal;
  }): Promise<ManagedSession> {
    const executable = chromeCandidates(input.chromeExecutable)[0];
    if (!executable)
      throw Object.assign(new Error("Google Chrome não foi localizado."), {
        code: "INVALID_CONFIGURATION",
      });
    const port = await this.dependencies.reservePort();
    const args = [
      `--remote-debugging-port=${port}`,
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${input.profileDirectory}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-blink-features=AutomationControlled",
      "--window-size=1280,800",
      "about:blank",
    ];
    if (input.browserBridgeDirectory) {
      args.splice(args.length - 1, 0, `--load-extension=${input.browserBridgeDirectory}`);
    }
    if (input.visible === false) {
      args.unshift(
        "--start-minimized",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
        "--disable-features=CalculateNativeWinOcclusion",
      );
    }
    const child = this.dependencies.spawnChrome(executable, args, {
      stdio: "ignore",
      windowsHide: false,
      shell: false,
    });
    const probe = devProbe("profiles", "browser-session-manager");
    const correlation = { ...input.monitorCorrelation, instanceId: String(child.pid ?? port) };
    if (probe.enabled)
      probe.emit({
        kind: "instance.created",
        entity: { type: "instance", id: correlation.instanceId },
        correlation,
        payload: { status: "created" },
      });
    const abort = () => child.kill();
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      const deadline = Date.now() + this.dependencies.startupTimeoutMs;
      while (Date.now() < deadline) {
        if (input.signal?.aborted)
          throw Object.assign(new Error("Execução cancelada."), { code: "CANCELLED" });
        if (child.exitCode !== null) throw new Error("O Chrome encerrou durante a inicialização.");
        const webSocketDebuggerUrl = await this.dependencies.browserVersion(port);
        if (webSocketDebuggerUrl) {
          if (probe.enabled)
            probe.emit({
              kind: "instance.ready",
              entity: { type: "instance", id: correlation.instanceId },
              correlation,
              payload: { status: "ready" },
            });
          return { port, webSocketDebuggerUrl, child, monitorCorrelation: correlation };
        }
        await new Promise((resolve) => setTimeout(resolve, this.dependencies.pollIntervalMs));
      }
      throw new Error("O Chrome não ficou pronto dentro do tempo esperado.");
    } catch (error) {
      if (probe.enabled)
        probe.emit({
          kind: "instance.crashed",
          entity: { type: "instance", id: correlation.instanceId },
          correlation,
          payload: { status: "crashed" },
        });
      child.kill();
      throw error;
    } finally {
      input.signal?.removeEventListener("abort", abort);
    }
  }

  async close(session: ManagedSession) {
    await this.dependencies.closeThroughCdp(session.webSocketDebuggerUrl).catch(() => false);
    if (session.child.exitCode === null) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2_000);
        timeout.unref();
        session.child.once("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    if (session.child.exitCode === null) session.child.kill();
    const probe = devProbe("profiles", "browser-session-manager");
    if (probe.enabled)
      probe.emit({
        kind: "instance.closed",
        entity: { type: "instance", id: String(session.child.pid ?? session.port) },
        correlation: session.monitorCorrelation ?? {},
        payload: { status: "closed" },
      });
  }
}
