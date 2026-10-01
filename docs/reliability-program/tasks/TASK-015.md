# TASK-015 — Centralizar retry manual de Bloco

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Fazer o retry manual solicitado pelo usuário sobre um `BlockExecution` ser validado e aplicado por uma transição canônica do Execution Core, preservando a API externa e mantendo projeção de `Project`, persistência e agendamento nos adapters.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `68d082ad138ba474fc25bd328329c86f1ad75cfe`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Problema técnico observado

`server/execution-commands.ts::retryBlockExecution()` ainda decide diretamente elegibilidade, incremento de tentativa, invalidação de deliveries, limpeza do estado técnico, semântica dos scopes `all`, `remaining` e `selected`, classificação humano/executor e estado da `ProcessExecution`.

No caminho `selected`, o adapter incrementa `attempt`, invalida deliveries e limpa campos antes de verificar se `itemId` existe. Um pedido inválido, portanto, pode retornar `false` depois de mutar parcialmente a execução.

## Decisão arquitetural aplicável

Conforme ADR-002, UI e adapters enviam intenções/fatos, enquanto o Execution Core valida e materializa transições operacionais. O fato desta task é `manual_block_retry_requested`, resolvido exclusivamente contra `ProcessExecution.methodSnapshot` e `ProcessExecution.blocks`.

## Escopo

- representar o pedido manual de retry como fato explícito do Core;
- centralizar eligibility e aplicação em `applyManualBlockRetry()`;
- preservar os scopes `all`, `remaining` e `selected`;
- validar `selected.itemId` antes de qualquer mutação;
- centralizar nova tentativa, limpeza técnica, invalidação da delivery e reativação humano/executor;
- manter `retryBlockExecution()` como adapter que traduz o resultado canônico para boolean, projeta `Project` e chama `touchExecution()`;
- atualizar testes, guardrail arquitetural, Current State e roadmap.

## Fora de escopo

- retry editorial de `VALIDAR`;
- retry/recovery técnico, backoff, troca de perfil, reconciliação ou intervenção;
- cancelamento e `acceptBlockDelivery()`;
- redefinição da política do output oficial do Processo;
- projeção canônica de `Project`, persistência atômica ou revisão;
- agendamento ou início automático de plugin/job;
- TASK-016 e posteriores.

## Invariantes e compatibilidade

- `failed` e `cancelled` aceitam retry manual;
- `completed` aceita somente `selected`;
- demais estados são bloqueados;
- `selected` exige item existente antes da primeira mutação;
- retry aceito incrementa exatamente uma tentativa com `(attempt ?? 1) + 1`;
- o Core usa a definição canônica `operator === "Humano" && !plugin` para reativação;
- deliveries do Bloco são invalidadas, sem invalidar automaticamente `__process_output__`;
- `all` limpa `values`, `itemProgress` e `progress`, mas preserva `items`;
- `remaining` e `selected` preservam valores, itens e progresso por item e recalculam `progress` quando existe total;
- snapshots e formatos persistidos não mudam.

## Output oficial observado

No comportamento vigente, um Bloco `completed` pode receber retry `selected` enquanto `execution.output` e `outputStatus = "completed"` permanecem coexistindo com o Bloco reaberto. A task preservará esse comportamento e o registrará como gap observado, sem inventar política de invalidação do output do Processo.

## Arquivos prováveis

- `src/lib/execution-core/apply-manual-retry.ts` e teste focal;
- `src/lib/execution-core/index.ts` e `types.ts`;
- `server/execution-commands.ts`;
- `server/execution-retry.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json` para incluir a suíte focal;
- documentação do Reliability Program.

## Testes e evidências necessárias

- reutilizar os casos existentes de `remaining`, `all`, `selected`, `cancelled` e “usar entrega atual”;
- provar aplicação canônica para `failed + all`;
- provar `completed + selected` preservando items/values e output oficial vigente;
- provar `selected` inexistente com execução deep equal;
- provar a decisão canônica distinta para humano nativo e executor;
- executar as validações focais e o fechamento definidos na missão.

## Condições de `DECISION REQUIRED`

