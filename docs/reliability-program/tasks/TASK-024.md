# TASK-024 — Porta de entrada de plugin explícita

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `3dade5a888954f3f5ace0e4929a86a7f54c1ad0b`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Tornar `BlockInputBinding.portKey` a única autoridade para decidir em qual porta de input de uma capability de plugin entra cada valor resolvido do Método.

## Problema técnico observado

`selectPluginInputPort()` respeita uma `portKey` explícita, mas, na ausência dela, ainda escolhe uma porta por compatibilidade de tipo, identidade semântica, metadata de apresentação/MIME e ordem. Isso permite que o runtime interprete intenção que deveria estar materializada no Método antes da execução.

`selectPluginImplicitContextPort()` também seleciona uma porta textual livre por nome. A inspeção de callers encontrou uso somente em testes; ela não participa do caminho de produção atual.

## Decisões aplicáveis

- ADR-003: o runtime canônico executa bindings explícitos e não resolve ambiguidade por heurística.
- ADR-007: compatibilidade histórica pertence às boundaries; esta task não cria adapter legado amplo.
- Source binding e port binding permanecem separados.
- O Builder pode materializar uma única porta compatível antes da execução; o runtime não pode fazê-lo.

## Escopo

- Reduzir `selectPluginInputPort()` a lookup exato por `input.portKey`, seguido de validação de tipo e multiplicidade.
- Remover scoring semântico, scoring de apresentação, ranking MIME e desempate por ordem do caminho de produção.
- Remover `selectPluginImplicitContextPort()` se continuar sem caller de produção.
- Remover fallbacks artificiais de `inputContract` e `inputDeliveries` depois da validação bem-sucedida.
- Preservar e provar a materialização do Builder para uma única porta compatível e o erro em caso ambíguo.
- Atualizar testes, guardrails, Current State e roadmap.

## Fora de escopo

- Output ports e response mapping.
- Semântica especial de `VALIDAR`.
- Adapter amplo de Métodos históricos.
- Migration ou reescrita de snapshots.
- Tornar `portKey` obrigatória globalmente em `BlockInputBinding`.

## Invariantes

- Input de plugin sem `portKey` é recusado no runtime, inclusive quando só existe uma porta compatível.
- Porta inexistente, tipo incompatível ou segunda ocupação de porta não-multiple falham sem remapeamento.
- Label, ID, `sourceKey`, presentation, MIME e ordem não escolhem porta no runtime.
- O Builder pode materializar uma escolha inequivocamente única antes da execução.
- Inputs recebem valores somente por bindings visíveis no Método.

## Compatibilidade e migração

