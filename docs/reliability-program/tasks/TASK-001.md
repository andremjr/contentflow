# TASK-001 — Baseline de confiabilidade

## Objetivo

Congelar uma fotografia técnica reproduzível do ContentFlow antes das mudanças estruturais do Reliability Program, sem corrigir, refatorar ou alterar o comportamento do motor de execução.

## Evidência Git/ambiente

- SHA inicial: `b539b6eaec1a6adf9f41d31cbe7e21272a1dc050`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.
- Versão do produto: `1.2.1` em `package.json`.
- Ambiente: Windows 11 Home Single Language, 64 bits, versão `10.0.26200`.

## Invariantes governantes

Este baseline preserva, por referência a [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) e à [`Constituição`](../00-PRODUCT-CONSTITUTION.md):

- 8 Processos Universais, 4 Blocos Essenciais e 3 Operadores;
- Método define estratégia; o Core controla estado e transições;
- plugins executam capabilities; o Orchestrator agenda trabalho elegível;
- a estratégia iniciada permanece congelada;
- compatibilidade histórica não pode reinterpretar silenciosamente uma execução iniciada.

## Inventário técnico confirmado

### Execution authority

Foram confirmados quatro caminhos atuais que criam ou aplicam estado autoritativo de execução:

1. `server/execution-commands.ts`: `startProcessExecution()`, `completeHumanBlock()`, `completeProcessOutput()`, `activateNextBlock()`, `finalizeOrRequestOutput()` e `completeProjectStage()` criam `ProcessExecution`, concluem trabalho humano, avançam Blocos e projetam o estado em `Project`.
2. `server/index.ts`: `startOrchestratedProcess()` constrói e persiste outra representação de `ProcessExecution` para o Orchestrator.
3. `server/index.ts`: `POST /api/executions` aceita uma execução fornecida pela borda legada, persiste-a e agenda o primeiro Bloco automático.
4. `server/index.ts`: `finishPluginBlock()`, `updateProjectAfterPluginBlock()` e `persistPluginExecution()` concluem plugins, avançam Blocos/processos e projetam o estado em `Project` por um caminho próprio.

A conclusão humana chega a `completeHumanBlock()` pela action `completeHuman` da rota de comandos. A conclusão de plugin ocorre no worker persistente e converge para `finishPluginBlock()`/`persistPluginExecution()`. Não existe ainda um único módulo canônico para todas essas transições.

### Contracts

- `src/lib/runtime-contract.ts`: `resolveBlockInputs()` resolve bindings explícitos, mas, na ausência deles, filtra candidatos compatíveis e usa `labelScore()` para escolher por semelhança textual.
- `server/plugin-input-values.ts`: `selectPluginInputPort()` respeita `input.portKey` explícito; sem ele, escolhe por compatibilidade, identidade semântica, apresentação e ordem da porta.
- `server/index.ts`: o `outputContract` usa `field.portKey` quando presente, mas ainda infere porta por tipo ou usa a primeira porta.
- `server/index.ts`: `valuesForPluginResponse()` tenta chave do campo, `portKey` e depois `responseValues.result`.
- `server/index.ts`: `mappedPluginValues()` mantém `selectedItemId ?? result` para `ESCOLHER`.
- `VALIDAR` possui `targetBlockId`/`targetOutputKey` explícitos no modelo, mas `normalizeMethodBlocks()` em `src/lib/human-workflow.ts` ainda infere o último Bloco não-`VALIDAR` e uma saída compatível para conteúdo legado/incompleto. Na boundary de plugin, `server/index.ts` ainda cai para a primeira saída do alvo e para a primeira porta de input compatível.

### Recovery

`server/execution-recovery-policy.ts` contém `decideExecutionRecovery()` e as seis decisões atuais: `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`.

Nos fluxos normais de plugin job em `server/index.ts`, `switch_profile` e `retry` possuem aplicação dedicada, persistem o job e mantêm a execução em progresso. As demais decisões convergem para `markPluginJobFailed()` e status terminal `failed`, embora `recoveryProductMessage()` diferencie a mensagem. O cancelamento solicitado também possui um caminho separado fora da aplicação genérica da decisão. Não há estados duráveis próprios de job para `reconcile` ou `intervene`.

