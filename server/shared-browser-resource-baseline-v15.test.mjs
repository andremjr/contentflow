import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const benchmarkPath = "scripts/benchmark-shared-browser-v15.mjs";
const reportPath = "docs/SHARED_BROWSER_RESOURCE_BASELINE_1_5.md";
const roadmapPath = "docs/SHARED_BROWSER_PROFILES_AND_PLUGIN_CONFIGURATION_ROADMAP.md";

test("pacote 1.5 mantém benchmark reproduzível e sem reutilizar dados reais", async () => {
  const source = await readFile(benchmarkPath, "utf8");
  for (const required of [
    "PROFILE_COUNTS = [1, 3, 5]",
    "COMMANDS_PER_PROFILE = 100",
    "benchmarkUi",
    "benchmarkSqlite",
    "benchmarkSimpleJob",
    "benchmarkBridgeCommands",
    "benchmarkChromeIdle",
    "mkdtempSync",
    "--user-data-dir=",
  ]) {
    assert.match(source, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /AppData[\\/]Roaming[\\/]ContentFlow/i);
  assert.doesNotMatch(source, /Default[\\/]Cookies|Login Data|Local Storage/i);
});

test("relatório 1.5 registra ambiente, variação e limites da evidência", async () => {
  const report = await readFile(reportPath, "utf8");
  for (const required of [
    "UI — rota de Plugins",
    "SQLite — inventário de perfis",
    "Job simples de plugin",
    "Browser Bridge — volume controlado",
    "Chrome + extensão ociosa",
    "1 perfil",
    "3 perfis",
    "5 perfis",
    "Chrome 153.0.8010.54",
    "Modelo de CPU, número de núcleos, memória total",
    "Limites da medição",
  ]) {
    assert.match(report, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(report, /C:\\Users\\andre|AppData[\\/]Local[\\/]Temp/i);
});

test("roadmap marca 1.5 concluído sem antecipar migração ou runtime", async () => {
  const roadmap = await readFile(roadmapPath, "utf8");
  const start = roadmap.indexOf("#### 1.5 — Linha de base de recursos");
  const end = roadmap.indexOf("### Fase 2", start);
  const section = roadmap.slice(start, end);
  assert.match(section, /Estado:\*\* concluído em 2026-09-26/);
  assert.match(section, /SHARED_BROWSER_RESOURCE_BASELINE_1_5\.md/);
  assert.match(section, /benchmark-shared-browser-v15\.mjs/);
  assert.match(section, /Nenhuma migração de produção/);
});
