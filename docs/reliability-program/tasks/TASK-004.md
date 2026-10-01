# TASK-004 — Plugin determinístico de fault injection

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Criar uma capability interna, determinística e isolada para reproduzir fatos de sucesso, falha técnica, rate limit, intervenção, efeito externo incerto, timeout e cancelamento sem rede, navegador, provider, relógio decisório, aleatoriedade ou estado global oculto.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `db971e214206b41fdee5b0272a89d4a6f23f7551`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.
- Versão do produto: `1.2.1` em `package.json`.

## Design do fault plugin

O pacote ficará em `ecosystem/plugins/testing/deterministic-fault-injection/`, fora de `ecosystem/plugins/reference/`, que é a única raiz usada pelo empacotamento e pelo catálogo oficiais. A capability `fault` será imediata, sem permissões, secrets, rede, browser, subprocessos ou artifacts. O cenário será escolhido exclusivamente por `configuration.scenario`; a entrada `content` comprovará o payload e o sucesso devolverá `result` em maiúsculas.

O handler usará despacho por tabela/funções pequenas. Cenários que aguardam timeout ou cancelamento não consultarão clock nem usarão sleep longo: permanecerão pendentes até o runner encerrar o worker ou até um `AbortSignal` observável ser disparado em chamada direta.

## Cenários disponíveis

| ID | Scenario | Fato produzido |
| --- | --- | --- |
| F01 | `success` | `success`, com `result = content.trim().toUpperCase()` e sem recovery facts. |
| F02 | `technical_retryable` | `UPSTREAM_UNAVAILABLE`, retryable, `before_effect` e `externalEffect = none`. |
| F03 | `timeout` | Mantém a Promise aberta até o timeout mínimo vigente de 1 segundo encerrar o worker. |
| F04 | `rate_limit` | `RATE_LIMIT`, retryable e `retryAfterMs = 1000`. |
| F05 | `intervention` | `CAPTCHA_REQUIRED`, `intervention = captcha` e nenhum efeito externo. |
| F06 | `external_effect_uncertain` | `effect_submitted`, `externalEffect = possible` e receipt estável `fault-receipt-001`. |
| F07 | `external_effect_confirmed_failure` | Falha terminal específica do fixture com `effect_confirmed` e `externalEffect = confirmed`. |
| F08 | `cancel_aware` | Aguarda cancelamento; em chamada direta observa `AbortSignal`, e no runner é encerrado pelo processo pai. |

## Mapping para RecoveryDecision

Os testes chamarão `decideExecutionRecovery()` sem alterar a policy e provarão, sob deadline suficiente e sem fallback de perfil:

- falha técnica segura → `retry`;
- rate limit → `retry`;
- CAPTCHA → `intervene`;
- efeito externo possível/submetido → `reconcile`.

Também ficou provado que F07 produz `fail`. O cenário não envia receipt porque a policy vigente considera a mera presença de `externalReceipt` evidência de incerteza, mesmo junto de `effect_confirmed`; usar somente os facts confirmados representa a falha terminal sem inventar contrato ou alterar a policy.

## Isolamento e permissões

O manifesto declarará `permissions: []`, `sideEffects: []`, custo gratuito e nenhuma transferência de dados. Não haverá acesso a filesystem pelo handler, rede, browser, subprocesso ou dependência externa.

## Integração com Plugin Runner

A suíte dedicada executará o pacote por `executeRegisteredPlugin()` no worker sandbox real. O timeout será imposto pelo runner com o mínimo vigente de 1 segundo. O cancelamento vigente será caracterizado no nível do runner: o sinal do chamador encerra o worker; ele não é atualmente propagado ao `AbortController` criado dentro do worker.

## Achados/gaps

