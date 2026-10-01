# TASK-028 — Normalização/validação canônica da resposta do executor

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `e5fa6cdff823ed5fb14610963147bf90f1143317`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.
- Versão do produto: `1.2.1`.
- O roadmap confirma TASK-027 `done` e TASK-028 `ready`. A tabela-resumo do Current State ainda registrava TASK-026/TASK-027 e será corrigida nesta missão.

## Objetivo de produto

Aceitar uma resposta de executor somente quando suas chaves técnicas puderem ser validadas contra o `PluginExecutionRequest.outputContract` congelado e traduzidas uma única vez para as chaves estratégicas do Bloco. Depois dessa boundary, `BlockExecution.values`, deliveries e o Execution Core continuam usando somente identidade estratégica.

## Problema técnico observado

`valuesForPluginResponse()` em `server/index.ts` tenta, para cada output, `field.key`, depois `contract.portKey` e por fim `responseValues.result`. `mappedPluginValues()` mantém ainda `selectedItemId ?? result` para `ESCOLHER`. O mesmo mapping permissivo é usado por success, pending, error e snapshots publicados por `services.publishPartial()`.

Assim, o executor pode escolher implicitamente qual saída estratégica preencher, campos desconhecidos são descartados silenciosamente e o caminho não valida o tipo material antes de mutar partials ou concluir o Bloco. Required e presentation são verificados apenas perto da conclusão; tipos inválidos podem atravessar o mapping.

## Inventário real dos formatos de resposta

### Contrato público vigente

- `PluginExecutionResponse.status = success` carrega `values`.
- `pending` e `error` carregam opcionalmente `partialValues` e `partialArtifacts`.
- `services.publishPartial()` publica snapshots em `update.values` e updates incrementais separados em `itemUpdates`.
- `ecosystem/skills/contentflow-plugin-development/references/protocol.md` já determina que outputs usam as chaves técnicas das portas declaradas.
- `PluginFieldContract` já transporta simultaneamente `key` estratégica e `portKey` técnica; não falta informação para a tradução.

### Formatos encontrados no ecossistema versionado

- Plugins de mídia e processamento, como Google Flow, Vibes, ElevenLabs, AssemblyAI, Edge TTS, FFmpeg, stock media e text-file-builder, normalmente devolvem as próprias output ports (`images`, `video`, `project_url`, `audio`, `subtitles`, `assets`, `document` etc.).
- Plugins de texto/API com porta técnica `result` devolvem `values.result`; isso é canônico quando `result` é de fato o `portKey` declarado, não um alias universal.
- Alguns plugins de browser e LLM usam `outputContract[].key` para construir a resposta, apesar de a documentação pública mandar usar a porta técnica. Esses plugins internos devem ser corrigidos para `field.portKey`.
- Alguns helpers de geração sempre acrescentam `result`; ele só pode permanecer quando `result` pertence ao `outputContract` enviado.
- Plugins de `ESCOLHER` normalmente devolvem a porta técnica `result`; três skill runners devolvem `selectedItemId` em um caminho diagnóstico e precisam convergir para a porta `result` declarada.
- `pending.partialValues` e `error.partialValues` encontrados usam os mesmos nomes técnicos dos outputs finais. Não foi encontrada evidência legítima de um namespace parcial diferente.
- `itemUpdates` usam `outputPort` técnico e já fazem lookup exato no contrato. Item orchestration também correlaciona `outputPort → outputContract.key`; esses caminhos são explícitos e não são aliases de response values.
- `artifacts`, `partialArtifacts`, `storedArtifacts`, `usage`, `logs`, `conversation`, `bridgeDiagnostics`, `jobId`, `progress` e `message` possuem campos próprios e não pertencem a `values`.

### Compatibilidades históricas confirmadas

