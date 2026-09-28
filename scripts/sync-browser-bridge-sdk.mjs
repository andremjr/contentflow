import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const checkOnly = process.argv.includes("--check");
const canonicalClient = path.join(
  root,
  "ecosystem",
  "browser-bridge",
  "sdk",
  "browser-bridge-client.mjs",
);
const canonicalDiagnostics = path.join(
  root,
  "ecosystem",
  "browser-bridge",
  "sdk",
  "bridge-diagnostics.mjs",
);

const sharedClientPlugins = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
  "grok-browser-studio",
  "mai-playground-browser",
  "meta-ai-browser-studio",
];

const diagnosticsPlugins = [
  ...sharedClientPlugins,
  "google-flow-browser-images",
  "vibes-browser-studio",
];

async function synchronize(sourcePath, destinationPath) {
  const source = await readFile(sourcePath, "utf8");
  const current = await readFile(destinationPath, "utf8").catch(() => undefined);
  if (current === source) return false;
  if (checkOnly) {
    throw new Error(`${path.relative(root, destinationPath)} divergiu da fonte canônica.`);
  }
  await writeFile(destinationPath, source, "utf8");
  return true;
}

let changed = 0;
for (const plugin of sharedClientPlugins) {
  changed += Number(
    await synchronize(
      canonicalClient,
      path.join(root, "ecosystem", "plugins", "reference", plugin, "browser-bridge-client.mjs"),
    ),
  );
}
for (const plugin of diagnosticsPlugins) {
  changed += Number(
    await synchronize(
      canonicalDiagnostics,
      path.join(root, "ecosystem", "plugins", "reference", plugin, "bridge-diagnostics.mjs"),
    ),
  );
}

if (!checkOnly && changed) {
  process.stdout.write(`Browser Bridge SDK sincronizado em ${changed} arquivo(s).\n`);
}
