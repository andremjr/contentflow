# TASK-011 — Unificar transição Bloco concluído → próximo estado

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Fazer a progressão normal após um Bloco já concluído usar uma única decisão do Execution Core e uma única aplicação compartilhada para os caminhos humano/manual e plugin.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `a88df75cf3ec383e329ca862d2751e77bffe2b4e`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Autoridades observadas antes da mudança

`server/execution-commands.ts::activateNextBlock()` consultava `evaluateExecutionCore(block_completed)`, mas materializava localmente `activate_block` e encaminhava `finish_blocks` para outra função local.

`server/index.ts::finishPluginBlock()` possuía uma segunda autoridade: usava `completedIndex + 1`, inspecionava `nextBlock.operator` e decidia localmente entre próximo Bloco e fim da sequência.

## Decisão canônica já existente no Core

`evaluateExecutionCore(execution, { type: "block_completed", blockId })` permanece a autoridade de decisão e retorna `activate_block`, `finish_blocks` ou `blocked`, incluindo `blockIndex`, `blockStatus` e `executionStatus` quando há próximo Bloco.

## Aplicação compartilhada criada

`src/lib/execution-core/apply-completed-transition.ts` expõe `applyCompletedBlockTransition()`. A função muta exclusivamente a `ProcessExecution` recebida, usa `now` explícito e retorna uma union explícita para `activate_block`, `finish_blocks` ou `blocked`.

Para `finish_blocks`, recebe somente callbacks puros de derivação de output e registro de delivery. Não conhece Express, SQLite, Project, scheduler, plugin runner ou Orchestrator.

## Caminho humano/manual

`activateNextBlock()` passou a receber o `blockId` concluído e chama `applyCompletedBlockTransition()`. `chooseCollectionItem()`, `completeHumanBlock()` e `acceptBlockDelivery()` continuam materializando suas conclusões atuais e convergem para essa mesma aplicação.

## Caminho plugin

`finishPluginBlock()` preserva a materialização da conclusão do plugin e o branch especial de VALIDAR. Fora desse branch, a progressão normal chama `applyCompletedBlockTransition()`.

Foram removidas da progressão normal a escolha por `completedIndex + 1`, a leitura de `nextBlock` para decidir avanço e a classificação do próximo executor por `nextBlock.operator`.

## Finish blocks

`activate_block` e `finish_blocks` agora passam pela mesma aplicação compartilhada. Quando existe output derivável, a execution recebe output oficial, delivery, `outputStatus = "completed"` e `status = "completed"`. Sem output derivável, mantém `outputStatus = "awaiting_human"` e `status = "awaiting_output"`.

## Project projection preservada fora do Core

O caminho manual continua projetando Project em `execution-commands.ts`. O caminho plugin continua usando `updateProjectAfterPluginBlock()` durante `persistPluginExecution()`. Nenhuma lógica de Project foi movida para o Execution Core.

## VALIDAR preservado fora de escopo

O branch plugin `rejected + retry_target`, incluindo `maxAttempts`, invalidação downstream, conversa e reativação do alvo, foi preservado como estava. TASK-014 continua responsável por essa unificação.

## Guardrail

`src/lib/architecture-invariants.test.ts` passa a exigir a aplicação compartilhada nos caminhos manual e plugin e impede que `finishPluginBlock()` reintroduza progressão normal por `completedIndex + 1` ou `nextBlock.operator === "Humano"`.

## Achados/gaps

Nenhum `DECISION REQUIRED` foi necessário. A conclusão humana e a conclusão de plugin ainda são materializadas em adapters separados, conforme escopo reservado a TASK-012 e TASK-013. Revisão/timestamp, Project projection, persistência, scheduling e semântica especial de VALIDAR permanecem fora desta task.

## Arquivos alterados

- `src/lib/execution-core/apply-completed-transition.ts`;
- `src/lib/execution-core/apply-completed-transition.test.ts`;
- `src/lib/execution-core/index.ts`;
- `server/execution-commands.ts`;
- `server/index.ts`;
- `server/automatic-plugin-execution.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro.

## Validação

Validações parciais já executadas durante a implementação:

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | pass |
| `npx tsc --noEmit -p tsconfig.server.json` | pass |
| `npm run test:execution-core` | pass, 31/31 |
| `npm run test:execution-state-machine` | pass, 16/16 |
| `npm run test:automatic-execution` | pass, 7/7 |

O primeiro failure real foi `npm run lint`: três erros de Prettier nos dois arquivos novos do Core. A formatação foi corrigida e o lint repetido passou.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass após correção dos 3 erros de Prettier |
| `npm run typecheck` | pass |
| `npm run test:execution-core` | pass, 31/31 |
| `npm run test:execution-state-machine` | pass, 16/16 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:legacy-execution-boundary` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run test:architecture` | pass, 4/4 |
| `npm run check` | avança até o failure conhecido em `test:shared-browser-v89`; essa suíte confirma 3/4 passando e 1 falhando |

O primeiro run de `test:architecture` após a refatoração encontrou apenas um guardrail com delimitador textual obsoleto: ele usava a função removida `finalizeOrRequestOutput` para localizar o fim de `startProcessExecution()`. O delimitador foi atualizado para `activateNextBlock` e a suíte foi repetida com 4/4.

No gate agregado, o primeiro failure restante é o já conhecido `test:shared-browser-v89`: a capability textual do ChatGPT retorna `incrementalStrategies = undefined`, enquanto a suíte espera `["per_item"]`. A falha isolada foi reproduzida diretamente com exit code 1, 3 testes passando e 1 falhando. Esse contrato permanece fora do escopo da TASK-011.

## Evidência final

- A suíte dedicada prova activate human/automatic, finish com e sem output, blocked sem mutação, soberania do snapshot, ativação de um único próximo Bloco e tempo explícito.
- A caracterização manual preserva humano → humano, humano → automático, output derivável, awaiting output, snapshot congelado e sequência sem dupla ativação.
- A integração automática preserva plugin → plugin → conclusão e adiciona prova real de plugin → humano.
- O branch especial de VALIDAR segue fora da progressão normal compartilhada e sua suíte permanece 11/11.
- O gate agregado passou por todas as suites anteriores até `test:shared-browser-v88` e parou no failure conhecido e não relacionado de `test:shared-browser-v89`.

## Definition of Done

- [x] decisão `block_completed` continua pertencendo ao Execution Core;
- [x] humano/manual e plugin usam a mesma aplicação de progressão normal;
- [x] `finishPluginBlock()` não escolhe o próximo Bloco por `completedIndex + 1`;
- [x] `finishPluginBlock()` não classifica o próximo Bloco por operator;
- [x] `activate_block` usa os estados devolvidos pelo Core;
- [x] `finish_blocks` usa a mesma aplicação compartilhada;
- [x] output derivável e ausência de output preservam a semântica vigente;
- [x] Project projection e scheduling permanecem fora do Core;
- [x] VALIDAR/retry especial e deliveries permanecem preservados;
- [x] estados inválidos retornam `blocked` sem mutação;
- [x] snapshot governa a ordem;
- [x] bateria obrigatória executada; suites da TASK-011 passam e o único failure agregado restante é o `test:shared-browser-v89` conhecido e fora de escopo;
- [x] TASK-011 `done`; TASK-012 `ready`.

## Próxima missão

TASK-012