- A permissividade `field.key → portKey → result` existe no Core e foi deliberadamente preservada pelas TASKs 025–027.
- O contrato sintético de `ESCOLHER` cria uma única saída estratégica `selectedItemId` ligada à primeira output port da capability ou, se não houver porta, a `result`. A escolha da porta é compatibilidade especializada anterior à TASK-028; ela não se torna regra universal.
- Não existe marcador de versão de resposta separado no Plugin API v1. Também não foi encontrada evidência de plugin público legitimamente suportado que exija alias estratégico depois de o protocolo já declarar chaves técnicas. Portanto não haverá adapter genérico por `field.key` ou `result`.

## Pontos de entrada da resposta do executor

- `services.publishPartial()` em `processDuePluginJobs()`;
- `success.values`;
- `pending.partialValues`;
- `error.partialValues`;
- snapshots duráveis em `PersistentPluginJob.partialValues` e `BlockExecution.values`;
- item orchestration e continuous session, que leem a porta técnica declarada e consolidam na key estratégica;
- incremental item updates, que já validam `update.outputPort` por lookup exato;
- item action/regenerate, que lê `pluginResponse.values[outputPort]` explicitamente;
- importação de artifacts no plugin runner antes da aplicação dos values;
- resume, que recebe partials já canônicos pertencentes ao Core.

## Decisão de namespace canônico

Para execução de Projeto, toda chave em `values`, `partialValues` e snapshots de `publishPartial()` deve ser um `portKey` presente no `outputContract` daquela requisição. A boundary realiza exatamente uma tradução `portKey → key`.

O normalizador retorna resultado explícito com uma destas classificações:

- válido canônico;
- válido pela compatibilidade especializada do contrato sintético de `ESCOLHER`;
- inválido, com diagnósticos tipados.

`ESCOLHER` continua produzindo `selectedItemId`, mas a resposta também precisa usar o `portKey` sintético enviado. `selectedItemId` não é aceito como alias quando a porta é outra.

## Política para aliases

- `field.key` não é alias técnico.
- `result` só é aceito quando é literalmente um `portKey` no contrato.
- `selectedItemId` só é aceito quando é literalmente o `portKey` sintético.
- Não haverá fallback por label, tipo, primeira chave, primeiro output, posição ou ordem do objeto.
- O ecossistema interno será atualizado para cumprir o contrato já documentado, em vez de perpetuar fallback global.

## Campos desconhecidos

Qualquer chave de response values ausente do `outputContract` invalida aquele snapshot/resposta. Ela não é ignorada nem promovida. Metadata deve continuar em seus campos próprios. A rejeição ocorre antes de mutar job, execução, delivery ou progressão.

## Campos ausentes e required

- Em `success`, todo contrato `required` deve possuir valor material não vazio.
- Em pending, error e `publishPartial`, outputs podem estar ausentes; partial não é conclusão.
- Um campo presente precisa ser válido mesmo quando opcional.
- `undefined` equivale a ausência; `null` é valor incompatível; string vazia e lista vazia não satisfazem required; boolean `false` e número `0` são materiais.

## Validação e normalização de tipo

- Texto, textarea, select, datetime, URL e approval exigem string.
- Número exige número finito; boolean exige boolean.
- List e multiselect exigem lista de strings, com uma única exceção existente: output `list` textual pode ser convertido por linhas pela normalização canônica já presente. Essa conversão muda forma permitida, não identidade.
- Records exigem lista de objetos não-file; campos internos required continuam validados.
- File/files/image/audio/video exigem `StoredFile` materializado pelo importador de artifacts; mídia singular valida MIME compatível.
- Thumbnail layout exige a forma 16:9 vigente.
- Restrições de presentation continuam sendo aplicadas sem criar uma segunda semântica.

## Partial responses

`success.values`, `pending.partialValues`, `error.partialValues` e `publishPartial.values` usam a mesma operação de identidade e tipo. Somente success exige required. Partial válido continua durável; partial inválido não altera `PersistentPluginJob.partialValues`, `BlockExecution.values` nem deliveries. Nenhum partial conclui o Bloco.

