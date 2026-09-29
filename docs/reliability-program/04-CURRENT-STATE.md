# Current State

Última revisão semântica: 29/09/2026.

Este documento representa o estado semântico e arquitetural conhecido do produto: capabilities presentes, gaps, blockers e posição no programa. Ele não é autoridade para o HEAD Git, a branch ativa nem a condição atual do worktree. Toda task deve descobrir esses dados diretamente do checkout no momento em que começa.

| Campo                       | Estado atual                               |
| --------------------------- | ------------------------------------------ |
| Baseline histórico original | `4ba92a834daef05d8c57fa871530ba935c5c9422` |
| Versão                      | `1.2.1`                                    |
| Task concluída              | TASK-019                                   |
| Task ativa                  | Nenhuma                                    |
| Próxima                     | TASK-020 (`ready`), ainda não iniciada     |

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
- Existe agora `src/lib/execution-core/`, um módulo puro e determinístico que reutiliza `ProcessExecution.methodSnapshot`, expõe State/Fact/Decision/Transition Result, valida invariantes estruturais, decide ativação do primeiro/próximo Bloco e possui o construtor canônico `createCanonicalProcessExecution()`. Esse construtor recebe identidade e tempo explicitamente, clona o snapshot defensivamente e materializa a ativação inicial pela própria máquina do Core. Os starts manual, Orchestrator e standalone/runThrough usam esse construtor; não resta constructor interno normal duplicado de `ProcessExecution`. Conclusões humanas normais entram no Core como `human_block_completed` e conclusões automáticas normais de executor como `executor_block_completed`; cada caminho possui aplicação canônica própria e ambos convergem depois na progressão compartilhada `applyCompletedBlockTransition()`. `VALIDAR` possui uma única aplicação editorial no Core, compartilhada entre resultados humanos e de executor. O retry manual de Bloco entra como `manual_block_retry_requested` e é avaliado/aplicado por `applyManualBlockRetry()`: eligibility, scopes `all`/`remaining`/`selected`, tentativa, limpeza técnica, invalidação da delivery e reativação humano/executor deixaram de ser determinados pelo adapter. “Usar entrega atual” entra como `current_block_delivery_accepted` e é aplicado por `applyCurrentBlockDeliveryAcceptance()`: o Core valida se um Bloco `failed` ou `cancelled`, exceto `ESCOLHER` e `VALIDAR`, pode promover seus values existentes para conclusão. Cancelamento entra como `execution_cancellation_requested` e possui uma única aplicação em `applyExecutionCancellation()`: Blocos concluídos permanecem concluídos e qualquer Bloco ainda não consolidado torna-se `cancelled`, preservando os dados produzidos. `Project` possui uma projeção canônica derivada de `ProcessExecution`: start manual, Orchestrator, progressão humana, plugin, retry, falha e cancelamento usam a mesma tabela de estados e a mesma regra de conclusão/progresso; o Projeto não decide execução. Plugin jobs, abort de execução externa, Orchestrator, revision e persistência permanecem nos adapters. A boundary continua resolvendo inputs e mapeando/validando respostas de plugin, valida o contrato material dos values e registra deliveries somente depois de a conclusão ser aceita pelo Core. Resultados parciais, recovery e handoff de Bloco Humano assistido por plugin permanecem nos adapters. O `POST /api/executions` permanece apenas como boundary explícita de compatibilidade histórica em `server/legacy-execution-boundary.ts`: valida estrutura mínima, preserva a representação materializada recebida e não define a forma canônica de nascimento da execução.
- O Orchestrator novo cria filas com `strategyVersion = 5`, ordem congelada e slots elegíveis. Versões históricas continuam aceitas.
- O núcleo persiste execuções, jobs, unidades, deliveries, perfis, bindings, readiness, leases, filas e journals em SQLite, ainda com parte relevante do comportamento concentrada no servidor HTTP.
- Plugin API, Browser Bridge, React, Express, SQLite, filesystem e formatos históricos ainda não estão completamente isolados do Core canônico descrito na arquitetura-alvo.

## Reliability capabilities already present

As capacidades abaixo existem no checkout atual e constituem base a preservar, caracterizar e convergir:

