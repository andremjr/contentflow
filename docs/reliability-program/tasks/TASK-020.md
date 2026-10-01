# TASK-020 — Remover auto-agendamento interno via HTTP loopback

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `4473c34dfdce2c0bd6925439419d2e1b306b3264`.
- Branch: `main`.
- Worktree inicial limpo (`git status --short` sem saída).
- Node.js `v26.5.1`; npm `11.6.1`.

## Problema observado

`scheduleAutomaticPluginBlock()` agenda trabalho após o commit, mas inicia o Bloco fazendo `fetch()` para `http://127.0.0.1:${port}/api/execute-block`. Assim, uma capacidade já disponível no mesmo processo depende desnecessariamente da porta HTTP, do Express e da serialização/parsing JSON.

O endpoint público `POST /api/execute-block` contém a operação de aplicação que valida o pedido, resolve plugin/capability/inputs/conexão/perfis/conversa, preserva existing jobs e revisão, cria o `PluginJob` atomicamente com execution/project e executa o caminho sync ou async.

## Decisão aplicável

- Preservar o ADR-002: o Execution Core continua sem HTTP e infraestrutura de plugin.
- Extrair uma operação interna na camada server/application, sem tipos `Request`/`Response`.
- Fazer a boundary HTTP e o scheduler automático convergirem nessa operação.
- Preservar o `setTimeout(..., 0)` pós-commit e a atomicidade estabelecida pela TASK-019.

## Escopo

- Remover o `fetch()` loopback do auto-agendamento.
- Extrair e tipar o resultado interno necessário para manter os status e payloads HTTP atuais.
- Reutilizar a operação no endpoint público e no scheduler.
- Preservar validações, existing-job semantics, sync/async, revision/cancelamento e `commitPluginJobTransition()`.
- Acrescentar guardrail arquitetural focal e atualizar Current State/Roadmap.

## Fora de escopo

- TASK-021 e posteriores.
- `labelScore`, bindings canônicos, porta explícita de input/output, alvo explícito de `VALIDAR`, adapter de Método legado e normalização de respostas do executor.
- Decomposição geral de `server/index.ts`, mudança de schema, migração ou política de recovery.

## Arquivos prováveis

