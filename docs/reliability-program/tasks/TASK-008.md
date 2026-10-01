# TASK-008 — Fazer start manual usar criação canônica

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Migrar exclusivamente `server/execution-commands.ts::startProcessExecution()` para `createCanonicalProcessExecution()`, preservando a semântica vigente do start manual.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `fa5fe04c30c4b9fe629fc7309c5300f1e6768ac6`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Caminho manual antes da migração

O adapter resolvia Project/Channel, capturava strategy snapshot, normalizava e validava o Método, mas também construía `ProcessExecution`, materializava blocos pendentes e aplicava localmente a decisão inicial do Core.

## Migração para createCanonicalProcessExecution

Após preparar o `ProcessMethod` canônico, o caller gera UUID e timestamp e chama `createCanonicalProcessExecution()`. Falha canônica retorna `undefined` antes de qualquer inserção em `db.executions` ou projeção de start no Project.

## Responsabilidades mantidas no adapter

Permanecem no caller: resolução de Project/Channel, `captureProjectStrategy()`, preferência pelo snapshot, `normalizeMethodBlocks()`, `getMethodConfigurationIssue()`, UUID, relógio, persistência no store em memória e projeção do Project.

## Equivalência de comportamento

Start humano continua em `awaiting_human`; start automático continua em `blocked_executor` enquanto a projeção do Project permanece `processing`. Attempts iniciam em 1 e downstream fica `pending`.

## Project projection preservada

A assimetria vigente do start automático foi mantida deliberadamente para TASK-018.

## Guardrail contra regressão

`architecture-invariants.test.ts` exige que `startProcessExecution()` invoque `createCanonicalProcessExecution()` e impede a reintrodução das assinaturas mais diretas da construção manual anterior.

## Callers ainda não migrados

- `startOrchestratedProcess()` → TASK-009.
- `POST /api/executions` → TASK-010.

## Achados/gaps

`touchExecution()` foi preservado após a projeção para manter o comportamento observável vigente de `updatedAt`; removê-lo não é necessário para esta convergência.

## Arquivos alterados

- `server/execution-commands.ts`;
- `server/execution-state-machine.characterization.test.ts`;
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
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:orchestrator` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run check` | primeiro failure real conhecido em `test:shared-browser-v89`: 3/4 passam; a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

O primeiro failure introduzido durante a implementação ocorreu no novo guardrail arquitetural por uma leitura assíncrona dentro de teste síncrono. O teste foi corrigido para `readFileSync()` e os gates afetados foram repetidos com sucesso antes do `check` agregado.

## Evidência final

O adapter escolhe e prepara dados; o Core materializa o nascimento da execução; o adapter persiste e projeta o resultado.

Os cenários de start humano e automático continuam semanticamente equivalentes à criação canônica; segunda chamada reutiliza a mesma execução; Method inválido não persiste execução nem projeta início; snapshot congelado continua protegido. O `check` agregado confirma ausência de nova regressão até alcançar o blocker preexistente de `shared-browser-v89`.

## Definition of Done

- [x] start manual usa criação canônica.
- [x] construção manual inicial removida desse caller.
- [x] UUID e relógio permanecem no adapter.
- [x] snapshot, normalização e validação permanecem na borda.
- [x] falha de criação não gera execução parcial.
- [x] existing execution permanece idempotente.
- [x] projeção humano/automático preservada.
- [x] Orchestrator e POST legado permanecem fora do escopo.

## Próxima missão

TASK-009
