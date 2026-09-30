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
  assert.match(architecture, /\*\*Coleções de mídia:\*\*/);
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
    "tasks/TASK-011.md",
    "tasks/TASK-012.md",
    "tasks/TASK-013.md",
    "tasks/TASK-014.md",
    "tasks/TASK-015.md",
    "tasks/TASK-016.md",
    "tasks/TASK-017.md",
    "tasks/TASK-018.md",
    "tasks/TASK-019.md",
    "tasks/TASK-020.md",
    "tasks/TASK-021.md",
    "tasks/TASK-022.md",
    "tasks/TASK-023.md",
    "tasks/TASK-024.md",
    "tasks/TASK-025.md",
    "tasks/TASK-026.md",
    "tasks/TASK-027.md",
    "tasks/TASK-028.md",
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
  for (const taskId of expectedTaskIds.slice(0, 28)) {
    assert.match(roadmap, new RegExp("\\| " + taskId + " \\|[^\\n]+\\| `done`\\s+\\|"));
  }
  assert.match(roadmap, /\| TASK-028A \|[^\n]+\| `done`\s+\|/);
  assert.match(roadmap, /\| TASK-029 \|[^\n]+\| `ready`\s+\|/);

  const task010 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-010.md", import.meta.url),
    "utf8",
  );
  assert.match(task010, /## Estado\s+`done`/);
  const task011 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-011.md", import.meta.url),
    "utf8",
  );
  assert.match(task011, /## Estado\s+`done`/);
  const task012 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-012.md", import.meta.url),
    "utf8",
  );
  assert.match(task012, /## Estado\s+`done`/);
  const task013 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-013.md", import.meta.url),
    "utf8",
  );
  assert.match(task013, /## Estado\s+`done`/);
  const task014 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-014.md", import.meta.url),
    "utf8",
  );
  assert.match(task014, /## Estado\s+`done`/);
  const task015 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-015.md", import.meta.url),
    "utf8",
  );
  assert.match(task015, /## Estado\s+`done`/);
  const task016 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-016.md", import.meta.url),
    "utf8",
  );
  assert.match(task016, /## Estado\s+`done`/);
  const task017 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-017.md", import.meta.url),
    "utf8",
  );
  assert.match(task017, /## Estado\s+`done`/);
  const task018 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-018.md", import.meta.url),
    "utf8",
  );
  assert.match(task018, /## Estado\s+`done`/);
  const task020 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-020.md", import.meta.url),
    "utf8",
  );
  assert.match(task020, /## Estado\s+`done`/);
  const task021 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-021.md", import.meta.url),
    "utf8",
  );
  assert.match(task021, /## Estado\s+`done`/);
  const task022 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-022.md", import.meta.url),
    "utf8",
  );
  assert.match(task022, /## Estado\s+`done`/);
  const task024 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-024.md", import.meta.url),
    "utf8",
  );
  assert.match(task024, /## Estado\s+`done`/);
  const task025 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-025.md", import.meta.url),
    "utf8",
  );
  assert.match(task025, /## Estado\s+`done`/);
  const task026 = readFileSync(
    new URL("../../docs/reliability-program/tasks/TASK-026.md", import.meta.url),
    "utf8",
  );
  assert.match(task026, /## Estado\s+`done`/);

  const projectProjection = readFileSync(
    new URL("./execution-core/project-projection.ts", import.meta.url),
    "utf8",
  );
  assert.match(projectProjection, /Record<ProcessExecutionStatus, ProcessState>/);
  for (const status of [
    "not_started",
    "running",
    "awaiting_human",
    "awaiting_output",
    "blocked_executor",
    "failed",
    "completed",
    "cancelled",
  ]) {
    assert.match(projectProjection, new RegExp(`\\b${status}:`));
  }

  const executionCommands = readFileSync(
    new URL("../../server/execution-commands.ts", import.meta.url),
    "utf8",
  );
  const manualStart = executionCommands.match(
    /function startProcessExecution[\s\S]*?\n {2}function activateNextBlock/,
  )?.[0];
  assert.ok(
    manualStart,
    "startProcessExecution should remain discoverable for architecture guardrails",
  );
  assert.match(manualStart, /createCanonicalProcessExecution\(/);
  assert.match(manualStart, /applyExecutionProjectProjection\(/);
  assert.doesNotMatch(manualStart, /blocks:\s*methodSnapshot\.blocks\.map/);
  assert.doesNotMatch(manualStart, /status:\s*"not_started"/);
  const server = readFileSync(new URL("../../server/index.ts", import.meta.url), "utf8");
  const automaticSchedulerStart = server.indexOf("function scheduleAutomaticPluginBlock");
  const automaticSchedulerEnd = server.indexOf(
    "const orchestratorReconciliationLocks",
    automaticSchedulerStart,
  );
  assert.ok(
    automaticSchedulerStart >= 0 && automaticSchedulerEnd > automaticSchedulerStart,
    "automatic plugin scheduler should remain discoverable",
  );
  const automaticScheduler = server.slice(automaticSchedulerStart, automaticSchedulerEnd);
  assert.match(automaticScheduler, /executePluginBlockInternal\(requestBody\)/);
  assert.doesNotMatch(automaticScheduler, /\bfetch\s*\(/);
  assert.doesNotMatch(automaticScheduler, /127\.0\.0\.1|localhost/);
  assert.match(
    automaticScheduler,
    /error instanceof PersistenceCommitError[\s\S]*?console\.error\([\s\S]*?return;/,
  );
  assert.doesNotMatch(
    automaticScheduler,
    /error instanceof PersistenceCommitError\)\s*(?:\{\s*)?throw\b/,
  );

  const pluginBlockOperationStart = server.indexOf("async function executePluginBlockInternal");
  const pluginBlockRouteStart = server.indexOf('app.post("/api/execute-block"');
  const pluginBlockRouteEnd = server.indexOf(
    'app.get("/api/youtube/channel"',
    pluginBlockRouteStart,
  );
  assert.ok(
    pluginBlockOperationStart >= 0 &&
      pluginBlockRouteStart > pluginBlockOperationStart &&
      pluginBlockRouteEnd > pluginBlockRouteStart,
    "shared plugin block operation and HTTP boundary should remain discoverable",
  );
  const pluginBlockOperation = server.slice(pluginBlockOperationStart, pluginBlockRouteStart);
  const pluginBlockRoute = server.slice(pluginBlockRouteStart, pluginBlockRouteEnd);
  assert.doesNotMatch(pluginBlockOperation, /\brequest\.|\bresponse\./);
  assert.match(pluginBlockRoute, /executePluginBlockInternal\(request\.body/);
  assert.match(pluginBlockRoute, /response\.status\(result\.status\)\.json\(result\.body\)/);
  assert.doesNotMatch(pluginBlockRoute, /pluginJobs\.|commitPluginJobTransition\(/);

  const orchestratedStart = server.match(
    /function startOrchestratedProcess[\s\S]*?\nfunction orchestrationMessage/,
  )?.[0];
  assert.ok(
    orchestratedStart,
    "startOrchestratedProcess should remain discoverable for architecture guardrails",
  );
  assert.match(orchestratedStart, /createCanonicalProcessExecution\(/);
  assert.match(orchestratedStart, /applyExecutionProjectProjection\(/);
  assert.doesNotMatch(orchestratedStart, /blocks:\s*methodSnapshot\.blocks\.map/);
  assert.doesNotMatch(orchestratedStart, /block\.operator === "Humano"/);

  const executionPostStart = server.indexOf('app.post("/api/executions",');
  const executionPostEnd = server.indexOf(
    'app.patch("/api/executions/:id/blocks/:blockId/runtime-inputs",',
    executionPostStart,
  );
  assert.ok(executionPostStart >= 0 && executionPostEnd > executionPostStart);
  const executionPost = server.slice(executionPostStart, executionPostEnd);
  assert.match(
    server,
    /import \{ parseCanonicalExecutionCreatePayload \} from "\.\/execution-create-boundary"/,
  );
  assert.match(executionPost, /parseCanonicalExecutionCreatePayload\(request\.body\)/);
  assert.match(
    executionPost,
    /!project \|\| !channel \|\| project\.channelId !== execution\.channelId/,
  );
  assert.doesNotMatch(executionPost, /adaptLegacyExecutionCreatePayload/);
  assert.doesNotMatch(executionPost, /request\.body as StoredPayload/);
  assert.doesNotMatch(executionPost, /as unknown as ProcessExecution/);

  const manualProgression = executionCommands.match(
    /function activateNextBlock[\s\S]*?\n {2}function blockDeliveryIssues/,
  )?.[0];
  assert.ok(manualProgression, "manual block progression should remain discoverable");
  assert.match(manualProgression, /applyCompletedBlockTransition\(/);
  assert.match(manualProgression, /applyExecutionProjectProjection\(/);

  const humanCompletion = executionCommands.match(
    /function completeHumanBlock[\s\S]*?\n {2}function completeProcessOutput/,
  )?.[0];
  assert.ok(humanCompletion, "normal human completion should remain discoverable");
  assert.match(humanCompletion, /applyHumanBlockCompletion\(/);
  assert.match(humanCompletion, /applyValidationOutcome\(/);
  assert.doesNotMatch(humanCompletion, /blockExecution\.status\s*=\s*"completed"/);
  assert.doesNotMatch(humanCompletion, /blockExecution\.completedAt\s*=/);
  const directValueAssignments = [...humanCompletion.matchAll(/blockExecution\.values\s*=/g)];
  assert.equal(directValueAssignments.length, 0);

  const pluginProgression = server.match(
    /function finishPluginBlock[\s\S]*?\nfunction executionById/,
  )?.[0];
  assert.ok(pluginProgression, "plugin block completion should remain discoverable");
  assert.match(pluginProgression, /applyExecutorBlockCompletion\(/);
  assert.match(pluginProgression, /applyValidationOutcome\(/);
  assert.match(pluginProgression, /applyCompletedBlockTransition\(/);
  assert.doesNotMatch(pluginProgression, /blockExecution\.status\s*=\s*"completed"/);
  assert.doesNotMatch(pluginProgression, /blockExecution\.completedAt\s*=/);
  assert.doesNotMatch(pluginProgression, /blockExecution\.values\s*=\s*values/);
  assert.match(
    pluginProgression,
    /block\.operator === "Humano"[\s\S]*?blockExecution\.status = "awaiting_human"/,
  );
  assert.doesNotMatch(pluginProgression, /completedIndex\s*\+\s*1/);
  assert.doesNotMatch(pluginProgression, /nextBlock\.operator\s*===\s*"Humano"/);
  for (const duplicatedValidationAlgorithm of [
    /targetIndex/,
    /maxAttempts/,
    /retryMode/,
    /invalidateBlockDeliveries/,
  ]) {
    assert.doesNotMatch(pluginProgression, duplicatedValidationAlgorithm);
  }
  assert.doesNotMatch(executionCommands, /function retryValidatedBlock/);

  const manualRetry = executionCommands.match(
    /function retryBlockExecution[\s\S]*?\n {2}return \{/,
  )?.[0];
  assert.ok(manualRetry, "manual block retry should remain discoverable");
  assert.match(manualRetry, /applyManualBlockRetry\(/);
  assert.match(manualRetry, /applyExecutionProjectProjection\(/);
  for (const duplicatedManualRetryAlgorithm of [
    /\.attempt\s*=/,
    /invalidateBlockDeliveries/,
    /\.itemRetryScope\s*=/,
    /\.itemRetryId\s*=/,
    /block\.operator\s*===\s*"Humano"/,
    /blockExecution\.status\s*=/,
  ]) {
    assert.doesNotMatch(manualRetry, duplicatedManualRetryAlgorithm);
  }

  const currentDeliveryAcceptance = executionCommands.match(
    /function acceptBlockDelivery[\s\S]*?\n {2}function retryBlockExecution/,
  )?.[0];
  assert.ok(currentDeliveryAcceptance, "current delivery acceptance should remain discoverable");
  assert.match(currentDeliveryAcceptance, /applyCurrentBlockDeliveryAcceptance\(/);
  assert.match(
    currentDeliveryAcceptance,
    /applyCurrentBlockDeliveryAcceptance\([\s\S]*?recordBlockDeliveries\([\s\S]*?activateNextBlock\(/,
  );
  for (const duplicatedCurrentDeliveryAcceptance of [
    /blockExecution\.status\s*=\s*"completed"/,
    /blockExecution\.completedAt\s*=/,
    /blockExecution\.progress\s*=\s*1/,
    /execution\.error\s*=\s*undefined/,
  ]) {
    assert.doesNotMatch(currentDeliveryAcceptance, duplicatedCurrentDeliveryAcceptance);
  }

  const storedExecutionCancellation = server.match(
    /function cancelStoredProcessExecution[\s\S]*?\nfunction resumeExecutionOrchestrators/,
  )?.[0];
  assert.ok(
    storedExecutionCancellation,
    "stored execution cancellation should remain discoverable",
  );
  assert.match(storedExecutionCancellation, /applyExecutionCancellation\(/);
  assert.match(storedExecutionCancellation, /applyExecutionProjectProjection\(/);
  assert.doesNotMatch(storedExecutionCancellation, /execution\.status\s*=\s*"cancelled"/);
  assert.doesNotMatch(
    storedExecutionCancellation,
    /execution\.blocks\s*=\s*execution\.blocks\.map/,
  );

  const pluginJobCancellation = server.match(
    /function markPluginJobCancelled[\s\S]*?\nasync function resolvePluginConnection/,
  )?.[0];
  assert.ok(pluginJobCancellation, "plugin job cancellation should remain discoverable");
  assert.match(pluginJobCancellation, /applyExecutionCancellation\(/);
  assert.match(pluginJobCancellation, /persistPluginExecution\(/);
  assert.doesNotMatch(pluginJobCancellation, /execution\.status\s*=\s*"cancelled"/);
  assert.doesNotMatch(pluginJobCancellation, /execution\.blocks\s*=\s*execution\.blocks\.map/);

  const executionCreateBoundary = readFileSync(
    new URL("../../server/execution-create-boundary.ts", import.meta.url),
    "utf8",
  );
  assert.match(executionCreateBoundary, /processMethodV3Schema\.safeParse/);
  assert.match(executionCreateBoundary, /validateExecutionCoreInvariants\(/);
  assert.match(executionCreateBoundary, /runtimeValueMatchesShape\(/);
  assert.doesNotMatch(executionCreateBoundary, /adaptLegacyExecutionCreatePayload/);

  const pluginPersistence = server.match(
    /function persistPluginExecution[\s\S]*?\nfunction failAutomaticPluginStart/,
  )?.[0];
  assert.ok(pluginPersistence, "plugin persistence should remain discoverable");
  assert.match(pluginPersistence, /applyExecutionProjectProjection\(/);
  assert.match(pluginPersistence, /database\.inTransaction/);
  assert.match(
    pluginPersistence,
    /if \(!database\.inTransaction\) queueOrchestratorReconciliationForProject/,
  );
  assert.match(server, /function commitPluginJobTransition/);
  const transactionalCallbacks = [
    ...server.matchAll(/commitPluginJobTransition\([^\n]+\(\) => \{/g),
  ].map((match) => {
    const start = match.index! + match[0].length;
    let depth = 1;
    let cursor = start;
    while (cursor < server.length && depth > 0) {
      if (server[cursor] === "{") depth += 1;
      if (server[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    assert.equal(depth, 0, "commitPluginJobTransition callback should remain balanced");
    return server.slice(start, cursor - 1);
  });
  assert.ok(transactionalCallbacks.length > 0);
  for (const callback of transactionalCallbacks) {
    for (const nonRollbackableEffect of [
      "releaseJobProfileLease(",
      "abortActivePluginInvocations(",
      "scheduleAutomaticPluginBlock(",
      "processDuePluginJobs(",
      "queueOrchestratorReconciliationForProject(",
      "clearInterval(",
      "setInterval(",
      "setTimeout(",
      "activeJobProfileLeases.delete(",
      "activeJobProfileLeases.set(",
    ]) {
      assert.equal(
        callback.includes(nonRollbackableEffect),
        false,
        `${nonRollbackableEffect} must run only after the SQLite commit`,
      );
    }
  }
  assert.match(
    server,
    /pluginJobs\.requestCancellation\(execution\.id\);[\s\S]*?database[\s\S]*?abortActivePluginInvocations\(execution\.id\)/,
  );
  assert.doesNotMatch(server, /function updateProjectAfterPluginBlock/);

  for (const taskId of expectedTaskIds.slice(29)) {
    assert.match(roadmap, new RegExp("\\| " + taskId + " \\|[^\\n]+\\| `pending` \\|"));
  }
  assert.doesNotMatch(roadmap, /\bTASK-053\b/);

  const rootReadme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
  assert.doesNotMatch(rootReadme, /V1_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /PROCESS_ORDER_AND_PRODUCT_NARRATIVE_ROADMAP\.md/);
  assert.doesNotMatch(rootReadme, /asset-generation-plugins-roadmap\.md/);
});
