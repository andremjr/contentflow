# TASK-018 — Centralizar a projeção de `Project` a partir de `ProcessExecution`

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Substituir as tabelas e regras locais que traduzem `ProcessExecution.status` para `Project.stages`, `currentStage`, `state` e `progress` por uma projeção canônica, pura e reutilizável. `ProcessExecution` continua sendo a fonte do estado operacional; `Project` permanece uma visão derivada para organização, UI e avanço entre Processos.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `4e47b4258bd75f431aa4f0f028f68d7e495bba16`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Autoridades e projeções duplicadas encontradas

- `server/execution-commands.ts::startProcessExecution()` projetava qualquer start não humano como `processing`.
- `activateNextBlock()` decidia localmente `awaiting_human`, `blocked`, conclusão, próximo Processo e progresso.
- `retryBlockExecution()` reinterpretava qualquer estado não humano como `blocked`.
- o caminho especial de `VALIDAR/retry_target` repetia a mesma interpretação.
- `completeProcessOutput()` e `completeProjectStage()` possuíam outra autoridade para conclusão, próximo Processo e progresso.
- `server/index.ts::startOrchestratedProcess()` repetia a regra do start manual.
- `updateProjectAfterPluginBlock()` mantinha uma tabela própria para plugin, conclusão e progresso.
- `cancelStoredProcessExecution()` e `markPluginJobCancelled()` projetavam cancelamento diretamente.

## Divergências concretas caracterizadas

- `blocked_executor` era `processing` no start manual/Orchestrator e `blocked` na progressão, retry e plugin.
- `awaiting_output` era `awaiting_human` na progressão manual e `processing` na tabela do plugin.

Os testes existentes caracterizam estados operacionais iguais e não demonstram duas semânticas intencionais. A convergência solicitada não exige `DECISION REQUIRED`.

## Decisão arquitetural aplicável

Conforme ADR-002, a execução é autoridade do Core. A projeção recebe somente `Project` e `ProcessExecution`, usa a estratégia já congelada no Projeto e não consulta Channel, Method atual, plugin, provider, browser, HTTP ou SQLite.

## Tabela canônica

| `ProcessExecution.status` | `Project` `ProcessState` |
| ------------------------- | ------------------------ |
| `not_started`             | `not_started`            |
| `running`                 | `processing`             |
| `awaiting_human`          | `awaiting_human`         |
| `awaiting_output`         | `awaiting_human`         |
| `blocked_executor`        | `blocked`                |
| `failed`                  | `error`                  |
| `completed`               | `done`                   |
| `cancelled`               | `not_started`            |

`blocked_executor` representa impossibilidade atual de continuar e, portanto, projeta `blocked`. `awaiting_output` requer uma entrega humana final e, portanto, projeta `awaiting_human`.

## Regra de conclusão

Ao concluir, o Processo atual vira `done`; o próximo elegível é calculado por `projectProcessOrder(project)` e `nextExecutableProcess()` com `runFrom/runThrough`; `currentStage` e `state` apontam para esse próximo Processo. Sem próximo Processo, permanecem no Processo concluído com `state = done`. O progresso é recalculado por `completedProcessProgress()`.

## Escopo

- helper puro de projeção em `src/lib/execution-core/`;
- migração de start manual, start do Orchestrator, progressão manual, `VALIDAR`, retry, output final, plugin, falha e cancelamento;
- remoção de `completeProjectStage()` e da tabela de `updateProjectAfterPluginBlock()` quando substituídas;
- testes focais em matriz e guardrail arquitetural econômico;
- atualização do Current State e roadmap após validação.

## Fora de escopo

- título gerado, `updatedAt`, revision e persistência;
- scheduling, próximo Bloco, retry/recovery e semântica editorial de `VALIDAR`;
- output, drafts, `ESCOLHER` e reset especializado, salvo a projeção após estado materializado;
- novos estados, migração de storage, release, versão ou publicação;
- TASK-019.

## Compatibilidade e invariantes

- não criar novos `ProcessState` nem `ProcessExecutionStatus`;
- preservar `progress` em todo estado não concluído;
- usar exclusivamente a ordem congelada disponível no `Project`;
- preservar `runFrom/runThrough` na conclusão;
- mutar somente `stages[processType]`, `currentStage`, `state` e, em conclusão, `progress`;
- manter título, tempo, revision, persistência e reconciliação nos adapters;
- não derivar estado de `ProcessExecution` a partir de `Project`.

## Testes e evidências necessárias

- matriz focal para todos os oito status;
- guardrails explícitos para `blocked_executor → blocked` e `awaiting_output → awaiting_human`;
- conclusão com `done`, progresso, próximo Processo, último Processo, estratégia congelada e run range;
- reutilizar suites de Execution Core, state machine, retry, execução automática, validação e Orchestrator;
- typecheck, arquitetura, lint e gate agregado, preservando o failure conhecido de `test:shared-browser-v89` se permanecer idêntico.

