# Current State

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../ARCHITECTURE.md), o [estado e limitações](../CURRENT_STATE.md) e o [processo de desenvolvimento](../DEVELOPMENT.md).

Última revisão semântica: 30/09/2026.

Este documento representa o estado semântico e arquitetural conhecido do produto: capabilities presentes, gaps, blockers e posição no programa. Ele não é autoridade para o HEAD Git, a branch ativa nem a condição atual do worktree. Toda task deve descobrir esses dados diretamente do checkout no momento em que começa.

| Campo                       | Estado atual                               |
| --------------------------- | ------------------------------------------ |
| Baseline histórico original | `4ba92a834daef05d8c57fa871530ba935c5c9422` |
| Versão                      | `1.2.1`                                    |
| Task concluída              | TASK-028B                                  |
| Task ativa                  | TASK-028D                                  |
| Ativa                       | Consumo textual e relações explícitas      |
| Próxima                     | TASK-029 está `ready`                      |

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
- [`../CONTENT_CONTRACT.md`](../CONTENT_CONTRACT.md) é a fonte normativa exclusiva de entradas, saídas, portas e deliveries. O contrato vigente usa somente as famílias `text`, `image`, `audio` e `video`, com cardinalidade e representação explícitas, e separa controle e registros. Métodos v3 e Plugin API v2 não adaptam a taxonomia anterior.
- A boundary canônica, parsers, Method Builder, telas humanas, executores, Plugin Kit, plugins oficiais e fixtures usam o mesmo `ValueShape`. `src/lib/runtime-value-validation.ts` é a autoridade material compartilhada para validar `RuntimeValue` contra `ValueShape`: cardinalidade, família, representação, `StoredFile`, MIME, extensão, records e controles são tratados uma única vez e reutilizados por runtime inputs, respostas/partials de plugin, conclusão humana, output oficial e proteção de delivery. O checkout compila sem aliases ou adapters para a taxonomia removida; Métodos v1/v2 e Plugin API v1 permanecem inválidos.
- Projetos podem congelar a ordem e os Métodos do Canal em `strategySnapshot`; cada `ProcessExecution` também conserva seu `methodSnapshot`.
- A máquina de execução atual está dividida entre `server/execution-commands.ts`, funções e rotas de `server/index.ts`, scheduler de jobs de plugin e reconciliação do Orchestrator.
- O auto-agendamento de Blocos de plugin não usa mais HTTP loopback. A boundary HTTP `POST /api/execute-block` e `scheduleAutomaticPluginBlock()` convergem em `executePluginBlockInternal()`, uma operação da camada server/application sem dependência de Request/Response. Scheduling continua assíncrono e pós-commit; o Execution Core permanece independente de HTTP e infraestrutura de plugins.
- Existe agora `src/lib/execution-core/`, um módulo puro e determinístico que reutiliza `ProcessExecution.methodSnapshot`, expõe State/Fact/Decision/Transition Result, valida invariantes estruturais, decide ativação do primeiro/próximo Bloco e possui o construtor canônico `createCanonicalProcessExecution()`. Esse construtor recebe identidade e tempo explicitamente, clona o snapshot defensivamente e materializa a ativação inicial pela própria máquina do Core. Os starts manual, Orchestrator e standalone/runThrough usam esse construtor; não resta constructor interno normal duplicado de `ProcessExecution`. Conclusões humanas normais entram no Core como `human_block_completed` e conclusões automáticas normais de executor como `executor_block_completed`; cada caminho possui aplicação canônica própria e ambos convergem depois na progressão compartilhada `applyCompletedBlockTransition()`. `VALIDAR` possui uma única aplicação editorial no Core, compartilhada entre resultados humanos e de executor. O retry manual de Bloco entra como `manual_block_retry_requested` e é avaliado/aplicado por `applyManualBlockRetry()`: eligibility, scopes `all`/`remaining`/`selected`, tentativa, limpeza técnica, invalidação da delivery e reativação humano/executor deixaram de ser determinados pelo adapter. “Usar entrega atual” entra como `current_block_delivery_accepted` e é aplicado por `applyCurrentBlockDeliveryAcceptance()`: o Core valida se um Bloco `failed` ou `cancelled`, exceto `ESCOLHER` e `VALIDAR`, pode promover seus values existentes para conclusão. Cancelamento entra como `execution_cancellation_requested` e possui uma única aplicação em `applyExecutionCancellation()`: Blocos concluídos permanecem concluídos e qualquer Bloco ainda não consolidado torna-se `cancelled`, preservando os dados produzidos. `Project` possui uma projeção canônica derivada de `ProcessExecution`: start manual, Orchestrator, progressão humana, plugin, retry, falha e cancelamento usam a mesma tabela de estados e a mesma regra de conclusão/progresso; o Projeto não decide execução. Plugin jobs, abort de execução externa, Orchestrator, revision e persistência permanecem nos adapters. A boundary continua resolvendo inputs e mapeando/validando respostas de plugin, valida o contrato material dos values e registra deliveries somente depois de a conclusão ser aceita pelo Core. Resultados parciais, recovery e handoff de Bloco Humano assistido por plugin permanecem nos adapters. O `POST /api/executions` permanece como boundary de estado materializado, mas aceita somente `ProcessMethod` v3 e `ProcessExecution` coerente com os invariantes do Core, os `ValueShape`s declarados e um Project/Channel existente; a antiga `server/legacy-execution-boundary.ts` foi removida.
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

