# TASK-016 — Centralizar “usar entrega atual”

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Fazer a intenção manual de aceitar como definitiva a entrega já persistida de um Bloco `failed` ou `cancelled` ser validada e aplicada pelo Execution Core, preservando a API externa e mantendo validação material dos values, deliveries, progressão, projeção de `Project` e persistência nas fronteiras atuais.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `d0ed7e0e5010fe35a88da67eeafaa380972f5c59`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Problema técnico observado

`server/execution-commands.ts::acceptBlockDelivery()` ainda decide diretamente se o estado aceita a entrega atual e materializa a conclusão ao gravar `status`, `completedAt`, `error`, `progress`, `progressMessage`, `itemProgress` e `itemRetryScope`, além de limpar `execution.error`.

A boundary já valida corretamente o conteúdo existente com `blockDeliveryIssues()`, registra deliveries depois da conclusão e converge a progressão em `applyCompletedBlockTransition()`. A autoridade restante a centralizar é exclusivamente a eligibility e a aplicação da aceitação manual.

## Decisão arquitetural aplicável

Conforme ADR-002, UI e adapters enviam intenções/fatos, enquanto o Execution Core valida e materializa transições operacionais. A boundary continua responsável por afirmar que os values existentes são materialmente utilizáveis; o Core decide se o Bloco pode promovê-los a conclusão naquele estado.

## Fato canônico

Representar a intenção como `current_block_delivery_accepted`, contendo somente `blockId` e `now`. O fato não carrega payload substituto, Project, HTTP, UI, plugin, provider, job ou perfil.

## Eligibility

- o estado estrutural da execução precisa ser válido;
- o Bloco deve existir no `methodSnapshot` e possuir `BlockExecution` correspondente;
- somente `failed` e `cancelled` são elegíveis;
- `ESCOLHER` e `VALIDAR` permanecem proibidos;
- qualquer rejeição ocorre antes da primeira mutação e preserva deep equality.

## Aplicação

A aplicação canônica deve materializar somente a conclusão: `status = completed`, `completedAt = now`, limpeza de erro e metadados de progresso/retry coerentes, `progress = 1` e limpeza de `execution.error`. Values, items, artifacts, receipts, tentativa e demais campos sem evidência permanecem intactos.

## Escopo

- adicionar o fato explícito e uma aplicação pequena no Execution Core;
- centralizar eligibility e completion metadata de “usar entrega atual”;
- adaptar `acceptBlockDelivery()` sem alterar sua assinatura ou resultado;
- manter validação material antes do Core;
- manter `recordBlockDeliveries()` depois da aceitação;
- manter `applyCompletedBlockTransition()` como única progressão;
- adicionar apenas testes focais necessários e guardrail arquitetural;
- atualizar Current State e roadmap ao concluir.

## Fora de escopo

- retry manual ou editorial de `VALIDAR`;
- cancelamento, recovery técnico e partial result;
- selected item retry;
- conclusão humana ou de executor normal;
- schema, transaction layer ou persistência;
- projeção canônica de `Project`;
- UI/API externa;
- TASK-017 e posteriores.

## Delivery e progressão

`recordBlockDeliveries()` permanece no adapter e roda somente depois de o Core aceitar a intenção. Em seguida, `applyCompletedBlockTransition()` continua sendo a única progressão, inclusive para derivar output e concluir ou colocar o último Bloco em `awaiting_output`.

## Compatibilidade

- a política vigente de `failed` e `cancelled` é preservada sem ampliação;
- os values persistidos continuam sendo a fonte da conclusão;
- items, artifacts e receipts existentes não são regenerados nem apagados;
- não há mudança de schema, snapshot ou formato persistido;
- `ESCOLHER` e `VALIDAR` não podem contornar suas semânticas próprias.

## Arquivos prováveis

- `src/lib/execution-core/apply-current-delivery-acceptance.ts` e teste focal;
- `src/lib/execution-core/types.ts` e `index.ts`;
- `server/execution-commands.ts`;
- `server/execution-retry.test.ts` somente para lacunas de integração;
- `src/lib/architecture-invariants.test.ts`;
- `package.json` para incluir a suíte focal;
- documentação do Reliability Program.

## Testes e evidências necessárias

- reutilizar o caso integrado de Bloco cancelado e último Bloco;
- provar `cancelled` e `failed` na aplicação canônica;
- provar preservação de values, items e artifacts;
- provar bloqueio sem mutação para estado inelegível, `ESCOLHER`, `VALIDAR`, Bloco desconhecido e estado estrutural inválido;
- executar typecheck, Execution Core, integração focal, arquitetura e state machine;
- executar lint, execução automática, validation retry e `npm run check` no fechamento, respeitando o failure conhecido de `test:shared-browser-v89`.

