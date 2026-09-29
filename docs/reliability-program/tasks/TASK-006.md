# TASK-006 — Criar módulo canônico do Core de execução

## Objetivo

Criar a primeira fronteira técnica do Core canônico de execução como módulo puro, determinístico e independente de transporte, persistência, UI e executores, extraindo apenas primitivas seguras de decisão já presentes no runtime.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `e823ea626e55255ac4657075d81d890c4c9152e5`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.
- Versão do produto: `1.2.1`.

## Inventário de autoridade atual

- `server/execution-commands.ts`: mistura decisão de sequência, criação de `ProcessExecution`, mutação de domínio, resolução de inputs, deliveries, retry editorial, projeção de `Project` e timestamps/IDs. Candidatos imediatos ao Core: escolha do primeiro/próximo Bloco e classificação humano/executor. Persistência permanece no caller.
- `server/index.ts::finishPluginBlock()`: contém transição própria de conclusão/avanço e semântica própria de `VALIDAR`; é trabalho futuro (TASK-013/TASK-014), não será migrado aqui.
- `server/index.ts::startOrchestratedProcess()`: possui segundo constructor de `ProcessExecution`; pertence à TASK-007/TASK-009.
- `POST /api/executions`: aceita representação legada pela borda HTTP; pertence à TASK-010.
- `resolveBlockInputs()` e runtime contracts: application/runtime concern preservado para TASK-021–TASK-028.
- deliveries, output de Processo, retry editorial, projeção de `Project`, persistência SQLite, recovery e chamadas externas permanecem fora do Core nesta task.

Classificação:

| Área | Classificação |
| --- | --- |
| ordem congelada de Blocos e escolha do próximo | Core candidate |
| estado inicial humano vs executor | Core candidate |
| invariantes estruturais da execução | Core candidate |
| aplicação de timestamps/values/status no objeto mutável | Adapter/application concern |
| resolução de inputs e contratos heurísticos | Future task |
| deliveries e output materializado | Future task |
| criação completa de `ProcessExecution` | Future task |
| VALIDAR e retry editorial | Future task |
| projeção de `Project` | Future task |
| SQLite/transações | Persistence concern |
| plugin/browser/HTTP | Adapter/application concern |

## Fronteira escolhida para o Core

`src/lib/execution-core/`, com tipos, invariantes e avaliação de transições puras. O Core reutiliza `ProcessExecution` e `methodSnapshot` existentes em vez de criar uma segunda representação autoritativa.

## Dependências permitidas/proibidas

Permitidas: tipos de domínio e helpers puros estritamente necessários. Proibidas: Express, SQLite, servidor HTTP, plugin runner, Browser Bridge/session manager, filesystem, rede, React, Electron e providers.

## Tipos canônicos introduzidos

- `ExecutionCoreState`: visão read-only do `ProcessExecution` existente, sem criar estado V2.
- `ExecutionCoreFact`: intenção/fato explícito de start ou conclusão de Bloco.
- `ExecutionCoreDecision`: union discriminada entre `activate_block`, `finish_blocks` e `blocked`, com `reason` estável e `expectedRevision` quando disponível.
- `ExecutionCoreTransitionResult`: estado recebido, fato, decisão e diagnósticos estruturados.

## Primitivas de decisão extraídas

- ativação do primeiro Bloco pela ordem de `methodSnapshot.blocks`;
- classificação de Bloco nativo Humano como `awaiting_human`;
- classificação de Bloco automático/plugin como `blocked_executor`;
- ativação estritamente sequencial do próximo Bloco após conclusão;
- decisão explícita `finish_blocks` quando a sequência estratégica termina.

## Invariantes

- IDs de Blocos do snapshot e da execução não podem ser ambíguos;
- cardinalidade e ordem de `execution.blocks` devem corresponder ao `methodSnapshot`;
- no máximo um Bloco pode estar ativo na sequência normal;
- downstream não pode estar ativo enquanto predecessor obrigatório não estiver `completed`;
- ordem e identidade são lidas exclusivamente do snapshot congelado;
- avaliação do Core não muta `ProcessExecution` nem `methodSnapshot`.

Estados impossíveis produzem `blocked` com código estável e lista de invariantes violadas.

## Integração existente

`server/execution-commands.ts` passou a consultar `evaluateExecutionCore()` para decidir o primeiro Bloco e o próximo Bloco após conclusão. Timestamps, aplicação mutável do estado, output, deliveries e projeção de `Project` permanecem no adapter/application layer vigente.

## Comportamentos deliberadamente não migrados

Criação canônica completa, Orchestrator, POST legado, conclusão de plugin, conclusão humana integral, VALIDAR, retry, cancelamento, projeção de Project, deliveries, runtime contracts, recovery e persistência.

## Achados/gaps

- A projeção assimétrica já caracterizada entre start automático (`processing`) e avanço para automático (`blocked`) será preservada.
- A conclusão de plugin continua com uma máquina de transição privada em `server/index.ts`; convergência pertence às tasks futuras.
- O Core ainda não aplica decisões nem persiste transições; isso é deliberado nesta etapa e preserva TASK-007–TASK-020.
- Não houve necessidade de novo ADR: ADR-002 já determina a autoridade alvo e a task apenas iniciou sua materialização.

## Arquivos alterados

- `src/lib/execution-core/types.ts`;
- `src/lib/execution-core/invariants.ts`;
- `src/lib/execution-core/index.ts`;
- `src/lib/execution-core/execution-core.test.ts`;
- `server/execution-commands.ts`;
- `src/lib/architecture-invariants.test.ts`;
- `package.json`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass após ajuste de formatação do teste novo |
| `npm run typecheck` | pass |
| `npm run test:execution-core` | pass, 11/11 |
| `npm run test:execution-state-machine` | pass, 13/13 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run test:v121-fixture` | pass, 2/2 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:orchestrator` | pass, 8/8 |
| `npm run test:process-order` | pass, 12/12 |
| `npm run test:architecture` | pass, 4/4 |
| `npm run check` | primeiro failure real conhecido em `test:shared-browser-v89`; 3/4 testes dessa suíte passam |

## Evidência final

- O Core não importa infraestrutura de transporte, banco, plugin/browser, filesystem, React ou Electron; guardrail dedicado verifica essa fronteira.
- C01–C10 provam soberania do snapshot, sequência, espera humana/automática, ausência de skip, terminal explícito, diagnóstico de estado inválido, determinismo e ausência de mutação.
- As characterization suites confirmam que a integração mínima em `execution-commands.ts` preserva o comportamento atual.
- Nenhum fluxo de criação completa, Orchestrator, POST legado, plugin completion, VALIDAR, retry, recovery ou persistência foi migrado antecipadamente.
- O gate agregado passou por todos os testes anteriores e parou no gap preexistente de `shared-browser-v89`: a capability textual do ChatGPT ainda retorna `incrementalStrategies = undefined`, enquanto a suíte espera `["per_item"]`.

## Definition of Done

- [x] Core puro e determinístico criado.
- [x] State/Fact/Decision/Result explícitos.
- [x] Snapshot soberano e sem mutação.
- [x] Invariantes e diagnóstico explícito testados.
- [x] Guardrail de dependências proibidas testado.
- [x] Primitivas reais reutilizadas por código existente.
- [x] Regressões obrigatórias executadas.
- [x] Current State e roadmap atualizados.

## Próxima missão

TASK-007
