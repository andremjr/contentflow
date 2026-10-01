# TASK-009 — Fazer Orchestrator e standalone usarem criação canônica

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Migrar `server/index.ts::startOrchestratedProcess()` para `createCanonicalProcessExecution()`, convergindo os starts do Orchestrator e de `runThrough` standalone sem alterar scheduling, projeção, persistência ou compatibilidade histórica.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `a2638d704b3fca112a1b93d38d91ca5a28f5e43b`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Caminhos de criação observados

Antes desta task, o start manual em `server/execution-commands.ts` já usava `createCanonicalProcessExecution()`, enquanto `server/index.ts::startOrchestratedProcess()` ainda materializava `ProcessExecution`, `BlockExecution[]`, `attempt`, `values`, `startedAt`, `outputStatus` e a classificação humano/executor diretamente.

O `POST /api/executions` continua sendo uma borda distinta que recebe uma representação pronta e não foi alterado nesta task.

## Uso compartilhado por Orchestrator e standalone

`reconcileExecutionOrchestrator()` e `reconcileEligibleSlotOrchestrator()` usam `startOrchestratedProcess()` para versões históricas e V5. `reconcileStandaloneProcesses()` reutiliza o mesmo helper para Projetos com `runThrough` e sem Orchestrator ativo. Portanto, a migração de um único ponto convergiu ambos os caminhos.

## Migração para createCanonicalProcessExecution

`startOrchestratedProcess()` preserva a checagem de execução existente, captura o snapshot estratégico, resolve o Method congelado, normaliza e valida na borda, gera `now` e UUID e então chama a API pública `createCanonicalProcessExecution()`.

O bloco local que criava `ProcessExecution` e classificava `Humano` versus executor foi removido. Se a criação canônica falhar, o helper retorna `issue` antes da projeção do Project, da transaction SQLite e do scheduling.

## Responsabilidades mantidas no adapter

Permanecem em `server/index.ts`: origem dos dados, `captureProjectStrategy()`, preferência por `project.strategySnapshot`, `normalizeMethodBlocks()`, `getMethodConfigurationIssue()`, UUID, relógio, Project projection, SQLite e scheduling.

O Core permanece responsável somente pela forma inicial canônica da execução e dos Blocos, incluindo status inicial, attempt, values e outputStatus.

## Persistência e scheduling preservados

A transaction existente continua inserindo `process_executions` e atualizando `projects` de forma conjunta. `scheduleAutomaticPluginBlock(execution)` continua sendo chamado somente depois da persistência. Nenhum repository/store novo foi introduzido e scheduling não foi movido para o Core.

A projeção do Project permanece igual: `awaiting_human` projeta `awaiting_human`; `blocked_executor` projeta `processing`; `currentStage`, `state` e `updatedAt = "Agora"` continuam no adapter.

## Equivalência com start manual

O teste integrado compara a forma inicial produzida pelo start manual e pelo Orchestrator para o mesmo Method canônico, ignorando apenas identidade, timestamp/revisão e efeitos externos. `processType`, `methodSnapshot`, blocos, status, values, attempts e `outputStatus` são equivalentes.

## Compatibilidade V1–V5

O reconciliador histórico não foi alterado. Teste dedicado confirma que `buildOrchestratorSteps()` continua aceitando versões 1, 2, 3, 4 e 5; a integração mantém os cenários V5 de batch, end-to-end, espera humana, plugin ausente e avanço após conclusão.

## Guardrail contra regressão

`architecture-invariants.test.ts` exige que `startOrchestratedProcess()` invoque `createCanonicalProcessExecution()` e rejeita a reintrodução dos padrões mais diretos da construção anterior, incluindo `blocks: methodSnapshot.blocks.map(...)` e classificação local por `block.operator === "Humano"`.

## POST legado ainda isolado

`app.post("/api/executions")` permanece inalterado. Ele ainda aceita uma representação externa pronta e será delimitado pela TASK-010.

