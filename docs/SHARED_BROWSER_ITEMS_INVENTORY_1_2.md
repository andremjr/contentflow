# Pacote 1.2 — inventário de itens e correlação

Data do levantamento: 2026-09-26. Branch observada: `main`.

Este documento registra como o ContentFlow representa hoje `BlockExecution`, unidades operacionais, deliveries, delivery items, jobs, partials e artifacts antes da normalização universal prevista na fase 8. O levantamento é descritivo: não cria tabela, migração, scheduler, serviço incremental novo nem muda o comportamento de plugins.

## Resumo do modelo atual

- `process_executions.payload` é a fonte persistida da execução de processo. O JSON contém `blocks`, os `BlockExecutionItem[]` já materializados, `deliveries` e o output oficial.
- `plugin_jobs.payload` persiste o estado operacional de jobs de plugin por `execution_id + block_id + attempt`. Ele guarda `partialValues`, `partialArtifacts`, `incrementalItems` e `itemOrchestration`, inclusive uma cópia de `workItems` durante a tentativa.
- `BlockExecutionItem.id` é criado pelo núcleo e já é usado para retry seletivo, edição, reorder e ações por item. `sourceItemId` preserva a linhagem quando a entrada veio de uma delivery anterior.
- `ProjectDelivery` e `DeliveryItem` são materializados pelo núcleo a partir dos valores do bloco. Uma delivery é identificada por execução, bloco, output e tentativa; um item tenta reaproveitar `sourceExecutionItemId`, chave externa ou, em último caso, posição.
- Artifacts de plugin são importados pelo runner para `StoredFile`. Seus metadados aparecem em `partialArtifacts` e nos valores persistidos, mas ainda não existe uma relação normalizada própria `artifact -> delivery item`.
- Listas continuam podendo existir como arrays opacos em `RuntimeValue`, `BlockExecution.values`, `PluginExecutionRequest.inputs` e `partialValues`. Identidade por elemento só está disponível quando a origem fornece delivery item IDs ou quando a capability entra nos caminhos de item orchestration/incremental items.

## Arquivo/superfície → responsabilidade → lacuna → fase dona

| Arquivo/superfície                                              | Responsabilidade atual                                                                                    | Lacuna para o contrato alvo                                                                                                                                                           | Fase dona    |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `src/lib/domain.ts` — `BlockExecution` / `BlockExecutionItem`   | Define estado do bloco, unidade operacional, tentativa, `sourceItemId`, correlação do plugin e progresso. | Unidade escalar não é materializada universalmente; os itens vivem aninhados no payload da execução.                                                                                  | 8.1–8.3      |
| `src/lib/domain.ts` — `ProjectDelivery` / `DeliveryItem`        | Define entrega persistida e itens ordenados, com `sourceExecutionItemId`, `externalKey` e referências.    | Delivery item ainda pode depender de identidade derivada por posição/valor; artifact não possui vínculo normalizado próprio com o item.                                               | 8.1, 8.5–8.6 |
| `src/lib/deliveries.ts`                                         | Materializa deliveries, reaproveita IDs e reconstrói valores de cardinalidade `many`.                     | Quando a correlação explícita não fecha, usa `externalKey`, posição e comparação profunda; listas seguem sendo reconstruídas por ordem.                                               | 8.1–8.2, 8.6 |
| `src/lib/runtime-contract.ts`                                   | Resolve inputs e carrega `sourceDeliveryId`/`sourceDeliveryItemIds` junto do valor runtime.               | O valor consumido continua sendo o array completo; a identidade dos elementos viaja em um side channel e pode faltar em fontes estáticas/runtime/histórico.                           | 8.2          |
| `server/index.ts` — `process_executions`                        | Persiste toda a `ProcessExecution` em um único JSON e expõe deliveries/items pelas APIs.                  | Itens, deliveries e output não possuem tabelas próprias; mutações regravem o payload completo.                                                                                        | 8.1, 8.5     |
| `server/index.ts` — `reconcileStoredExecutionItems()`           | Reconstrói itens legados a partir de jobs/outputs quando encontra mapeamento determinístico.              | A recuperação ainda precisa inferir coleção/saída e casar outputs por posição.                                                                                                        | 8.1–8.2      |
| `server/plugin-job-store.ts` — `plugin_jobs`                    | Persiste lifecycle do job, partials, artifacts, item orchestration e incremental items por tentativa.     | Duplica parte do estado que também termina em `process_executions`; não é a identidade universal final de item.                                                                       | 8.1, 8.5     |
| `server/plugin-item-orchestration.ts`                           | Materializa itens para capabilities com coleção declarada, mantém tentativas, retomada e retry seletivo.  | A implementação atual só entra para arrays com pelo menos dois elementos e possui vários caminhos de compatibilidade por índice.                                                      | 8.2, 8.4–8.7 |
| `server/plugin-incremental-items.ts`                            | Correlaciona updates incrementais/variantes com IDs do núcleo e `pluginCorrelation`.                      | O contrato incremental ainda convive com outputs agregados e job payload; `registerItems/claimItems/publishItemUpdate` da fase normativa ainda não são serviços universais do runner. | 8.3–8.5      |
| `server/plugin-runner.ts`                                       | Importa artifacts, troca `artifact://` por `StoredFile` e preserva artifacts parciais entre respostas.    | Relação do artifact com execução/item é indireta pelo valor/correlação; não há entidade persistente própria de artifact.                                                              | 8.1, 8.5     |
| `server/index.ts` — APIs `/items`, `/items-order`, item actions | Edita, reordena, regenera e seleciona usando `BlockExecutionItem.id`.                                     | Alguns fallbacks precisam reordenar arrays agregados por índice quando não existe job correlacionado.                                                                                 | 8.6          |

