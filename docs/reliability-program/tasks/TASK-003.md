# TASK-003 — Characterization de `VALIDAR` e retry editorial

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Congelar em testes reproduzíveis a semântica vigente do caminho humano de `VALIDAR` e do retry editorial antes da futura centralização no Core canônico, sem corrigir nem redesenhar o comportamento observado.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `3140499c975bc2a4aa755ea69f8af5a1a64c78cf`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Escopo

- characterization dedicada do caminho humano de aprovação, pausa e `retry_target`;
- attempts técnicos e editoriais, `maxAttempts` e nova rodada;
- fronteira exata do trecho invalidado, deliveries e output oficial;
- `retryMode = full` e `conversation_feedback` com conversa sintética;
- aprovação depois de retry e seleção singular sem provider real;
- script dedicado, Current State, roadmap e teste documental.

Ficaram fora do escopo mudanças no Core, contratos, inferência legada, plugin execution, recovery, concorrência, migração, `shared-browser-v89`, versão e release.

## Implementação vigente observada

- `completeHumanBlock()` valida inputs/outputs, detecta rejeição por output `approval`, registra values/deliveries e então decide entre pausa e retry.
- `retryValidatedBlock()` usa `validation.attempt` para limitar rodadas editoriais; o `attempt` técnico acumulado do target não consome esse limite.
- `attemptAfterRetryInvalidation()` incrementa Blocos que já iniciaram e preserva o attempt de Blocos downstream ainda nunca iniciados.
- o trecho de invalidação começa no target e vai até o fim do Método; deliveries de todos esses Blocos e de `__process_output__` são invalidadas sem apagar identidade ou itens.
- `recordBlockDeliveries()` materializa a rejeição antes de `retryValidatedBlock()` verificar `maxAttempts`.
- `retryMode = full` remove `pluginConversation`; `conversation_feedback` preserva somente a conversa do target. Os dois modos materializam feedback, fallback textual e imagens da tentativa anterior.

## Cenários caracterizados

- V01: aprovação conclui o `VALIDAR`, persiste values/deliveries e ativa o próximo Bloco sem retry.
- V02: rejeição com `pause` preserva a decisão, mantém a validação aguardando e não reabre o alvo.
- V03: `retry_target` reativa o target e reprojeta execução/Projeto.
- V04: rodada editorial é contada pelo `attempt` do `VALIDAR`, separada de retry técnico.
- V05: `maxAttempts` impede nova rodada e mantém target/Projeto, com a persistência prévia da rejeição explicitada.
- V06: target, intermediários e validação têm estado transitório resetado a partir da fronteira editorial.
- V07: Blocos e deliveries anteriores ao target são preservados integralmente.
- V08: deliveries downstream são invalidadas, conservando IDs, itens e proveniência histórica.
- V09: output atual e delivery sintética do Processo deixam de ser atuais.
- V10: retry completo limpa conversa e carrega feedback/contexto/attachments nos campos de retry.
- V11: retry por feedback preserva a conversa do target e mantém fallback/attachments.
- V12: a próxima rodada do `VALIDAR` não conserva values, erro, logs, timestamps, job ou progresso antigos.
- V13: depois de refazer o target, aprovação na segunda rodada avança sem invalidar a nova delivery.
- V14: `select_one` persiste a seleção e avança sem retry editorial.

## Semântica de attempts observada

O limite editorial pertence ao `VALIDAR`. Um target em attempt 9 pode abrir nova rodada quando o `VALIDAR` está em attempt 1; nesse caso, target e validação passam respectivamente para 10 e 2. Blocos já iniciados no trecho incrementam attempt; um downstream ainda realmente pendente conserva seu attempt.

## Semântica de deliveries observada

Retries invalidam, em vez de apagar, as deliveries do target em diante e o output sintético do Processo. IDs e itens históricos permanecem rastreáveis. Deliveries anteriores ao target continuam válidas. A delivery de rejeição do próprio `VALIDAR` também é criada e invalidada durante um retry aceito.

## Retry modes observados

- `full`: limpa values e conversa do target; preserva a tentativa rejeitada por fallback context/attachments e `retryFeedback`.
- `conversation_feedback`: executa o mesmo reset downstream, mas conserva `pluginConversation` do target e associa feedback/fallback à nova tentativa.

## Achados/gaps

- Em `pause`, o `VALIDAR` permanece `awaiting_human` sem `completedAt`, embora suas deliveries sejam registradas como `completed`.
- Quando `maxAttempts` já foi atingido, `completeHumanBlock()` retorna `ok: false`, mas values e deliveries da nova rejeição já foram persistidos no `VALIDAR`. Target, execution status e Project não são reiniciados.
- O caminho caracterizado permanece em `server/execution-commands.ts`; nenhuma centralização prevista para TASK-011, TASK-012, TASK-014, TASK-015 ou TASK-026 foi antecipada.

## Arquivos alterados

- `server/validation-retry.characterization.test.ts`;
- `package.json`;
- `src/lib/architecture-invariants.test.ts`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro histórico.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 4/4 |
| `npm run test:execution-state-machine` | pass, 13/13 |
| `npm run test:validation-retry` | pass, 11/11 testes cobrindo V01–V14 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:orchestrator` | pass, 8/8 |
| `npm run check` | fail conhecido em `test:shared-browser-v89`, 3/4; todos os gates anteriores passaram |

## Evidência final

- a suíte dedicada caracteriza estado, attempts, values, timestamps, job/progresso, retry fields, conversa, deliveries, output e projeção de Project conforme aplicável;
- não houve alteração em código de produção nem em política de retry;
- o gate agregado avançou até a falha preexistente de `shared-browser-v89`: a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]`;
- a falha conhecida permaneceu fora do escopo e nenhuma regressão da TASK-003 foi observada antes dela.

## Definition of Done

- [x] Aprovação, pausa e `retry_target` caracterizados.
- [x] Tentativas técnicas e editoriais separadas e limite caracterizado.
- [x] Target reativado, downstream resetado e upstream preservado.
- [x] Deliveries e output downstream invalidados com histórico preservado.
- [x] Modos `full` e `conversation_feedback` caracterizados.
- [x] Nova rodada e aprovação após retry caracterizadas.
- [x] Seleção singular não-approval caracterizada.
- [x] Regressões obrigatórias finais registradas.
- [x] Nenhuma centralização de Core antecipada.

## Próxima missão

TASK-004 — Plugin determinístico de fault injection. A missão está `ready`, mas não foi iniciada.
