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

const backgroundSafeBrowserPlugins = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
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
  }
});

test("Browser Studios selecionados preservam a execução com a janela minimizada", async () => {
  const requiredFlags = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
  ];
  for (const plugin of backgroundSafeBrowserPlugins) {
    const root = new URL(`../ecosystem/plugins/reference/${plugin}/`, import.meta.url);
    const source = await readFile(new URL("handler.mjs", root), "utf8");
    for (const flag of requiredFlags) {
      assert.ok(
        source.includes(flag),
        `${plugin} precisa iniciar o Chrome minimizado sem throttling de segundo plano (${flag})`,
      );
    }
  }
});
