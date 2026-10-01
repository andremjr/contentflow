# TASK-019 — Persistência atômica das transições

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `684c4453880160a476338766e7752e39402c5bf7`.
- Branch: `main`.
- Worktree inicial limpo (`git status --short` sem saída).
- Node.js `v26.5.1`; npm `11.6.1`.

## Unidade de commit e atomicidade já existente

- `POST /api/commands` já executava leitura do receipt, aplicação, gravação de `ProcessExecution`, projeção de `Project` e receipt na mesma transação SQLite. `start`, conclusão humana, `VALIDAR`, retry, uso de entrega atual e reset compartilham essa fronteira. O receipt continua consultado antes de reaplicar o comando. Drafts não geram receipt, conforme contrato vigente.
- `PluginJobStore.save()` já executava `onSaved` dentro de `database.transaction().immediate()`. As transições terminais de plugin que chamavam `persistPluginExecution()` no callback já incluíam job, execution e project no mesmo commit.
- Start orquestrado já inseria execution e atualizava project na mesma transação.
- Uma statement isolada de `updateClaimed()` já era atômica como statement SQLite; isso não tornava automaticamente atômica a transição lógica job + execution + project.
- Os triggers de `state_clock` participam da transação e são revertidos no rollback.

## Janelas reais fechadas

- `cancelStoredProcessExecution()` gravava `plugin_jobs.cancel_requested` em transação anterior à gravação de execution/project e abortava invocações antes do commit. Agora a intenção do job, a execution cancelada e a projeção do project compartilham uma transação. O abort ocorre somente após commit. A exclusão de Canal ou Projeto segue a mesma ordem para cancelamento durável e abort.
- Retry, troca de perfil, resultado pendente/parcial e avanço de item em alguns caminhos executavam `save()` ou `updateClaimed()` e só depois `persistPluginExecution()` em outro commit. Esses pares estão envolvidos em `commitPluginJobTransition()`. O helper agenda reconciliação somente após o commit externo; callbacks de `save()` continuam puramente de estado SQLite.
- A criação inicial do job era confirmada antes de marcar a execution como `running`. Agora `PluginJobStore.create()`, estado da execution e projeção do project compartilham a transação de start do plugin.
- `persistPluginExecution()` enfileirava reconciliação mesmo quando chamado de dentro de `onSaved`, antes do commit do job. Agora, dentro de transação, apenas grava; `savePluginJob()` agenda após `save()` retornar com sucesso. Fora de transação, o próprio helper agenda após seu commit.
- Falha de persistência durante o processamento do worker é classificada como `PersistenceCommitError` e propagada; não é reinterpretada como falha do plugin nem resulta em resposta de sucesso. Objetos JS mutados em callback que falhou são descartados no unwind; a próxima leitura usa SQLite. O worker não reutiliza o snapshot após esse erro.
- A liberação do lease de perfil nos dois caminhos de `switch_profile` ocorre somente depois de `commitPluginJobTransition()` retornar com sucesso. Assim, `clearInterval`, remoção do map em memória e liberação/reconciliação do lease não podem anteceder uma escrita SQLite posterior sujeita a rollback. O guardrail arquitetural rejeita esses e os demais efeitos pós-commit conhecidos dentro das callbacks transacionais.

## Cancelamento e efeitos externos

Ordem adotada: intenção/estado durável → commit → `AbortController.abort()` → processamento de jobs vencidos. Um crash antes do commit deixa o estado anterior e não sinaliza abort; um crash após o commit preserva `cancel_requested` e execution cancelada para retomada. A invocação ativa pode continuar brevemente entre commit e abort, mas o worker verifica cancelamento persistido e `PluginJobStore.save()` impede que um resultado tardio vença `cancel_requested`. Esta task não decide se um efeito externo chegou ao provider, conforme ADR-004.

`scheduleAutomaticPluginBlock()`, `processDuePluginJobs()` e a reconciliação de standalone observam commits já concluídos nos caminhos alterados. HTTP, subprocessos, Browser Bridge, filesystem, leases e abort não são declarados transacionais por SQLite. `POST /api/executions` histórico permanece boundary de compatibilidade.

## Revision, updatedAt e memória

`revision` e `updatedAt` continuam definidos pelo adapter, sem alterar seus significados ou o check de optimistic concurrency. Comando manual opera sobre snapshot lido dentro da transação e descartado em falha. Worker pode mutar snapshots capturados durante callback, mas erro de commit propaga e encerra a tentativa corrente, sem reutilizá-los; a execução e o projeto persistentes permanecem nas revisões anteriores. `state_clock` continua exclusivamente por triggers.

## Validação

`server/execution-persistence.test.ts` introduz quatro casos focais: rollback da unidade manual incluindo receipt/clock; rollback do callback de `PluginJobStore.save()` após alterar execution/project; commit positivo dos três estados; rollback e commit da intenção de cancelamento antes do abort. São falhas determinísticas em SQLite local, sem flags de produção. As suites existentes cobrem semântica dos comandos, plugin e Orchestrator.

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:persistence` | pass, 4/4 |
| `npm run test:plugin-jobs` | pass |
| `npm run test:execution-core` | pass |
| `npm run test:execution-state-machine` | pass, 17/17, incluindo plugin integrado |
| `npm run test:architecture` | pass, 4/4 |
| `npx tsx --test server/execution-retry.test.ts` | pass, 6/6 |
| `npm run test:plugin-partials` | pass, 6/6 |
| `npm run test:plugin-concurrency` | pass, 4/4 |
| `npm run test:plugin-fallback` | pass, 28/28 |
| `npm run test:shared-browser-v43` | pass, 4/4 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:validation-retry` | pass, 14/14 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run lint` | pass |
| `npm run check` | avança sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha pré-existente: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `["per_item"]`. |

## Arquivos alterados

- `server/index.ts`, `server/plugin-job-store.ts`;
- `server/execution-persistence.test.ts`, `src/lib/architecture-invariants.test.ts`, `package.json`;
- `docs/reliability-program/tasks/TASK-019.md`, `docs/reliability-program/04-CURRENT-STATE.md`, `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.

## Reliability Program

TASK-006..TASK-019 `done`; TASK-020 `ready`; TASK-021..TASK-052 `pending`. TASK-020 não foi iniciada. Sem alteração de schema, formato persistido, contrato de receipt, máquina de estados de job ou política de efeito incerto. Sem commit, tag ou release.
