import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { validatePluginDirectory } from "./plugin-validation";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function copyFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "contentflow-branding-"));
  temporaryDirectories.push(root);
  const target = path.join(root, "plugin");
  await cp(path.resolve("ecosystem/plugins/reference/openai-gpt"), target, { recursive: true });
  return target;
}

async function updateManifest(
  directory: string,
  mutate: (manifest: Record<string, unknown>) => void,
) {
  const manifestPath = path.join(directory, "contentflow.plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  mutate(manifest);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

test("aceita PNG local válido e mantém branding opcional", async () => {
  const branded = await copyFixture();
  assert.equal(
    validatePluginDirectory(branded, false).manifest.branding?.iconPath,
    "assets/icon.png",
  );

  const legacy = await copyFixture();
  await updateManifest(legacy, (manifest) => delete manifest.branding);
  assert.equal(validatePluginDirectory(legacy, false).manifest.branding, undefined);
});

test("rejeita ícone ausente, conteúdo falso e traversal", async () => {
  const missing = await copyFixture();
  await rm(path.join(missing, "assets/icon.png"));
  assert.throws(() => validatePluginDirectory(missing, false), /Ícone não encontrado/);

  const forged = await copyFixture();
  await writeFile(path.join(forged, "assets/icon.png"), "não é uma imagem");
  assert.throws(() => validatePluginDirectory(forged, false), /PNG ou WebP válido/);

  const traversal = await copyFixture();
  await updateManifest(traversal, (manifest) => {
    manifest.branding = { iconPath: "../icon.png" };
  });
  assert.throws(() => validatePluginDirectory(traversal, false), /branding.iconPath/);
});
