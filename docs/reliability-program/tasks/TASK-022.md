# TASK-022 — Binding canônico explícito para inputs

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `868399224c07c92e8060065d92d1aee4253f4237`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Representar de forma canônica, discriminada e determinística a origem estratégica de cada input de Método, preservando temporariamente a leitura dos campos planos legados e mantendo source binding separado de portas e capabilities de plugin.

## Problema técnico observado

`BlockInputBinding` combina `source`, `sourceKey`, `sourceProcessType`, `blockId`, `staticValue`, `historyLimit` e `historyEligibility` como campos independentes. Assim, TypeScript permite referências incompletas ou contraditórias, como `previous_block` sem `blockId` e `previous_process` sem processo ou output. Quando a referência explícita não resolve, `resolveBlockInputs()` ainda pode recorrer a `labelScore()`, o que não é aceitável para um binding canônico presente.

## Decisões aplicáveis

- ADR-003: execução canônica usa contratos explícitos e identificadores canônicos; ambiguidade gera diagnóstico.
- ADR-007: compatibilidade histórica permanece temporariamente na fronteira e não deve sobrescrever a forma canônica.
- O Método e seu snapshot são autoridade da estratégia; plugins implementam capabilities e não escolhem a origem dos dados.
- A TASK-022 introduz source binding canônico, mas não remove `labelScore`, não torna `portKey` obrigatória e não altera outputs ou `VALIDAR`.

## Escopo

- Adicionar ao domínio um union discriminado para `project`, `previous_process`, `previous_block`, `channel_history`, `runtime` e `static`.
- Adicionar o binding opcional a `BlockInputBinding`, mantendo os campos legados durante a janela de compatibilidade.
- Centralizar a precedência `canonical → legacy explicit → heuristic temporary`.
- Materializar bindings canônicos apenas a partir de informação estrutural já explícita, sem labels, posição ou consulta a plugin.
- Resolver bindings canônicos diretamente e impedir fallback heurístico quando um binding canônico presente for inválido ou não resolvível.
- Fazer o Builder validar e produzir bindings canônicos quando houver informação suficiente.
- Preservar o binding em normalização, snapshots e round-trips de Método.
- Atualizar testes focais, guardrails, Current State e roadmap.

## Fora de escopo

- Remover campos legados ou `labelScore()`.
- Criar migration SQLite ou reescrever snapshots históricos.
- Alterar a semântica de `channel_library`.
- Adicionar `portKey`, `pluginId`, `capabilityId` ou configuração de executor ao source binding.
- Alterar inferência de portas, mapeamento de outputs ou fallbacks de `VALIDAR`.
- Iniciar a TASK-023.

## Invariantes

- Binding canônico presente é a única autoridade da origem estratégica daquele input.
- Binding canônico inválido ou não resolvível resulta em `resolved = false`; nunca cai em `labelScore()` nem nos campos legados.
- Materialização legada não adivinha IDs, keys ou processos.
- `previous_block` exige `blockId + outputKey`; `previous_process` exige `processType + outputKey`.
- `project` canônico aceita somente `title` ou `deadline`.
- Runtime continua buscando o valor por `input.id` na execução.
- Source binding permanece independente de plugin e de porta.
- Métodos sem binding canônico preservam a compatibilidade vigente.

## Compatibilidade e migração

