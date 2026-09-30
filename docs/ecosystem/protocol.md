# ContentFlow Plugin API v2

Este é o protocolo público vigente de plugins. O contrato de dados normativo está em [`../CONTENT_CONTRACT.md`](../CONTENT_CONTRACT.md).

## Manifesto

O pacote contém `contentflow.plugin.json` na raiz:

```json
{
  "apiVersion": "2",
  "id": "com.example.plugin",
  "name": "Plugin",
  "version": "1.0.0",
  "description": "Descrição",
  "author": "Autor",
  "license": "Proprietary",
  "runtime": { "kind": "node", "version": ">=26 <27", "module": "esm" },
  "entrypoint": "handler.mjs",
  "permissions": [],
  "capabilities": []
}
```

IDs de plugin, capability e porta são estáveis. Mudá-los, remover porta ou alterar seu shape exige nova major do plugin.

## Capabilities e portas

Uma capability declara operador, Blocos/Processos compatíveis, portas, execução, efeitos, custo, política de dados e schema de configuração.

```json
{
  "id": "generate-titles",
  "operator": "IA",
  "blockTypes": ["CRIAR"],
  "processTypes": ["title"],
  "inputPorts": [
    {
      "key": "briefing",
      "label": "Briefing",
      "shape": {
        "kind": "content",
        "family": "text",
        "cardinality": "one",
        "representation": "inline"
      },
      "required": true
    }
  ],
  "outputPorts": [
    {
      "key": "titles",
      "label": "Títulos",
      "shape": {
        "kind": "content",
        "family": "text",
        "cardinality": "many",
        "representation": "inline"
      },
      "required": true,
      "presentation": { "renderer": "list" }
    }
  ],
  "execution": { "mode": "immediate" },
  "sideEffects": ["external_read"],
  "cost": { "model": "metered", "estimateSupported": false },
  "dataPolicy": { "sendsDataToThirdParties": true, "providers": ["Example"] },
  "blockConfigSchema": { "type": "object", "properties": {}, "additionalProperties": false },
  "outputSchema": { "type": "object" }
}
```

Cada porta possui exatamente um `shape`. Não existem `acceptedTypes`, `producedTypes`, `acceptedInputTypes`, `producedOutputTypes`, `multiple` ou `deliveryTypes`. Cardinalidade está no shape. A descoberta de famílias do plugin é derivada das output ports.

Múltiplas famílias usam múltiplas portas. Uma capability que produz imagens e vídeos declara, por exemplo, `images: image/many/artifact` e `videos: video/many/artifact`.

## Binding

O Método materializa `portKey` explicitamente. O runtime procura essa chave exata e valida `ValueShape`; não escolhe por label, ordem, alias, tipo aproximado ou primeira porta compatível.

O handler lê `request.inputs[portKey]` e devolve `values[portKey]`. A chave estratégica do Bloco permanece interna ao núcleo.

## Request

```ts
type PluginExecutionRequest = {
  executionId: string;
  traceId: string;
  blockId: string;
  capabilityId: string;
  attempt: number;
  invocation: PluginInvocation;
  configuration: Record<string, unknown>;
  settings: Record<string, unknown>;
  inputs: Record<string, RuntimeValue>;
  inputContract: PluginInputContract[];
  inputDeliveries?: PluginInputDelivery[];
  outputContract: PluginFieldContract[];
  resolvedInstruction?: string;
  unresolvedInstructionVariables?: string[];
  batch?: { itemId: string; index: number; total: number };
  context: PluginExecutionContext;
};
```

O request não contém secrets, cookies, storage, caminho físico, token ou ID interno de perfil. Secrets são resolvidos por `services.getSecret()` somente quando declarados e autorizados.

## Respostas

Sucesso:

```js
{ status: "success", values: { titles: ["A", "B"] }, artifacts: [] }
```

Pending:

```js
{ status: "pending", jobId: "opaque", pollAfterMs: 5000, progress: 0.4 }
```

Erro:

```js
{
  status: "error",
  code: "RATE_LIMIT",
  message: "Limite temporário.",
  retryable: true,
  retryAfterMs: 30000
}
```

Outputs usam exclusivamente port keys declaradas. Shape incompatível, cardinalidade incorreta, porta desconhecida ou output obrigatório ausente falham antes da conclusão.

## Artifacts

Artifact é representação material de `text`, `image`, `audio` ou `video`, nunca uma família. O plugin grava somente em `services.getOutputPath()` e devolve referências `artifact://...`; o núcleo valida, importa e cria `StoredFile`.

Conteúdo textual em TXT, Markdown ou SRT continua sendo `family: "text", representation: "artifact"`. MIME e extensões pertencem a `ContentShape.formats`.

## Item orchestration

`execution.itemOrchestration` pode apontar uma input port `many` e uma output port compatível. O núcleo cria work units e chama a capability por item. O plugin não infere lote pela presença de array, não inventa item IDs e não reprocessa concluídos.

Execução multiperfil distribui work units exclusivas entre perfis físicos distintos. Uma pasta física possui no máximo uma execução de navegador ativa.

## Jobs, idempotência e recovery

Invocações usam `start`, `resume` e `cancel`. A chave lógica é `executionId + blockId + capabilityId + attempt + invocation.mode`. `start` repetido não pode criar efeito ou cobrança duplicada; `resume` e `cancel` são idempotentes.

Timeout ou reconnect após possível efeito externo exige reconciliação. O plugin relata fatos e receipts; não escolhe retry, troca de perfil nem avanço estratégico.

## Services

- `signal`: cancelamento abortável.
- `getSecret(key)`: secret declarado e autorizado.
- `resolveInputFile(file)`: abre `StoredFile` concedido em staging.
- `getOutputPath(relativePath)`: saída temporária exclusiva.
- `getWorkspacePath(relativePath)`: checkpoint privado autorizado.
- `getProfilePath(relativePath)`: raiz opcional do perfil ativo, após vínculo explícito.
- `publishPartial(update)`: partial durável validado pelo mesmo output contract.
- `registerItems`, `claimItems`, `publishItemUpdate`: serviços reservados de work units.

## Segurança e permissões

Permissões são negadas por padrão e declaradas entre `network`, `filesystem:read`, `filesystem:write`, `process`, `worker` e `native`. Declare hosts, provedores, retenção, treinamento, custo e efeitos externos honestamente.

O plugin não acessa SQLite, cofre, diretórios arbitrários, outros perfis ou arquivos fora das raízes concedidas. Caminhos absolutos, traversal e symlinks externos são inválidos.

## Browser Bridge e perfis

Perfis são identidades locais globais. O vínculo plugin + perfil e o readiness são explícitos e independentes. O Método v3 usa a política local `profileExecution`, com `profileIds` e modos `fallback` ou `parallel`; os IDs nunca são enviados ao plugin em `request`. Quando o manifesto declara `profileSetup`, `configurationKey` e `fallbackConfigurationKey` apenas nomeiam a configuração funcional do vínculo. Cookies, sessão e credenciais nunca entram em Método, snapshot portátil ou request.

A Browser Bridge negocia versão/capabilities antes do primeiro efeito, usa comandos idempotentes, eventos sequenciados, snapshots sob demanda, observers limitados e backpressure. Recarga não é fallback universal e fica bloqueada diante de efeito incerto.

## Apresentação e configuração

`presentation` solicita apenas renderer seguro do núcleo. Ele não altera shape. A interface funcional da capability vem de `blockConfigSchema`; plugins não injetam React, HTML, CSS ou scripts.

Localizações podem traduzir nome, descrição, labels, ajuda e opções. IDs técnicos, port keys e valores não são traduzidos.

## Versionamento

Plugin API v2 e Método v3 são os únicos contratos aceitos pelo caminho canônico. API v1 e Métodos v1/v2 não recebem adapter automático. Conversão de pacotes anteriores é trabalho explícito e separado.