- A documentação referenciada por caminhos antigos em `docs/ARCHITECTURE.md` e `ecosystem/plugin-kit/README.md` está hoje consolidada nas referências da skill em `ecosystem/skills/contentflow-plugin-development/references/`; isso não foi corrigido nesta task.
- A aplicação durável de `reconcile` e `intervene` continua fora do escopo e pertence às TASK-029+.
- O runner recebe um `AbortSignal` do chamador, porém hoje encerra o worker diretamente; o `AbortController` criado no worker não recebe esse sinal. F08 caracteriza os dois níveis sem criar infraestrutura nova.
- `pending_once` não foi incluído porque uma transição determinística entre invocações exigiria estado persistente adicional; permanece adequado para TASK-049.
- `partial_then_fail` e um segundo cenário pela API automática não foram adicionados: o runner real cobre a fronteira obrigatória sem duplicar a extensa montagem HTTP já caracterizada por `test:automatic-execution`.

## Arquivos alterados

- `ecosystem/plugins/testing/deterministic-fault-injection/contentflow.plugin.json`;
- `ecosystem/plugins/testing/deterministic-fault-injection/handler.mjs`;
- `ecosystem/plugins/testing/deterministic-fault-injection/fixtures/execution.json`;
- `ecosystem/plugins/testing/deterministic-fault-injection/test.mjs`;
- `ecosystem/plugins/testing/deterministic-fault-injection/README.md`;
- `server/deterministic-fault-injection.integration.test.ts`;
- `package.json`;
- `src/lib/architecture-invariants.test.ts`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro histórico.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run plugin:kit -- check ./ecosystem/plugins/testing/deterministic-fault-injection` | pass; manifesto, contrato e sandbox compatíveis, sem permissões. |
| `npm run plugin:kit -- test-contract ./ecosystem/plugins/testing/deterministic-fault-injection` | pass; 9/9 testes portáteis. |
| `npm run plugin:kit -- test-sandbox ./ecosystem/plugins/testing/deterministic-fault-injection` | pass; execução real `success`, permissões nenhuma. |
| `npm run lint` | pass. |
| `npm run typecheck` | pass. |
| `npm run test:architecture` | pass, 4/4 no estado `in_progress`; repetido no estado final. |
| `npm run test:execution-state-machine` | pass, 13/13. |
| `npm run test:validation-retry` | pass, 11/11. |
| `npm run test:fault-injection` | pass, 15/15. |
| `npm run test:automatic-execution` | pass, 7/7. |
| `npm run test:browser-runtime-core` | pass, 13/13 da policy/runtime e 1/1 de sync da Bridge. |
| `npm run check` | falha conhecida em `test:shared-browser-v89`, 3/4; todos os gates anteriores passaram. |

O gate agregado parou no mesmo gap preexistente: a capability textual do ChatGPT não declara `incrementalStrategies: ["per_item"]`. A TASK-004 não alterou esse plugin nem o teste.

## Evidência final

- O plugin é executável no sandbox real por `executeRegisteredPlugin()` e preserva errors/recovery facts estruturados através do processo worker.
- O timeout encerra o worker em aproximadamente 1 segundo, e o cancelamento do chamador o encerra em aproximadamente 100–125 ms nos testes observados.
- A policy vigente produz `retry`, `retry`, `intervene`, `reconcile` e `fail` para F02, F04, F05, F06 e F07, respectivamente.
- O empacotamento e catálogo oficiais continuam lendo exclusivamente `ecosystem/plugins/reference/`; a fixture vive em `ecosystem/plugins/testing/` e um teste protege essa fronteira.
- Não houve mudança em recovery policy, contratos de produção, versão, tag, release ou publicação.

## Definition of Done

- [x] Fixture/plugin determinístico dedicado criado.
- [x] F01–F08 representados e limitações vigentes documentadas.
- [x] Mapping de recovery testado sem alteração da policy.
- [x] Execução pelo Plugin Runner real testada.
- [x] Timeout e cancelamento curtos encerram o worker.
- [x] Permissões mínimas e exclusão de catálogo comprovadas.
- [x] Regressões obrigatórias executadas.
- [x] Current State e roadmap atualizados.

## Próxima missão

TASK-005 — Fixture persistente representativa da 1.2.1. Está `ready`, mas não foi iniciada.