`server/index.ts` continua combinando persistência, lifecycle de plugins, criação e aplicação de execuções, recovery, Orchestrator, reconciliação e inicialização de storage. A operação compartilhada de start de plugin já separa a tradução HTTP da aplicação, mas o gap arquitetural restante é a concentração das demais responsabilidades, independentemente da contagem momentânea de linhas ou rotas.

### Autoridade de execução ainda distribuída em semânticas especiais

- `chooseCollectionItem()`, drafts e output final do Processo conservam seus caminhos especializados até as tasks correspondentes.

Os starts internos normais convergiram para a criação canônica. O `POST /api/executions` não aceita mais representação histórica frouxa: a boundary valida contrato v3, invariantes estruturais, valores materiais, runtime inputs, output e deliveries antes de persistir. Conclusões humanas normais e conclusões automáticas normais de executor passam pelo mesmo contrato material antes dos fatos e aplicações canônicas do Core e da progressão subsequente. A autoridade ainda está distribuída nas semânticas especializadas e na persistência até as tasks seguintes.

### Semântica vigente de `VALIDAR` e retry editorial

`VALIDAR` possui uma única semântica editorial compartilhada entre resultados humanos e de executor em `applyValidationOutcome()`. Aprovação segue a progressão normal; rejeição com `pause` conserva o Bloco em `awaiting_human`, com values e delivery da decisão materializados, sem avançar. Com `retry_target`, a rodada editorial é contada pelo `attempt` do próprio `VALIDAR`, separada das tentativas técnicas anteriores do alvo.

A aplicação comum invalida deliveries do alvo até o `VALIDAR`, inclusive o output oficial do Processo, limpa `execution.output`, restaura `outputStatus = pending` e reseta o trecho downstream; Blocos e deliveries anteriores ao alvo são preservados. `retryMode = full` limpa a conversa do alvo, enquanto `conversation_feedback` a preserva; ambos materializam feedback, fallback context e imagens da tentativa rejeitada nos campos de retry.

A checagem de `maxAttempts` ocorre depois de persistir values e deliveries da rejeição. Portanto, uma rejeição que não pode abrir nova rodada ainda atualiza o estado editorial do `VALIDAR`, mas não reinicia o alvo. A projeção subsequente de `Project` é canônica e compartilha a transação do comando.

### Retry manual de Bloco

O retry manual possui aplicação canônica própria no Execution Core. `failed` e `cancelled` são elegíveis; `completed` é elegível somente para `selected`. O item selecionado precisa existir antes de qualquer mutação. A aplicação incrementa a tentativa, invalida deliveries do Bloco, limpa o estado técnico da tentativa anterior, preserva a semântica de `all`, `remaining` e `selected` e reabre o Bloco como `awaiting_human` ou `blocked_executor` pela definição canônica do snapshot.

Na ação humana explícita, o Core também pode adotar a revisão atual do Método a partir do Bloco alvo: preserva o prefixo concluído, registra o snapshot substituído e invalida o sufixo. Unidades operacionais só são preservadas quando pertencem ao lote atual ou ao job retomado; mudanças de porta, cardinalidade ou base de itemização descartam unidades obsoletas e seu progresso.

O adapter conserva apenas tradução para boolean, aplicação da projeção canônica de `Project`, `touchExecution()` e persistência externa. No comportamento vigente preservado, um retry `selected` de Bloco concluído mantém `execution.output` e `outputStatus = completed` enquanto reabre o Bloco; a política de invalidação desse output oficial não foi redefinida pela TASK-015.

### Usar entrega atual

“Usar entrega atual” possui aplicação canônica própria no Execution Core. Somente Blocos `failed` ou `cancelled` são elegíveis; `ESCOLHER` e `VALIDAR` continuam proibidos. A aplicação promove os values já persistidos sem substituí-los, preserva items, artifacts e receipts, materializa os metadados de conclusão e limpa o erro da execução.

