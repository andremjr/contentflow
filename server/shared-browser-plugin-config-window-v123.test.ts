import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translate } from "../src/lib/app-preferences";

const builderSource = readFileSync(
  new URL("../src/components/method-builder.tsx", import.meta.url),
  "utf8",
);

test("package 12.3 opens plugin configuration beside the block in a responsive workspace", () => {
  assert.match(
    builderSource,
    /data-plugin-workspace=\{pluginConfigurationOpen \? "open" : "closed"\}/,
  );
  assert.match(builderSource, /data-testid="plugin-configuration-panel"/);
  assert.match(builderSource, /h-\[min\(92vh,56rem\)\]/);
  assert.match(builderSource, /sm:max-w-\[80rem\]/);
  assert.match(builderSource, /max-h-\[90vh\] overflow-y-auto sm:max-w-3xl/);
  assert.match(builderSource, /lg:grid-cols-\[minmax\(22rem,0\.82fr\)_minmax\(32rem,1\.18fr\)\]/);
  assert.match(builderSource, /hidden min-h-0 overflow-y-auto lg:block lg:border-r/);
  assert.match(builderSource, /min-h-0 flex-1 space-y-4 overflow-y-auto/);
  assert.doesNotMatch(builderSource, /<Dialog open=\{pluginConfigurationOpen\}/);
});

test("package 12.3 returns to the centered block through close, cancel, apply, or Escape", () => {
  assert.match(builderSource, /setPluginConfigurationVisibility\(false\)/);
  assert.match(
    builderSource,
    /onChange\(\{ plugin: commit\.value \}\);\s*setPluginConfigurationVisibility\(false\)/,
  );
  assert.match(builderSource, /onEscapeKeyDown=\{\(event\) =>/);
  assert.match(builderSource, /pluginPanelBlockId === selectedBlock\?\.id/);
  assert.match(builderSource, /Fechar configuração do plugin/);
  assert.match(builderSource, /Voltar ao bloco/);
  assert.match(builderSource, /Escape fecha a janela e descarta alterações não aplicadas/);
});

test("package 12.3 keeps missing or disabled saved plugins readable", () => {
  assert.match(builderSource, /plugins=\{readinessPlugins\}/);
  assert.match(builderSource, /selectedPluginMissing \|\| selectedPluginUnavailable/);
  assert.match(builderSource, /Object\.entries\(block\.plugin\.configuration\)/);
  assert.match(builderSource, /Plugin desativado ou indisponível/);
});

test("package 12.3 translates every new window frame string", () => {
  for (const phrase of [
    "Configuração salva",
    "Perfis",
    "Configurar plugin executor",
    "Fechar configuração do plugin",
    "Voltar ao bloco",
    "Revise o executor, o contrato e as configurações locais desta ação.",
    "A configuração histórica foi preservada, mas o plugin não está instalado.",
    "A configuração histórica foi preservada, mas o plugin está desativado ou indisponível.",
    "Escape fecha a janela e descarta alterações não aplicadas.",
  ]) {
    assert.notEqual(translate(phrase, "en"), phrase);
    assert.notEqual(translate(phrase, "es"), phrase);
  }
});
