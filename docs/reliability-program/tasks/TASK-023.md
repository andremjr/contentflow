# TASK-023 — Retirar `labelScore()` do runtime canônico

## Estado

`done`

## Evidência inicial

- HEAD: `3fe7689981ac07eec9a8d8f8340fbbba4888254f`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Eliminar completamente a escolha de origem de input por similaridade textual durante a execução. O runtime deve resolver somente binding canônico ou representação legada suficientemente explícita; qualquer origem insuficiente ou ambígua permanece não resolvida.

## Problema técnico observado

`resolveBlockInputs()` ainda possui um terceiro estágio depois da resolução canônica e legada: coleta candidatos compatíveis, prioriza o candidato sintético `selectedItem`, ordena por `labelScore(input.label, candidate.label)` e escolhe o primeiro. Assim, Métodos históricos incompletos podem executar com uma origem inferida por label ou ordem.

`resolveLegacyExplicitInput()` também aceita referências incompletas:

- `previous_block` com `blockId`, mas sem `sourceKey`, escolhe qualquer output compatível daquele Bloco e concede tratamento especial ao candidato sintético `selectedItem`;
- `previous_process` com `sourceKey`, mas sem `sourceProcessType`, procura a key em qualquer Processo anterior.

## Decisões aplicáveis

- ADR-003: ambiguidade no caminho de execução não pode ser resolvida silenciosamente por heurística.
- ADR-007: compatibilidade histórica deve permanecer delimitada nas fronteiras e convergir para uma forma canônica ou diagnóstico.
- Binding canônico presente permanece soberano e nunca cai para campos legados.
- A TASK-023 não altera inferência de portas, outputs de plugin nem fallbacks de `VALIDAR`.

## Escopo

- Remover `labelScore()` e `normalizeLabel()` de produção.
- Remover o terceiro estágio heurístico de `resolveBlockInputs()`.
- Exigir `blockId + sourceKey` para `previous_block` legado.
- Exigir `sourceProcessType + sourceKey` para `previous_process` legado, preservando `blockId` opcional quando explicitamente informado.
- Preservar resolução determinística de Projeto, runtime, estático, Histórico do Canal e bindings canônicos.
- Atualizar characterization, guardrails, Current State e roadmap.

## Fora de escopo

- Tornar porta de input de plugin explícita (TASK-024).
- Alterar inferência ou normalização de outputs (TASK-025/TASK-028).
- Alterar fallbacks de `VALIDAR` (TASK-026).
- Criar adapter amplo para Métodos legados ou migration (TASK-027).
- Reescrever snapshots persistidos.

## Callers reais inspecionados

- `server/execution-commands.ts`: bloqueia escolha humana e conclusão humana quando existem inputs não resolvidos.
- `server/index.ts`: retorna `422` com `Entradas ausentes` antes do mapeamento para portas e criação do job.
- `src/components/process-runner.tsx`: apresenta ausência de input nos gates humanos e de `ESCOLHER`.
- suites de deliveries, runtime inputs e Histórico do Canal exercem a resolução diretamente.

Todos consomem `resolved: false` sem exigir nova taxonomia de erro.

## Decisão sobre `selectedItem`

O candidato `selectedItem` não é uma saída declarada do Bloco `ESCOLHER`, não é produzido pelo Builder como `sourceKey`/binding e não aparece como referência explícita em Métodos ou testes. O único fluxo encontrado escolhe esse candidato porque `sourceKey` está ausente. Portanto, ele é fallback implícito e será removido desta resolução. Referências explícitas aos campos reais da coleção continuam resolvendo por `blockId + sourceKey`; `selectedItemId` continua sendo a delivery declarada da decisão e não será alterado.

## Compatibilidade e migração