## Identidades que já existem

### `BlockExecution`

O bloco é localizado dentro de `ProcessExecution.blocks` por `blockId`. A tentativa do bloco é `attempt`. O payload guarda estado, valores, job, progresso, itens e timestamps, mas não existe hoje uma linha SQL por bloco nem uma tabela separada de unidades.

### `BlockExecutionItem`

`server/plugin-item-orchestration.ts` cria `id` com `randomUUID()` no núcleo. Quando a entrada veio de uma delivery e a quantidade coincide, `sourceItemId` recebe o ID do delivery item correspondente. Cada item guarda `order`, input, status, tentativa atual, output, erro e histórico de tentativas.

Updates incrementais criados em `server/plugin-incremental-items.ts` também terminam como `BlockExecutionItem`, usando `pluginCorrelation` para separar porta, item de lote e variante sem permitir que o plugin defina o `itemId` universal.

### `ProjectDelivery` e `DeliveryItem`

`deliveryIdFor()` usa `execution.id + blockId + outputKey + attempt`. Para cada elemento, `materializeBlockDeliveries()` prefere nesta ordem:

1. `sourceExecutionItemId`, quando a lista de itens operacionais pode ser alinhada à saída;
2. chave externa estável de `StoredFile.id` ou de campos `id/key/externalId/external_id` de record;
3. posição `order + 1` como fallback.

Ao atualizar uma delivery, o código tenta reaproveitar o item anterior por `sourceExecutionItemId`, depois pelo ID derivado e, por último, por `order + deepEqual(value)`.

### Jobs, partials e artifacts

`plugin_jobs` possui uma linha por tentativa do bloco e guarda o estado completo do job em `payload`. `partialValues` é um mapa agregado por output; `partialArtifacts` é uma lista de `StoredFile`; `itemOrchestration.workItems` e `incrementalItems` carregam unidades operacionais durante a execução.

O runner valida/importa artifacts e substitui referências `artifact://<id>` por `StoredFile`. O mesmo `StoredFile` pode então aparecer no output de um `BlockExecutionItem`, em `partialValues` e em delivery items. Essa correlação é útil, mas ainda implícita: o banco não possui entidade de artifact com `executionItemId`/`deliveryItemId` próprio.

## Onde listas ainda são valores opacos

1. `RuntimeValue` inclui `string[]`, `StoredFile[]` e `StructuredRecord[]`; portanto `BlockExecution.values` e outputs oficiais podem persistir a coleção inteira sem uma unidade universal para cada elemento.
2. `PluginExecutionRequest.inputs` entrega o valor da porta como array. `inputDeliveries` fornece `deliveryId/itemIds` em paralelo, mas o handler legado pode ignorar esse side channel e tratar a lista como um único valor.
3. `PersistentPluginJob.partialValues` guarda arrays agregados. Mesmo quando `workItems` existe, os dois formatos convivem para compatibilidade.
4. Capabilities sem `itemOrchestration` podem devolver listas completas. O núcleo tenta criar correlação determinística somente em cenários simples de uma lista de entrada/uma lista de saída.
5. Entradas `static`, `runtime` e `channel_history` podem resolver arrays sem `sourceDeliveryItemIds`; nesses casos os elementos não carregam linhagem de item anterior.
6. O output oficial do processo continua sendo `ProcessOutput.values`; deliveries normalizadas são derivadas ao lado desse valor agregado para compatibilidade.

