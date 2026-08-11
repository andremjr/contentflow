# ContentFlow Plugin API v1 — resumo para agentes

Um plugin é uma pasta independente com `contentflow.plugin.json` e um entrypoint ESM para Node 26. O entrypoint exporta `async function execute(request, services)` e retorna exatamente um estado público: `success`, `pending` ou `error`.

## Fronteira pública

`request.inputs` contém valores indexados pela `portKey`. `request.inputContract` e `request.outputContract` descrevem o binding vigente. Não acesse banco, rotas, componentes ou arquivos internos do ContentFlow.

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

Jobs assíncronos devolvem `pending` com `jobId` e `pollAfterMs`; `start`, `resume` e `cancel` devem ser idempotentes. Resultados progressivos usam `partialValues` e `partialArtifacts` como snapshots acumulados.

## Segurança e manifesto

Declare o menor conjunto entre `network`, `filesystem:read`, `filesystem:write`, `process`, `worker` e `native`. Para rede, declare `networkHosts`; para credenciais, somente nomes em `secretKeys`. Toda capacidade declara operador, blocos, portas, execução, efeitos colaterais, custo, política de dados e schemas.

Plugins não podem injetar React, HTML ou renderizadores. Eles apenas escolhem os renderizadores padronizados do núcleo por `presentation`. Não execute `npm install`, `preinstall` ou `postinstall` durante geração ou uso. O schema JSON anexado é a definição exata do manifesto; não esconda campos desconhecidos nem erros.