Não haverá migration nem reescrita. Campos legados permanecem aceitos quando identificam deterministicamente a origem. Métodos históricos ambíguos passam a falhar de forma segura como input não resolvido; a consolidação do legado permanece na TASK-027.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:plugin-inputs`
- `npm run test:execution-state-machine`
- suites de runtime contract, execução automática, Builder e arquivos de Método diretamente afetadas
- regressões com Métodos históricos sem binding explícito
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- `labelScore()` e `normalizeLabel()` removidos de produção.
- Runtime sem seleção textual ou por primeiro candidato compatível.
- Fluxo restrito a canonical → legacy explicit → unresolved.
- Binding canônico permanece soberano.
- Legacy completo continua funcionando; legacy ambíguo permanece unresolved independentemente da ordem.
- Fallback implícito de `selectedItem` removido.
- Guardrails impedem retorno das heurísticas e substitutos óbvios.
- Nenhuma mudança em porta, output, `VALIDAR`, migration ou adapter amplo.
- TASK-023 `done`, TASK-024 `ready`, TASK-025..TASK-052 `pending` após todas as validações.

## Condições de `DECISION REQUIRED`

Interromper se a remoção exigir criar nova semântica estrutural para `ESCOLHER`, alterar formato persistido, introduzir migration, redefinir autoridade entre Método/Core/plugin ou modificar as inferências reservadas às TASKs 024–028.

## Implementação

- Removidos `labelScore()`, `normalizeLabel()` e o ranking textual de `resolveBlockInputs()`.
- O fluxo termina em `resolved: false` quando binding canônico ou representação legada explícita não resolvem.
- Referências legadas completas continuam convergindo por `canonicalInputBindingFromLegacy()` e lookup exato.
- `previous_block` e `previous_process` incompletos não procuram mais qualquer candidato compatível.
- O candidato sintético `selectedItem` e seu tratamento especial por ausência de `sourceKey` foram removidos. Campos reais da coleção continuam endereçáveis por `blockId + sourceKey`; a delivery `selectedItemId` da decisão de `ESCOLHER` permanece inalterada.

## Guardrails

O guardrail de contratos determinísticos agora exige ausência de `labelScore` e `normalizeLabel` em produção, verifica a sequência canonical/legacy explicit/unresolved e proíbe ranking, seleção de candidato compatível e o fallback implícito `selectedItem` dentro do runtime. Os guardrails de porta, output e `VALIDAR` foram preservados sem alteração semântica.

## Testes alterados

- A characterization de label similarity foi substituída por ambiguidade unresolved com dois candidatos, label idêntico e ordens invertidas.
- Adicionado caso de `previous_block + blockId + sourceKey` legado completo.
- Adicionado caso de `previous_process` sem `sourceProcessType`, que permanece unresolved mesmo com key disponível.
- A regressão de `selectedItem` agora comprova que ausência de `sourceKey` não injeta o item completo.
- Casos existentes continuam cobrindo binding canônico exato, binding canônico não resolvido sem fallback, Builder, arquivos, transferência, execução automática e Histórico do Canal.

## Produção

Não houve mudança em inferência de porta de plugin, mapeamento de outputs, `VALIDAR`, schema, migration ou adapter legado amplo. Nenhum texto de interface foi adicionado ou alterado.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 8/8 |
| `npm run test:plugin-inputs` | pass, 19/19 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:deliveries` | pass, 9/9 |
| `npm run test:channel-history` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run test:builder-mcp` | pass, 6/6 |
| `npm run test:method-file` | pass, 22/22 |
| `npm run test:method-transfer` | pass, 2/2 |
| `npm run lint` | pass |
| `npm run check` | avançou sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica idêntica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `['per_item']` |

## Arquivos alterados

- `src/lib/runtime-contract.ts`.
- `server/runtime-contract-runtime-inputs.test.ts`.
- `server/deliveries.test.ts`.
- `src/lib/deterministic-contract-guardrails.test.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `docs/reliability-program/tasks/TASK-023.md`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.

## Reliability Program

TASK-001..TASK-023 `done`; TASK-024 `ready`; TASK-025..TASK-052 `pending`. TASK-024 não foi iniciada. Sem commit, tag ou release.

