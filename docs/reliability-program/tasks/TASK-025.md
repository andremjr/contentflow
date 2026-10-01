# TASK-025 — Outputs de plugin explícitos

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `8e061b5c48648461c67f877738394db36bc7e25f`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Tornar explícito, no Método e no snapshot, qual porta de output da capability materializa cada saída universal declarada por um Bloco executado por plugin, sem transferir ao plugin a identidade estratégica dessa saída.

## Lei arquitetural

Entradas e saídas pertencem ao Bloco, nunca ao executor. `BlockFieldDefinition.key` continua identificando o output e a delivery do Bloco; `portKey` é somente o binding técnico para uma `PluginOutputPort` da capability selecionada.

## Problema técnico observado

`executePluginBlockInternal()` valida bindings explícitos incompatíveis, mas ainda constrói o `outputContract` de outputs normais usando esta sequência:

1. `field.portKey`;
2. primeira `outputPort` compatível por tipo;
3. `capability.outputPorts[0]`;
4. `field.key`.

Assim, um snapshot moderno sem binding explícito ainda pode criar um job cuja semântica de output foi escolhida pelo runtime. Em contraste, `validatePluginConfiguration()` no Builder já materializa uma única candidata compatível e rejeita zero ou múltiplas candidatas.

O caminho especializado de `ESCOLHER` ainda constrói um contrato sintético para `selectedItemId` usando a primeira output port ou `result`. Ele não representa a semântica universal de outputs declarados e será preservado, delimitado e caracterizado nesta task, sem alterar Biblioteca Estratégica, `chooseCollectionItem()` ou response mapping.

## Decisões aplicáveis

- ADR-003: o runtime canônico recebe contratos explícitos; compatibilidade de tipo valida o vínculo, mas não o escolhe.
- ADR-007: compatibilidade histórica permanece nas fronteiras; esta task não cria adapter amplo nem migration.
- O Método e seu snapshot são autoridade da estratégia e dos bindings técnicos congelados.
- O Execution Core permanece independente de `PluginOutputPort`, `PluginFieldContract`, `responseValues` e resolução de `portKey`.

## Escopo

- Exigir `field.portKey` para cada output declarado normal de Bloco que possua `block.plugin`.
- Fazer lookup exato da porta e validar `producedTypes` antes da criação do job.
- Recusar ausência de `portKey`, porta inexistente e tipo incompatível com `422`, sem procurar alternativa.
- Construir o `PluginFieldContract` normal copiando `field.portKey` sem cadeia de fallback.
- Preservar a materialização do Builder para candidata única e o erro em caso ambíguo ou sem candidata.
- Preservar `field.key` como identidade dos values e deliveries.
- Preservar item orchestration, incremental execution, partial outputs, artifacts e correlação por `outputContract.portKey`.
- Preservar snapshots e round-trips de Método com `output.portKey`.
- Atualizar guardrails, testes, Current State e roadmap.

## Fora de escopo

- Normalizar ou restringir `responseValues[field.key]`, `responseValues[contract.portKey]` ou `responseValues.result` (TASK-028).
- Alterar `selectedItemId ?? result`, `chooseCollectionItem()`, `collectionId` ou a Biblioteca Estratégica.
- Redefinir `BUSCAR`, `ESCOLHER`, `CRIAR` ou `VALIDAR`.
- Alterar target/output/porta de `VALIDAR` (TASK-026).
- Alterar source/input bindings das TASKs 022–024.
- Criar `LegacyMethodAdapter`, migration SQLite ou reescrever snapshots históricos.
- Mover contratos de plugin para o Execution Core.

## Invariantes

- `field.key` e `field.portKey` podem e devem permanecer distintos.
- `BlockExecution.values` e `Delivery.outputKey` continuam usando `field.key`.
- Tipo serve apenas para validar uma porta explicitamente vinculada.
- Ordem, label e semelhança de nome nunca escolhem porta de output no runtime.
- Toda validação de output ocorre antes de `createPersistentPluginJob()`.
- Outputs humanos continuam válidos sem `portKey`; o campo permanece opcional no domínio global.
- `ESCOLHER` permanece uma implementação especializada histórica, não uma regra universal de output binding.

## Compatibilidade e migração