Não haverá migration nem adapter novo. Método histórico que alcançar diretamente o runtime sem `portKey` será recusado de forma segura até a TASK-027.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:plugin-inputs`
- `npm run test:automatic-execution`
- `npm run test:execution-state-machine`
- `npm run test:builder-mcp`
- suites diretamente afetadas por plugins e Métodos
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Runtime exige `input.portKey` e faz somente lookup exato, validação de tipo e multiplicidade.
- Ausência de porta, porta inválida e colisão não-multiple falham sem fallback.
- Helpers de scoring e implicit context sem uso são removidos.
- Builder continua materializando escolha única e rejeitando ambiguidade.
- Guardrails impedem retorno de scoring e escolha por primeira porta compatível.
- Outputs, `VALIDAR`, response mapping, schemas e migrations permanecem inalterados.
- TASK-024 `done`, TASK-025 `ready`, TASK-026..TASK-052 `pending`.

## Condições de `DECISION REQUIRED`

Interromper se a implementação exigir tornar `portKey` globalmente obrigatória, alterar outputs, `VALIDAR`, response mapping, criar adapter legado amplo, migration ou outra forma de inferência/hidden context.

## Inferência anterior e helpers removidos

O runtime filtrava todas as portas compatíveis, calculava `semanticIdentityScore()` por `sourceKey`, label e ID, calculava `presentationScore()` por item type e MIME, ordenava por score e usava a posição original como desempate. Foram removidos `semanticIdentityScore()`, `presentationScore()`, `mimePatternMatches()` e todo o pipeline de `map/filter/sort/[0]`.

`selectPluginImplicitContextPort()` também foi removida. A busca global comprovou que ela só era importada pelos próprios testes e não participava da execução de produção; mantê-la preservaria uma API interna de inferência por nomes `content`, `context` e `prompt` sem boundary legítima.

## Runtime

`selectPluginInputPort()` agora:

1. exige `input.portKey`;
2. procura exatamente `port.key === input.portKey`;
3. valida compatibilidade de tipo;
4. rejeita porta não-`multiple` já presente em `usedInputPorts`;
5. retorna a porta ou `undefined`, sem procurar alternativa.

`executePluginBlockInternal()` continua resolvendo e validando todos os inputs antes de criar o job. Qualquer input sem porta válida entra em `unsupportedInputs` e recebe o `422` existente (`O plugin não aceita: ...`). Depois dessa validação, `inputContract` e `inputDeliveries` usam diretamente a `input.portKey` explicitamente validada; os fallbacks para `input.id` foram removidos.

## Builder

`validatePluginConfiguration()` permanece como boundary de materialização. Sem `portKey`, uma única candidata compatível é gravada no Método; zero candidatas gera erro e múltiplas candidatas exigem `portKey` explícita. Esse comportamento ganhou testes dedicados e não foi movido para o runtime.

## Comportamentos finais

- **Sem `portKey`:** input não recebe porta, mesmo com label idêntico ou uma única candidata compatível; a execução recusa antes do job.
- **Porta inválida:** key inexistente ou tipo incompatível retorna `undefined`; nenhuma alternativa é tentada.
- **Multiplicity:** a segunda atribuição a uma porta não-`multiple` retorna `undefined`; outra porta compatível não é usada como fallback.
- **Implicit context:** removido, pois não havia caller de produção e contexto oculto contradiz o contrato explícito.
- **Source binding:** permanece separado de `portKey`; `BlockInputSourceBinding` não foi alterado.

## Guardrails

O guardrail focal agora exige ausência dos três helpers de scoring/MIME e de `selectPluginImplicitContextPort()` em produção. O corpo de `selectPluginInputPort()` precisa conter guarda para `portKey`, lookup exato, validação de tipo e multiplicidade, e não pode conter sorting, filtering, presentation, `sourceKey`, label, ID ou escolha da primeira candidata. A operação server-side também fica protegida contra a volta dos fallbacks `port?.key ?? input.id` em contratos e deliveries.

## Testes alterados

- porta explícita válida continua vencendo independentemente da ordem;
- porta explícita incompatível falha sem fallback;
- ausência de `portKey` não usa presentation/MIME, `sourceKey` ou label;
- ausência de `portKey` falha mesmo com uma única porta compatível;
- segunda ocupação de porta não-`multiple` falha sem remapeamento;
- Builder materializa candidata única;
- Builder exige vínculo explícito em ambiguidade;
- fixtures modernas de execução automática e fallback de perfil agora declaram `portKey`.

## Produção

Não houve alteração em output ports, `VALIDAR`, `responseValues.result`, `selectedItemId ?? result`, schema, migration ou formato persistido. `portKey` continua opcional no tipo global porque inputs humanos e outros blocos sem plugin não precisam de porta de executor.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 8/8 |
| `npm run test:plugin-inputs` | pass, 19/19 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:builder-mcp` | pass, 8/8 |
| `npm run test:plugin-fallback` | pass, 28/28 |
| `npm run test:deliveries` | pass, 9/9 |
| `npm run test:method-file` | pass, 22/22 |
| `npm run test:method-transfer` | pass, 2/2 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run lint` | pass |
| `npm run check` | avançou sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica idêntica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `['per_item']` |

## Arquivos alterados

- `server/plugin-input-values.ts`.
- `server/index.ts`.
- `server/plugin-input-values.test.ts`.
- `server/builder-methods.test.ts`.
- `server/automatic-plugin-execution.test.ts`.
- `server/plugin-account-fallback.integration.test.ts`.
- `src/lib/deterministic-contract-guardrails.test.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `docs/reliability-program/tasks/TASK-024.md`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.

## Reliability Program

TASK-001..TASK-024 `done`; TASK-025 `ready`; TASK-026..TASK-052 `pending`. TASK-025 não foi iniciada. Sem commit, tag ou release.
