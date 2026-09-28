# Current State

Última revisão semântica: 28/09/2026.

Este documento representa o estado semântico e arquitetural conhecido do produto: capabilities presentes, gaps, blockers e posição no programa. Ele não é autoridade para o HEAD Git, a branch ativa nem a condição atual do worktree. Toda task deve descobrir esses dados diretamente do checkout no momento em que começa.

| Campo | Estado atual |
| --- | --- |
| Baseline histórico original | `4ba92a834daef05d8c57fa871530ba935c5c9422` |
| Versão | `1.2.1` |
| Task concluída | TASK-002 |
| Task ativa | Nenhuma |
| Próxima | TASK-003 (`ready`), ainda não iniciada |

Este arquivo representa somente o estado atual. O histórico de cada trabalho pertence à respectiva especificação em `tasks/` e ao Git; fatos substituídos devem ser removidos daqui em vez de acumulados como changelog.

## Product validation already observed

O ContentFlow já foi usado em aulas e testes reais com alunos para executar Métodos diferentes que produziram:

- temas;
- títulos;
- thumbnails;
- roteiros.

Narração e assets visuais ainda não receberam a mesma amplitude de validação real, principalmente pelo custo superior de geração e teste.

Consequentemente, o produto não é apenas conceitual e o início do pipeline já possui validação de uso real. O foco atual do programa é consolidar arquitetura e confiabilidade sem ampliar a gramática ou adicionar features desconectadas desse objetivo.

## Architecture currently present

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) continua sendo a fonte normativa do domínio atual: 8 Processos Universais, 4 Blocos Essenciais, 3 Operadores e 3 interfaces de domínio.
- Projetos podem congelar a ordem e os Métodos do Canal em `strategySnapshot`; cada `ProcessExecution` também conserva seu `methodSnapshot`.
- A máquina de execução atual está dividida entre `server/execution-commands.ts`, funções e rotas de `server/index.ts`, scheduler de jobs de plugin e reconciliação do Orchestrator.
- O Orchestrator novo cria filas com `strategyVersion = 5`, ordem congelada e slots elegíveis. Versões históricas continuam aceitas.
- O núcleo persiste execuções, jobs, unidades, deliveries, perfis, bindings, readiness, leases, filas e journals em SQLite, ainda com parte relevante do comportamento concentrada no servidor HTTP.
- Plugin API, Browser Bridge, React, Express, SQLite, filesystem e formatos históricos ainda não estão completamente isolados do Core canônico descrito na arquitetura-alvo.

## Reliability capabilities already present

As capacidades abaixo existem no checkout atual e constituem base a preservar, caracterizar e convergir:

- **strategy snapshots:** `Project.strategySnapshot`, captura da ordem e dos Métodos e `ProcessExecution.methodSnapshot`;
- **work units:** `BlockExecutionItem` com identidade do núcleo, proveniência, tentativa, estado durável, receipt e histórico;
- **deliveries:** `ProjectDelivery` e `DeliveryItem`, incluindo materialização, invalidação e promoção de outputs;
- **durable plugin jobs:** tabela/store `plugin_jobs`, claims, deadlines, retries, partials, artifacts, cancelamento e recuperação após restart;
- **browser profiles globais:** identidades físicas em `browser_profiles`, separadas dos plugins;
- **plugin-profile bindings:** vínculos explícitos em `plugin_profile_bindings`, sem fusão silenciosa por alias;
- **readiness por vínculo:** estado específico de plugin + perfil;
- **leases:** lock persistente por perfil físico, token, TTL, heartbeat e liberação;
- **profile lanes:** pool multiperfil, distribuição exclusiva de unidades, falha de lane e reconciliação;
- **recovery policy:** `decideExecutionRecovery()` distingue `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`;
- **migration journal:** schema versionado com journal, passos, estados `started/completed/failed` e recuperação de migração interrompida;
- **Orchestrator V5:** elegibilidade por slots, ordem congelada e retomada de filas persistidas;
- **characterization da execução básica:** suíte dedicada cobre start humano/automático, avanço sequencial, espera humana/de executor, outputs, drafts, rejeições sem mutação, snapshot congelado e sucesso simples de plugin;
- **testes extensos:** suites para arquitetura, execução, plugins, perfis, Browser Bridge, persistência, migrações e distribuição.

Existência não significa convergência completa com a arquitetura-alvo. Essas capacidades ainda passam por caminhos de aplicação diferentes e precisam de characterization tests antes de consolidação.

## Known convergence gaps

### Servidor concentrado

`server/index.ts` continua combinando HTTP, persistência, lifecycle de plugins, criação e aplicação de execuções, recovery, Orchestrator, reconciliação e inicialização de storage. O gap arquitetural é a concentração de responsabilidades, independentemente da contagem momentânea de linhas ou rotas.

### Autoridade de execução duplicada

- `server/execution-commands.ts` cria `ProcessExecution` para o fluxo de comandos e conclui trabalho humano.
- `startOrchestratedProcess()` em `server/index.ts` possui outra construção de `ProcessExecution`.
- `POST /api/executions` ainda aceita e persiste uma representação recebida pela borda legada.
- conclusão e avanço de plugin permanecem aplicados por caminhos próprios em `server/index.ts`.

O comportamento converge em vários pontos, mas ainda não existe um único módulo canônico que decida e aplique todas as transições.

