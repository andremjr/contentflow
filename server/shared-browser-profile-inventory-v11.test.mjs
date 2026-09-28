import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(root, "docs", "SHARED_BROWSER_PROFILES_INVENTORY_1_1.md");
const referenceRoot = path.join(root, "ecosystem", "plugins", "reference");

test("pacote 1.1 inventaria superfícies centrais de perfil e portabilidade", async () => {
  const inventory = await readFile(inventoryPath, "utf8");
  for (const expected of [
    "server/plugin-profiles.ts",
    "server/index.ts",
    "server/plugin-runner.ts",
    "server/plugin-worker.ts",
    "src/routes/plugins.tsx",
    "src/components/method-builder.tsx",
    "server/builder-methods.ts",
    "server/mcp.ts",
    "src/lib/method-file.ts",
    "server/data-directory-migration.ts",
    "server/browser-profile-readiness.ts",
    "plugin_workspaces",
    "plugin_profiles",
    "getWorkspacePath()",
    "getProfilePath()",
  ]) {
    assert.match(inventory, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("todo plugin de referência com profileSetup aparece no inventário 1.1", async () => {
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

  assert.ok(
    profilePlugins.length >= 1,
    "esperava ao menos um plugin de referência com profileSetup",
  );
  for (const pluginName of profilePlugins) {
    assert.match(
      inventory,
      new RegExp(
        `ecosystem/plugins/reference/${pluginName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`,
      ),
      `plugin ${pluginName} não foi mapeado no inventário 1.1`,
    );
  }
});