## `ESCOLHER`

- Continua exclusivamente ligado à coleção da Biblioteca Estratégica.
- O contrato sintético especializado continua produzindo a key estratégica `selectedItemId`.
- A resposta usa exclusivamente o `portKey` desse contrato.
- A validação posterior de pertencimento do item à coleção permanece intacta.
- Não há fallback canônico `selectedItemId ?? result`.

## `VALIDAR`

Outputs próprios (`decision`, `feedback`, `selected_value`, `selected_values`) são normalizados como quaisquer outputs declarados, pelas respectivas portas técnicas. `applyValidationOutcome()` continua recebendo values estratégicos. Approval, rejection, pause, retry editorial, attempts, conversa e invalidação não mudam.

## Item orchestration, incremental updates e actions

- `itemUpdates.outputPort`, `pluginCorrelation.outputPort`, batch e continuous session permanecem técnicos e explícitos.
- A consolidação continua traduzindo pelo mesmo `outputContract` para keys estratégicas.
- `item_action` já lê a porta técnica exata e mantém sua validação focal; não será redesenhado.
- Resume continua transportando valores já canônicos do Core, não payload bruto do plugin.

## Artifacts

Artifacts e partial artifacts continuam importados antes da validação dos values. O normalizador valida somente referências `StoredFile` já materializadas. Artifact, StoredFile e output estratégico permanecem conceitos separados.

## Invariantes

- O Core não importa contratos ou respostas de plugin.
- `BlockExecution.values` e `Delivery.outputKey` nunca usam `portKey`.
- Toda resposta inválida falha antes de mutação observável de sucesso/partial.
- Um mesmo `portKey` não pode apontar ambiguamente para duas keys estratégicas.
- Required só muda semântica de conclusão; não transforma partial em final.
- Nenhum provider específico entra no Core ou no normalizador.
- Não há seleção por ordem, label, tipo ou semelhança.

## Escopo

- Criar operação explícita e testável de normalização/validação.
- Integrá-la em success, pending, error e `publishPartial`.
- Remover mappings permissivos do servidor.
- Atualizar plugins/fixtures internos que devolvem identidade estratégica em vez de porta técnica.
- Adicionar integração real `portKey != key`, partials, `ESCOLHER`, `VALIDAR`, artifacts, item orchestration e guardrails.
- Atualizar documentação do protocolo, Current State, roadmap e este registro.

## Fora de escopo

- Recovery TASK-029–038, novos estados, `applyRecoveryDecision()`, cancel, backoff, reconcile ou intervenção.
- Scheduler, paralelismo, lanes, watchdog ou execução desacompanhada TASK-039–043.
- Migration SQLite ou rewrite de snapshots/jobs históricos.
- Nova Plugin API, nova primitiva, Bloco, Operador ou Processo.
- Release, versão, tag, publicação ou GitHub Actions.

## Testes planejados

- Suite unitária específica para response normalization.
- Integração de output normal com `key != portKey`, delivery estratégica e falha sem sucesso aparente.
- Success: unknown, missing required, optional absent, invalid type, aliases estratégicos e `result` genérico.
- Partial pending/error/publish: identidade comum, tipo, unknown e ausência de conclusão.
- `ESCOLHER`: porta sintética exata, item válido e item fora da coleção.
- `VALIDAR`: outputs próprios pelas portas exatas e payload inválido sem retry/pause/progressão.
- Artifacts e item orchestration/incremental sem regressão.
- Regressões das TASKs 022–027, fixture 1.2.1, typecheck, lint, build e gate agregado.

## Definition of Done