### Resolução heurística de inputs

`resolveBlockInputs()` em `src/lib/runtime-contract.ts` ainda seleciona candidatos compatíveis e os ordena por `labelScore()`. Isso permite que semelhança textual participe da escolha em runtime quando não existe binding explícito, em conflito com o estado alvo de bindings determinísticos.

`selectPluginInputPort()` em `server/plugin-input-values.ts` respeita uma `portKey` explícita, mas, quando ela não existe, ainda escolhe a porta por compatibilidade, identidade semântica, apresentação e ordem. A boundary de plugin também infere portas de output por tipo ou pela primeira porta disponível.

### Mapeamento permissivo de outputs

`valuesForPluginResponse()` em `server/index.ts` ainda tenta, nesta ordem, chave do campo, `portKey` do contrato e o fallback genérico `responseValues.result`. O caminho de `ESCOLHER` também aceita `selectedItemId ?? result`. Esse comportamento pode transformar resposta ambígua em aparente sucesso e precisa migrar para outputs explícitos com adapter legado delimitado.

`VALIDAR` possui alvo persistido, mas a normalização de Método ainda pode inferir o último Bloco não-`VALIDAR` e uma saída compatível. Na boundary de plugin, a primeira saída do alvo e a primeira porta de input compatível ainda funcionam como fallback.

### Recovery decidido de forma mais rica do que é aplicado

`decideExecutionRecovery()` produz seis decisões: `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`.

Nos principais caminhos de falha de plugin em `server/index.ts`, somente `switch_profile` e `retry` recebem aplicação dedicada. As demais decisões terminam, em geral, no mesmo caminho `markPluginJobFailed()`, embora a mensagem de produto varie. `PluginJobStatus` ainda não possui estados duráveis próprios para `reconcile` e `intervene`.

Assim, a política já reconhece efeito incerto e intervenção, mas sua aplicação e retomada não são ainda simétricas, universais e duráveis.

### Recursos distribuídos em políticas locais

O scheduler de plugin jobs possui limite global fixo de quatro workers. `maxConcurrency` possui default 1 e é aplicado por capability ou por perfil, conforme o manifesto; leases persistentes mantêm exclusividade por perfil físico e lanes paralelas usam perfis distintos. Essas proteções existem, mas ainda não formam o governador global e adaptável de recursos previsto para TASK-050.

### Compatibilidade histórica dentro dos caminhos normais

- `ExecutionOrchestrator.strategyVersion` aceita versões 1, 2, 3, 4 e 5.
- o servidor mantém caminhos específicos para V5 e planejamento/reconciliação das versões anteriores;
- `legacyItemOrchestration()` reconstrói identidade depois da conclusão de handlers agregados antigos;
- o startup executa reconciliação de títulos, itens armazenados, normalização de work units e migração de itens da Biblioteca;
- conexões e perfis antigos continuam passando por resolvers e migrações de compatibilidade.

Esses caminhos preservam instalações existentes, mas parte da reconciliação semântica ainda ocorre no bootstrap e no fluxo principal em vez de convergir por adapters delimitados.

## Known test gaps

Existem suites importantes para arquitetura, máquina básica de execução, ordem de Processos, jobs persistentes, restart de componentes, Browser Bridge, perfis, lanes, migrações, plugins e contratos. A TASK-002 passou a proteger explicitamente C01–C12 e o sucesso simples de plugin. Ainda não existe um gate único que prove, em conjunto:

- jornada automática completa dos 8 Processos;
- fault injection determinístico;
- restart em todos os estados relevantes;
- cinco vídeos desacompanhados;
- efeito externo incerto e reconciliação;
- endurance;
- comportamento de recursos em máquina fraca.

Testes parciais de restart e efeito incerto existem, especialmente em jobs, Orchestrator e Browser Bridge. Eles não substituem o Reliability Gate integrado definido para TASK-052.

O baseline da TASK-001 confirmou inicialmente 135 erros de Prettier e um warning de Fast Refresh. Em limpeza posterior explicitamente autorizada, esses 136 diagnósticos foram eliminados e `npm run lint` e `npm run typecheck` passaram. O `npm run check` agora avança até `test:shared-browser-v89`, onde falha porque a capability textual do ChatGPT não declara `incrementalStrategies: ["per_item"]`; a falha isolada reproduz 3 testes passando e 1 falhando. A evidência detalhada está em [`tasks/TASK-001.md`](tasks/TASK-001.md).

## Governing references

As decisões permanentes não são duplicadas neste snapshot. Consulte a [`Constituição`](00-PRODUCT-CONSTITUTION.md), a [`Arquitetura-alvo`](01-TARGET-ARCHITECTURE.md) e os [`ADRs`](decisions/README.md). A sequência oficial permanece TASK-001–TASK-052, com TASK-052 como Reliability Gate final; especificações são criadas just-in-time conforme o [`Working Protocol`](05-WORKING-PROTOCOL.md).

## Blockers

Não há blocker externo confirmado para preparar a especificação da TASK-003. Sua criação e implementação ainda exigem autorização explícita.

O gate agregado `npm run check` não está verde pela falha confirmada em `test:shared-browser-v89`. Corrigir esse contrato funcional exige escopo próprio e não foi incluído automaticamente na limpeza de formatação.
