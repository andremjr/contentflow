import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { translate } from "../src/lib/app-preferences";

const builderSource = readFileSync(
  new URL("../src/components/method-builder.tsx", import.meta.url),
  "utf8",
);

test("package 11.1 exposes ordered fallback and capability-gated parallel controls", () => {
  assert.match(builderSource, /Modo de execução dos perfis/);
  assert.doesNotMatch(builderSource, /<SelectItem value="single"/);
  assert.match(builderSource, /value="fallback"/);
  assert.match(builderSource, /profileExecution\?\.mode === "parallel" \? "parallel" : "fallback"/);
  assert.match(builderSource, /supportsParallel &&/);
  assert.match(builderSource, /value="parallel"/);
  assert.match(builderSource, /profileExecution=\{pluginDraft\.profileExecution\}/);
  assert.match(builderSource, /onProfileExecutionChange/);
  assert.match(builderSource, /profileIds: uniqueProfileIds/);
  assert.match(builderSource, /moveSelectedProfile/);
});

test("package 11.1 reports effective workers and the distributed collection contract", () => {
  assert.match(builderSource, /profileParallelism/);
  assert.match(builderSource, /capability\.execution\.maxConcurrency/);
  assert.match(builderSource, /Máximo de workers/);
  assert.match(builderSource, /Workers efetivos/);
  assert.match(builderSource, /Coleção distribuída/);
  assert.match(builderSource, /Entrega agregada/);
});

test("package 11.1 translates the new editor controls in English and Spanish", () => {
  const phrases = [
    "Modo de execução dos perfis",
    "Fallback ordenado",
    "Executar perfis simultaneamente",
    "Perfis simultâneos",
    "Selecione e ordene os perfis que poderão receber itens desta execução.",
    "Workers efetivos",
    "Coleção distribuída",
    "Entrega agregada",
    "Descer",
  ];

  for (const phrase of phrases) {
    assert.notEqual(translate(phrase, "en"), phrase, `missing English translation: ${phrase}`);
    assert.notEqual(translate(phrase, "es"), phrase, `missing Spanish translation: ${phrase}`);
  }

  assert.equal(translate("Fallback ordenado", "en"), "Ordered fallback");
  assert.equal(translate("Máximo de workers", "en"), "Maximum workers");
  assert.equal(translate("Subir", "en"), "Move up");
});
