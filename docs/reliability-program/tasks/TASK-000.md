# TASK-000 — Fundação documental do Reliability Program

## Objetivo

Criar uma memória versionada, curta e suficiente para que outra sessão compreenda o produto, o programa, o estado atual, as decisões permanentes e a próxima missão sem depender das conversas que originaram o trabalho.

## Baseline

- commit observado: `4ba92a834daef05d8c57fa871530ba935c5c9422`, branch `main`;
- versão: `1.2.1`;
- worktree já não estava limpo e continha mudanças de implementação fora do escopo documental;
- o núcleo, a versão, tags e releases não foram alterados pela TASK-000.

## Subtasks

| Subtask | Resultado |
| --- | --- |
| TASK-000A | auditou e saneou índices e roadmaps documentais obsoletos |
| TASK-000B | criou Constituição e Arquitetura-alvo |
| TASK-000C | criou Roadmap e Cenários de Aceitação |
| TASK-000D | registrou Current State, Working Protocol e índice de tasks |
| TASK-000E | criou ADRs iniciais, integrou `AGENTS.md` e adicionou guardrail |
| TASK-000F | auditou o sistema como nova sessão, corrigiu consistência e encerrou a preparação |

## Documentos removidos

- `docs/V1_ROADMAP.md` — planejamento V1 superseded, que competia com a arquitetura e o programa atuais;
- `docs/PROCESS_ORDER_AND_PRODUCT_NARRATIVE_ROADMAP.md` — decisões já absorvidas pela arquitetura normativa;
- `docs/ecosystem/asset-generation-plugins-roadmap.md` — planejamento antigo substituído pelo índice e roadmap atuais do ecossistema.

## Documentos mantidos

- `docs/ecosystem/roadmap.md` — planejamento ativo apenas do ecossistema de plugins, explicitamente não normativo para o Core;
- `docs/FLOW_VISUAL_ASSET_METHOD_CATALOG.md` — catálogo funcional de Métodos e plugins, não plano do Core;
- `docs/SHARED_BROWSER_PROFILES_AND_PLUGIN_CONFIGURATION_ROADMAP.md` — preservado como evidência histórica e compatibilidade das implementações anteriores, reclassificado para não governar trabalho futuro;
- inventários, baselines, evidências e release notes — preservados para reprodução e compatibilidade, carregados somente quando uma task exigir.

## Arquivos criados

- `docs/reliability-program/README.md`;
- `00-PRODUCT-CONSTITUTION.md`, `01-TARGET-ARCHITECTURE.md`, `02-RELIABILITY-ROADMAP.md`, `03-ACCEPTANCE-SCENARIOS.md`, `04-CURRENT-STATE.md` e `05-WORKING-PROTOCOL.md`;
- `decisions/README.md` e `ADR-001` a `ADR-007`;
- `tasks/README.md` e este registro `tasks/TASK-000.md`.

Também foram atualizados `AGENTS.md`, os READMEs raiz/documental e o guardrail em `src/lib/architecture-invariants.test.ts`.

## Decisões registradas

Os ADRs fixam contexto persistente, autoridade operacional do Core, contratos determinísticos, reconciliação de efeitos externos incertos, progresso desacompanhado, execução conservadora em recursos e isolamento de legado nas fronteiras. O Método continua definindo a estratégia; o Orchestrator apenas agenda trabalho elegível; plugins executam capabilities e devolvem fatos sem avançar a estratégia.

## Auditoria de contexto e consistência

Uma leitura na ordem do Working Protocol permite reconstruir o que é o ContentFlow, a missão e a razão do programa, as autoridades de Core, Método, Orchestrator e plugins, as políticas para incerteza, ambiguidade e hardware fraco, o progresso de trabalho independente, o estado atual e o uso de `DECISION REQUIRED`.

A auditoria final alinhou bindings determinísticos em `ARCHITECTURE.md`, esclareceu a independência entre filas, distinguiu ordem estratégica de autoridade operacional no ADR-002, reduziu duplicação no Current State, classificou roadmaps remanescentes e corrigiu referências locais quebradas.

## Testes e evidências

- `npm run test:architecture` — passou, incluindo o guardrail do Reliability Program;
- `npm run typecheck` — passou;
- `npx eslint src/lib/architecture-invariants.test.ts` — passou;
- auditoria de links Markdown locais — passou após a correção da referência histórica a `docs/DESKTOP.md`;
- `git diff --check` no escopo — passou;
- `npm run check` — executado, mas parou no lint por 135 erros de Prettier e um warning de Fast Refresh em arquivos preexistentes ao escopo; os gates seguintes não foram executados por esse comando agregado.

## Resultado final

TASK-000 concluída. TASK-001 está `ready`, não possui especificação criada e não foi implementada. TASK-002–TASK-052 permanecem `pending`.

## Nota de fechamento sobre estado Git

A TASK-000 registrou o checkout observado durante sua execução. O commit do próprio trabalho naturalmente tornou aquele SHA anterior ao novo HEAD, revelando que HEAD, branch e condição do worktree não pertencem ao Current State persistente. Cada task passa a descobrir esse estado ao vivo e registra SHAs específicos somente como evidência histórica em seu próprio arquivo.

O baseline `4ba92a834daef05d8c57fa871530ba935c5c9422` permanece um marco histórico do início do Reliability Program, não uma afirmação sobre o HEAD atual. Mudanças de implementação que já existiam no worktree e foram posteriormente incluídas no mesmo commit não passam, por isso, a ser autoria ou escopo da TASK-000.

