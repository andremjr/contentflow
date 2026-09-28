import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(root, "docs", "SHARED_BROWSER_EXTENSION_INVENTORY_1_3.md");
const referenceRoot = path.join(root, "ecosystem", "plugins", "reference");

test("pacote 1.3 inventaria manifesto, protocolo e lifecycle da Browser Bridge", async () => {
  const [inventory, manifest, worker, contentScript] = await Promise.all([
    readFile(inventoryPath, "utf8"),
    readFile(path.join(root, "ecosystem", "browser-bridge", "manifest.json"), "utf8"),
    readFile(path.join(root, "ecosystem", "browser-bridge", "service-worker.js"), "utf8"),
    readFile(path.join(root, "ecosystem", "browser-bridge", "content-script.js"), "utf8"),
  ]);

  for (const expected of [
    "manifest.json",
    "`tabs`, `storage`, `debugger`, `alarms` e `power`",
    "PLUGIN_POLICIES",
    "COMMON_ACTIONS",
    "protocolVersion = 2",
    "contentflowCommandCacheV2",
    "contentflowCancelledExecutionsV2",
    "contentflowLeasesV1",
    "activeSessions",
    "debuggerSessionsByTab",
    "SESSION_TTL_MS",
    "MAX_ACTIVE_SESSIONS",
    "MAX_COMMAND_CACHE",
    "chrome.runtime.onMessage",
    "chrome.runtime.onConnect",
    "chrome.alarms.onAlarm",
    "chrome.tabs.onRemoved",
    "chrome.tabs.onUpdated",
    "setInterval(..., 20_000)",
    "setTimeout(..., 500)",
    "Chrome real",
  ]) {
    assert.ok(inventory.includes(expected), `inventário 1.3 não registra: ${expected}`);
  }

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.manifest_version, 3);
  assert.deepEqual(parsedManifest.permissions, ["tabs", "storage", "debugger", "alarms", "power"]);
  assert.match(worker, /const PROTOCOL_VERSION = 2;/);
  assert.match(worker, /const COMMAND_CACHE_KEY = "contentflowCommandCacheV2";/);
  assert.match(worker, /const LEASES_KEY = "contentflowLeasesV1";/);
  assert.match(worker, /chrome\.runtime\.onConnect\.addListener/);
  assert.match(worker, /chrome\.tabs\.onUpdated\.addListener/);
  assert.match(contentScript, /setInterval\(\(\) =>/);
  assert.match(contentScript, /20_000/);
  assert.match(contentScript, /setTimeout\(connectContentFlowBridge, 500\)/);
});

test("todo plugin de referência com profileSetup aparece no inventário da extensão", async () => {
  const inventory = await readFile(inventoryPath, "utf8");
  const entries = await readdir(referenceRoot, { withFileTypes: true });
  const profilePlugins = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(referenceRoot, entry.name, "contentflow.plugin.json");
    let manifest;
    try {
      manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    } catch {
      continue;
    }
    if (manifest.profileSetup) profilePlugins.push(entry.name);
  }

  assert.equal(
    profilePlugins.length,
    8,
    "o inventário 1.3 precisa ser revisto se o conjunto de profileSetup mudar",
  );
  for (const pluginName of profilePlugins) {
    assert.ok(
      inventory.includes(`\`${pluginName}\``),
      `plugin ${pluginName} não foi mapeado no inventário 1.3`,
    );
  }
});

test("inventário registra as três famílias atuais de cliente da Browser Bridge", async () => {
  const commonPlugins = [
    "chatgpt-browser-studio",
    "claude-browser-text",
    "gemini-browser-studio",
    "grok-browser-studio",
    "mai-playground-browser",
    "meta-ai-browser-studio",
  ];
  const [inventory, ...commonSources] = await Promise.all([
    readFile(inventoryPath, "utf8"),
    ...commonPlugins.map((plugin) =>
      readFile(path.join(referenceRoot, plugin, "browser-bridge-client.mjs"), "utf8"),
    ),
  ]);
  for (const source of commonSources.slice(1)) {
    assert.equal(
      source,
      commonSources[0],
      "as seis cópias comuns do cliente deixaram de estar sincronizadas",
    );
  }

  const vibes = await readFile(
    path.join(referenceRoot, "vibes-browser-studio", "browser-bridge-client.mjs"),
    "utf8",
  );
  const flow = await readFile(
    path.join(referenceRoot, "google-flow-browser-images", "handler.mjs"),
    "utf8",
  );
  assert.notEqual(
    vibes,
    commonSources[0],
    "Vibes deixou de ser variante; atualize o inventário se houve unificação",
  );
  assert.match(vibes, /leaseAcquire/);
  assert.match(flow, /globalThis\.contentFlowBridge\.connect/);
  assert.ok(inventory.includes("seis são idênticos entre si"));
  assert.ok(inventory.includes("variante própria"));
  assert.ok(inventory.includes("lógica equivalente embutida em `handler.mjs`"));
});
