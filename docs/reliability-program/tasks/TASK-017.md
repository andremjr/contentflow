# TASK-017 — Centralizar cancelamento de `ProcessExecution`

## Objetivo

Transformar o pedido explícito de cancelamento em uma aplicação canônica do Execution Core, preservando trabalho consolidado e dados parciais enquanto efeitos externos, projeção de `Project`, revisão, persistência e semântica do Orchestrator permanecem nos adapters.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `8055e121896ad3df43429ce01ca2b60e6e3dd03c`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Autoridades duplicadas encontradas

- `server/index.ts::cancelStoredProcessExecution()` materializa diretamente `ProcessExecution.status = cancelled` e substitui o status de todo Bloco não concluído por `cancelled`.
- `server/index.ts::markPluginJobCancelled()` repete o mesmo algoritmo ao encerrar um job de plugin.

O endpoint explícito impede cancelamento de execução `completed`, mas atualmente reaplica efeitos e persistência quando a execução já está `cancelled`. Os caminhos do Orchestrator evitam ambos os terminais antes de chamar `cancelStoredProcessExecution()`.

## Decisão arquitetural aplicável

Conforme ADR-002, adapters enviam intenção/fato e o Execution Core valida e materializa a transição operacional. O Core não executa cancelamento externo, não governa `PersistentPluginJob`, não projeta `Project` e não persiste.

## Fato e aplicação canônica

Adicionar o fato `execution_cancellation_requested`, sem timestamp porque a transição de domínio não materializa tempo. Uma aplicação pequena `applyExecutionCancellation()` deve validar invariantes antes da primeira mutação e retornar resultado explícito `cancelled | already_cancelled | blocked`.

## Eligibility e idempotência

- elegíveis, preservando o comportamento atual: `not_started`, `running`, `awaiting_human`, `awaiting_output`, `blocked_executor` e `failed`;
- `completed`: bloqueado com `execution_already_completed`, sem mutação;
- `cancelled`: `already_cancelled`, sem mutação e sem repetir efeitos do adapter;
- estrutura inválida: bloqueada com `malformed_state`, sem mutação.

## Semântica canônica e preservação

- `ProcessExecution.status` torna-se `cancelled`;
- cada `BlockExecution` `completed` permanece `completed`;
- qualquer outro status de Bloco torna-se `cancelled`;
- values, items, artifacts, receipts, attempt, resultados parciais, logs, deliveries, erros e output não são limpos nem invalidados.

Essa forma continua elegível para retry manual e para “usar entrega atual” conforme TASK-015 e TASK-016.

## Aplicação nos adapters

### `cancelStoredProcessExecution()`

Usar a aplicação canônica e somente executar efeitos/projeção/persistência quando o resultado for `cancelled`. A aplicação ocorre em memória para validar eligibility; o sinal de cancelamento externo continua antes da transação que torna a execução cancelada durável. Revision, timestamps, projeção e `processDuePluginJobs()` permanecem fora do Core.

### `markPluginJobCancelled()`

Continuar responsável pelo estado e diagnóstico do `PersistentPluginJob`. Quando houver execution/project correlacionados, usar a aplicação canônica; projetar e persistir somente quando ela materializar novo cancelamento.

## Escopo

- fato e aplicação canônica de cancelamento de `ProcessExecution`;
- adaptação dos dois caminhos duplicados;
- cobertura focal econômica e guardrail arquitetural;
- atualização do Current State e roadmap após validação.

## Fora de escopo

- recovery action `cancel` e Universal Recovery;
- retry, intervene ou reconcile;
- state machine de `PersistentPluginJob`;
- Browser Bridge;
- projeção canônica de `Project`;
- persistência atômica;
- semântica e estado do Orchestrator;
- revision e timestamps do adapter;
- DELETE de execution e guardrail de PUT.

## Testes e evidências necessárias

- cobertura focal da aplicação para mapeamento de Blocos e preservação de dados;
- bloqueio de `completed` e estado estrutural inválido com deep equality;
- idempotência de `cancelled` com deep equality;
- suites existentes de Execution Core, fault injection, Orchestrator e plugin cancellation;
- regressões de retry/uso da entrega atual;
- typecheck, arquitetura, lint, validation retry, execução automática e gate agregado conforme a task.

## Condições de `DECISION REQUIRED`

Interromper se a implementação exigir ampliar eligibility, limpar dados ou deliveries, alterar recovery, redefinir projeção/persistência, mover semântica do Orchestrator ou mudar o contrato do job de plugin. A caracterização inicial não exige essas decisões.

## Implementação concluída

### Fato e aplicação canônica

`ExecutionCancellationRequestedFact` representa `execution_cancellation_requested` sem timestamp artificial e integra o union canônico `ExecutionCoreFact`. `ExecutionCoreEvaluationFact` delimita os fatos consumidos pelo avaliador genérico, enquanto a intenção de cancelamento continua aplicada por `applyExecutionCancellation()`. Essa aplicação valida invariantes antes de mutar e retorna `cancelled`, `already_cancelled` ou `blocked`, com os reason codes mínimos `execution_already_completed` e `malformed_state`.

### Eligibility e idempotência

