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

test("execução normal inicia minimizada e teste de Método mantém o navegador visível", async () => {
  for (const plugin of browserPlugins) {
    const root = new URL(`../ecosystem/plugins/reference/${plugin}/`, import.meta.url);
    const manifest = JSON.parse(await readFile(new URL("contentflow.plugin.json", root), "utf8"));
    const source = await readFile(new URL("handler.mjs", root), "utf8");
    assert.equal(
      manifest.settingsSchema?.properties?.startMinimized?.default,
      true,
      `${plugin} precisa manter startMinimized como padrão`,
    );
    assert.match(
      source,
      /runMode\s*!==\s*["']method_test["'][\s\S]{0,100}settings\.startMinimized\s*!==\s*false/,
      `${plugin} precisa abrir a janela durante o teste de bloco`,
    );
  }
});