- `server/index.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.
- Este registro.

## Invariantes e compatibilidade

- `POST /api/execute-block` mantém status e payloads.
- Existing jobs `starting`/`pending`/`cancel_requested` retornam 202, `completed` retorna 200 e outros terminais retornam 409.
- Scheduler mantém os guardrails de execution/Block/plugin/readiness e transforma resultado não-2xx em `failAutomaticPluginStart()`.
- `latestExecution`, revision e cancelamento continuam verificados antes da criação.
- Criação do job + execution `running` + projeção de Project continuam no mesmo `commitPluginJobTransition()`.
- `processDuePluginJobs()` permanece fora da transação.
- `PersistenceCommitError` continua sendo erro local e não é convertido em falha do plugin; boundaries fire-and-forget devem registrá-lo e consumi-lo sem rejection não tratada.

## Validação planejada

- `npm run typecheck`
- `npm run test:automatic-execution`
- `npm run test:execution-state-machine`
- `npm run test:plugin-jobs`
- `npm run test:persistence`
- `npm run test:orchestrator`
- `npm run test:architecture`
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Scheduler sem HTTP, `fetch`, porta local ou serialização artificial.
- Endpoint e scheduler usam a mesma operação server-side.
- Sem regressão de validação, existing jobs, sync/async, revision, cancelamento ou atomicidade.
- Guardrail estrutural protege a convergência.
- Current State e roadmap registram TASK-020 `done`, TASK-021 `ready` e TASK-022..TASK-052 `pending`, sem iniciar TASK-021.

## Implementação concluída

### Loopback removido

O caminho anterior era:

```text
scheduleAutomaticPluginBlock()
  -> fetch(http://127.0.0.1:${port}/api/execute-block)
  -> Express
  -> criação/processamento do PluginJob no mesmo processo
```

O scheduler continua aplicando os guardrails de execution `blocked_executor`, Bloco ativo, vínculo de plugin e `automaticPluginBlockReady()`, e mantém `setTimeout(..., 0)` após o commit. O callback agora chama diretamente `executePluginBlockInternal(requestBody)`.

### Operação interna compartilhada

`server/index.ts` contém `executePluginBlockInternal()`, que recebe `ExecutePluginBlockInput` sem depender de `Request` ou `Response` e devolve `ExecutePluginBlockResult` com `status` e `body`.

A operação preserva a lógica anteriormente contida na rota: registro/consentimento, lookup de Project/Execution/Block, existing job, compatibilidade da capability, inputs e portas vigentes, `VALIDAR`, outputs vigentes, instrução, conexão/secrets, perfis, conversa, criação de job e execução sync/async.

### Endpoint público

`POST /api/execute-block` agora é uma boundary fina: passa `request.body` para `executePluginBlockInternal()` e traduz o resultado com `response.status(result.status).json(result.body)`. Status e payloads existentes foram preservados.

### Existing jobs, revision e atomicidade

- `starting`, `pending` e `cancel_requested` continuam retornando 202; `completed`, 200; demais terminais, 409.
- A releitura de `latestExecution`, o check de revision e o bloqueio de execução cancelada permanecem antes da criação do job.
- `PluginJobStore.create()`, execution `running` e projeção de Project continuam na mesma `commitPluginJobTransition()`.
- `processDuePluginJobs()` continua depois da transação.
- `PersistenceCommitError` propaga pela operação interna até a boundary chamadora. No scheduler fire-and-forget, ele é registrado como erro interno e consumido sem chamar `failAutomaticPluginStart()` e sem produzir unhandled rejection.
- Plugins async continuam retornando pending/202; plugins sync continuam aguardando `processPluginJob()` e retornando o status/payload vigente.

## Testes

Nenhum novo caso funcional foi necessário. As suites existentes já exercitam scheduler automático, endpoint, fluxo integrado, existing jobs, sync/async, persistência e Orchestrator.

O caso integrado C13 em `server/execution-state-machine.characterization.test.ts` deixou de exigir que a leitura imediatamente posterior ao POST ainda observe `blocked_executor`: sem a latência do loopback, a execução pode legitimamente já estar `running` ou `completed`. A prova final permanece estrita sobre conclusão, values, delivery, output e projeção de Project.

O guardrail em `src/lib/architecture-invariants.test.ts` passou a verificar que:

- `scheduleAutomaticPluginBlock()` chama `executePluginBlockInternal()`;
- o scheduler não contém `fetch`, `127.0.0.1` ou `localhost`;
- a operação interna não usa `request`/`response`;
- a rota pública usa a mesma operação e não contém lógica de job/transação;
- o scheduler registra e consome `PersistenceCommitError`, sem relançá-lo no catch fire-and-forget.

### Correção pós-fechamento

Após o primeiro commit da TASK-020, foi identificado que o catch fire-and-forget de `scheduleAutomaticPluginBlock()` relançava `PersistenceCommitError`, o que poderia produzir unhandled rejection. A boundary agora registra o erro com `console.error(...)` e retorna. Outros erros continuam seguindo para `failAutomaticPluginStart(...)`. Não foi adicionado recovery, retry, estado ou infraestrutura.

A correção foi revalidada com typecheck, lint e as suites focais de execução automática, máquina de estados, persistência e arquitetura.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:plugin-jobs` | pass |
| `npm run test:persistence` | pass, 4/4 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:architecture` | pass, 4/4 |
| `npm run lint` | pass |
| `npm run check` | avança sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `["per_item"]` |

A varredura final de produção encontrou `/api/execute-block` somente na definição da boundary pública. As referências restantes a `127.0.0.1`, `localhost` e `fetch()` pertencem à API local, Browser/DevTools, download/catálogo, UI ou outras boundaries legítimas; não existe chamada HTTP interna para iniciar Bloco automaticamente.

## Arquivos alterados

- `server/index.ts`.
- `server/execution-state-machine.characterization.test.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `docs/reliability-program/tasks/TASK-020.md`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.

## Reliability Program

TASK-006..TASK-020 `done`; TASK-021 `ready`; TASK-022..TASK-052 `pending`. TASK-021 não foi iniciada. Sem commit, tag ou release.

