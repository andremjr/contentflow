# TASK-013 — Conclusão de Plugin passa pelo Core

## Objetivo

Fazer a conclusão automática normal de um Bloco executado por plugin entrar no Execution Core como fato explícito, ser validada contra o snapshot e o estado canônico e ser materializada por uma aplicação canônica antes de delivery e progressão.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `26687404b0888609a4d80bc2dac2231d03f152cd`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Semântica antes da mudança

`server/index.ts::finishPluginBlock()` recebe values já mapeados/validados e, no caminho automático normal, atribui diretamente `values`, `status = "completed"`, `completedAt` e limpa `error`; depois registra deliveries e chama `applyCompletedBlockTransition()`.

## Estado real no momento de sucesso

Caracterização do runtime confirma que, antes do callback final de sucesso, o Bloco de plugin está em `in_progress` e a `ProcessExecution` está em `running`. O estado `blocked_executor` é anterior ao início do job e não é o estado de conclusão normal.

## Novo fato executor

`ExecutionCoreFact` agora inclui `executor_block_completed`, identificado por `blockId` e carregando somente `values` materializados e `now` explícito. O fato não conhece manifest, capability schema, job, perfil, HTTP ou provider.

## Validação de autoridade

O Core resolve o Bloco exclusivamente em `execution.methodSnapshot`, exige operador automático (não `Humano`), `BlockExecution.status === "in_progress"`, `execution.status === "running"` e invariantes estruturais válidos. Rejeições usam `unknown_executor_block`, `block_not_executor`, `executor_block_not_active`, `execution_not_running` ou `malformed_state`, sem mutação.

## Aplicação canônica

`src/lib/execution-core/apply-executor-completion.ts` expõe `applyExecutorBlockCompletion()`. A função consulta o Core, clona defensivamente `values`, materializa `status = "completed"`, aplica `completedAt = now` e limpa `error`. Não registra deliveries, não altera metadata de job e não decide progressão.

## Mapping/validation preservados na boundary

`valuesForPluginResponse()`, `mappedPluginValues()`, normalização, validação de `ESCOLHER`, outputs obrigatórios e restrições de apresentação permanecem no adapter.

## Partial results

Permanecem fora da conclusão canônica.

## Plugin-assisted human handoff

`operator === "Humano"` com plugin continua como handoff para `awaiting_human`, sem conclusão estratégica automática.

## VALIDAR preservado

O branch especial de `retry_target` permanece nesta task sem migração semântica.

## Deliveries e progressão

A ordem alvo é conclusão aceita pelo Core → delivery → semântica especial de VALIDAR quando aplicável → progressão compartilhada da TASK-011.

## Recovery fora de escopo

Retry técnico, fallback, switch profile, reconcile, intervene, cancel e failure permanecem inalterados.

## Persistência/Project fora de escopo

`persistPluginExecution()`, revision e projeção de Project permanecem inalterados.

## Guardrail

`src/lib/architecture-invariants.test.ts` exige a aplicação canônica dentro de `finishPluginBlock()`, proíbe materialização direta de `values/status/completedAt` no caminho normal e preserva explicitamente o handoff Humano assistido.

## Achados/gaps

Nenhum `DECISION REQUIRED` identificado até aqui.

## Arquivos alterados

- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-013.md`;
- `package.json`;
- `server/index.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `src/lib/execution-core/apply-executor-completion.ts`;
- `src/lib/execution-core/apply-executor-completion.test.ts`;
- `src/lib/execution-core/evaluate.ts`;
- `src/lib/execution-core/index.ts`;
- `src/lib/execution-core/types.ts`.

## Validação

O primeiro failure real da bateria foi `npm run lint`: dois erros de Prettier no novo teste de conclusão executor. A formatação foi corrigida e o lint repetido passou. Não houve failure funcional novo da TASK-013.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass após corrigir 2 erros de Prettier |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 4/4 |
| `npm run test:execution-core` | pass, 50/50 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:plugin-jobs` | pass |
| `npm run test:plugin-partials` | pass, 6/6 |
| `npm run test:plugin-fallback` | pass, 28/28 |
| `npm run test:plugin-concurrency` | pass, 4/4 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:legacy-execution-boundary` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run check` | avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`; 3/4 passaram e a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

## Evidência final

O caminho automático normal chama `applyExecutorBlockCompletion()` antes de `recordBlockDeliveries()` e `applyCompletedBlockTransition()`. O branch `operator === "Humano"` retorna antes desse fato e continua em `awaiting_human`. Partial results continuam em `in_progress`; falhas/retries/cancelamento não chamam a aplicação canônica.

## Definition of Done

- [x] conclusão automática normal de executor é fato explícito do Core;
- [x] Core usa `methodSnapshot` e valida autoridade/estado;
- [x] sucesso real caracterizado como `in_progress/running`;
- [x] values são clonados e `completedAt` usa `now` explícito;
- [x] error é limpo no sucesso;
- [x] adapter não materializa diretamente a conclusão automática normal;
- [x] partial/error/retry/cancel permanecem fora;
- [x] plugin-assisted human permanece `awaiting_human`;
- [x] ESCOLHER e output validation permanecem na boundary;
- [x] VALIDAR `retry_target` permanece preservado;
- [x] deliveries continuam antes da progressão;
- [x] recovery, Project e persistência permanecem fora;
- [x] TASK-013 `done`, TASK-014 `ready`, TASK-014 não iniciada.

## Próxima missão

TASK-014
