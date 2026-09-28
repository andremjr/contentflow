import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const browserPlugins = [
  "chatgpt-browser-studio",
  "claude-browser-text",
  "gemini-browser-studio",
  "google-flow-browser-images",
  "grok-browser-studio",
  "mai-playground-browser",
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
    for (const capability of manifest.capabilities) {
      const startMinimized = capability.blockConfigSchema?.properties?.startMinimized;
      assert.equal(
        startMinimized?.type,
        "boolean",
        `${plugin}/${capability.id} precisa expor startMinimized no bloco`,
      );
      assert.equal(
        startMinimized?.default,
        true,
        `${plugin}/${capability.id} precisa iniciar minimizado por padrão`,
      );
    }
    assert.ok(
      source.includes('typeof request?.configuration?.startMinimized === "boolean"'),
      `${plugin} precisa priorizar a configuração startMinimized do bloco`,
    );
  }
});

test("o lifecycle central preserva a execução com a janela minimizada", async () => {
  const requiredFlags = [
    "--disable-background-timer-throttling",
    "--disable-backgrounding-occluded-windows",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
  ];
  const source = await readFile(new URL("./browser-session-manager.ts", import.meta.url), "utf8");
  for (const flag of requiredFlags) {
    assert.ok(source.includes(flag), `o núcleo precisa configurar o Chrome minimizado com ${flag}`);
  }
});