## Definition of Done

- [x] uma única projeção canônica cobre todos os status;
- [x] todos os adapters relevantes convergem no helper;
- [x] conclusão usa ordem congelada, run range e recalcula progresso;
- [x] `Project` não se torna autoridade da execução;
- [x] título, persistence, revision e scheduling permanecem fora;
- [x] testes focais e regressões obrigatórias passam;
- [x] Current State registra a projeção canônica e remove esse gap;
- [x] TASK-018 fica `done`, TASK-019 fica `ready` e TASK-020..TASK-052 ficam `pending`.

## Implementação concluída

### Helper canônico

`src/lib/execution-core/project-projection.ts::applyExecutionProjectProjection()` recebe somente `Project` e `ProcessExecution`. A tabela usa `Record<ProcessExecutionStatus, ProcessState>`, tornando qualquer ampliação futura do status uma falha de tipo até receber projeção explícita. O helper não usa relógio, persistência, HTTP, Channel, plugin ou provider e só muta os quatro campos derivados autorizados.

### Adapters migrados

- start manual e progressão em `server/execution-commands.ts`;
- start do Orchestrator em `server/index.ts`;
- retry manual e `VALIDAR` nos modos `pause` e `retry_target`;
- conclusão por output humano;
- persistência de plugin, incluindo running, falha, conclusão e `awaiting_output`;
- cancelamento armazenado e cancelamento de plugin job.

`completeProjectStage()` e `updateProjectAfterPluginBlock()` foram removidos. O reset explícito permanece especializado porque elimina a execução anterior e não projeta um estado materializado de `ProcessExecution`.

### Completed, progresso e estratégia congelada

`completed` marca o Processo atual como `done`, recalcula progresso e encontra o próximo Processo com `projectProcessOrder(project)` e `nextExecutableProcess(..., runFrom, runThrough)`. O teste focal usa uma ordem congelada diferente da ordem universal e um intervalo delimitado; sem próximo elegível, o Projeto permanece no Processo concluído com estado `done`.

### Responsabilidades preservadas fora da projeção

`applyGeneratedProjectTitle()`, `updatedAt`, revision, SQLite, transações, reconciliação do Orchestrator e scheduling continuam nos adapters. O helper não altera `ProcessExecution` e não decide próximo Bloco, retry, validação editorial ou recovery.

## Testes reutilizados

- `execution-state-machine.characterization.test.ts`: start humano/automático, progressão, output humano, snapshot e plugin simples;
- `execution-retry.test.ts`: retry manual e uso da entrega atual;
- `automatic-plugin-execution.test.ts`: encadeamento automático;
- `validation-retry.characterization.test.ts`: `VALIDAR` humano e plugin;
- suites do Orchestrator: start, retomada, bloqueio, cancelamento e ordem congelada.

## Novos testes e justificativa

`project-projection.test.ts` adiciona três testes compactos:

1. uma matriz cobre os sete estados não concluídos, inclusive os guardrails `blocked_executor → blocked` e `awaiting_output → awaiting_human`, além de provar preservação de progresso e metadata;
2. conclusão prova `done`, progresso, ordem congelada e `runFrom/runThrough` no mesmo cenário;
3. conclusão no último Processo prova `state = done` sem inflar a matriz.

`architecture-invariants.test.ts` agora exige TASK-018 concluída, tabela explicitamente tipada, uso do helper nos principais adapters e ausência da antiga tabela de plugin.

## Arquivos alterados

- `src/lib/execution-core/project-projection.ts`;
- `src/lib/execution-core/project-projection.test.ts`;
- `src/lib/execution-core/index.ts`;
- `server/execution-commands.ts`;
- `server/index.ts`;
- `server/execution-state-machine.characterization.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-018.md`.

## Validação

| Comando                                         | Resultado                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | pass                                                                                                                                                                                                           |
| `npm run test:execution-core`                   | pass, 63/63                                                                                                                                                                                                    |
| `npm run test:execution-state-machine`          | pass, 17/17                                                                                                                                                                                                    |
| `npx tsx --test server/execution-retry.test.ts` | pass, 6/6                                                                                                                                                                                                      |
| `npm run test:automatic-execution`              | pass, 7/7                                                                                                                                                                                                      |
| `npm run test:validation-retry`                 | pass, 14/14                                                                                                                                                                                                    |
| `npm run test:orchestrator`                     | pass, 9/9                                                                                                                                                                                                      |
| `npm run test:architecture`                     | pass, 4/4                                                                                                                                                                                                      |
| `npm run lint`                                  | pass                                                                                                                                                                                                           |
| `npm run check`                                 | precheck pass, 17/17; gate avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`, com 3/4 passando e a capability textual do ChatGPT ainda sem `incrementalStrategies: ["per_item"]` |

## Reliability Program

`TASK-006..TASK-018 done`; `TASK-019 ready`; `TASK-020..TASK-052 pending`. TASK-019 não foi iniciada.
