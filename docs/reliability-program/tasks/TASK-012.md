# TASK-012 — Conclusão Humana passa pelo Core

## Objetivo

Fazer a conclusão humana normal entrar no Execution Core como fato explícito, ser validada pelo snapshot e pelo estado canônico e ser materializada por uma única aplicação antes da progressão compartilhada criada na TASK-011.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `910e4eb910f141bc4ad40f08fe1b1251e6794857`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Semântica humana antes da mudança

`server/execution-commands.ts::completeHumanBlock()` valida executor, estado, Projeto, inputs e outputs. No caminho normal, o próprio adapter clona `values`, marca o `BlockExecution` como `completed`, define `completedAt`, registra deliveries e chama a progressão compartilhada. Rejeições editoriais de `VALIDAR` seguem um branch anterior e distinto.

## Novo fato humano do Core

`ExecutionCoreFact` agora inclui `human_block_completed`, identificado por `blockId` e carregando `values` e `now` explícito. O fato representa um resultado humano já validado semanticamente pela boundary; não carrega conceitos de UI.

## Validação de autoridade

O Core usa exclusivamente `execution.methodSnapshot` para confirmar que o Bloco existe e é humano nativo (`operator === "Humano" && !plugin`). Também exige o `BlockExecution` correspondente em `awaiting_human`, a execution global em `awaiting_human` e invariantes estruturais válidos. Rejeições retornam `unknown_human_block`, `block_not_human`, `human_block_not_awaiting`, `execution_not_awaiting_human` ou `malformed_state` sem mutar o estado.

## Aplicação canônica da conclusão

`src/lib/execution-core/apply-human-completion.ts` expõe `applyHumanBlockCompletion()`. A função recebe a execution e o fato, avalia a autoridade pelo Core, clona `values` antes da primeira mutação, marca somente o `BlockExecution` aceito como `completed`, aplica `completedAt = fact.now` e retorna union discriminada `completed | blocked`. A mutation policy está documentada no próprio módulo.

## Inputs e form validation mantidos na boundary

`resolveBlockInputs()`, campos obrigatórios, records e restrições de apresentação permanecem em `server/execution-commands.ts`.

## Deliveries

`recordBlockDeliveries()` permanece no adapter e é chamado somente depois de o Core aceitar e materializar a conclusão. A ordem observável continua conclusão → delivery → progressão. A task não introduziu atomicidade nova entre essas etapas.

## Progressão via TASK-011

Depois da delivery, o adapter chama `applyCompletedBlockTransition()` por meio de `activateNextBlock()`. Humano → humano, humano → automático, último Bloco com output derivável e último Bloco sem output derivável continuam cobertos pela caracterização integrada.

## VALIDAR preservado

Rejeição, `pause`, `retry_target`, `maxAttempts`, invalidação, conversa e feedback permaneceram no branch anterior à conclusão normal. Aprovação e seleção concluída seguem o caminho normal sem reescrever a semântica editorial. A suíte dedicada permaneceu 11/11.

## ESCOLHER

`chooseCollectionItem()` foi estudado e possui semântica própria de coleção, item e `selectedItemId`. Integrá-lo ampliaria o escopo sem necessidade para remover a autoridade direta do caminho normal de `completeHumanBlock()`. Portanto, permaneceu fora; não foi quebrado e segue coberto pelas suítes existentes.

## Drafts e Process Output fora de escopo

`saveHumanBlockDraft()`, `completeProcessOutput()` e `acceptBlockDelivery()` permanecem inalterados em sua autoridade atual, reservados às respectivas missões.

## Guardrail

`src/lib/architecture-invariants.test.ts` exige `applyHumanBlockCompletion()` no comando humano, proíbe atribuições diretas de `status = "completed"` e `completedAt` em `completeHumanBlock()` e permite a única atribuição direta de `values` exclusivamente antes da aplicação canônica, no branch de rejeição preservado de `VALIDAR`.

## Achados/gaps

Nenhum `DECISION REQUIRED` foi necessário. Atomicidade entre conclusão, delivery e progressão continua reservada à TASK-019; conclusão de plugin continua reservada à TASK-013. O Core não passou a validar contratos de formulário, acessar Project, Biblioteca, SQLite ou runtime input resolution.

## Arquivos alterados

- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- `docs/reliability-program/tasks/TASK-012.md`;
- `package.json`;
- `server/execution-commands.ts`;
- `server/execution-state-machine.characterization.test.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `src/lib/execution-core/apply-completed-transition.ts`;
- `src/lib/execution-core/apply-human-completion.ts`;
- `src/lib/execution-core/apply-human-completion.test.ts`;
- `src/lib/execution-core/evaluate.ts`;
- `src/lib/execution-core/index.ts`;
- `src/lib/execution-core/types.ts`.

## Validação

O primeiro failure observado durante a implementação foi `npm run typecheck`: a nova variante de decisão exigiu narrowing explícito em `applyCompletedBlockTransition()` e o teste de clone possuía um union narrowing ambíguo. Ambos foram corrigidos e o typecheck repetido passou.

Na bateria obrigatória, o primeiro failure foi `npm run lint`, com três erros de Prettier nos arquivos novos. As quebras de linha foram corrigidas e o lint repetido passou.

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass após correção de 3 erros de Prettier |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 4/4 |
| `npm run test:execution-core` | pass, 40/40 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:orchestrator` | pass, 9/9 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:legacy-execution-boundary` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run check` | avançou até o failure conhecido em `test:shared-browser-v89`; 3/4 da suíte passaram e a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]` |

## Evidência final

- Testes dedicados H01–H07 cobrem conclusão aceita, clone defensivo, tempo explícito, Bloco inativo, executor automático/plugin-backed, ID desconhecido e estado estrutural inválido.
- A prova integrada C08A força uma estrutura com dois Blocos ativos e confirma rejeição pelo Core sem alterar execution, Project, delivery ou progressão.
- A caracterização integrada preserva start canônico → `awaiting_human` → conclusão aceita → delivery → próximo estado, incluindo fim com output ou `awaiting_output`.
- `VALIDAR` rejeitado, retries editoriais, drafts, Process Output, uso de entrega atual e plugin completion não foram migrados.
- O gate agregado reproduziu somente o blocker conhecido e fora de escopo de `test:shared-browser-v89`.

## Definition of Done

- [x] conclusão humana normal é fato explícito do Core;
- [x] autoridade humana é validada pelo snapshot e estado canônico;
- [x] falha não produz mutação parcial;
- [x] values são clonados e `completedAt` usa `now` explícito;
- [x] adapter não materializa diretamente a conclusão normal;
- [x] deliveries precedem a progressão compartilhada;
- [x] VALIDAR rejeitado, ESCOLHER, drafts, Process Output e plugin completion permanecem no escopo correto;
- [x] testes obrigatórios executados e evidências registradas;
- [x] TASK-012 `done` e TASK-013 `ready` sem iniciar TASK-013.

## Próxima missão

TASK-013
