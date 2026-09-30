# TASK-026 — `VALIDAR` com alvo estratégico explícito

## Estado

`done`

## Evidência inicial

- HEAD: `23b6919deb772ba7ea7e1da7a0a714a68d9cd4e8`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Tornar explícito no Método e no snapshot qual Bloco um `VALIDAR` audita e, quando o modo ou executor exige um valor material específico, qual output universal e qual porta técnica da capability recebem esse valor. Humano e plugin devem observar a mesma identidade estratégica congelada, sem escolha por proximidade, tipo ou ordem durante a execução.

## Definição normativa preservada

`VALIDAR` continua sendo auditoria, teste de qualidade, verificação de regras ou escolha sobre resultados produzidos durante a execução. A task não redefine `BUSCAR`, `ESCOLHER`, `CRIAR`, os três operadores nem os modos `approval`, `select_one` e `select_many`.

## Problema técnico observado

- `normalizeMethodBlocks()` procura o último Bloco anterior não-`VALIDAR` quando `targetBlockId` está ausente.
- O mesmo normalizador escolhe `targetOutputKey` por output compatível com seleção ou pela primeira saída.
- `getMethodConfigurationIssue()` ainda aceita target implícito por proximidade.
- A criação e o editor de Bloco na UI iniciam `VALIDAR` apontando automaticamente para o último Bloco anterior e, ao mudar target ou modo, escolhem uma saída por tipo/ordem.
- `executePluginBlockInternal()` usa a primeira saída do target quando `targetOutputKey` não está presente e escolhe a primeira `inputPort` compatível da capability.
- O Builder já materializa portas normais de input/output antes da execução, mas ainda não representa nem valida separadamente a porta que recebe o target material de `VALIDAR`.

## Decisões aplicáveis

- ADR-003: runtime canônico executa contratos explícitos e trata ambiguidade como erro.
- ADR-007: adaptação histórica pertence às fronteiras e permanece reservada à TASK-027.
- O Método define a estratégia; o snapshot congela `targetBlockId` e `targetOutputKey`; o Core aplica retry editorial usando essa identidade.
- Plugin implementa a capability e não escolhe target, output ou porta.
- Inputs adicionais de `VALIDAR` continuam contexto complementar e não substituem o target.

## Decisão de `approval`

A evidência vigente define `approval` como aprovação do Bloco inteiro:

- `docs/ARCHITECTURE.md` exige referência a um Bloco anterior específico e descreve aprovação/reprovação sem exigir uma saída;
- o contrato de Método exige `targetOutputKey` somente para `select_one`/`select_many`;
- `getMethodConfigurationIssue()` e a UI humana exigem saída específica somente nos modos de seleção;
- `applyValidationOutcome()` usa `targetBlockId` para retry/invalidação e não interpreta `targetOutputKey`.

Portanto `targetBlockId` é obrigatório em todos os modos; `targetOutputKey` permanece opcional em `approval`. Quando um plugin precisa receber um valor material específico em `approval`, esse output deve ser declarado explicitamente; o runtime não escolhe um output arbitrário.

## Binding técnico adotado

Adicionar `validation.targetPortKey?: string`, com significado exclusivo de porta de input da capability que recebe o valor material indicado por `targetOutputKey`.

- não substitui `targetBlockId` nem `targetOutputKey`;
- não altera identidade estratégica ou `Delivery.outputKey`;
- é materializado pelo Builder quando existe exatamente uma porta compatível e livre;
- exige escolha explícita quando existem várias candidatas;
- é validado por lookup exato e compatibilidade de tipo na boundary de plugin;
- nunca é escolhido no runtime;
- não entra na política do Execution Core.

## Escopo

- Tornar `targetBlockId` obrigatório no tipo e nos schemas modernos de Método.
- Exigir target existente, anterior e de tipo permitido (`BUSCAR`, `ESCOLHER` ou `CRIAR`).
- Exigir `targetOutputKey` existente em `select_one` e `select_many`; em `approval`, aceitá-lo apenas quando explicitamente configurado.
- Remover inferências de target/output da normalização, validação, UI e runtime.
- Preservar `optionsSourceBlockId`/`optionsSourceKey` como reflexo das referências explícitas.
- Materializar/validar `targetPortKey` no Builder e na UI de configuração do plugin.
- Recusar target material sem porta técnica válida com `422` antes de criar job.
- Preservar snapshot, arquivos/pacotes/transferência de Método, deliveries e retry editorial.
- Atualizar guardrails, testes, Current State e roadmap.

