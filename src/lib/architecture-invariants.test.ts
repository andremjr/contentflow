import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  BLOCK_OPERATORS,
  BLOCK_TYPES,
  PROCESS_META,
  PROCESS_ORDER,
  createEmptyMethods,
} from "./domain";

test("preserves the ContentFlow universal grammar", () => {
  assert.deepEqual(PROCESS_ORDER, [
    "theme",
    "title",
    "thumbnail",
    "script",
    "narration",
    "assets",
    "editing",
    "publishing",
  ]);
  assert.equal(new Set(PROCESS_ORDER).size, 8);
  assert.deepEqual(BLOCK_TYPES, ["BUSCAR", "ESCOLHER", "CRIAR", "VALIDAR"]);
  assert.deepEqual(BLOCK_OPERATORS, ["IA", "Humano", "Código"]);
});

test("keeps every universal process represented by metadata and an empty Method slot", () => {
  const methods = createEmptyMethods();
  assert.deepEqual(Object.keys(PROCESS_META).sort(), [...PROCESS_ORDER].sort());
  assert.deepEqual(Object.keys(methods).sort(), [...PROCESS_ORDER].sort());
  for (const processType of PROCESS_ORDER) {
    assert.equal(methods[processType].processType, processType);
  }
});

test("documents the domain identity hierarchy, shared profiles, and exactly three domain interfaces", () => {
  const architecture = readFileSync(new URL("../../docs/ARCHITECTURE.md", import.meta.url), "utf8");

  for (const term of [
    "`BlockExecution`",
    "Unidade de trabalho",
    "Entrega",
    "Item de entrega",
    "Artifact",
    "perfil de navegador",
    "vínculo de plugin",
    "readiness",
    "`single`",
    "`fallback`",
    "`parallel`",
  ]) {
    assert.match(architecture, new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }

  assert.match(architecture, /\*\*Escalar:\*\*/);
  assert.match(architecture, /\*\*Lista de cenas:\*\*/);
  assert.match(architecture, /\*\*Lista de assets:\*\*/);
  assert.equal((architecture.match(/INTERFACE [123]:/g) ?? []).length, 3);
});

test("keeps the Reliability Program connected and bounded", () => {
  const requiredFiles = [
    "README.md",
    "00-PRODUCT-CONSTITUTION.md",
    "01-TARGET-ARCHITECTURE.md",
    "02-RELIABILITY-ROADMAP.md",
    "03-ACCEPTANCE-SCENARIOS.md",
    "04-CURRENT-STATE.md",
    "05-WORKING-PROTOCOL.md",
    "tasks/README.md",
    "tasks/TASK-000.md",
    "decisions/README.md",
    "decisions/ADR-001-PERSISTENT-AI-CONTEXT.md",
    "decisions/ADR-002-CORE-EXECUTION-AUTHORITY.md",
    "decisions/ADR-003-DETERMINISTIC-RUNTIME-CONTRACTS.md",
    "decisions/ADR-004-UNCERTAIN-EXTERNAL-EFFECTS.md",
    "decisions/ADR-005-UNATTENDED-PROGRESS.md",
    "decisions/ADR-006-RESOURCE-CONSERVATIVE-EXECUTION.md",
    "decisions/ADR-007-LEGACY-AT-BOUNDARIES.md",
  ];

  for (const relativePath of requiredFiles) {
    const file = new URL(`../../docs/reliability-program/${relativePath}`, import.meta.url);
    assert.equal(existsSync(file), true, `missing Reliability Program file: ${relativePath}`);
  }

  const agents = readFileSync(new URL("../../AGENTS.md", import.meta.url), "utf8");
  assert.match(agents, /Reliability Program/);
  assert.match(agents, /docs\/reliability-program\/05-WORKING-PROTOCOL\.md/);

  const roadmap = readFileSync(
    new URL("../../docs/reliability-program/02-RELIABILITY-ROADMAP.md", import.meta.url),
    "utf8",
  );
  const expectedTaskIds = Array.from(
    { length: 52 },
    (_, index) => `TASK-${String(index + 1).padStart(3, "0")}`,
  );
  const roadmapTaskIds = [...roadmap.matchAll(/\| (TASK-\d{3}) \|/g)].map((match) => match[1]);
  assert.deepEqual(roadmapTaskIds, expectedTaskIds);
  assert.match(roadmap, /Estado da TASK-000: `done`/);
  assert.match(roadmap, /\| TASK-001 \|[^\n]+\| `ready` \|/);
  for (const taskId of expectedTaskIds.slice(1)) {
    assert.match(roadmap, new RegExp("\\| " + taskId + " \\|[^\\n]+\\| `pending` \\|"));
  }
  assert.doesNotMatch(roadmap, /\bTASK-053\b/);

  const rootReadme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(rootReadme, /V1_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /PROCESS_ORDER_AND_PRODUCT_NARRATIVE_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /asset-generation-plugins-roadmap\.md/);
});
