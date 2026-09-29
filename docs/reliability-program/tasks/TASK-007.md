# TASK-007 — Unificar criação de ProcessExecution

## Objetivo

Estabelecer no Core uma única função pura e determinística que materialize o estado inicial canônico de uma `ProcessExecution` a partir de identidade, tempo e `ProcessMethod` já canônico e validado.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `484ae2b49df2bdee79b89ad5b0d07eafb6ecb43b`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.
- Versão do produto: `1.2.1`.

## Duplicação observada

- `server/execution-commands.ts::startProcessExecution()` cria snapshot, blocos pendentes e consulta `evaluateExecutionCore(start_requested)` para ativação inicial.
- `server/index.ts::startOrchestratedProcess()` cria snapshot, blocos e estado inicial diretamente, incluindo classificação humano/executor.
- `POST /api/executions` continua aceitando uma representação pronta pela borda legada.

## Contrato do construtor canônico

`createCanonicalProcessExecution(input)` pertence a `src/lib/execution-core/`. Ele cria uma execução nova sem banco, HTTP, UI, plugin, Browser Bridge, relógio ou geração de UUID.

## Inputs explícitos

- `executionId`;
- `projectId`;
- `channelId`;
- `processType`;
- `methodSnapshot` canônico;
- `now`;
- `revision` opcional e somente quando fornecida.

## Estado inicial produzido

Todos os Blocos nascem com `status = pending`, `attempt = 1` e `values = {}`. O construtor então envia `start_requested` ao evaluator canônico e materializa somente sua decisão:

- primeiro Bloco humano nativo → Bloco e execução em `awaiting_human`, com `startedAt = now`;
- primeiro Bloco automático/plugin → Bloco e execução em `blocked_executor`, com `startedAt = now`;
- downstream permanece `pending`.

## Relação com evaluateExecutionCore

A classificação humano/executor e a escolha do primeiro Bloco continuam pertencendo a `evaluateExecutionCore()`. A implementação existente do evaluator foi movida para `execution-core/evaluate.ts` apenas para permitir reutilização interna sem dependência circular; a API pública continua exportada por `execution-core/index.ts`.

## Diagnósticos

- Método vazio retorna `ok: false`, `reason: empty_method`.
- Snapshot estruturalmente inválido retorna `ok: false`, `reason: malformed_state` e os diagnósticos de `validateExecutionCoreInvariants()`.
- Divergência entre `execution.processType` e `methodSnapshot.processType` é rejeitada com o diagnóstico `process_type_snapshot_mismatch`.
- Nenhuma execução parcialmente inicializada é retornada em falha.

## Determinismo e imutabilidade

IDs e timestamp chegam explicitamente no input. O `methodSnapshot` é clonado defensivamente com `structuredClone`; o Método e seus Blocos recebidos não são mutados. Cada Bloco recebe seu próprio objeto `values`.

## Equivalência com comportamento vigente

A suíte dedicada compara a forma canônica com a semântica atual para primeiro Bloco humano e automático, cobrindo snapshot, Blocos, attempts, `startedAt`, status, `outputStatus`, `createdAt` e `updatedAt`.

## Callers ainda não migrados

Permanecem intocados nesta task:

- `server/execution-commands.ts::startProcessExecution()` — TASK-008;
- `server/index.ts::startOrchestratedProcess()` — TASK-009;
- `POST /api/executions` — TASK-010.

## Achados/gaps

Nenhum novo `DECISION REQUIRED` foi identificado. A duplicação de produção permanece deliberadamente até as tasks de migração.

## Arquivos alterados

- `src/lib/execution-core/create-execution.ts`;
- `src/lib/execution-core/create-execution.test.ts`;
- `src/lib/execution-core/evaluate.ts`;
- `src/lib/execution-core/index.ts`;
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
| `npm run test:architecture` | pass, 4/4 após atualizar o guardrail para TASK-007 concluída e TASK-008 pronta |
| `npm run test:execution-core` | pass, 25/25 incluindo E01-E14 e C01-C10 |
| `npm run test:execution-state-machine` | pass, 13/13 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:orchestrator` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run check` | primeiro failure real conhecido em `test:shared-browser-v89`, fora do escopo desta task |

## Evidência final

- `createCanonicalProcessExecution()` é a única definição canônica nova para o estado inicial de domínio e vive dentro de `src/lib/execution-core/`.
- O construtor recebe `executionId` e `now` explicitamente e não usa UUID, relógio, banco, HTTP, UI, plugin ou Browser Bridge.
- Todos os `BlockExecution` são criados `pending`, com `attempt = 1` e objetos `values` independentes; a ativação inicial é decidida por `evaluateExecutionCore(start_requested)`.
- O snapshot é clonado defensivamente e os inputs permanecem imutáveis.
- Método vazio e snapshots estruturalmente inválidos retornam diagnóstico explícito sem execução parcial.
- `processType` contraditório com o snapshot é detectado como invariant violation antes da ativação inicial.
- Teste dedicado prova determinismo, invariantes e equivalência semântica com a criação vigente para primeiro Bloco humano e automático.
- `startProcessExecution()`, `startOrchestratedProcess()` e `POST /api/executions` permanecem nos caminhos atuais e serão tratados nas TASK-008, TASK-009 e TASK-010, respectivamente.

## Definition of Done

- [x] Construtor canônico criado dentro do Core.
- [x] ID e tempo recebidos explicitamente.
- [x] Sem dependência de banco, HTTP, UI, plugin ou browser.
- [x] Method canônico recebido sem normalização legada.
- [x] Todos os `BlockExecution` nascem no construtor.
- [x] Ativação inicial usa `evaluateExecutionCore()`.
- [x] Estados humano e automático corretos.
- [x] Snapshot clonado defensivamente e inputs não mutados.
- [x] Execução válida satisfaz invariantes do Core.
- [x] Método vazio e snapshot inválido produzem diagnóstico explícito.
- [x] Criação determinística comprovada.
- [x] Equivalência com a semântica vigente comprovada por teste.
- [x] Callers de produção não migrados nesta task.
- [x] TASK-007 marcada `done` e TASK-008 marcada `ready`.

## Próxima missão

TASK-008
