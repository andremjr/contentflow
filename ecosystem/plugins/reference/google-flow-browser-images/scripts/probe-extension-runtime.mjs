import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const executable = process.argv[2];
const headless = process.argv.includes("--headless");
if (!executable) {
  console.error("Uso: node scripts/probe-extension-runtime.mjs <navegador> [--headless]");
  process.exitCode = 2;
} else {
  const extensionPath = fileURLToPath(new URL("../extension", import.meta.url));
  const profilePath = await mkdtemp(join(tmpdir(), "contentflow-flow-runtime-"));
  const port = 19444 + Math.floor(Math.random() * 1000);
  const args = [
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
    `--user-data-dir=${profilePath}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--start-minimized",
    `--disable-extensions-except=${extensionPath}`,
    `--load-extension=${extensionPath}`,
    ...(headless ? ["--headless=new"] : []),
    "about:blank",
  ];
  const child = spawn(executable, args, { shell: false, stdio: "ignore", windowsHide: true });
  let client;
  try {
    const deadline = Date.now() + 15000;
    let version;
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`);
        if (response.ok) {
          version = await response.json();
          break;
        }
      } catch {
        // O processo ainda está iniciando.
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!version?.webSocketDebuggerUrl) throw new Error("A porta CDP não respondeu.");

    client = new WebSocket(version.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      client.addEventListener("open", resolve, { once: true });
      client.addEventListener("error", reject, { once: true });
    });
    let nextId = 1;
    const pending = new Map();
    client.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const callback = pending.get(message.id);
      if (!callback) return;
      pending.delete(message.id);
      callback(message);
    });
    const send = (method, params = {}) =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, (message) =>
          message.error ? reject(new Error(message.error.message)) : resolve(message.result || {}),
        );
        client.send(JSON.stringify({ id, method, params }));
      });

    let worker;
    while (Date.now() < deadline) {
      const { targetInfos = [] } = await send("Target.getTargets");
      worker = targetInfos.find(
        (target) =>
          target.type === "service_worker" &&
          /^chrome-extension:\/\/[^/]+\/service-worker\.js$/i.test(String(target.url || "")),
      );
      if (worker) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    console.log(
      JSON.stringify({
        compatible: Boolean(worker),
        headless,
        browser: version.Browser,
        extensionWorkerUrl: worker?.url || null,
      }),
    );
    await send("Browser.close").catch(() => undefined);
    if (!worker) process.exitCode = 1;
  } catch (error) {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  } finally {
    try {
      client?.close();
    } catch {
      // O navegador pode ter fechado primeiro.
    }
    if (!child.killed) child.kill();
    await rm(profilePath, { recursive: true, force: true }).catch(() => undefined);
  }
}
