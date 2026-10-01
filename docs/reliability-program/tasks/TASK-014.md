# TASK-014 — Unificar semântica de `VALIDAR`

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Consolidar no Execution Core uma única aplicação da decisão editorial de `VALIDAR`, usada por resultados humanos e de executor, sem transferir ao plugin autoridade sobre estratégia, progressão ou retry editorial.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `2d2d0945fbe412dd2aeb3dc0fa86b70c427a7092`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Problema técnico observado

Existem duas implementações da semântica editorial de rejeição:

- `server/execution-commands.ts::retryValidatedBlock()` governa o caminho humano;
- `server/index.ts::finishPluginBlock()` contém um segundo algoritmo para executor/plugin.

As implementações divergem: o humano usa o `attempt` do próprio `VALIDAR`, invalida também `__process_output__`, limpa `execution.output` e restaura `outputStatus = "pending"`; o plugin usa o `attempt` técnico do alvo, implementa reset/invalidação separadamente e permite que `rejected + pause` caia na progressão normal.

## Decisão arquitetural aplicável

O Método congelado em `ProcessExecution.methodSnapshot` define `targetBlockId`, `onReject`, `maxAttempts` e `retryMode`. O Core interpreta e aplica essa estratégia. Humano e plugin apenas produzem o resultado tipado e continuam responsáveis por suas boundaries, persistência e projeção de Project.

## Semântica canônica

- aprovação usa a conclusão e progressão normal já canônicas;
- rejeição com `pause` preserva values e delivery da decisão, mantém o `VALIDAR` e a execução aguardando humano e não avança;
- rejeição com `retry_target` usa o `attempt` do próprio `VALIDAR` como rodada editorial;
- retries técnicos anteriores do alvo não consomem rodadas editoriais;
- o trecho alvo → `VALIDAR` → downstream é resetado de forma única;
- deliveries do trecho e `__process_output__` são invalidadas;
- `execution.output` é limpo e `outputStatus` volta a `pending`;
- feedback, modo, contexto e attachments são materializados no alvo;
- `full` limpa a conversa do alvo e `conversation_feedback` a preserva;
- atingir `maxAttempts` preserva a rejeição materializada, mas não abre nova rodada.

## Escopo

- criar um resultado editorial explícito e uma aplicação compartilhada pequena em `src/lib/execution-core/`;
- integrar `completeHumanBlock()` e `finishPluginBlock()` à mesma aplicação;
- remover os algoritmos editoriais duplicados dos adapters;
- ampliar economicamente a characterization existente para provar a origem executor;
- atualizar o guardrail arquitetural, Current State e roadmap.

## Fora de escopo

- projeção centralizada de `Project`;
- nova transaction layer ou alteração de schema;
- retry manual/técnico, recovery, `switch_profile`, cancelamento ou “usar entrega atual”;
- redefinição de Bloco Humano assistido por plugin;
- remoção das inferências legadas de target na normalização de Método;
- TASK-015 e posteriores.

## Invariantes

- snapshot é a única fonte para alvo, posição e configuração de `VALIDAR`;
- nenhum manifesto, provider, perfil, job, HTTP, SQLite ou Express entra na policy;
- values e delivery da decisão são materializados antes da aplicação editorial;
- estado estrutural inválido não pode sofrer reset parcial;
- `approved` continua usando `applyCompletedBlockTransition()`;
- `paused` e `retry_target` nunca chamam a progressão do `VALIDAR`.

## Arquivos prováveis

- `src/lib/execution-core/apply-validation-outcome.ts`;
- `src/lib/execution-core/index.ts`;
- `server/execution-commands.ts`;
- `server/index.ts`;
- `server/validation-retry.characterization.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json` somente se a suíte focal do Core ganhar arquivo próprio;
- documentação do Reliability Program.

## Testes e evidências necessárias

- reutilizar a characterization humana V01–V14;
- provar `plugin rejected + pause` sem avanço;
- provar contagem pelo attempt do `VALIDAR`, não pelo alvo;
- provar equivalência humano/executor no reset, deliveries/output e `retryMode`;
- executar os comandos focais e o fechamento exigidos pela missão;
- registrar o failure conhecido de `test:shared-browser-v89` sem tratá-lo como regressão da task, se o gate agregado alcançá-lo.

## Condições de `DECISION REQUIRED`

Registrar e interromper somente se a implementação exigir mudar política editorial, compatibilidade histórica, persistência, atomicidade ou projeção de Project além do comportamento já caracterizado. Nenhuma dessas decisões é necessária no diagnóstico inicial.

