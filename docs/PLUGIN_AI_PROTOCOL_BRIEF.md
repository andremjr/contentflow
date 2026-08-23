# ContentFlow Plugin API v1 — resumo para agentes

Um plugin é uma pasta independente com `contentflow.plugin.json` e um entrypoint ESM para Node 26. O entrypoint exporta `async function execute(request, services)` e retorna exatamente um estado público: `success`, `pending` ou `error`.

## Fronteira pública

`request.inputs` contém valores indexados pela `portKey`. `request.inputContract` e `request.outputContract` descrevem o binding vigente. `request.inputDeliveries`, quando presente, informa `deliveryId` e `itemIds` das origens; `request.context.previousDeliveries` contém entregas anteriores autorizadas do Projeto atual. Quando um bloco `ESCOLHER` conecta `channel_history`, o histórico limitado de outros Projetos chega como um input `records` normal antes da escolha. Não acesse banco, rotas, componentes ou arquivos internos do ContentFlow.

Serviços disponíveis:

- `signal`: cancelamento/timeout;
- `getSecret(nome)`: lê apenas credenciais declaradas;
- `resolveInputFile(storedFile)`: resolve arquivo de entrada autorizado;
- `getOutputPath(nomeRelativo)`: caminho temporário para artefato final;
- `getWorkspacePath(nomeRelativo)`: checkpoint local quando a permissão permite.

Resposta imediata mínima:

```js
return { status: "success", values: { result: "texto" } };
```

Um arquivo produzido usa `artifact://<id>` em `values` e o mesmo `id` em `artifacts`. Use `source.kind: "path"` para arquivo criado no output ou `source.kind: "url"` para HTTPS. Artefatos remotos exigem `network`, host declarado e passam pela importação segura do núcleo.

O plugin não inventa os IDs universais. Depois de validar a resposta, o núcleo cria uma entrega por output e um item identificado por elemento de listas, registros ou coleções de arquivos. IDs externos do provedor podem permanecer nos dados para proveniência.

Jobs assíncronos devolvem `pending` com `jobId` e `pollAfterMs`; `start`, `resume` e `cancel` devem ser idempotentes. Resultados progressivos usam `partialValues` e `partialArtifacts` como snapshots acumulados.

## Segurança e manifesto

Declare o menor conjunto entre `network`, `filesystem:read`, `filesystem:write`, `process`, `worker` e `native`. Para rede, declare `networkHosts`; para credenciais, somente nomes em `secretKeys`. Automação de navegador é implementada e autenticada pelo próprio plugin; o núcleo não fornece navegador nem extrai sessões. Toda capacidade declara operador, blocos, portas, execução, efeitos colaterais, custo, política de dados e schemas.

Plugins não podem injetar React, HTML ou renderizadores. Eles apenas escolhem os renderizadores padronizados do núcleo por `presentation`. O runtime distribuído deve declarar Node `>=26 <27`. Não execute `npm install`, `pip install`, `preinstall` ou `postinstall` durante instalação ou uso; dependências ficam empacotadas. O schema JSON anexado define a estrutura do manifesto, e o Plugin Kit acrescenta regras semânticas; não esconda campos desconhecidos nem erros.
