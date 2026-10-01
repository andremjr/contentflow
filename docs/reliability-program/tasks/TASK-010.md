# TASK-010 — Isolar POST /api/executions legado

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Isolar `POST /api/executions` como boundary explícita de compatibilidade para uma `ProcessExecution` histórica já materializada, sem transformá-lo em start canônico nem espalhar compatibilidade legada pelo Core.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `9b083faa61f452a26577b574941330f553ef9067`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Semântica observada antes da mudança

O POST recebe `request.body`, faz cast para o `StoredPayload` genérico e valida apenas `id`, `projectId`, `processType` e `updatedAt`. Quando Project e Channel existem e o Project ainda não possui `strategySnapshot`, chama `captureProjectStrategy()` antes do duplicate guard e persiste o snapshot capturado. Depois consulta `executionFor(projectId, processType)`, retorna `409` com a execution existente quando há duplicata, ou insere o payload praticamente cru em `process_executions`. Em seguida faz `as unknown as ProcessExecution`, chama `scheduleAutomaticPluginBlock()`, chama `queueOrchestratorReconciliationForProject()` e retorna `201` com o mesmo payload.

Project ou Channel ausentes não impedem atualmente o `201` e a persistência. Essa tolerância será caracterizada e preservada nesta task.

Callers/testes localizados que fazem `POST /api/executions`: `server/automatic-plugin-execution.test.ts`, quatro cenários em `server/plugin-account-fallback.integration.test.ts` e o C13 de `server/execution-state-machine.characterization.test.ts`.

## Por que o POST não é um start canônico

O endpoint aceita uma representação histórica já materializada. Ele não é um mecanismo recomendado de criação de novas executions. Starts internos novos usam `createCanonicalProcessExecution()`; este POST deve preservar o estado recebido em vez de reconstruí-lo a partir do Method.

## Boundary de compatibilidade criada

`server/legacy-execution-boundary.ts` expõe `adaptLegacyExecutionCreatePayload(input: unknown)`. O módulo é puro, não conhece Express, SQLite, scheduling ou Orchestrator e retorna uma union explícita de sucesso (`ProcessExecution`) ou diagnóstico estrutural. A rota chama esse adapter antes de qualquer efeito.

## Validação estrutural

A boundary valida `id`, `projectId`, `channelId`, `processType`, `methodSnapshot`, `blocks`, `status`, `outputStatus`, `createdAt` e `updatedAt`. `processType` usa `PROCESS_ORDER`; status de execution e Bloco usam os contratos vivos do domínio. `methodSnapshot` precisa conter `processType` coerente e `blocks` com IDs utilizáveis, mas a boundary aceita a forma histórica observada sem `name`. Cada `BlockExecution` precisa de `blockId`, status conhecido e `values` objeto; `attempt`, quando presente, precisa ser numérico.

Foi usada validação estrutural própria e pequena. `validateExecutionCoreInvariants()` exige correspondência completa entre snapshot e blocos, ordem/unicidade e regras de ativação canônicas; aplicar o conjunto inteiro nesta importação poderia reinterpretar ou rejeitar estado histórico ainda legível.

## Compatibilidade preservada

Antes da alteração de produção, a suíte de integração passou contra a rota antiga e congelou a semântica observável. O adapter preserva o payload aceito via `structuredClone()`, inclusive revision, deliveries, output, items, artifacts, receipts, retry metadata e plugin conversation. Status, attempts e values recebidos não são recalculados.

Project ou Channel ausentes continuam aceitos e persistidos, como antes. O duplicate guard continua definido por `projectId + processType`, retorna `409` com a execution existente e não cria segundo registro.

## Strategy snapshot

A captura vigente foi preservada exatamente antes do duplicate guard. Quando Project + Channel existem e o Project não possui snapshot, `captureProjectStrategy()` continua executando e o Project atualizado continua sendo persistido antes de `executionFor()`.

## Persistência e scheduling

