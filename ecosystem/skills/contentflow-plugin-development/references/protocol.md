# Referência: ContentFlow Plugin API v1

Leia este arquivo sempre que o plugin envolver manifesto, portas, tipos, execução, jobs, retries, artifacts, versionamento ou compatibilidade.

## Manifesto essencial

O arquivo `contentflow.plugin.json` fica na raiz do pacote. Os campos essenciais são `apiVersion: "1"`, `id` reverso e imutável, `name`, `version` SemVer, `description`, `author`, `license`, `runtime`, `entrypoint` e `capabilities`. Declare `minCoreVersion` quando aplicável. O runtime v1 é Node/ESM, normalmente `>=26 <27`.

Cada capability deve declarar `id`, `operator` (`IA` ou `Código`), `blockTypes`, `processTypes` quando necessário, `inputPorts`, `outputPorts`, `execution`, `sideEffects`, `cost`, `dataPolicy`, `blockConfigSchema` e, quando útil, `outputSchema`. `deliveryTypes` classifica o pacote para descoberta, mas não substitui as portas. `instructionUsage` informa se a capability exige, aceita ou ignora a instrução resolvida do bloco; ausência equivale a `optional`. O `blockConfigSchema` também é a declaração da interface funcional da capability: propriedades visíveis aparecem na área principal, na ordem declarada, com os componentes seguros do núcleo. O plugin controla títulos, descrições, opções, defaults, limites e visibilidade condicional, mas não injeta React, HTML ou CSS.

No manifesto, `branding.iconPath` pode apontar para PNG/WebP local de até 512 KiB, relativo ao pacote, sem URL, caminho absoluto, `..` ou symlink externo. Recomenda-se 256 × 256; o autor precisa possuir direito de uso. `profileSetup`, `execution.itemOrchestration` e `supportsConversationContinuation` são contratos funcionais: só os declare quando handler e testes cobrirem seus ciclos completos.

Use schemas JSON Schema Draft 2020-12 dentro do subconjunto aceito pelo núcleo. Configurações devem ter raiz `object`; prefira `additionalProperties: false`; defaults precisam satisfazer o próprio schema; propriedades desconhecidas devem ser rejeitadas antes de invocar o handler.

## Portas e binding

Portas são semânticas. Defina `key` estável, `label`, tipos aceitos/produzidos, `required`, `multiple`, `recordFields` e `presentation` somente quando necessário. O núcleo filtra por operador, bloco e processo, faz binding automático apenas quando inequívoco e solicita mapeamento quando houver ambiguidade.

O handler deve usar `request.inputs[portKey]`, nunca labels. Outputs usam as chaves técnicas das portas declaradas. `acceptedInputTypes` e `producedOutputTypes` são resumos; as portas são a autoridade de binding.

## Request e services

A requisição inclui, entre outros campos, `executionId`, `traceId`, `blockId`, `capabilityId`, `attempt`, `invocation`, `configuration`, `settings`, `inputs`, `inputContract`, `inputDeliveries`, `outputContract`, `validation`, `retryFeedback`, `resolvedInstruction`, `unresolvedInstructionVariables`, `batch`, `conversation` e `context`.

Capabilities com `instructionUsage: required` devem falhar de forma clara quando `resolvedInstruction` estiver vazia; `optional` pode combiná-la com configuração própria; `not_applicable` deve ignorá-la. Nunca volte ao template cru quando variáveis ficaram não resolvidas sem tratar `unresolvedInstructionVariables`.

Plugins que preservam uma conversa no provedor podem declarar `supportsConversationContinuation: true`. O request recebe `conversation: { mode: "new" }` ou `conversation: { mode: "reuse", id: "..." }`; o sucesso devolve opcionalmente `conversation: { id: "..." }`. Trate o ID como opaco, valide que pertence ao provedor esperado e nunca inclua tokens. O núcleo só permite reutilização entre blocos anteriores com o mesmo plugin e a mesma conexão local.

`execution.itemOrchestration` preserva `inputPort`, `outputPort` e `mode: "sequential"` para compatibilidade. `strategies` pode declarar `per_item`, `continuous_session` ou ambas; `preferredStrategy` precisa pertencer à lista. A ausência desses campos continua significando o comportamento legado por item. `collectionAssociations` declara pares adicionais de coleção/entrega quando houver mais de uma combinação estruturalmente válida, e `profileParallelism` apenas informa elegibilidade futura para lanes em perfis físicos distintos.

Em `per_item`, o núcleo chama uma vez por unidade e fornece `request.batch` com ID/índice/total. Em `continuous_session`, o request preserva a coleção inteira e o runtime pode expor `services.claimItems` para que uma única invocação processe várias unidades sem fechar o recurso externo entre elas. Cada concessão contém ID, índice, total, tentativa e input persistidos pelo núcleo e fica associada à invocação/perfil ativo até conclusão, erro, cancelamento ou expiração. `services.registerItems` também pode ser negociado em jobs de Projeto compatíveis e só resolve depois que parent, ordem, entrada, chave semântica e IDs foram persistidos; repetir o mesmo plano na mesma tentativa lógica reaproveita os IDs. `services.publishItemUpdate` permanece aditivo/opcional até o runtime concluir a persistência incremental por item. `services.publishPartial` permanece como compatibilidade para snapshots agregados. Handlers legados sem `itemOrchestration` recebem a coleção inteira; quando o retorno final admite um pareamento unívoco de mesma cardinalidade, o núcleo pode materializar as unidades apenas após a conclusão, marcando-as como compatibilidade agregada sem suporte a updates tardios, tempo real ou paralelismo por perfil.