Não haverá migration nem adapter novo. Métodos históricos com outputs normais de plugin sem `portKey` podem ser recusados no runtime nesta janela; a adaptação ampla permanece reservada à TASK-027. Snapshots não serão reescritos.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:plugin-inputs`
- `npm run test:automatic-execution`
- `npm run test:execution-state-machine`
- `npm run test:builder-mcp`
- `npm run test:plugin-jobs`
- suites afetadas de plugin fallback, partials, incremental execution, item orchestration, deliveries, Method file e Method transfer
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Runtime normal exige `output.portKey` e nunca escolhe porta por tipo, ordem ou `field.key`.
- Ausência, porta inexistente e tipo incompatível falham antes do job.
- Builder materializa candidata única e rejeita ambiguidade/ausência.
- `field.key` continua sendo a identidade do output e da delivery.
- Item orchestration, incremental execution e partial outputs preservam correlação e identidade.
- Response mapping amplo permanece deliberadamente inalterado para TASK-028.
- `ESCOLHER` e `VALIDAR` não são redesenhados.
- Execution Core não ganha conhecimento de contratos de plugin.
- Nenhuma migration ou adapter legado amplo é criado.
- TASK-025 fica `done`, TASK-026 `ready` e TASK-027..TASK-052 `pending` somente depois de todas as provas.

## Condições de `DECISION REQUIRED`

Interromper se a implementação exigir redefinir qualquer Bloco, transformar output port em identidade estratégica, alterar Biblioteca Estratégica, `chooseCollectionItem()`, `selectedItemId`, target de `VALIDAR`, response normalization, criar nova primitiva, migration, adapter legado amplo ou mover contrato de plugin para o Execution Core.

## Implementação

### Separação entre output do Bloco e porta da capability

`validatePluginOutputContract()` valida somente bindings já materializados pelo Método. Para cada output normal, exige `field.portKey`, procura exatamente `port.key === field.portKey` e usa `legacyTypeListAccepts()` apenas para confirmar compatibilidade. O contrato enviado ao executor mantém:

- `key: field.key`, como identidade universal do output;
- `portKey: field.portKey`, como binding técnico da capability;
- label, tipo, obrigatoriedade, options, recordFields e presentation declarados pelo Bloco.

Não existe seleção por tipo, posição, primeira porta, label, nome ou fallback de `field.key`.

### Runtime e criação do job

`executePluginBlockInternal()` valida todos os outputs declarados normais antes de construir `PluginExecutionRequest` e antes de `createPersistentPluginJob()`. Ausência de `portKey`, key inexistente e tipo incompatível retornam `422`; o scheduler automático materializa a falha contratual sem registrar job.

O teste de integração usa uma capability com uma única porta compatível para provar que a ausência de `portKey` continua sendo recusada. Os três cenários inválidos terminam com `jobs: []`.

### Builder

`validatePluginConfiguration()` já era a boundary correta e foi preservado:

- uma única output port compatível materializa `output.portKey` no Método;
- zero candidatas produz erro;
- múltiplas candidatas exigem escolha explícita;
- binding informado é validado contra key e tipo.

Foram adicionadas regressões específicas para candidata única e ambiguidade de outputs.

### Deliveries, proveniência e item orchestration

O caso integrado válido declara `output.key = script` e `output.portKey = result`. A resposta da capability é materializada em `BlockExecution.values.script`, e a delivery persiste `outputKey = script`. Assim, a porta técnica não substitui a identidade estratégica.

`outputContract.portKey` continua disponível para correlação de item orchestration, `pluginCorrelation.outputPort`, incremental updates e partial outputs. Não houve mudança em `batchItemId`, `variantKey`, work units, artifacts, tentativa, cursor ou identidade operacional.

### Response mapping preservado

`valuesForPluginResponse()` continua aceitando, nesta task, `responseValues[field.key]`, `responseValues[contract.portKey]` e `responseValues.result`. `mappedPluginValues()` continua aceitando `selectedItemId ?? result` para `ESCOLHER`. Esses comportamentos pertencem à interpretação da resposta e permanecem reservados à TASK-028.

### Tratamento de `ESCOLHER`

O caminho sintético de `ESCOLHER`, que ainda usa a primeira output port ou `result`, foi preservado sem alterar coleção, `selectedItemId`, `chooseCollectionItem()` ou campos disponibilizados ao Bloco seguinte. O trecho está explicitamente delimitado como compatibilidade especializada histórica e o guardrail exige que exista somente nesse caminho, sem expansão para outputs normais.

### `VALIDAR`

Target, output e porta de input de `VALIDAR` não foram alterados. Seus fallbacks atuais permanecem caracterizados para a TASK-026.

### Snapshot e round-trip

O domínio mantém `BlockFieldDefinition.portKey?: string`, porque outputs humanos não precisam de binding técnico. O round-trip de arquivo de Método agora comprova simultaneamente a preservação de `output.key` e `output.portKey`; packages e transferências continuaram verdes.

## Guardrails

Os guardrails agora:

- proíbem `PluginOutputPort` e `PluginFieldContract` no Execution Core;
- exigem guarda de ausência de `field.portKey`, lookup exato e validação de tipo na boundary;
- proíbem `ports[0]`, seleção de candidatas por tipo e `field.key` como fallback no caminho normal;
- exigem retorno `422` para output inválido antes da criação do job;
- preservam `responseValues.result` e `selectedItemId ?? result` somente nas compatibilidades ainda autorizadas;
- delimitam a primeira output port ao contrato especializado histórico de `ESCOLHER`;
- protegem a ordem `resolve inputs → mapear inputs → validar outputs → criar job`.

## Testes e evidências

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 8/8 |
| `npm run test:plugin-inputs` | pass, 19/19 |
| `npm run test:plugin-outputs` | pass, 5/5 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:builder-mcp` | pass, 10/10 |
| `npm run test:plugin-jobs` | pass |
| `npm run test:plugin-fallback` | pass, 28/28 |
| `npm run test:plugin-partials` | pass, 6/6 |
| `npm run test:deliveries` | pass, 9/9 |
| `npm run test:method-file` | pass, 22/22 |
| `npm run test:method-transfer` | pass, 2/2 |
| `npm run lint` | pass |
| `npm run check` | avançou sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica idêntica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `['per_item']` |

O gate agregado também atravessou as suites compartilhadas de work units, materialização de inputs, itens derivados, sessão contínua, persistência incremental, consolidação, compatibilidade agregada e Flow contínuo antes da falha histórica conhecida.

## Arquivos alterados

- `server/plugin-output-contract.ts`.
- `server/index.ts`.
- `server/plugin-output-contract.test.ts`.
- `server/plugin-output-contract.integration.test.ts`.
- `server/builder-methods.test.ts`.
- `server/automatic-plugin-execution.test.ts`.
- `server/execution-state-machine.characterization.test.ts`.
- `server/plugin-account-fallback.integration.test.ts`.
- `server/method-file.test.ts`.
- `src/lib/deterministic-contract-guardrails.test.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `package.json`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.
- este registro.

## Reliability Program

TASK-001..TASK-025 `done`; TASK-026 `ready`; TASK-027..TASK-052 `pending`. TASK-026 não foi iniciada. Sem migration, commit, tag ou release.