SQL e scheduling permanecem em infraestrutura/aplicação. Depois do adapter e do duplicate guard, a rota insere a representação preservada e só então chama `scheduleAutomaticPluginBlock(execution)`. C13 e `test:automatic-execution` continuam provando scheduling real pelo POST legado. Payload rejeitado é testado com zero linha em `process_executions` e zero `plugin_jobs`.

## Orchestrator reconciliation

`queueOrchestratorReconciliationForProject(execution.projectId)` continua depois da persistência. A integração injeta um Orchestrator ativo representativo, cria a execução histórica pelo POST e observa a fila mudar de `running` para `awaiting_human`, provando a reconciliação assíncrona real.

## Guardrail

`architecture-invariants.test.ts` protege TASK-010 `done`, TASK-011 `ready`, exige o adapter legado no POST e impede `createCanonicalProcessExecution()`, `request.body as StoredPayload` e `as unknown as ProcessExecution` dentro dessa rota.

## Achados/gaps

Nenhum `DECISION REQUIRED` foi necessário. A compatibilidade observada permite executions cujo Project ou Channel não existem; como a rota persiste nesses casos hoje e isso não impede a persistência estrutural da representação, o comportamento foi preservado conscientemente.

## Arquivos alterados

- `server/legacy-execution-boundary.ts`;
- `server/legacy-execution-boundary.test.ts`;
- `server/legacy-execution-boundary.integration.test.ts`;
- `server/index.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test:execution-core` | pass, 25/25 |
| `npm run test:execution-state-machine` | pass, 16/16; C13 preservado |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run test:legacy-execution-boundary` | pass, 8/8 |
| `npm run test:architecture` | pass, 4/4 |
| `npm run check` | avança até o failure conhecido em `test:shared-browser-v89`; 3/4 testes dessa suíte passam |

O primeiro failure real durante a validação da task foi Prettier em arquivos de teste recém-criados. Os pontos de formatação foram corrigidos antes da bateria acima; não houve regressão funcional associada.

No gate agregado, o primeiro failure restante é o já conhecido `test:shared-browser-v89`: a capability textual do ChatGPT retorna `incrementalStrategies = undefined`, enquanto a suíte espera `["per_item"]`. Esse contrato permanece fora do escopo da TASK-010.

## Evidência final

- L01/L04: representação materializada aceita e persistida sem reconstrução; revision, status, attempts e values preservados.
- L02: payload sem estrutura mínima retorna `400`.
- L03: duplicate mantém `409`, retorna a execution existente e não duplica a linha.
- L05: Project + Channel sem snapshot capturam a estratégia vigente antes do duplicate guard.
- L06: C13 e `test:automatic-execution` continuam agendando plugin a partir do POST histórico.
- L07: integration observa reconciliação real do Orchestrator após o POST.
- L08–L11: processo, Method, blocos e status estruturalmente inválidos são rejeitados pelo adapter.
- L12: rejeição ocorre antes de persistência e scheduling, com zero execution e zero plugin job.
- L13: campos legítimos profundos não usados pela rota são preservados.

## Definition of Done

- [x] `POST /api/executions` continua existindo.
- [x] Boundary está explicitamente nomeada como legado/compatibilidade.
- [x] Cast permissivo direto foi removido da rota.
- [x] Adapter puro e testável existe.
- [x] Payload inválido é rejeitado antes de efeitos.
- [x] Estado histórico aceito é preservado.
- [x] POST não chama `createCanonicalProcessExecution()`.
- [x] Duplicate continua `409`.
- [x] Strategy snapshot vigente foi preservado.
- [x] Scheduling continua depois da persistência.
- [x] Reconciliação do Orchestrator continua.
- [x] C13 continua passando.
- [x] PUT/DELETE/cancel não foram refatorados.
- [x] Core não recebeu lógica histórica.
- [x] Current State representa a boundary histórica explicitamente.
- [x] TASK-010 `done`; TASK-011 `ready` sem iniciar TASK-011.

## Próxima missão

TASK-011