## Validação

### Policy/aplicação compartilhada

`src/lib/execution-core/apply-validation-outcome.ts` passou a expor:

- `ValidationOutcome`, representação explícita de `approved` e `rejected`;
- `validationOutcomeFromValues()`, tradução independente de UI/provider dos values tipados;
- `applyValidationOutcome()`, única aplicação de `pause`, `retry_target`, `maxAttempts`, reset, invalidação de deliveries/output e `retryMode`.

A aplicação depende somente de contratos do domínio e helpers puros do núcleo. Não conhece manifest, plugin ID, provider, perfil, job, Browser Bridge, HTTP, Express ou SQLite.

### Integração humana

`completeHumanBlock()` usa a conclusão humana canônica para qualquer resultado aceito, registra as deliveries e entrega o resultado de `VALIDAR` à policy comum. `retryValidatedBlock()` e seu algoritmo foram removidos. O adapter conserva apenas a projeção de `Project` depois de `retry_target`.

### Integração plugin

`finishPluginBlock()` continua usando a conclusão executor canônica, registra as deliveries e entrega o mesmo resultado à mesma policy. O cálculo local de target, attempts, reset, invalidação e modo de conversa foi removido. Somente `approved` chama `applyCompletedBlockTransition()`; pausa, retry e bloqueio retornam sem progressão.

### maxAttempts, pause e retry_target

- `maxAttempts` usa exclusivamente `validationExecution.attempt`;
- tentativas técnicas do alvo não consomem rodadas editoriais;
- `rejected + pause` deixa `VALIDAR` e `ProcessExecution` em `awaiting_human`, preservando values/delivery;
- `rejected + retry_target` invalida e reseta o mesmo trecho para ambas as origens;
- limite atingido preserva a rejeição materializada e não abre nova rodada.

### Deliveries, output e retryMode

A aplicação comum invalida alvo → `VALIDAR` → downstream e `__process_output__`, limpa `execution.output`, restaura `outputStatus = "pending"`, materializa feedback/contexto/attachments e aplica `full` ou `conversation_feedback` de forma idêntica.

### Project e persistência

Projeção de `Project` permanece nos adapters. Schema, transaction layer e persistência não foram alterados.

### Testes reutilizados

- V01–V14 em `server/validation-retry.characterization.test.ts`: aprovação, pausa humana, retry, attempts editoriais, limite, reset, deliveries/output e modos de conversa;
- suíte do Execution Core: invariantes e aplicações canônicas existentes;
- suíte de execução automática: integração e regressões de retry técnico/manual existentes.

### Novos testes adicionados

- P01: prova que plugin `rejected + pause` materializa decisão e não avança;
- P02: prova que plugin usa o attempt do `VALIDAR`, não o attempt técnico do alvo, e invalida o output oficial;
- P03: prova equivalência humano/plugin para `full` e `conversation_feedback`.

Foram adicionados três casos focais à suíte existente, sem criar uma suíte paralela.

### Resultados

| Comando                            | Resultado                                                                                                                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                | pass                                                                                                                                                                               |
| `npm run test:execution-core`      | pass, 50/50                                                                                                                                                                        |
| `npm run test:validation-retry`    | pass, 14/14                                                                                                                                                                        |
| `npm run test:automatic-execution` | pass, 7/7                                                                                                                                                                          |
| `npm run test:architecture`        | pass, 4/4                                                                                                                                                                          |
| `npm run lint`                     | pass                                                                                                                                                                               |
| `npm run test:fault-injection`     | pass, 15/15                                                                                                                                                                        |
| `npm run test:orchestrator`        | pass, 9/9                                                                                                                                                                          |
| `npm run check`                    | avançou sem regressão nova até o failure conhecido em `test:shared-browser-v89`; 3/4 passaram e a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

Não houve failure funcional novo da TASK-014. O gate agregado mantém somente o blocker conhecido e fora de escopo documentado no Current State.

## Definition of Done

- [x] existe uma única aplicação da semântica editorial de `VALIDAR`;
- [x] humano e executor usam a mesma autoridade;
- [x] aprovação continua na progressão normal;
- [x] pausa nunca avança;
- [x] retry editorial usa `validationExecution.attempt`;
- [x] reset, deliveries, output e retryMode são equivalentes entre origens;
- [x] Project, persistência e recovery técnico permanecem fora;
- [x] testes focais e de fechamento foram executados;
- [x] TASK-014 está `done`, TASK-015 está `ready` e TASK-015 não foi iniciada.

## Próxima missão

TASK-015, ainda não iniciada.