Estados duráveis de unidade: `planned`, `pending`, `leased`, `submitted`, `awaiting_result`, `completed`, `failed`, `awaiting_human` e `cancelled`. O plugin repete somente o `itemId` concedido como correlação e nunca inventa IDs do núcleo. `submitted` bloqueia retry cego; tentativa e revisão fazem parte da correlação e resultados concluídos não podem ser repetidos silenciosamente.

`profileSetup` habilita `invocation.mode = "configure"` com `action = "status"` ou `"prepare"`. Essas chamadas não pertencem a Projeto e retornam `values.ready`. Perfis alternativos só usam `fallbackConfigurationKey` com aliases preparados explicitamente. O núcleo consulta a política central antes de trocar de perfil: somente falhas seguras e associadas ao perfil podem avançar; efeito externo incerto exige reconciliação e condições humanas exigem intervenção. Cancelamento e lista esgotada encerram o fallback.

O contrato alvo separa alias legado de identidade física: `profileId` é um identificador local opaco e a política local do Bloco chama-se `profileExecution`, com `profileIds` e modos canônicos `fallback` ou `parallel`. Fallback ordenado é o padrão mesmo com um perfil; o valor histórico `single` é aceito apenas na leitura e normalizado para `fallback`. Métodos API v1 existentes continuam resolvendo por `pluginId + alias`; aliases iguais em plugins diferentes não são fundidos. Depois de vínculo explícito e válido, o handler pode receber `services.getProfilePath(relativePath)`; ele nunca recebe `profileId` nem enumera perfis.

A assinatura é `execute(request, services)`. Serviços:

| Serviço                          | Regra                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `signal`                         | Encaminhar para operações abortáveis.                        |
| `getSecret(key)`                 | Só aceita chaves declaradas no manifesto.                    |
| `resolveInputFile(file)`         | Resolve `StoredFile` autorizado em staging.                  |
| `getOutputPath(relativePath)`    | Retorna caminho temporário exclusivo de saída.               |
| `getWorkspacePath(relativePath)` | Retorna caminho persistente dentro do workspace autorizado.  |
| `getProfilePath(relativePath)`   | Raiz opcional do perfil global ativo, concedida por vínculo. |

Secrets, cookies, storage de sessão, caminhos físicos, `profileId`, `profileExecution` e IDs internos de vínculo/readiness/lease nunca aparecem no envelope serializável ou pacote portátil.

## Valores universais

A API v1 usa `text`, `textarea`, `number`, `boolean`, `list`, `records`, `select`, `multiselect`, `datetime`, `url`, `file`, `files`, `image`, `audio`, `video`, `approval` e `thumbnail_layout`. Strings são UTF-8; números devem ser finitos; datas usam ISO 8601; listas preservam ordem; records não podem conter campos desconhecidos; records não são aninhados.

O núcleo gera IDs universais depois de validar a resposta. Um escalar gera um item; listas, records e coleções de arquivos geram um item por elemento. Não invente IDs do núcleo. IDs externos como `jobId` e `assetId` podem ser preservados como campos de proveniência.

## Respostas

Sucesso:

```js
{
  status: "success",
  values: { result: "valor" },
  artifacts: [],
  usage: {},
  logs: []
}
```

Pendência:

```js
{
  status: "pending",
  jobId: "id-opaco",
  pollAfterMs: 5000,
  progress: 0.4,
  message: "Em processamento",
  partialValues: {},
  partialArtifacts: []
}
```

Erro:

```js
{
  status: "error",
  code: "RATE_LIMIT",
  message: "Limite temporário do provedor.",
  retryable: true,
  retryAfterMs: 30000
}
```

Códigos recomendados: `INVALID_INPUT`, `INVALID_CONFIGURATION`, `AUTHENTICATION_FAILED`, `PERMISSION_DENIED`, `NOT_FOUND`, `RATE_LIMIT`, `UPSTREAM_UNAVAILABLE`, `TIMEOUT`, `OUTPUT_VALIDATION_FAILED`, `JOB_FAILED` e `CANCELLED`.

## Execução assíncrona e idempotência

Use `invocation.mode = "start"`, `"resume"` e `"cancel"`. `start` inicia o job; `resume` consulta o mesmo `jobId`; `cancel` deve ser idempotente. O handler não pode depender de memória global, PID ou processo sobrevivente. Estado necessário deve estar no provedor, em `jobId` ou no workspace autorizado.

A chave lógica é `executionId + blockId + capabilityId + attempt + invocation.mode`. `start` repetido para a mesma chave não pode criar jobs ou cobranças duplicadas. `resume` pode ser repetido. Após timeout com efeito externo incerto, reconcilie o status pelo ID externo antes de repetir.

## Blocos

`BUSCAR` consulta fontes e preserva origem/licença. `ESCOLHER` seleciona itens preexistentes da coleção estratégica. `CRIAR` produz novas entregas. `VALIDAR` devolve decisões ou seleção; reprovação editorial é `success` válido com `decision: "rejected"`, não erro técnico.

## Compatibilidade

Mudanças compatíveis incluem adicionar capability, ampliar processos/tipos, adicionar configuração opcional com default e melhorar implementação sem mudar semântica. Renomear/remover porta ou capability, tornar campo obrigatório, mudar tipo/significado da saída, remover formato ou alterar permissões/efeitos significativamente exige major do plugin. Mudanças incompatíveis no envelope ou semântica do protocolo exigem nova `apiVersion` do ContentFlow.

O Método salva `pluginId`, `pluginVersion`, `capabilityId`, configuração e bindings. O snapshot registra também hash do pacote e `apiVersion`. Não substitua silenciosamente uma versão ausente por outra.

Fonte: [protocol.md](https://github.com/andremjr/contentflow/blob/main/docs/ecosystem/protocol.md).