## Fora de escopo

- Adapter amplo ou migration para Métodos legados (TASK-027).
- Normalização ampla de `responseValues` (TASK-028).
- Alterar `ESCOLHER`, `collectionId`, `selectedItemId`, Biblioteca Estratégica ou `chooseCollectionItem()`.
- Alterar modos editoriais, política de retry, attempts, invalidação ou progressão do Core.
- Criar migration SQLite ou reescrever snapshots existentes.

## Invariantes

- Reordenar ou inserir Blocos não altera `targetBlockId` configurado.
- Reordenar outputs não altera `targetOutputKey` configurado.
- Tipo valida uma porta já declarada; nunca escolhe a porta no runtime.
- `targetPortKey` não substitui source bindings nem inputs adicionais.
- `BlockFieldDefinition.key` continua sendo a identidade universal e `Delivery.outputKey`.
- `selected_value`/`selected_values` continuam outputs do próprio `VALIDAR`.
- O Execution Core não conhece capability, manifesto, `PluginInputPort`, `legacyTypeListAccepts` nem `targetPortKey`.

## Compatibilidade e migração

Não haverá migration, reescrita de snapshot ou adapter novo. Métodos modernos incompletos falham de forma segura. A adaptação de representações históricas fica integralmente para a TASK-027.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:execution-state-machine`
- `npm run test:validation-retry`
- `npm run test:builder-mcp`
- `npm run test:plugin-inputs`
- `npm run test:automatic-execution`
- `npm run test:plugin-jobs`
- suites afetadas de deliveries, Method file/package/transfer, plugin fallback e partials
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Todo `VALIDAR` moderno possui `targetBlockId` explícito.
- Target ausente, inexistente, futuro ou `VALIDAR` falha como configuração.
- Seleção exige `targetOutputKey` explícito e existente.
- Normalização/runtime não escolhem target, output ou target port por ordem/tipo.
- `approval` permanece aprovação do Bloco inteiro e não exige output para execução humana.
- Plugin usa somente target material e porta explicitamente materializados.
- Humano e plugin preservam a mesma identidade estratégica.
- Retry editorial continua usando o target congelado.
- Inputs adicionais continuam apenas contexto.
- Guardrails impedem retorno das três inferências.
- `ESCOLHER`, response mapping geral, migration e adapter legado amplo permanecem inalterados.
- TASK-026 `done`, TASK-027 `ready`, TASK-028..TASK-052 `pending` após todas as provas.

## Condições de `DECISION REQUIRED`

Interromper se a implementação exigir redefinir `VALIDAR` ou `ESCOLHER`, transformar input adicional em target, tornar plugin autoridade estratégica, mover contrato de plugin para o Core, alterar retry/modos editoriais, criar primitiva estratégica, migration, adapter legado amplo ou antecipar a TASK-028.

## Resultado implementado

### Semântica e normalização

- `BlockValidationConfig.targetBlockId` passou a ser obrigatório nos contratos modernos de domínio, arquivo de Método e Builder.
- `normalizeMethodBlocks()` não procura mais o último Bloco anterior nem escolhe output por tipo ou posição. Referências explícitas são preservadas; dados modernos incompletos permanecem inválidos em vez de receber intenção inventada.
- `optionsSourceBlockId` e `optionsSourceKey` continuam sendo projeções mecânicas das referências explícitas usadas pelos modos de seleção.
- Reordenar ou inserir Blocos e reordenar outputs não altera a identidade estratégica configurada.

### Política de target e target output

- O target deve existir no mesmo Método, anteceder o `VALIDAR` e ser `BUSCAR`, `ESCOLHER` ou `CRIAR`; target ausente, futuro ou outro `VALIDAR` falha como configuração.
- `select_one` e `select_many` exigem `targetOutputKey` explícito e existente no target.
- `approval` preserva a decisão documentada de aprovar o Bloco inteiro. Para humano, não exige output específico; para plugin, só há transporte material quando o Método declara explicitamente `targetOutputKey`.

### Binding técnico de plugin

- `validation.targetPortKey` representa exclusivamente a porta técnica da capability que recebe o valor material do target.
- O Builder materializa essa porta somente quando há exatamente uma candidata compatível e desocupada; ambiguidade exige escolha explícita.
- A boundary de execução faz lookup exato de target, output e porta, valida tipo e ocupação e retorna `422` antes de criar job quando o contrato está ausente ou inválido.
- O runtime não usa primeira saída, primeira porta compatível nem qualquer fallback por ordem ou tipo.

### Builder e interface

- Criar um `VALIDAR` não seleciona automaticamente o Bloco anterior.
- Alterar modo ou target não seleciona automaticamente uma saída.
- A interface permite escolher explicitamente a saída enviada ao plugin, inclusive a opção de aprovar o Bloco inteiro, e expõe a porta técnica na camada avançada.
- Os novos textos da moldura visual possuem versões em português do Brasil, inglês e espanhol, protegidas por teste de regressão de internacionalização.

### Runtime humano, deliveries e retry

- A interface humana apresenta o Bloco target congelado separadamente dos inputs adicionais; approval mostra o conjunto de outputs do target e seleção usa somente o output exato.
- Deliveries de seleção referenciam apenas a delivery com o `targetOutputKey` declarado.
- `applyValidationOutcome()` continua usando o `targetBlockId` congelado para retry editorial, invalidação e progressão. Modos, attempts, `maxAttempts`, pausa, `retry_target` e conversa não foram redefinidos.

### Execution Core e guardrails

- O Execution Core não recebeu conhecimento de capability, manifesto, `PluginInputPort` nem `targetPortKey`.
- Guardrails impedem o retorno de inferência do último Bloco, primeira saída, saída por tipo ou primeira porta compatível e protegem a separação entre contrato estratégico e binding técnico.

## Evidências de validação

| Prova                                  | Resultado                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                    | passou                                                                                                                                                                                                                             |
| `npm run lint`                         | passou                                                                                                                                                                                                                             |
| `npm run test:architecture`            | 8/8                                                                                                                                                                                                                                |
| `npm run test:validation-retry`        | 22/22, incluindo target explícito, ausência/invalidez, reordenação e approval por Bloco                                                                                                                                            |
| `npm run test:builder-mcp`             | 13/13, incluindo materialização única e ambiguidade de target port                                                                                                                                                                 |
| `npm run test:automatic-execution`     | 8/8, incluindo integração determinística de target/output/porta exatos e falha antes do job                                                                                                                                        |
| `npm run test:deliveries`              | 10/10                                                                                                                                                                                                                              |
| `npm run test:method-file`             | 23/23                                                                                                                                                                                                                              |
| `npm run test:method-transfer`         | 2/2                                                                                                                                                                                                                                |
| `npm run test:i18n`                    | 26/26                                                                                                                                                                                                                              |
| `npm run test:execution-state-machine` | 17/17                                                                                                                                                                                                                              |
| `npm run test:plugin-inputs`           | 19/19                                                                                                                                                                                                                              |
| `npm run test:plugin-jobs`             | passou                                                                                                                                                                                                                             |
| `npm run test:plugin-partials`         | 6/6                                                                                                                                                                                                                                |
| `npm run test:plugin-fallback`         | 28/28                                                                                                                                                                                                                              |
| `npm run test:orchestrator`            | 9/9, após corrigir fixtures modernas para declarar target explícito                                                                                                                                                                |
| `npm run check`                        | todas as suites anteriores a `test:shared-browser-v89` passaram; o gate parou somente na falha histórica idêntica, 3/4, porque a capability textual do ChatGPT retorna `incrementalStrategies` indefinido em vez de `["per_item"]` |

## Limites preservados

- Nenhuma alteração foi feita na semântica de `ESCOLHER`, no response mapping geral, em migrations SQLite ou no adapter legado amplo.
- Métodos modernos incompletos falham de forma segura. Compatibilidade histórica permanece reservada à TASK-027.
- Não houve publicação, incremento de versão, commit, tag, release nem uso de GitHub Actions.

## Arquivos e superfícies principais alterados

- Contratos e normalização: `src/lib/domain.ts`, `src/lib/method-file.ts`, `src/lib/human-workflow.ts`.
- Builder e interface: `server/builder-methods.ts`, `src/components/method-builder.tsx`, `src/lib/app-preferences.tsx`.
- Runtime e deliveries: `server/index.ts`, `src/components/process-runner.tsx`, `src/lib/deliveries.ts`.
- Provas: suites de targets, Builder, integração de plugin, arquivos de Método, deliveries, i18n, Orchestrator e guardrails determinísticos.

## Reliability Program

- TASK-001 a TASK-026: `done`.
- TASK-027: `ready`.
- TASK-028 a TASK-052: `pending`.
- A TASK-027 ainda não possui especificação criada; sua abertura continua sujeita ao Working Protocol.
