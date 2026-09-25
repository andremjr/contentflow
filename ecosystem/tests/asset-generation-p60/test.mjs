import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, "..", "..", "..");
const fixture = JSON.parse(await readFile(path.join(root, "p60-integrated-fixture.json"), "utf8"));
const canonical = JSON.parse(
  await readFile(
    path.join(
      repo,
      "ecosystem/plugins/reference/google-flow-browser-images/fixtures/asset-generation-canonical-v1.json",
    ),
    "utf8",
  ),
);

const manifestDirs = new Map([
  ["local.contentflow.google-flow-batch-images", "google-flow-browser-images"],
  ["local.contentflow.vibes-browser-studio", "vibes-browser-studio"],
  ["local.contentflow.meta-ai-browser-studio", "meta-ai-browser-studio"],
  ["local.contentflow.chatgpt-browser-studio", "chatgpt-browser-studio"],
  ["local.contentflow.free-stock-media-studio", "free-stock-media-studio"],
]);

async function readJson(relative) {
  return JSON.parse(await readFile(path.resolve(root, relative), "utf8"));
}

test("P60 deriva da fixture P00 e cobre dezenas de slots em cinco fontes", async () => {
  assert.equal(fixture.derivedFromFixtureId, canonical.fixtureId);
  assert.deepEqual(fixture.baseSlots, canonical.slots);
  assert.equal(fixture.providers.length, 5);

  const generationSeeds = [
    ...fixture.baseSlots.filter((slot) => slot.kind === "generation_prompt"),
    ...fixture.extraGenerationPrompts,
  ];
  const stockSeeds = [
    ...fixture.baseSlots.filter((slot) => slot.kind === "stock_brief").map((slot) => slot.brief),
    ...fixture.extraStockBriefs,
  ];
  const generatedSlots = fixture.providers
    .filter((provider) => provider.source !== "free-stock")
    .flatMap((provider) =>
      generationSeeds.map((seed) => `p60-${provider.source}-${seed.expectedItemId}`),
    );
  const stockSlots = stockSeeds.map((brief) => `p60-free-stock-${brief.brief_id}`);

  assert.equal(generatedSlots.length, 20);
  assert.equal(stockSlots.length, 3);
  assert.equal(new Set([...generatedSlots, ...stockSlots]).size, 23);
  assert.ok(
    [...generatedSlots, ...stockSlots].includes(fixture.runPolicy.intentionalFailureItemId),
  );
});

test("Métodos P60 apontam para capabilities e portas que existem nos manifestos atuais", async () => {
  for (const provider of fixture.providers) {
    const methodFile = await readJson(provider.methodFile);
    assert.equal(methodFile.format, "contentflow-method");
    assert.equal(methodFile.method.processType, "assets");
    methodFile.method.blocks.forEach((block, index) => assert.equal(block.order, index));

    const pluginBlock = methodFile.method.blocks.find(
      (block) =>
        block.plugin?.pluginId === provider.pluginId &&
        block.plugin?.capabilityId === provider.capabilityId,
    );
    assert.ok(pluginBlock, `${provider.source}: bloco do provedor ausente`);
    assert.ok(pluginBlock.inputs.some((input) => input.portKey === provider.inputPort));
    assert.ok(pluginBlock.outputs.some((output) => output.portKey === provider.outputPort));

    const manifestDir = manifestDirs.get(provider.pluginId);
    assert.ok(manifestDir, `${provider.source}: manifesto não mapeado`);
    const manifest = JSON.parse(
      await readFile(
        path.join(repo, "ecosystem/plugins/reference", manifestDir, "contentflow.plugin.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.id, provider.pluginId);
    const capability = manifest.capabilities.find((entry) => entry.id === provider.capabilityId);
    assert.ok(capability, `${provider.source}: capability ausente`);
    assert.ok(capability.inputPorts.some((port) => port.key === provider.inputPort));
    assert.ok(capability.outputPorts.some((port) => port.key === provider.outputPort));

    const validation = methodFile.method.blocks.find((block) => block.type === "VALIDAR");
    assert.ok(validation, `${provider.source}: VALIDAR ausente`);
    assert.equal(validation.validation.targetBlockId, pluginBlock.id);
    assert.equal(validation.validation.targetOutputKey, provider.outputPort);
  }
});

test("modelo de interrupção e retomada preserva concluídos, tentativa e proveniência", () => {
  const itemIds = fixture.providers
    .filter((provider) => provider.source !== "free-stock")
    .flatMap((provider) => {
      const seeds = [
        ...fixture.baseSlots.filter((slot) => slot.kind === "generation_prompt"),
        ...fixture.extraGenerationPrompts,
      ];
      return seeds.map((seed) => `p60-${provider.source}-${seed.expectedItemId}`);
    });
  const ledger = new Map();
  const midpoint = Math.floor(itemIds.length / 2);

  for (const itemId of itemIds.slice(0, midpoint)) {
    ledger.set(itemId, {
      status: "completed",
      attempt: 1,
      artifactId: `${itemId}-artifact`,
      sha256: `sha-${itemId}`,
    });
  }
  const pendingBeforeResume = itemIds.filter((itemId) => !ledger.has(itemId));
  for (const itemId of pendingBeforeResume) {
    if (itemId === fixture.runPolicy.intentionalFailureItemId) {
      ledger.set(itemId, { status: "failed", attempt: 1 });
      ledger.set(itemId, {
        status: "completed",
        attempt: 2,
        artifactId: `${itemId}-artifact`,
        sha256: `sha-${itemId}`,
      });
    } else {
      ledger.set(itemId, {
        status: "completed",
        attempt: 1,
        artifactId: `${itemId}-artifact`,
        sha256: `sha-${itemId}`,
      });
    }
  }

  assert.equal(ledger.size, itemIds.length);
  for (const itemId of itemIds.slice(0, midpoint)) assert.equal(ledger.get(itemId).attempt, 1);
  assert.equal(ledger.get(fixture.runPolicy.intentionalFailureItemId).attempt, 2);

  const selection = [...ledger].map(([itemId, entry]) => ({
    itemId,
    attempt: entry.attempt,
    artifactId: entry.artifactId,
    sha256: entry.sha256,
    source: itemId.split("-")[1],
  }));
  assert.equal(selection.length, itemIds.length);
  assert.ok(
    selection.every((entry) => entry.itemId && entry.artifactId && entry.sha256 && entry.source),
  );
});