## Inferências por índice/posição que precisam desaparecer como fonte de identidade

As ocorrências abaixo são compatibilidade útil hoje, mas a fase 8 não deve depender delas para decidir se um item é o mesmo:

- `declaredItemOrchestration()` associa `sourceItemIds[order]` ao array de entrada e cria `itemIds[order]`.
- `resumedItemOrchestrationFromItems()` e `selectedItemOrchestrationFromItems()` comparam `previousItems[index].input` com `fresh.items[index]` para aceitar retomada.
- `legacyItemOrchestration()` associa `outputs[index]` ao item de entrada de mesmo índice.
- `invocationRequestForJob()` escolhe `items[currentIndex]` e `itemIds[currentIndex]` para a invocação corrente.
- `sameOrchestratedInput()` exige a mesma sequência de `itemIds` e usa igualdade serializada do array quando os IDs de delivery não existem.
- `materializeBlockDeliveries()` usa `executionItems[order]` somente quando os comprimentos coincidem e cai para `String(order + 1)` quando não há identidade melhor.
- O fallback de reaproveitamento de delivery item combina `candidate.order === order` com `deepEqual(candidate.value, item)`.
- A API de reorder, quando não encontra job correlacionado, remapeia arrays de `blockExecution.values` usando o índice antigo de cada `BlockExecutionItem`.

Esses caminhos não são bugs isolados: eles representam a camada de compatibilidade que permite ao modelo atual funcionar antes da materialização universal. A fase 8 deve preservar compatibilidade externa enquanto move a autoridade de identidade para unidades persistidas antes do primeiro efeito.

## Fluxo atual de uma lista com identidade disponível

1. `runtime-contract` resolve a entrada e transporta `sourceDeliveryId/sourceDeliveryItemIds` quando a origem é uma delivery.
2. `server/index.ts` monta `PluginExecutionRequest.inputDeliveries` junto do array da porta.
3. `declaredItemOrchestration()` cria IDs do núcleo e copia a linhagem para `sourceItemId` quando as contagens coincidem.
4. O job persiste `workItems`; o bloco espelha esses itens em `BlockExecution.items`.
5. O plugin recebe `batch.itemId/index/total` ou publica updates incrementais correlacionados.
6. O núcleo atualiza `BlockExecutionItem`, `partialValues` e o job; depois materializa deliveries parciais/completas.
7. A próxima entrada pode receber os IDs dos delivery items pelo `inputDeliveries` side channel.

Esse fluxo já demonstra a direção do contrato alvo, mas ainda não cobre universalmente escalar, todas as listas, itens derivados, artifacts e múltiplas coleções ambíguas.

## Lacunas que a fase 8 precisa resolver

- materializar também a unidade escalar e listas de qualquer origem antes do executor;
- tornar a identidade persistida independente do formato agregado em `values/partialValues`;
- normalizar ou definir uma única autoridade durável para unidade, tentativa, delivery item e artifact, reduzindo a duplicação `plugin_jobs` ↔ `process_executions`;
- registrar itens derivados antes do primeiro efeito externo e receber IDs do núcleo;
- relacionar artifacts diretamente ao item que os produziu, mantendo o `StoredFile` agregado por compatibilidade;
- usar IDs para retomada, reorder, retry e consolidação, deixando índice somente como metadado de ordem;
- tratar múltiplas listas/saídas com associação declarada, sem heurística de “uma lista de entrada/uma lista de saída”;
- preservar handlers agregados legados enquanto as capabilities migram para correlação incremental.

## Fora do escopo do pacote 1.2

Não foram criadas tabelas de item/delivery/artifact, migrações, serviços `registerItems/claimItems/publishItemUpdate`, materialização escalar, scheduler, lanes, leases, mudanças de UI ou adaptações de plugin. Esses efeitos pertencem às fases posteriores do roadmap.