## Condições de `DECISION REQUIRED`

Interromper somente se a implementação exigir ampliar eligibility, redefinir a validade material da delivery, limpar dados sem evidência, alterar progressão, Project, persistência ou a semântica própria de `ESCOLHER`/`VALIDAR`. O diagnóstico inicial não exige nenhuma dessas decisões.

## Implementação concluída

### Fato e aplicação canônica

`CurrentBlockDeliveryAcceptedFact` materializa `current_block_delivery_accepted` com `blockId` e `now`. `applyCurrentBlockDeliveryAcceptance()` valida invariantes, correspondência entre snapshot e execução, tipo e status antes da primeira mutação, retornando `completed | blocked` com os reason codes `unknown_delivery_block`, `block_not_accepting_current_delivery`, `unsupported_delivery_acceptance` e `malformed_state`.

### Eligibility e metadados

Somente `failed` e `cancelled` são aceitos. `ESCOLHER`, `VALIDAR`, demais estados e estruturas inválidas são bloqueados sem mutação parcial. A aplicação define `completed`, usa o timestamp explícito, limpa erros e metadados transitórios de progresso/retry e fixa `progress = 1`.

### Values, items e artifacts

Os values persistidos não são clonados nem substituídos. Items, artifacts, receipts, tentativa e demais dados produzidos permanecem intactos. O `itemRetryId` é limpo junto de `itemRetryScope` para não manter um marcador de retry órfão numa conclusão consolidada.

### Delivery, progressão, Project e persistência

`acceptBlockDelivery()` preserva a validação material com `blockDeliveryIssues()`, chama a aplicação canônica e somente então registra a delivery. A progressão continua exclusivamente em `applyCompletedBlockTransition()`, inclusive para o último Bloco. Projeção de `Project`, `touchExecution()` e persistência continuam nas fronteiras existentes; cancelamento e retry não foram alterados.

### Testes reutilizados

- `server/execution-retry.test.ts`: o caso existente de Bloco cancelado comprova preservação dos Blocos anteriores, values, tentativa, delivery, output final e projeção do Project;
- `server/execution-state-machine.characterization.test.ts`: cobre a progressão compartilhada e o último Bloco;
- suites existentes de execução automática, `VALIDAR` e arquitetura comprovam ausência de regressão nas intenções vizinhas.

### Novos testes e justificativa

Foram adicionados três casos focais em `apply-current-delivery-acceptance.test.ts`:

1. `cancelled` prova metadados canônicos e preservação de values, items, artifacts e receipt;
2. `failed` prova a mesma conclusão canônica para a segunda origem permitida;
3. uma matriz prova bloqueio com deep equality para `ESCOLHER`, `VALIDAR`, estado inelegível, Bloco desconhecido e estado estrutural inválido.

O guardrail arquitetural exige a sequência aplicação canônica → delivery → progressão e proíbe a permanência das atribuições diretas no adapter.

## Arquivos alterados

- `src/lib/execution-core/apply-current-delivery-acceptance.ts`;
- `src/lib/execution-core/apply-current-delivery-acceptance.test.ts`;
- `src/lib/execution-core/types.ts`;
- `src/lib/execution-core/index.ts`;
- `server/execution-commands.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-016.md`.

## Validação

| Comando                                         | Resultado                                                                                                                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                             | pass                                                                                                                                                                               |
| `npm run test:execution-core`                   | pass, 57/57                                                                                                                                                                        |
| `npx tsx --test server/execution-retry.test.ts` | pass, 6/6                                                                                                                                                                          |
| `npm run test:architecture`                     | pass, 4/4                                                                                                                                                                          |
| `npm run test:execution-state-machine`          | pass, 17/17                                                                                                                                                                        |
| `npm run lint`                                  | pass                                                                                                                                                                               |
| `npm run test:automatic-execution`              | pass, 7/7                                                                                                                                                                          |
| `npm run test:validation-retry`                 | pass, 14/14                                                                                                                                                                        |
| `npm run check`                                 | avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`; 3/4 passaram e a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

## Definition of Done

- [x] intenção/fato canônico existe no Core;
- [x] Core decide eligibility para `failed` e `cancelled`;
- [x] demais estados, `ESCOLHER` e `VALIDAR` são rejeitados sem mutação;
- [x] completion metadata é aplicada canonicamente e `execution.error` é limpo;
- [x] values, items e artifacts existentes são preservados;
- [x] delivery é registrada depois da aceitação;
- [x] progressão continua em `applyCompletedBlockTransition()`;
- [x] Project, persistência, cancelamento e retry permanecem fora;
- [x] testes focais e de fechamento foram executados;
- [x] Current State e roadmap representam TASK-016 `done` e TASK-017 `ready`.

## Próxima missão

TASK-017, não iniciada.