A boundary continua validando required outputs, restrições de apresentação e records antes da intenção canônica, registra a delivery somente depois da aceitação e então usa `applyCompletedBlockTransition()` para a progressão compartilhada. Projeção de `Project` e persistência permanecem fora do Core.

### Resolução determinística de inputs

Inputs de Método possuem obrigatoriamente um `BlockInputSourceBinding`, representação discriminada da origem estratégica. As variantes explícitas cobrem Projeto, Processo anterior, Bloco anterior, Histórico do Canal, Biblioteca do Canal, valor fornecido na execução e valor estático. A referência usa identificadores estruturais e não contém porta ou identidade de plugin. Não existem campos planos históricos alternativos.

`resolveBlockInputs()` resolve exclusivamente o binding canônico. Uma referência inválida ou cuja origem não existe permanece não resolvida. `previous_process` sem `blockId` designa exatamente o output oficial do Processo declarado; `previous_block` exige bloco e output explícitos; `channel_library` exige coleção e campo explícitos.

Métodos sem binding canônico são inválidos. Não há boundary de adaptação ou inferência a partir de `source`, `sourceKey`, `sourceProcessType`, `collection`, `staticValue`, `historyLimit` ou campos equivalentes.

Inputs destinados a plugins só entram em portas explicitamente declaradas pelo Método. `selectPluginInputPort()` exige `input.portKey`, faz lookup exato na capability e valida o `ValueShape`; ausência, porta inexistente, incompatibilidade ou segunda ocupação da mesma porta permanecem sem vínculo. Label, ID, `sourceKey`, presentation, MIME e ordem não escolhem portas no runtime.

A compatibilidade é direcional no único caso de contração declarado: uma saída `text/many/inline` pode alimentar uma entrada `text/one/inline` ou `either`. O produtor continua com N itens e N IDs, enquanto o consumidor recebe uma unidade textual concatenada de forma determinística. Nenhuma mídia, artifact, controle ou registro recebe merge implícito.

### Contrato definitivo de Método e plugin

`ProcessMethod.contractVersion: 3` identifica a única representação aceita. Campos carregam `ValueShape`; a Plugin API v2 usa o mesmo shape em cada porta. Não existem adapters de taxonomia v1/v2 no caminho canônico. Métodos e plugins anteriores permanecem inválidos até conversão explícita posterior.

Outputs declarados normais destinados a plugins também entram no executor somente por `BlockFieldDefinition.portKey` explícita. Ausência de binding, porta inexistente ou tipo incompatível falham antes da criação do job; compatibilidade de tipo apenas valida a porta escolhida pelo Método. O Builder materializa `portKey` quando existe exatamente uma candidata compatível e exige configuração explícita quando há ambiguidade. O Execution Core continua sem conhecimento de labels, manifestos, portas ou respostas de plugin.

### Binding e normalização canônica de outputs de plugin

As saídas universais continuam pertencendo ao Bloco. Para Blocos executados por plugin, o Método/snapshot materializa explicitamente qual `outputPort` da capability implementa cada saída declarada. O runtime normal não escolhe portas por tipo, ordem, primeira porta ou fallback de `field.key`; `BlockFieldDefinition.key` continua identificando `BlockExecution.values` e `Delivery.outputKey`, enquanto `portKey` permanece somente correlação técnica.

Respostas de executor cruzam uma única boundary explícita em `server/plugin-response-normalization.ts`. Success, pending, error e snapshots de `publishPartial()` aceitam exclusivamente `portKey` presente no `outputContract` congelado, validam os valores materiais e traduzem uma única vez para a `key` estratégica. Success exige os outputs obrigatórios, incluindo partials canônicos previamente persistidos; partials não concluem o Bloco.

Campos `identifier` de registros podem declarar `referencesInputId`; a boundary aceita somente IDs concedidos naquela entrada e as deliveries materializam essas referências sem interpretar seu significado editorial. Em orquestração item a item, uma unidade de uma porta `many` pode produzir uma ou mais variantes atômicas compatíveis; cada variante é validada e conserva a linhagem da mesma unidade de origem.

Quando o mesmo job publica artifacts ou variantes incrementais, `itemProgress` continua derivado das unidades obrigatórias do lote. Esses eventos não substituem o total nem criam um segundo cursor de conclusão.

Chaves estratégicas, labels, ordem do objeto e `result` genérico não são aliases. `result` só é válido quando é literalmente a porta declarada. Chaves desconhecidas, tipos incompatíveis, required ausente e bindings ambíguos falham antes de sucesso ou mutação parcial observável. `BlockExecution.values` e `Delivery.outputKey` permanecem estratégicos.

`ESCOLHER` usa output canônico de controle `selection`, com cardinalidade explícita. Quando executado por plugin, o Método deve declarar `portKey` exato; primeira porta e chave implícita `result` não possuem semântica especial.