1. Existe operação explícita e testável de normalização/validação.
2. Outputs normais são correlacionados somente por `portKey`.
3. Values e deliveries permanecem estratégicos.
4. `field.key` e `result` deixam de ser fallbacks universais.
5. `ESCOLHER` deixa de aceitar alias amplo e preserva Biblioteca Estratégica.
6. Unknown, tipos incompatíveis e required ausentes falham com diagnóstico.
7. Partials compartilham o contrato sem virar conclusão.
8. Item orchestration, incremental updates, artifacts e resume permanecem estáveis.
9. `VALIDAR` preserva integralmente sua semântica editorial.
10. Guardrails protegem a boundary e o Core.
11. Plugins internos relevantes usam portas técnicas.
12. Regressões 022–027 e fixture 1.2.1 passam.
13. Current State e roadmap representam o encerramento de Deterministic Contracts.
14. TASK-029–052 permanecem não iniciadas e nenhuma próxima missão fica autorizada/ready.
15. Este arquivo registra comandos e resultados reais.

## Implementação concluída

- `server/plugin-response-normalization.ts` concentra a boundary única `portKey → key`, com diagnóstico tipado para chave desconhecida, binding ambíguo, tipo incompatível, campo obrigatório ausente e restrição material inválida.
- Success, pending, error e `services.publishPartial()` usam a mesma operação; somente success exige todos os outputs obrigatórios. Um success final pode completar outputs obrigatórios já persistidos por partials canônicos.
- Os fallbacks universais por `field.key`, `result`, label ou ordem foram removidos. `result` só é aceito quando é a porta declarada; `ESCOLHER` conserva apenas seu contrato sintético especializado e exato.
- `BlockExecution.values`, deliveries e a progressão do Core continuam estratégicos. Item orchestration, updates incrementais, artifacts, resume e a semântica editorial de `VALIDAR` permanecem nas boundaries existentes.
- Plugins de referência de browser, API e skill runners passaram a devolver as portas técnicas declaradas. Fixtures históricas tocadas pela validação foram materializadas na representação canônica da TASK-027.
- `test:plugin-responses` foi incluído no gate agregado e guardrails arquiteturais impedem o retorno do mapping permissivo.

## Evidência final

- HEAD observado ao concluir: `e5fa6cdff823ed5fb14610963147bf90f1143317`; nenhuma criação de commit, tag, versão ou release foi autorizada ou executada.
- `npm run test:plugin-responses`: 9/9.
- `npm run test:plugin-outputs`: 5/5.
- `npm run test:plugin-partials`: 6/6.
- `npm run test:automatic-execution`: 8/8.
- `npm run test:orchestrator`: 9/9.
- `npm run test:architecture`: 8/8.
- `npm run test:legacy-method-adapter`: 9/9.
- `npm run test:deliveries`: 10/10.
- `npm run test:channel-history`: 8/8.
- `npm run test:method-file`: 23/23.
- `npm run test:builder-mcp`: 13/13.
- `npm run test:v121-fixture`: 2/2.
- `npm run test:browser-plugins`: 255/255.
- `npm run test:skill-sync`, `npm run lint`, `npm run typecheck` e `npm run build`: aprovados.
- `npm run check`: toda a sequência anterior ao baseline conhecido foi aprovada, incluindo `precheck` 17/17 e as regressões de Deterministic Contracts. O comando parou somente em `test:shared-browser-v89`, com 3/4 testes passando, porque a capability textual do ChatGPT não declara `incrementalStrategies: ["per_item"]`. Essa mesma falha já estava documentada no Current State antes da TASK-028 e não pertence ao seu escopo.
- Nenhuma task de Universal Recovery, scheduler, execução desacompanhada, migração ou release foi iniciada.

## Condições de `DECISION REQUIRED`

Interromper se surgir evidência concreta de plugin público suportado que dependa de alias não distinguível/versionável; namespace parcial historicamente incompatível; necessidade de Plugin API v2; conflito entre duas interpretações; mudança de regra de `ESCOLHER`; alteração de recovery; migration destrutiva; ou rewrite de dados históricos.