### Persistence/legacy

- Schema atual: `CONTENTFLOW_SCHEMA_VERSION = 4` em `server/schema-migrations.ts`.
- O journal `contentflow_migration_journal` registra `started`, `completed` e `failed`, etapa atual e passos concluídos.
- Migrações versionadas: infraestrutura/journal (v1), perfis globais + bindings + readiness (v2), conversão recuperável de perfis legados (v3) e leases persistentes por perfil (v4).
- O bootstrap ainda executa reconciliação semântica por `reconcileStoredProjectTitles()`, `reconcileStoredExecutionItems()`, `normalizeStoredExecutionWorkUnits()` e `migrateLegacyLibraryItems()` em `server/index.ts`.
- `ExecutionOrchestrator.strategyVersion` suporta 1, 2, 3, 4 e 5; novas filas usam 5 e o servidor mantém planejamento/reconciliação das versões anteriores.
- `legacyItemOrchestration()` em `server/plugin-item-orchestration.ts` e a migração/reconciliação de jobs existentes mantêm caminhos legados de item orchestration.
- Jobs duráveis vivem em `plugin_jobs` por `server/plugin-job-store.ts`, com claim, lease, deadline, retry, partials, artifacts, cancelamento e retomada.
- Leases globais por perfil vivem em `browser_profile_leases` e são aplicados por `BrowserProfileLeaseStore`.
- Lanes multiperfil são persistidas em `PersistentPluginJob.profileLanePool` e executadas por `server/parallel-profile-executor.ts`, com unidades exclusivas por lane.

### Resources

- Limite global atual: no máximo 4 plugin workers simultâneos em `processDuePluginJobs()` (`server/index.ts`).
- `capability.execution.maxConcurrency` é aceito entre 1 e 100; ausência do campo resulta em limite 1.
- `server/plugin-concurrency.ts` aplica o limite por `pluginId + capabilityId` ou, quando há profile configurado, por `pluginId + profile`.
- Um lease persistente em `browser_profile_leases` impede duas execuções de navegador simultâneas sobre o mesmo perfil físico. Lanes paralelas exigem perfis distintos.

## Medidas estruturais

Medição por linhas físicas via `Get-Content` e busca estática no checkout inicial:

| Medida | Valor |
| --- | ---: |
| `server/index.ts` | 8.907 linhas |
| `server/execution-commands.ts` | 570 linhas |
| `server/plugin-runner.ts` | 852 linhas |
| `server/plugin-item-orchestration.ts` | 1.151 linhas |
| `src/lib/execution-orchestrator.ts` | 168 linhas |
| `src/lib/runtime-contract.ts` | 397 linhas |
| Rotas Express em `server/index.ts` | aproximadamente 102 chamadas `app.get/post/put/patch/delete` |
| Arquivos de teste | 144 arquivos `test`/`spec` encontrados por `rg --files` |
| Scripts `test`/`test:*` em `package.json` | 79 |

Esses números são fotografia histórica, não metas arquiteturais.

## Baseline de testes

| Comando | Resultado | Observação |
| --- | --- | --- |
| `npm run lint` | fail | 135 erros `prettier/prettier` em 9 arquivos e 1 warning `react-refresh/only-export-components`; todos preexistiam no worktree inicialmente limpo. |
| `npm run typecheck` | pass | TypeScript da aplicação e do servidor sem erros. |
| `npm run test:architecture` | fail inicial; pass final | A execução inicial encontrou 3/4 testes passando e uma expectativa documental antiga de TASK-001 `ready` após a mudança autorizada para `in_progress`. O teste documental mínimo foi atualizado para o estado final e revalidado. |
| `npm run test:automatic-execution` | pass | 7/7 testes. |
| `npm run test:orchestrator` | pass | 8/8 testes. |
| `npm run test:plugin-jobs` | pass | Restart, idempotência, lease, cancelamento, timeout e limpeza aprovados. |
| `npm run test:process-order` | pass | 12/12 testes. |
| `npm run test:browser-runtime-core` | pass | 13/13 testes do runtime/recovery e 1/1 de sincronização do SDK. |
| `npm run test:schema-migrations` | pass | 31/31 testes. |
| `npm run check` | fail | Para no primeiro gate, `npm run lint`, com os mesmos 135 erros e 1 warning; comandos posteriores do pipeline não são executados. |