`VALIDAR` possui alvo estratégico explícito no Método e no snapshot. `targetBlockId` identifica sempre um Bloco anterior não-`VALIDAR`; `select_one` e `select_many` exigem `targetOutputKey`, enquanto `approval` continua aprovando o Bloco inteiro e só transporta um valor material quando uma saída foi declarada. Para execução por plugin, `targetPortKey` correlaciona esse valor com uma porta técnica da capability antes do runtime. Normalização e execução não escolhem alvo, saída ou porta por proximidade, tipo ou ordem. Inputs adicionais permanecem contexto complementar e não substituem o target.

Guardrails focais protegem a boundary canônica, todos os bindings, `ESCOLHER` e `VALIDAR` contra seleção por tipo, primeira porta, primeira saída ou `field.key`.

### Recovery decidido de forma mais rica do que é aplicado

`decideExecutionRecovery()` produz sete decisões: `cancel`, `reconcile`, `intervene`, `switch_profile`, `reload_and_retry`, `retry` e `fail`.

Nos principais caminhos de falha de plugin em `server/index.ts`, `switch_profile`, `retry` e `reload_and_retry` recebem aplicação dedicada. A recarga é decidida pelo Core apenas para `BRIDGE_PAGE_UNAVAILABLE`, persiste uma diretiva na próxima invocação e permanece no mesmo perfil. A Bridge distingue ausência, incompatibilidade, indisponibilidade pré-efeito e resultado incerto; fallback automático ficou restrito a códigos de conta/perfil. As demais decisões terminam, em geral, no mesmo caminho `markPluginJobFailed()`, embora a mensagem de produto varie. `PluginJobStatus` ainda não possui estados duráveis próprios para `reconcile` e `intervene`.

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

## Infraestrutura interna de provas

O Dev Monitor opt-in (`docs/DEV_MONITOR.md`, TASK-028E) reúne eventos locais dos
cinco domínios, reconstrói projeções e gera checks, slices e digest. Os cenários
monitorados iniciais são humano/HTTP/Core/delivery e falhas do worker real.
Profiles/Bridge e demais lacunas permanecem explícitas na matriz; um PASS desses
cenários não demonstra o Reliability Gate ou o provider autenticado. TASK-028D
permanece ativa e TASK-029 não foi iniciada por este trabalho.

TASK-028E foi concluída em 01/10/2026 com 19 testes próprios, dois cenários
monitorados íntegros e `npm run check` integral aprovado. Evidências e limites
estão registrados em `docs/DEV_MONITOR_REPORT.md`; não houve publicação.

## Known test gaps

Existem suites importantes para arquitetura, máquina básica de execução, `VALIDAR`/retry editorial, ordem de Processos, jobs persistentes, restart de componentes, Browser Bridge, perfis, lanes, migrações, plugins e contratos. As TASK-002 e TASK-003 protegem respectivamente a máquina básica e a semântica humana de validação/retry. Ainda não existe um gate único que prove, em conjunto:

- jornada automática completa dos 8 Processos;
- restart em todos os estados relevantes;
- cinco vídeos desacompanhados;
- efeito externo incerto e reconciliação;
- endurance;
- comportamento de recursos em máquina fraca.

Testes parciais de restart e efeito incerto existem, especialmente em jobs, Orchestrator e Browser Bridge. Eles não substituem o Reliability Gate integrado definido para TASK-052.

O baseline da TASK-001 confirmou inicialmente 135 erros de Prettier e um warning de Fast Refresh. Em limpeza posterior explicitamente autorizada, esses 136 diagnósticos foram eliminados. A TASK-028A também alinhou a declaração `per_item` da capability textual do ChatGPT ao comportamento já implementado. `npm run lint`, `npm run typecheck`, `npm run test:i18n`, as suites focais corrigidas, `npm run build` e o gate agregado `npm run check` passam no fechamento da task.

## Governing references

As decisões permanentes não são duplicadas neste snapshot. Consulte a [`Constituição`](00-PRODUCT-CONSTITUTION.md), a [`Arquitetura-alvo`](01-TARGET-ARCHITECTURE.md) e os [`ADRs`](decisions/README.md). A sequência oficial permanece TASK-001–TASK-052, com TASK-052 como Reliability Gate final; especificações são criadas just-in-time conforme o [`Working Protocol`](05-WORKING-PROTOCOL.md).

## Blockers

Deterministic Contracts foi encerrada com a TASK-028 e as extensões autorizadas TASK-028A e TASK-028B foram concluídas. A base local real foi migrada para as representações canônicas atuais com backup verificado, pós-planejamento limpo e preservação explícita de histórico terminal. TASK-029 é a próxima missão `ready`.