- **strategy snapshots:** `Project.strategySnapshot`, captura da ordem e dos Métodos e `ProcessExecution.methodSnapshot`;
- **work units:** `BlockExecutionItem` com identidade do núcleo, proveniência, tentativa, estado durável, receipt e histórico;
- **deliveries:** `ProjectDelivery` e `DeliveryItem`, incluindo materialização, invalidação e promoção de outputs;
- **durable plugin jobs:** tabela/store `plugin_jobs`, claims, deadlines, retries, partials, artifacts, cancelamento e recuperação após restart;
- **commit local de transições:** comandos manuais persistem `ProcessExecution`, projeção de `Project` e receipt na mesma transação; callbacks terminais de `PluginJobStore.save()` e atualizações correlacionadas de job/execution/project compartilham o commit SQLite. Cancelamento registra intenção de job e execution/project antes do abort externo; scheduling e reconciliação seguem o commit. SQLite não cobre efeitos externos.
- **browser profiles globais:** identidades físicas em `browser_profiles`, separadas dos plugins;
- **plugin-profile bindings:** vínculos explícitos em `plugin_profile_bindings`, sem fusão silenciosa por alias;
- **readiness por vínculo:** estado específico de plugin + perfil;
- **leases:** lock persistente por perfil físico, token, TTL, heartbeat e liberação;
- **profile lanes:** pool multiperfil, distribuição exclusiva de unidades, falha de lane e reconciliação;
- **recovery policy:** `decideExecutionRecovery()` distingue `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`;
- **fault injection determinístico:** fixture interna sem provider externo reproduz success, falha técnica recuperável, rate limit, intervenção, efeito externo incerto, falha após efeito confirmado, timeout e cancelamento pelo runner;
- **fixture persistente 1.2.1:** baseline sintética, versionada e reiniciável em `test-fixtures/reliability/v1.2.1/`, com Canal, Projeto, snapshots, executions, deliveries, work units, job de plugin, perfil/vínculo/readiness, Orchestrator, Biblioteca e preferências para futuros testes de compatibilidade e upgrade;
- **migration journal:** schema versionado com journal, passos, estados `started/completed/failed` e recuperação de migração interrompida;
- **Orchestrator V5:** elegibilidade por slots, ordem congelada e retomada de filas persistidas;
- **characterization da execução básica:** suíte dedicada cobre start humano/automático, avanço sequencial, espera humana/de executor, outputs, drafts, rejeições sem mutação, snapshot congelado e sucesso simples de plugin;
- **characterization de `VALIDAR` e retry editorial:** suíte dedicada cobre, para resultados humanos e de executor, aprovação, pausa, `retry_target`, attempts editoriais, limite, invalidação do trecho, deliveries, output do Processo, modos de conversa, nova rodada, aprovação posterior e seleção singular;
- **testes extensos:** suites para arquitetura, execução, plugins, perfis, Browser Bridge, persistência, migrações e distribuição.

Existência não significa convergência completa com a arquitetura-alvo. Essas capacidades ainda passam por caminhos de aplicação diferentes e precisam de characterization tests antes de consolidação.

## Known convergence gaps

### Servidor concentrado

`server/index.ts` continua combinando HTTP, persistência, lifecycle de plugins, criação e aplicação de execuções, recovery, Orchestrator, reconciliação e inicialização de storage. O gap arquitetural é a concentração de responsabilidades, independentemente da contagem momentânea de linhas ou rotas.

### Autoridade de execução ainda distribuída em semânticas especiais

- `chooseCollectionItem()`, drafts e output final do Processo conservam seus caminhos especializados até as tasks correspondentes.

Os starts internos normais convergiram para a criação canônica. O `POST /api/executions` deixou de ser tratado como constructor concorrente: ele é uma boundary histórica explícita e testada. Conclusões humanas normais e conclusões automáticas normais de executor agora passam por fatos e aplicações canônicas do Core antes da mesma progressão subsequente. A autoridade ainda está distribuída nas semânticas especializadas e na persistência até as tasks seguintes.

### Semântica vigente de `VALIDAR` e retry editorial