Distribuição dos erros de lint: 60 em `google-flow-browser-images/handler.mjs`, 47 em `server/plugin-runner.ts`, 9 em `chatgpt-browser-studio/handler.mjs`, 6 em `src/components/process-runner.tsx` e 13 distribuídos entre cinco outros arquivos. O warning está em `src/components/output-character-count.tsx`. As categorias observadas são indentação, quebras de linha/compactação e estilo de fim de linha, todas reportadas por Prettier; não foi executado `npm run format`.

## Gaps confirmados

- Quatro caminhos atuais criam ou aplicam estado autoritativo de execução.
- Inputs, portas de plugin, outputs e alvo/porta de `VALIDAR` ainda possuem inferências ou fallbacks em runtime/boundary.
- A política de recovery expressa seis decisões, mas somente `switch_profile` e `retry` recebem aplicação operacional própria no fluxo normal de falha do job.
- Compatibilidade histórica e reconciliação semântica ainda participam do bootstrap e dos caminhos normais.
- Concorrência global, concorrência por capability/profile e leases existem em camadas distintas; ainda não há o governador global de recursos previsto para TASK-050.
- O gate agregado permanece vermelho por lint preexistente.

## Achados novos

- A heurística contratual não se limita a `labelScore()`: `selectPluginInputPort()` também pontua identidade semântica/apresentação quando `portKey` não foi materializado.
- Embora `VALIDAR` armazene alvo explícito, normalização e boundary de plugin ainda inferem alvo, saída e porta em casos incompletos ou legados.
- O teste arquitetural anterior codificava o estado transitório TASK-001 `ready`; foi atualizado somente para reconhecer o handoff concluído desta task.

## Alterações realizadas nesta task

- criação deste registro histórico;
- atualização factual do `04-CURRENT-STATE.md`;
- atualização dos estados no roadmap;
- ajuste mínimo do teste documental do Reliability Program.

Nenhum comportamento do Core, contrato de plugin, recovery, fila, concorrência, persistência, versão ou release foi alterado.

### Limpeza pós-baseline autorizada

Depois de o baseline acima estar concluído, o usuário autorizou explicitamente corrigir os 135 erros de Prettier e o warning de Fast Refresh. O autofix do ESLint/Prettier foi aplicado somente aos nove arquivos reportados, e `countTextCharacters()` deixou de ser exportado por `src/components/output-character-count.tsx`, pois é um helper usado apenas pelo componente do mesmo arquivo.

Após a limpeza, `npm run lint` e `npm run typecheck` passaram. `npm run check` avançou além de todos os gates que antes ficavam ocultos pelo lint e encontrou uma falha funcional preexistente em `test:shared-browser-v89`: a capability textual do ChatGPT não declara `incrementalStrategies: ["per_item"]`. A falha foi confirmada isoladamente (3/4 testes passam) e não foi corrigida, porque não faz parte da solicitação de formatação nem do escopo observacional da TASK-001.

## Evidência final

- Checkout/SHA usado na validação: `b539b6eaec1a6adf9f41d31cbe7e21272a1dc050` em `main`; não houve commit nesta task.
- O status final contém os documentos da TASK-001, roadmap/Current State, o teste documental correspondente e a limpeza de lint explicitamente autorizada depois do baseline.
- O baseline funcional foi executado sobre o mesmo código de produto do SHA inicial.

## Definition of Done

- [x] Baseline Git/ambiente registrado.
- [x] Invariantes referenciadas.
- [x] Autoridade, contracts, recovery, persistência/legacy e recursos inventariados.
- [x] Medidas estruturais coletadas.
- [x] Testes selecionados executados individualmente.
- [x] `npm run check` executado e ponto de falha registrado.
- [x] Problemas preexistentes preservados como fatos, sem correção silenciosa.
- [x] Current State atualizado como fotografia semântica.
- [x] TASK-001 marcada `done`; TASK-002 marcada `ready` sem criação ou implementação.

## Próxima missão

TASK-002 — Characterization tests da máquina de estados atual.
