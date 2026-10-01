# TASK-002 — Characterization tests da máquina de estados atual

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Objetivo

Congelar o comportamento observável vigente da máquina de estados de execução antes da convergência arquitetural prevista para TASK-006–TASK-020, sem corrigir ou redesenhar o runtime atual.

## Estado

`done`

## Evidência Git/ambiente inicial

- SHA inicial: `928dbf4bfce084bf870ab366bdebe4bb8194a400`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.

## Escopo autorizado

- suíte dedicada e coesa de characterization da máquina básica;
- start humano e automático;
- avanço humano para humano e humano para executor;
- output derivado e output fornecido por humano;
- drafts, rejeições de estado inválido e contratos ausentes;
- snapshot congelado e ativação estritamente sequencial;
- sucesso simples de plugin pela fronteira HTTP existente;
- documentação e scripts de teste estritamente necessários.

## Fora de escopo

- qualquer unificação ou refatoração da máquina de estados;
- mudanças em retry editorial, recovery, concorrência, bindings ou migrações;
- correção da falha conhecida de `test:shared-browser-v89`;
- versão, tag, release ou publicação.

## Cenários caracterizados

- C01: start humano, timestamps, attempts e projeção de Project;
- C02: start automático em `blocked_executor` e projeção inicial `processing`;
- C03: avanço humano → humano com values, delivery e timestamps;
- C04: avanço humano → automático com projeção `blocked`;
- C05: derivação automática do output oficial e conclusão do Processo;
- C06: `awaiting_output`, validação e conclusão por `completeProcessOutput()`;
- C07: draft humano sem conclusão, delivery ou avanço;
- C08: conclusão de Bloco inativo rejeitada sem mutação;
- C09: input ausente rejeitado sem promoção de valores ou delivery;
- C10: output obrigatório ausente rejeitado com estado preservado;
- C11: `methodSnapshot` e sequência existentes congelados após alterar o Canal;
- C12: ativação estritamente sequencial em Método com três Blocos;
- C13: sucesso simples de plugin pela API real, com values, delivery, output e projeção do Project.

## Arquivos alterados

- `server/execution-state-machine.characterization.test.ts`: suíte dedicada com 13 cenários;
- `package.json`: script `test:execution-state-machine` e execução automática antes do gate agregado por `precheck`;
- `src/lib/architecture-invariants.test.ts`: presença da TASK-002 e handoff coerente para TASK-003;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`: estados da TASK-002/TASK-003;
- `docs/reliability-program/04-CURRENT-STATE.md`: fotografia semântica e posição do programa;
- este registro histórico.

## Validação

| Comando | Resultado | Evidência |
| --- | --- | --- |
| `npm run lint` | pass | ESLint sem erros ou warnings. |
| `npm run typecheck` | pass | TypeScript da aplicação e do servidor sem erros. |
| `npm run test:architecture` | pass | 4/4 testes. |
| `npm run test:execution-state-machine` | pass | 13/13 testes, C01–C13. |
| `npm run test:automatic-execution` | pass | 7/7 testes. |
| `npm run test:orchestrator` | pass | 8/8 testes. |
| `npm run test:process-order` | pass | 12/12 testes. |
| `npm run check` | fail conhecido | Primeiro failure real em `test:shared-browser-v89`: 3/4 passam; a capability textual do ChatGPT continua sem `incrementalStrategies: ["per_item"]`. |

O failure agregado é o mesmo gap funcional preexistente registrado pela TASK-001 e não foi alterado nesta task.

## Achados e gaps

- A projeção vigente é assimétrica: start automático deixa `Project.stages[process] = processing`, enquanto avanço humano → automático deixa o mesmo estágio em `blocked`.
- A conclusão de um único Processo entre oito resulta em `Project.progress = 13` por arredondamento de `12,5%`.
- O caminho de plugin continua aplicando sua própria transição privada em `server/index.ts`; a suíte o protege pela fronteira HTTP, sem antecipar TASK-013.
- O `POST /api/executions` continua sendo a borda legada usada pela fixture de plugin; não foi removido nem redesenhado.
- Nenhum `DECISION REQUIRED` foi necessário: todos os comportamentos encontrados puderam ser caracterizados sem mudança de política.

## Evidência final

- A suíte dedicada passou com 13/13 testes após formatação e correções somente no código de teste.
- Todos os gates diretamente relevantes passaram.
- `npm run check` avançou até a falha preexistente de `shared-browser-v89`, que permaneceu intacta.
- Não houve alteração em código de produção, máquina de estados, retry, recovery, concorrência, migração, versão ou release.
- O worktree inicial era limpo; as mudanças finais pertencem exclusivamente à TASK-002 e não houve commit nesta task.

## Definition of Done

- [x] Suíte dedicada/coesa criada.
- [x] C01–C12 caracterizados com assertions de estado, projeção, values, deliveries, timestamps, attempts e snapshots conforme aplicável.
- [x] Sucesso simples de plugin caracterizado pela fronteira real.
- [x] Regressões diretamente relevantes verdes.
- [x] Falha conhecida de `shared-browser-v89` preservada fora do escopo.
- [x] Nenhuma refatoração arquitetural antecipada.
- [x] TASK-002 marcada `done`; TASK-003 marcada `ready` sem ser iniciada.