`VALIDAR` possui uma única semântica editorial compartilhada entre resultados humanos e de executor em `applyValidationOutcome()`. Aprovação segue a progressão normal; rejeição com `pause` conserva o Bloco em `awaiting_human`, com values e delivery da decisão materializados, sem avançar. Com `retry_target`, a rodada editorial é contada pelo `attempt` do próprio `VALIDAR`, separada das tentativas técnicas anteriores do alvo.

A aplicação comum invalida deliveries do alvo até o `VALIDAR`, inclusive o output oficial do Processo, limpa `execution.output`, restaura `outputStatus = pending` e reseta o trecho downstream; Blocos e deliveries anteriores ao alvo são preservados. `retryMode = full` limpa a conversa do alvo, enquanto `conversation_feedback` a preserva; ambos materializam feedback, fallback context e imagens da tentativa rejeitada nos campos de retry.

A checagem de `maxAttempts` ocorre depois de persistir values e deliveries da rejeição. Portanto, uma rejeição que não pode abrir nova rodada ainda atualiza o estado editorial do `VALIDAR`, mas não reinicia o alvo. A projeção subsequente de `Project` é canônica e compartilha a transação do comando.

### Retry manual de Bloco

O retry manual possui aplicação canônica própria no Execution Core. `failed` e `cancelled` são elegíveis; `completed` é elegível somente para `selected`. O item selecionado precisa existir antes de qualquer mutação. A aplicação incrementa a tentativa, invalida deliveries do Bloco, limpa o estado técnico da tentativa anterior, preserva a semântica de `all`, `remaining` e `selected` e reabre o Bloco como `awaiting_human` ou `blocked_executor` pela definição canônica do snapshot.

O adapter conserva apenas tradução para boolean, aplicação da projeção canônica de `Project`, `touchExecution()` e persistência externa. No comportamento vigente preservado, um retry `selected` de Bloco concluído mantém `execution.output` e `outputStatus = completed` enquanto reabre o Bloco; a política de invalidação desse output oficial não foi redefinida pela TASK-015.

### Usar entrega atual

“Usar entrega atual” possui aplicação canônica própria no Execution Core. Somente Blocos `failed` ou `cancelled` são elegíveis; `ESCOLHER` e `VALIDAR` continuam proibidos. A aplicação promove os values já persistidos sem substituí-los, preserva items, artifacts e receipts, materializa os metadados de conclusão e limpa o erro da execução.

A boundary continua validando required outputs, restrições de apresentação e records antes da intenção canônica, registra a delivery somente depois da aceitação e então usa `applyCompletedBlockTransition()` para a progressão compartilhada. Projeção de `Project` e persistência permanecem fora do Core.

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

- `POST /api/executions` aceita uma `ProcessExecution` histórica já materializada por um adapter próprio, sem reconstrução canônica; Project/Channel ausentes continuam tolerados conforme a semântica caracterizada;
- `ExecutionOrchestrator.strategyVersion` aceita versões 1, 2, 3, 4 e 5.
- o servidor mantém caminhos específicos para V5 e planejamento/reconciliação das versões anteriores;
- `legacyItemOrchestration()` reconstrói identidade depois da conclusão de handlers agregados antigos;
- o startup executa reconciliação de títulos, itens armazenados, normalização de work units e migração de itens da Biblioteca;
- conexões e perfis antigos continuam passando por resolvers e migrações de compatibilidade.

Esses caminhos preservam instalações existentes, mas parte da reconciliação semântica ainda ocorre no bootstrap e no fluxo principal em vez de convergir por adapters delimitados.

## Known test gaps

Existem suites importantes para arquitetura, máquina básica de execução, `VALIDAR`/retry editorial, ordem de Processos, jobs persistentes, restart de componentes, Browser Bridge, perfis, lanes, migrações, plugins e contratos. As TASK-002 e TASK-003 protegem respectivamente a máquina básica e a semântica humana de validação/retry. Ainda não existe um gate único que prove, em conjunto:

- jornada automática completa dos 8 Processos;
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

Não há blocker externo confirmado para iniciar a TASK-020. O gap imediato é o auto-agendamento interno via HTTP loopback.

O gate agregado `npm run check` não está verde pela falha confirmada em `test:shared-browser-v89`. Corrigir esse contrato funcional exige escopo próprio e não foi incluído automaticamente na limpeza de formatação.