Interromper somente se a implementação exigir redefinir output oficial, alterar persistência/schema, ampliar eligibility, mudar semântica de scopes ou misturar retry manual com retry editorial/técnico. O diagnóstico inicial não exige nenhuma dessas decisões.

## Implementação concluída

### Fato e aplicação canônica

`ManualBlockRetryRequestedFact` materializa `manual_block_retry_requested` com `blockId`, `scope` e `itemId` opcional. `applyManualBlockRetry()` valida invariantes e o pedido integral antes de mutar a execução, retorna union explícita `retried | blocked` e usa reason codes `unknown_retry_block`, `block_not_retryable`, `selected_item_missing` e `malformed_state`.

### Eligibility e scopes

- `failed` e `cancelled` aceitam `all`, `remaining` ou `selected` válido;
- `completed` aceita somente `selected` válido;
- estados restantes retornam `block_not_retryable`;
- `all` limpa `values`, `itemProgress` e `progress`, preservando `items`;
- `remaining` preserva resultados e recalcula progresso quando há total;
- `selected` preserva values/items e materializa `itemRetryId` somente depois de validar sua existência.

### Tentativa, limpeza, deliveries e reativação

Retry aceito incrementa `(attempt ?? 1) + 1`, invalida somente deliveries do Bloco e limpa `error`, `pluginConversation`, `jobId`, `traceId`, `completedAt` e `progressMessage`. A aplicação também limpa `execution.error` e decide `awaiting_human` para `Humano` nativo sem plugin ou `blocked_executor` para os demais executores.

### Output oficial, Project e persistência

O comportamento vigente de `completed + selected` foi preservado: `execution.output` e `outputStatus = completed` coexistem temporariamente com o Bloco reaberto. Essa política não foi ampliada silenciosamente.

`Project` continua projetado no adapter a partir de `execution.status`; `touchExecution()`, persistência e revisão permanecem externos ao Core. `acceptBlockDelivery()`, cancelamento, retry editorial e recovery técnico não foram alterados.

### Testes reutilizados

- `server/execution-retry.test.ts`: attempts editoriais isolados, `remaining`, `all`, `selected`, Bloco cancelado e “usar entrega atual”;
- suíte do Execution Core e execução automática;
- characterization de `VALIDAR` para provar a separação dos retries;
- fault injection e guardrail arquitetural existentes.

### Novos testes e justificativa

Foram adicionados quatro casos focais em `apply-manual-retry.test.ts`:

1. `failed + all` prova tentativa, limpeza, delivery e estado executor;
2. `completed + selected` prova preservação de values/items e do output oficial vigente;
3. item inexistente, estado inelegível e estado estrutural inválido provam bloqueio com deep equality;
4. humano nativo e executor provam estados canônicos distintos.

O guardrail arquitetural exige que `retryBlockExecution()` use `applyManualBlockRetry()` e proíbe a permanência do algoritmo direto no adapter.

### Arquivos alterados

- `src/lib/execution-core/apply-manual-retry.ts`;
- `src/lib/execution-core/apply-manual-retry.test.ts`;
- `src/lib/execution-core/types.ts`;
- `src/lib/execution-core/index.ts`;
- `server/execution-commands.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-015.md`.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:execution-core` | pass, 54/54 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npx tsx --test server/execution-retry.test.ts` | pass, 6/6 |
| `npm run test:architecture` | pass, 4/4 |
| `npm run lint` | pass após formatação mecânica dos arquivos alterados |
| `npm run test:validation-retry` | pass, 14/14 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run check` | avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`; 3/4 passaram e a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

## Definition of Done

- [x] fato manual explícito existe no Core;
- [x] eligibility e scopes são decididos/aplicados pelo Core;
- [x] `selected` inválido não produz mutação parcial;
- [x] tentativa, limpeza técnica, delivery e reativação são canônicas;
- [x] adapter não contém algoritmo próprio de retry;
- [x] Project, persistência, retry editorial/técnico, cancelamento e accept delivery permanecem fora;
- [x] testes focais e de fechamento passam, ressalvado apenas o failure conhecido fora de escopo;
- [x] Current State e roadmap representam TASK-015 `done` e TASK-016 `ready`.

## Próxima missão

TASK-016, não iniciada.