Os estados `not_started`, `running`, `awaiting_human`, `awaiting_output`, `blocked_executor` e `failed` são elegíveis, refletindo o endpoint anterior. `completed` é bloqueado sem mutação. `cancelled` retorna `already_cancelled` sem mutação; o endpoint mantém a resposta `202`, mas não repete cancelamento externo, revision, projeção ou persistência.

### Blocos e dados preservados

Blocos `completed` permanecem `completed`; todos os demais tornam-se `cancelled`. A aplicação não altera values, items, artifacts, external receipts, attempts, erros, logs, output nem deliveries e não chama `invalidateBlockDeliveries()`.

### Adapters e ordem dos efeitos

`cancelStoredProcessExecution()` aplica a transição em memória e só continua quando um novo cancelamento foi materializado. Revision e projeção permanecem locais; `requestPluginExecutionCancellation()` continua antes da transação que persiste a execution cancelada, seguido de `processDuePluginJobs()`.

`markPluginJobCancelled()` continua materializando status, `cancelRequested`, diagnóstico `JOB_CANCELLED` e polling terminal do job. Sua callback usa a mesma aplicação canônica antes da projeção e de `persistPluginExecution()`.

O Orchestrator continua decidindo seu próprio status, `stoppedAt`, mensagem e branching por `strategyVersion`; suas executions passam por `cancelStoredProcessExecution()`. O DELETE continua sendo deleção e o guardrail do PUT contra ressurreição permaneceu inalterado.

### Testes reutilizados

- `server/plugin-account-fallback.integration.test.ts`: cancelamento explícito interrompe o worker ativo, leva o PluginJob a `cancelled` e libera lease;
- `server/execution-orchestrator.integration.test.ts`: Stop cancela a fila e a `ProcessExecution` corrente;
- `server/deterministic-fault-injection.integration.test.ts`: cancelamento pelo runner interrompe a execução externa;
- `server/shared-browser-cancel-resume-v104.test.ts`: cancelamento encerra lanes sem reabrir trabalho;
- `server/execution-retry.test.ts`: retry de Bloco cancelado e “usar entrega atual” preservam Blocos anteriores e resultados.

### Novos testes e justificativa

Foram adicionados três testes focais em `apply-execution-cancellation.test.ts`:

1. uma matriz cobre todos os seis estados elegíveis, a política `completed`/demais e a preservação de values, items, artifact, receipt, tentativa, erros, logs e deliveries;
2. `completed` e estado estrutural inválido são bloqueados com deep equality;
3. `already_cancelled` é idempotente e não mutante.

O fixture usa `satisfies ExecutionCoreFact`, criando uma prova de tipo que falha no typecheck se o fato deixar de integrar o union canônico. Não foi criada outra suíte de integração porque os efeitos externos, Orchestrator, retry e lanes já possuem cobertura dedicada.

## Arquivos alterados

- `src/lib/execution-core/apply-execution-cancellation.ts`;
- `src/lib/execution-core/apply-execution-cancellation.test.ts`;
- `src/lib/execution-core/types.ts`;
- `src/lib/execution-core/index.ts`;
- `server/index.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-017.md`.

## Validação

| Comando                                         | Resultado                                                                                                                                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | pass                                                                                                                                                                                                           |
| `npm run test:execution-core`                   | pass, 60/60                                                                                                                                                                                                    |
| `npm run test:fault-injection`                  | pass, 15/15                                                                                                                                                                                                    |
| `npm run test:orchestrator`                     | pass, 9/9                                                                                                                                                                                                      |
| `npm run test:plugin-fallback`                  | pass, 28/28                                                                                                                                                                                                    |
| `npm run test:shared-browser-v104`              | pass, 2/2                                                                                                                                                                                                      |
| `npx tsx --test server/execution-retry.test.ts` | pass, 6/6                                                                                                                                                                                                      |
| `npm run test:automatic-execution`              | pass, 7/7                                                                                                                                                                                                      |
| `npm run test:architecture`                     | pass, 4/4                                                                                                                                                                                                      |
| `npm run lint`                                  | pass                                                                                                                                                                                                           |
| `npm run test:validation-retry`                 | pass, 14/14                                                                                                                                                                                                    |
| `npm run check`                                 | precheck pass, 17/17; gate avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`, com 3/4 passando e a capability textual do ChatGPT ainda sem `incrementalStrategies: ["per_item"]` |

## Definition of Done

- [x] existe uma aplicação canônica de cancelamento de `ProcessExecution`;
- [x] cancelamento explícito e cancelamento decorrente de plugin job usam a aplicação;
- [x] eligibility, idempotência e invariantes são protegidas sem mutação rejeitada;
- [x] Blocos concluídos e todos os dados produzidos são preservados;
- [x] Blocos não concluídos tornam-se `cancelled`;
- [x] efeitos externos, PluginJob, Project, revision, persistência e Orchestrator permanecem fora;
- [x] retry manual, uso da entrega atual e proteção contra resultado tardio continuam válidos;
- [x] testes focais e de fechamento foram executados;
- [x] Current State e roadmap representam TASK-017 `done` e TASK-018 `ready`.

## Próxima missão

TASK-018, não iniciada.
