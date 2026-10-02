import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseMethodFile, parseMethodImportFile } from "../../src/lib/method-file.ts";
import { areValueShapesCompatible } from "../../src/lib/data-shape.ts";
import { resolveInstructionTemplate } from "../../src/lib/instruction-template.ts";
import { __test as chatgpt } from "../plugins/reference/chatgpt-browser-studio/handler.mjs";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const methodName = "historicos-assets-50-imagens.contentflow-method.json";
const contents = readFileSync(path.join(repo, methodName), "utf8");

test("Método Históricos v3 preserva dois Blocos, 50 prompts e as portas API v2", () => {
  const parsed = parseMethodFile(contents);
  assert.deepEqual(parseMethodImportFile(contents), parsed);
  assert.equal(parsed.version, 3);
  assert.equal(parsed.method.contractVersion, 3);
  assert.equal(parsed.method.name, parsed.name);
  assert.equal(parsed.method.processType, "assets");
  assert.equal(parsed.method.blocks.length, 2);
  const [prompts, images] = parsed.method.blocks;
  assert.deepEqual(
    parsed.method.blocks.map((block) => [block.type, block.operator, block.order]),
    [
      ["CRIAR", "IA", 0],
      ["CRIAR", "IA", 1],
    ],
  );
  assert.equal(prompts.parameters[0].key, "scene_count");
  assert.equal(prompts.parameters[0].value, 50);
  assert.equal(images.plugin.configuration.maxImagesPerPrompt, 1);
  assert.equal(images.plugin.configuration.maxConcurrentGenerations, 1);
  assert.deepEqual(prompts.inputs[0].binding, {
    kind: "previous_process",
    processType: "script",
    outputKey: "script",
  });
  assert.deepEqual(images.inputs[0].binding, {
    kind: "previous_block",
    blockId: prompts.id,
    outputKey: prompts.outputs[0].key,
  });
  assert.equal(prompts.inputs[0].portKey, "context_1");
  assert.equal(prompts.outputs[0].portKey, "parts");
  assert.equal(images.inputs[0].portKey, "prompts");
  assert.equal(images.outputs[0].portKey, "images");
  assert.ok(areValueShapesCompatible(prompts.outputs[0].shape, images.inputs[0].shape));
  for (const [block, directory] of [
    [prompts, "chatgpt-browser-studio"],
    [images, "google-flow-browser-images"],
  ]) {
    const manifest = JSON.parse(
      readFileSync(
        path.join(repo, "ecosystem/plugins/reference", directory, "contentflow.plugin.json"),
        "utf8",
      ),
    );
    assert.equal(block.plugin.pluginId, manifest.id);
    assert.equal(block.plugin.pluginVersion, "2.0.0");
    assert.equal(block.plugin.pluginVersion, manifest.version);
    const capability = manifest.capabilities.find(
      (entry) => entry.id === block.plugin.capabilityId,
    );
    assert.ok(capability);
    for (const input of block.inputs) {
      const port = capability.inputPorts.find((entry) => entry.key === input.portKey);
      assert.ok(port);
      assert.ok(areValueShapesCompatible(input.shape, port.shape));
    }
    for (const output of block.outputs) {
      const port = capability.outputPorts.find((entry) => entry.key === output.portKey);
      assert.ok(port);
      assert.ok(areValueShapesCompatible(port.shape, output.shape));
    }
    assert.equal(block.plugin.configuration.accountProfile, undefined);
    assert.equal(block.plugin.configuration.fallbackAccountProfiles, undefined);
    assert.equal(block.plugin.connectionId, undefined);
    assert.equal(block.plugin.profileExecution, undefined);
  }
  assert.throws(() => parseMethodFile(JSON.stringify({ ...JSON.parse(contents), version: 1 })));
});

test("o plugin serializa e lê os 50 prompts, sem exigência de linhas no Método", () => {
  const block = parseMethodFile(contents).method.blocks[0];
  const resolved = resolveInstructionTemplate(block.instructions, {
    channel: { name: "Teste", language: "es", niche: "História" },
    project: { title: "Teste" },
    block: { name: block.name, type: block.type },
    inputs: [{ ...block.inputs[0], value: "Roteiro de teste." }],
    parameters: { scene_count: 50 },
  });
  assert.deepEqual([...resolved.unresolved], []);
  assert.match(resolved.instruction, /exatamente 50 prompts/);
  assert.match(resolved.instruction, /Roteiro de teste\./);
  assert.doesNotMatch(resolved.instruction, /linhas não vazias|uma linha por prompt/);
  const request = {
    resolvedInstruction: resolved.instruction,
    inputs: { context_1: "Roteiro de teste." },
    outputContract: block.outputs,
    configuration: {},
  };
  assert.match(chatgpt.buildParts(request)[0], /array JSON válido de strings/);
  const prompts = Array.from({ length: 50 }, (_, index) => `Prompt de teste ${index + 1}`);
  assert.deepEqual(chatgpt.generationResponseValues(JSON.stringify(prompts), [], request), {
    parts: prompts,
  });
  assert.throws(
    () => chatgpt.generationResponseValues(prompts.join("\n"), [], request),
    /array JSON válido/,
  );
});

function catalogWorkspace(t, methodContents) {
  const workspace = mkdtempSync(path.join(os.tmpdir(), "contentflow-catalog-method-"));
  assert.equal(path.dirname(workspace), path.resolve(os.tmpdir()));
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  writeFileSync(path.join(workspace, methodName), methodContents);
  mkdirSync(path.join(workspace, "release/ecosystem"), { recursive: true });
  writeFileSync(
    path.join(workspace, "release/ecosystem/ContentFlow-Plugin-Catalog.json"),
    JSON.stringify({ plugins: [] }),
  );
  return workspace;
}

function prepare(workspace) {
  return spawnSync(process.execPath, [path.join(repo, "scripts/prepare-official-catalog.mjs")], {
    cwd: workspace,
    encoding: "utf8",
  });
}

test("catálogo copia exatamente o Método v3 validado e registra versão/hash", (t) => {
  const workspace = catalogWorkspace(t, contents);
  const result = prepare(workspace);
  assert.equal(result.status, 0, result.stderr);
  const output = path.join(workspace, "release/ecosystem");
  const catalog = JSON.parse(readFileSync(path.join(output, "catalog.json"), "utf8"));
  assert.equal(catalog.methods[0].version, "3");
  assert.equal(catalog.methods[0].sha256, createHash("sha256").update(contents).digest("hex"));
  assert.equal(readFileSync(path.join(output, catalog.methods[0].downloadUrl), "utf8"), contents);
});

test("catálogo rejeita Método v1 antes de copiar ou escrever o catálogo", (t) => {
  const workspace = catalogWorkspace(t, JSON.stringify({ ...JSON.parse(contents), version: 1 }));
  const result = prepare(workspace);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /não passou no parser v3/);
  assert.equal(existsSync(path.join(workspace, "release/ecosystem/methods")), false);
  assert.equal(existsSync(path.join(workspace, "release/ecosystem/catalog.json")), false);
});