## Achados/gaps

Nenhum novo `DECISION REQUIRED` foi identificado.

Durante a construção dos testes, três problemas da própria fixture foram encontrados e corrigidos antes do gate final: inferência excessivamente estreita do tipo retornado por `randomUUID()`, IDs de outputs gerados pela normalização legada que impediam comparação estável e um output de `theme` tipado como `text` em vez de `textarea`, que fazia o Processo aguardar output em vez de concluir. Nenhum deles exigiu mudança no comportamento de produção.

O primeiro failure restante no gate agregado continua sendo o conhecido `test:shared-browser-v89`: a capability textual do ChatGPT retorna `incrementalStrategies = undefined`, enquanto a suíte espera `["per_item"]`. A falha é preexistente e fora do escopo da TASK-009.

## Arquivos alterados

- `server/index.ts`;
- `server/execution-orchestrator.integration.test.ts`;
- `server/execution-orchestrator.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 4/4 |
| `npm run test:execution-core` | pass, 25/25 |
| `npm run test:execution-state-machine` | pass, 16/16 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run check` | avança até o failure conhecido em `test:shared-browser-v89`; 3/4 testes dessa suíte passam |

## Evidência final

- **O01:** Orchestrator com primeiro Bloco Humano cria `awaiting_human`, mantém downstream `pending` e o Orchestrator fica em `awaiting_human`.
- **O02:** Method automático/plugin cria `blocked_executor`; no cenário com downstream, somente o primeiro Bloco fica bloqueado e o seguinte permanece `pending`.
- **O03:** `startOrchestratedProcess()` preserva o early return de execution existente antes de UUID/Core; reconciliações repetidas não duplicam a execução standalone observada.
- **O04:** Method inválido deixa zero executions persistidas e o Project continua `not_started`.
- **O05:** alteração no Method vivo depois do snapshot não muda o Method usado pelo próximo Processo standalone.
- **O06:** batch V5 quantidade 2 continua criando trabalho elegível em múltiplos slots, inclusive com espera humana independente.
- **O07:** end-to-end V5 continua avançando na ordem congelada após conclusão do Processo anterior.
- **O08:** plugin ausente continua criando `blocked_executor` e Orchestrator `blocked`.
- **O09:** `runThrough` sem Orchestrator ativo inicia o próximo Processo pelo mesmo `startOrchestratedProcess()` canônico.
- **O10:** reconciliação standalone periódica não duplica uma execution existente.
- **O11:** versões 1–5 continuam aceitas pelas suites do Orchestrator.
- **O12:** Orchestrator e start manual possuem a mesma forma inicial de domínio para o mesmo Method canônico.

Não resta constructor interno normal duplicado de `ProcessExecution` nos starts manual, Orchestrator ou standalone/runThrough.

## Definition of Done

- [x] `startOrchestratedProcess()` usa `createCanonicalProcessExecution()`.
- [x] Construção manual de `BlockExecution[]` removida desse helper.
- [x] Classificação humano/executor removida do adapter de start.
- [x] UUID e relógio permanecem no adapter.
- [x] Method resolution, snapshot, normalização e validação permanecem no adapter.
- [x] Falha antes da criação não persiste nem projeta estado parcial.
- [x] Project projection permanece com a semântica vigente.
- [x] Transaction SQLite permanece no adapter.
- [x] Scheduling automático permanece depois da persistência.
- [x] Batch e end-to-end V5 continuam funcionando.
- [x] V1–V4 permanecem aceitos.
- [x] Standalone/runThrough passa pelo mesmo constructor.
- [x] Existing executions não são duplicadas.
- [x] Forma inicial é equivalente ao start manual.
- [x] `POST /api/executions` não foi alterado.
- [x] TASK-009 está `done`.
- [x] TASK-010 está `ready`.

## Próxima missão

TASK-010
