import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const browserPlugins = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
  "google-flow-browser-images",
  "grok-browser-studio",
  "meta-ai-browser-studio",
];

test("todos os jobs de navegador iniciam minimizados por padrão", async () => {
  for (const plugin of browserPlugins) {
    const root = new URL(`../ecosystem/plugins/reference/${plugin}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("contentflow.plugin.json", root), "utf8"));
    const source = await readFile(new URL("handler.mjs", root), "utf8");
    assert.equal(
      manifest.settingsSchema?.properties?.startMinimized?.default,
      true,
      `${plugin} precisa manter startMinimized como padrão`,
    );
    assert.ok(
      source.includes("settings.startMinimized !== false"),
      `${plugin} precisa respeitar startMinimized em qualquer modo de job`,
    );
    assert.ok(
      !/runMode\s*!==\s*["']method_test["'][\s\S]{0,100}settings\.startMinimized/.test(source),
      `${plugin} não pode abrir automaticamente só porque o job é um teste de bloco`,
    );
  }
});
