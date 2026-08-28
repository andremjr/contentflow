# Referência: ContentFlow Plugin API v1

Leia este arquivo sempre que o plugin envolver manifesto, portas, tipos, execução, jobs, retries, artifacts, versionamento ou compatibilidade.

## Manifesto essencial

O arquivo `contentflow.plugin.json` fica na raiz do pacote. Os campos essenciais são `apiVersion: "1"`, `id` reverso e imutável, `name`, `version` SemVer, `description`, `author`, `license`, `runtime`, `entrypoint` e `capabilities`. Declare `minCoreVersion` quando aplicável. O runtime v1 é Node/ESM, normalmente `>=26 <27`.

Cada capability deve declarar `id`, `operator` (`IA` ou `Código`), `blockTypes`, `processTypes` quando necessário, `inputPorts`, `outputPorts`, `execution`, `sideEffects`, `cost`, `dataPolicy`, `blockConfigSchema` e, quando útil, `outputSchema`. `deliveryTypes` classifica o pacote para descoberta, mas não substitui as portas.

Use schemas JSON Schema Draft 2020-12 dentro do subconjunto aceito pelo núcleo. Configurações devem ter raiz `object`; prefira `additionalProperties: false`; defaults precisam satisfazer o próprio schema; propriedades desconhecidas devem ser rejeitadas antes de invocar o handler.

## Portas e binding

Portas são semânticas. Defina `key` estável, `label`, tipos aceitos/produzidos, `required`, `multiple`, `recordFields` e `presentation` somente quando necessário. O núcleo filtra por operador, bloco e processo, faz binding automático apenas quando inequívoco e solicita mapeamento quando houver ambiguidade.

O handler deve usar `request.inputs[portKey]`, nunca labels. Outputs usam as chaves técnicas das portas declaradas. `acceptedInputTypes` e `producedOutputTypes` são resumos; as portas são a autoridade de binding.

## Request e services

A requisição inclui, entre outros campos, `executionId`, `traceId`, `blockId`, `capabilityId`, `attempt`, `invocation`, `configuration`, `settings`, `inputs`, `inputContract`, `inputDeliveries`, `outputContract`, `validation`, `retryFeedback` e `context`.

A assinatura é `execute(request, services)`. Serviços:

| Serviço | Regra |
| --- | --- |
| `signal` | Encaminhar para operações abortáveis. |
| `getSecret(key)` | Só aceita chaves declaradas no manifesto. |
| `resolveInputFile(file)` | Resolve `StoredFile` autorizado em staging. |
| `getOutputPath(relativePath)` | Retorna caminho temporário exclusivo de saída. |
| `getWorkspacePath(relativePath)` | Retorna caminho persistente dentro do workspace autorizado. |

Secrets nunca aparecem no envelope serializável, Método, snapshot, log ou artifact.

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

Fonte: [protocol.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/protocol.md).