Não haverá migration de banco. A representação canônica coexistirá temporariamente com os campos planos. `channel_library` permanece apenas com a compatibilidade vigente e não será promovido silenciosamente a variante canônica sem evidência de fluxo legítimo.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:plugin-inputs`
- `npm run test:execution-state-machine`
- testes focais de runtime contract e Builder
- testes de Method file/package/transfer somente conforme o impacto observado
- `npm run lint`
- `npm run check` (aceitável apenas a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Union discriminado implementado e usado como autoridade quando presente.
- Resolução exata de `previous_block` e `previous_process` coberta.
- Binding canônico inválido coberto sem fallback heurístico.
- Compatibilidade de Método legado coberta.
- Builder materializa somente referências estruturalmente completas.
- Snapshot e round-trip preservam o binding.
- Guardrails protegem separação de plugin/porta e precedência canônica.
- Current State e roadmap registram TASK-022 `done`, TASK-023 `ready` e TASK-024..TASK-052 `pending`.

## Condições de `DECISION REQUIRED`

Interromper se a implementação exigir remover campos legados, migration SQLite, quebrar packages existentes, mudar `channel_library`, fundir source binding com porta/capability, tornar `portKey` obrigatória, remover `labelScore`, inferir IDs por labels ou redefinir a ordem universal.

## Modelo canônico implementado

`BlockInputSourceBinding` é um union discriminado com estas variantes:

- `project(key: "title" | "deadline")`;
- `previous_process(processType, outputKey, blockId?)`;
- `previous_block(blockId, outputKey)`;
- `channel_history(processType, blockId, outputKey, limit, eligibility)`;
- `runtime`;
- `static(value)`.

O binding estratégico não contém `portKey`, `pluginId`, `capabilityId`, configuração de executor nem labels. `channel_library` não foi promovido: a investigação confirmou que `normalizeActionBlock()` filtra essa origem e não existe evidência para reviver o fluxo como binding canônico normal.

## Precedência e runtime

`authoritativeInputSource()` centraliza a precedência. Quando `input.binding` existe, ele é autoridade mesmo que os campos legados sejam conflitantes. `resolveBlockInputs()` resolve essa referência diretamente; se a origem exata não existir ou o binding for inválido, retorna `resolved = false` antes do fallback de labels.

Sem binding canônico, a representação legada continua temporariamente aceita. Referências legadas estruturalmente completas podem ser materializadas e resolvidas deterministicamente; referências históricas incompletas ainda podem alcançar `labelScore()` até a TASK-023.

`previous_process` sem `blockId` seleciona o output oficial exato do Processo, identificado por `__process_output__`; com `blockId`, seleciona somente o bloco declarado. `previous_block` seleciona somente `blockId + outputKey`. `project` canônico rejeita keys fora de `title | deadline`; static vazio permanece não resolvido; runtime continua usando `input.id` para buscar o valor pertencente à execução.

## Materialização no Builder

`canonicalInputBindingFromLegacy()` é pura e não consulta labels, posição, tipo, plugin ou capability. Ela materializa somente campos estruturais já presentes. `normalizeActionBlock()` preserva bindings existentes e acrescenta o binding quando a forma legada é completa; `validateBuilderMethods()` valida referências futuras, outputs e compatibilidade de tipo usando a autoridade canônica. Referências incompletas não recebem IDs inventados.

## Snapshot e round-trip

O construtor canônico de `ProcessExecution` continua clonando defensivamente o Método inteiro, incluindo `input.binding`. Os schemas de arquivo, pack e transfer aceitam o union discriminado. Exportação/importação preservam a referência e remapeiam `blockId` canônico junto dos IDs portáteis, tanto dentro do Método quanto entre Processos.

## Compatibilidade mantida

- Campos `source`, `sourceKey`, `sourceProcessType`, `blockId`, `staticValue`, `historyLimit` e `historyEligibility` permanecem no domínio e nos schemas.
- Não houve migration SQLite nem reescrita de snapshot histórico.
- `labelScore()` permanece somente no caminho temporário de input sem binding canônico.
- Inferência de porta, output mapping, `VALIDAR`, `responseValues.result` e `selectedItemId ?? result` não foram alterados.

## Testes focais

- canonical `previous_block` vence campos legados conflitantes e candidato de label mais forte;
- canonical `previous_process` resolve o output oficial exato;
- binding canônico com origem removida fica unresolved sem legacy/heuristic fallback;
- characterization legada sem binding continua resolvendo por label;
- Builder materializa referência legada explícita;
- arquivo portátil preserva e remapeia binding canônico;
- snapshot defensivo preserva o binding congelado;
- guardrails proíbem labels, porta, plugin e capability no source binding.

## Validação

| Comando                                | Resultado                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                    | pass                                                                                                                                                                                           |
| `npm run test:architecture`            | pass, 8/8                                                                                                                                                                                      |
| `npm run test:plugin-inputs`           | pass, 17/17                                                                                                                                                                                    |
| `npm run test:execution-state-machine` | pass, 17/17                                                                                                                                                                                    |
| `npm run test:execution-core`          | pass, 63/63                                                                                                                                                                                    |
| `npm run test:channel-history`         | pass, 8/8                                                                                                                                                                                      |
| `npm run test:process-order`           | pass, 12/12                                                                                                                                                                                    |
| `npm run test:builder-mcp`             | pass, 6/6                                                                                                                                                                                      |
| `npm run test:method-file`             | pass, 22/22                                                                                                                                                                                    |
| `npm run test:method-transfer`         | pass, 2/2                                                                                                                                                                                      |
| `npm run lint`                         | pass                                                                                                                                                                                           |
| `npm run check`                        | avançou sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica idêntica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `['per_item']` |

Durante o primeiro gate, `test:plugin-fallback` detectou que um snapshot histórico usa uma lista em `staticValue`, apesar do contrato TypeScript moderno declarar string. A materialização foi restringida a strings: esse payload antigo permanece no caminho legado em vez de ser promovido para um binding canônico incompatível. A suite isolada voltou a passar 28/28 e o segundo gate atravessou esse ponto antes de alcançar somente a falha histórica conhecida.

## Arquivos alterados

- `src/lib/domain.ts`.
- `src/lib/input-source-binding.ts`.
- `src/lib/runtime-contract.ts`.
- `src/lib/channel-history.ts`.
- `src/lib/human-workflow.ts`.
- `src/lib/process-order.ts`.
- `src/lib/method-file.ts`.
- `server/builder-methods.ts`.
- `server/runtime-input-values.ts`.
- testes focais de runtime, Builder, arquivos de Método, snapshot e guardrails.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.
- este registro.

## Reliability Program

TASK-001..TASK-022 `done`; TASK-023 `ready`; TASK-024..TASK-052 `pending`. TASK-023 não foi iniciada. Sem commit, tag ou release.
