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

test("inventário 1.2 preserva inferências históricas sem exigir sua presença no runtime atual", async () => {
  const inventory = await readFile(inventoryPath, "utf8");

  assert.match(inventory, /Documento histórico — arquivado/);
  assert.match(inventory, /não é o roadmap de implementação vigente/);
  assert.match(inventory, /CURRENT_STATE\.md/);
  assert.match(inventory, /DEVELOPMENT\.md/);

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
      `inventário não preserva inferência posicional histórica: ${expected}`,
    );
  }
});
