import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverPluginDirectories, normalizeUserProvidedPath } from "./plugin-package";
import { pluginRegistrationConflictIsReportable } from "./plugin-runner";

test("aceita caminhos colados com aspas simples ou duplas", () => {
  assert.equal(
    normalizeUserProvidedPath('  "C:\\Plugins\\Meu plugin"  '),
    "C:\\Plugins\\Meu plugin",
  );
  assert.equal(normalizeUserProvidedPath("'C:\\Plugins\\Meu plugin'"), "C:\\Plugins\\Meu plugin");
  assert.equal(normalizeUserProvidedPath("C:\\Plugins\\Meu plugin"), "C:\\Plugins\\Meu plugin");
});

test("pasta local substitui a instalação sem gerar conflito de manifesto", () => {
  assert.equal(pluginRegistrationConflictIsReportable("local", "installed"), false);
  assert.equal(pluginRegistrationConflictIsReportable("local", "local"), true);
  assert.equal(pluginRegistrationConflictIsReportable("installed", "installed"), true);
});

test("descobre um plugin individual ou vários plugins na raiz de um pacote", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-plugin-package-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const individual = path.join(root, "individual");
  await mkdir(individual);
  await writeFile(path.join(individual, "contentflow.plugin.json"), "{}");
  assert.deepEqual(discoverPluginDirectories(individual), [individual]);
  assert.deepEqual(discoverPluginDirectories(`"${individual}"`), [individual]);

  const bundle = path.join(root, "bundle");
  await mkdir(path.join(bundle, "plugin-b"), { recursive: true });
  await mkdir(path.join(bundle, "plugin-a"), { recursive: true });
  await mkdir(path.join(bundle, "documentation"), { recursive: true });
  await writeFile(path.join(bundle, "plugin-a", "contentflow.plugin.json"), "{}");
  await writeFile(path.join(bundle, "plugin-b", "contentflow.plugin.json"), "{}");
  assert.deepEqual(discoverPluginDirectories(bundle), [
    path.join(bundle, "plugin-a"),
    path.join(bundle, "plugin-b"),
  ]);
});

test("rejeita pasta vazia ou inexistente", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-empty-package-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  assert.throws(() => discoverPluginDirectories(root), /não contém/);
  assert.throws(() => discoverPluginDirectories(path.join(root, "missing")), /não existe/);
});
