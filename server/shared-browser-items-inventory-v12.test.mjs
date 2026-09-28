import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = path.join(root, "docs", "SHARED_BROWSER_ITEMS_INVENTORY_1_2.md");

test("pacote 1.2 inventaria identidades, persistência e superfícies de itens", async () => {
  const inventory = await readFile(inventoryPath, "utf8");
  for (const expected of [
    "BlockExecution",
    "BlockExecutionItem",
    "ProjectDelivery",
    "DeliveryItem",
    "process_executions.payload",
    "plugin_jobs.payload",
    "partialValues",
    "partialArtifacts",
    "plugin-item-orchestration.ts",
    "plugin-incremental-items.ts",
    "plugin-runner.ts",
    "runtime-contract.ts",
    "sourceItemId",
    "sourceExecutionItemId",
    "artifact -> delivery item",
  ]) {
    assert.match(inventory, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("inferências posicionais existentes permanecem explicitamente registradas no inventário 1.2", async () => {
  const [inventory, deliveries, orchestration, index] = await Promise.all([
    readFile(inventoryPath, "utf8"),
    readFile(path.join(root, "src", "lib", "deliveries.ts"), "utf8"),
    readFile(path.join(root, "server", "plugin-item-orchestration.ts"), "utf8"),
    readFile(path.join(root, "server", "index.ts"), "utf8"),
  ]);

  for (const expected of [
    "sourceItemIds[order]",
    "outputs[index]",
    "items[currentIndex]",
    "itemIds[currentIndex]",
    "executionItems[order]",
    "String(order + 1)",
    "candidate.order === order",
  ]) {
    assert.ok(
      inventory.includes(expected),
      `inventário não registra inferência posicional: ${expected}`,
    );
  }

  assert.match(
    orchestration,
    /sourceItemIds\?\.length === items\.length \? sourceItemIds\[order\]/,
  );
  assert.match(orchestration, /outputs\[index\]/);
  assert.match(orchestration, /item\.items\[item\.currentIndex\]/);
  assert.match(orchestration, /item\.itemIds\[item\.currentIndex\]/);
  assert.match(deliveries, /executionItems\?\.\[order\]\?\.id/);
  assert.match(deliveries, /String\(order \+ 1\)/);
  assert.match(deliveries, /candidate\.order === order/);
  assert.match(index, /oldIndexById\.get\(item\.id\)!/);
});
