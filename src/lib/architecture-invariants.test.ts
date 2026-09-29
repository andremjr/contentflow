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
    "tasks/TASK-001.md",
    "tasks/TASK-002.md",
    "tasks/TASK-003.md",
    "tasks/TASK-004.md",
    "tasks/TASK-005.md",
    "tasks/TASK-006.md",
    "tasks/TASK-007.md",
    "tasks/TASK-008.md",
    "tasks/TASK-009.md",
    "tasks/TASK-010.md",
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
  assert.match(roadmap, /\| TASK-001 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-002 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-003 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-004 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-005 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-006 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-007 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-008 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-009 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-010 \|[^\n]+\| `done` \|/);
  assert.match(roadmap, /\| TASK-011 \|[^\n]+\| `ready` \|/);

  const task010 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-010.md", import.meta.url),
    "utf8",
  );
  assert.match(task010, /## Estado\s+`done`/);

  const executionCommands = readFileSync(
    new URL("../../server/execution-commands.ts", import.meta.url),
    "utf8",
  );
  const manualStart = executionCommands.match(
    /function startProcessExecution[\s\S]*?\n {2}function finalizeOrRequestOutput/,
  )?.[0];
  assert.ok(
    manualStart,
    "startProcessExecution should remain discoverable for architecture guardrails",
  );
  assert.match(manualStart, /createCanonicalProcessExecution\(/);
  assert.doesNotMatch(manualStart, /blocks:\s*methodSnapshot\.blocks\.map/);
  assert.doesNotMatch(manualStart, /status:\s*"not_started"/);
  const server = readFileSync(new URL("../../server/index.ts", import.meta.url), "utf8");
  const orchestratedStart = server.match(
    /function startOrchestratedProcess[\s\S]*?\nfunction orchestrationMessage/,
  )?.[0];
  assert.ok(
    orchestratedStart,
    "startOrchestratedProcess should remain discoverable for architecture guardrails",
  );
  assert.match(orchestratedStart, /createCanonicalProcessExecution\(/);
  assert.doesNotMatch(orchestratedStart, /blocks:\s*methodSnapshot\.blocks\.map/);
  assert.doesNotMatch(orchestratedStart, /block\.operator === "Humano"/);

  const legacyPostStart = server.indexOf('app.post("/api/executions",');
  const legacyPostEnd = server.indexOf(
    'app.patch("/api/executions/:id/blocks/:blockId/runtime-inputs",',
    legacyPostStart,
  );
  assert.ok(legacyPostStart >= 0 && legacyPostEnd > legacyPostStart);
  const legacyExecutionPost = server.slice(legacyPostStart, legacyPostEnd);
  assert.match(
    server,
    /import \{ adaptLegacyExecutionCreatePayload \} from "\.\/legacy-execution-boundary"/,
  );
  assert.match(legacyExecutionPost, /adaptLegacyExecutionCreatePayload\(request\.body\)/);
  assert.doesNotMatch(legacyExecutionPost, /createCanonicalProcessExecution\(/);
  assert.doesNotMatch(legacyExecutionPost, /request\.body as StoredPayload/);
  assert.doesNotMatch(legacyExecutionPost, /as unknown as ProcessExecution/);

  const legacyBoundary = readFileSync(
    new URL("../../server/legacy-execution-boundary.ts", import.meta.url),
    "utf8",
  );
  assert.match(legacyBoundary, /adaptLegacyExecutionCreatePayload/);
  assert.match(legacyBoundary, /Compatibility adapter for the historical HTTP creation boundary/);

  for (const taskId of expectedTaskIds.slice(11)) {
    assert.match(roadmap, new RegExp("\\| " + taskId + " \\|[^\\n]+\\| `pending` \\|"));
  }
  assert.doesNotMatch(roadmap, /\bTASK-053\b/);

  const rootReadme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(rootReadme, /V1_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /PROCESS_ORDER_AND_PRODUCT_NARRATIVE_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /asset-generation-plugins-roadmap\.md/);
});
