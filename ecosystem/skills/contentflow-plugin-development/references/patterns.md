# Referência: padrões de implementação

## `text-transform`: transformação local

Use quando a capability só precisa transformar texto/dados em memória. Não declare permissões. Valide tipo e limites, evite estado global e retorne valores diretamente.

```js
export async function execute(request) {
  const text = request.inputs.content;
  if (typeof text !== "string") {
    return { status: "error", code: "INVALID_INPUT", message: "content deve ser texto", retryable: false };
  }
  return { status: "success", values: { result: text.trim() } };
}
```

## `hosted-api`: API HTTPS

Use para SaaS, API pública ou webhook HTTPS. Declare `network`, `networkHosts` quando conhecidos, `secretKeys`, provider, dados transmitidos, custo e efeitos. Use `fetch` com `services.signal`, timeout, validação de status e schema. Não envie contexto desnecessário.

```js
export async function execute(request, services) {
  const key = await services.getSecret("PROVIDER_API_KEY");
  if (!key) return { status: "error", code: "AUTHENTICATION_FAILED", message: "Credencial não configurada", retryable: false };
  const response = await fetch("https://api.example.com/v1/run", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: request.inputs.prompt }),
    signal: services.signal,
  });
  if (response.status === 429) return { status: "error", code: "RATE_LIMIT", message: "Limite temporário", retryable: true };
  if (!response.ok) return { status: "error", code: "UPSTREAM_UNAVAILABLE", message: "Falha no provedor", retryable: true };
  const data = await response.json();
  return { status: "success", values: { result: data.result } };
}
```

Não registre a chave, headers ou payload completo. Se a API responder com job, implemente `pending/resume/cancel` e preserve o ID externo.

## `file-artifact`: arquivos

Use para ler `StoredFile` e produzir arquivo. Resolva inputs com `resolveInputFile`, escreva apenas no caminho de `getOutputPath` e devolva artifact relativo. Não grave diretamente em storage definitivo nem retorne base64.

## Adapter para Python/FFmpeg

Mantenha o handler Node como entrypoint, empacote o executável e declare `process`. Use `spawn` sem shell, argumentos estruturados, allowlist, timeout, cancelamento e limpeza da árvore. Valide tipo, tamanho, MIME e nomes de arquivos.

## Capability assíncrona

Separe `start`, `resume` e `cancel`. Retorne `pending` rapidamente; persista o job no provedor ou workspace. Faça `resume` reentrante e `cancel` idempotente. Não dependa de memória global ou PID.

## Conversão de automações

| Automação | Adaptação |
| --- | --- |
| JavaScript | Mover lógica para handler e substituir caminhos/estado global por portas e services. |
| n8n/Make/FastAPI | Chamar endpoint HTTPS estável; documentar dados e efeitos. |
| Playwright/Puppeteer/Selenium | Empacotar runtime; autenticação e perfil explícitos; confirmação visível. |
| Fila/renderização | Mapear provider job para `jobId`; implementar reconciliação e idempotência. |

Separe capabilities quando houver entregas que o usuário precise conectar, validar, substituir ou reutilizar. Mantenha internas as etapas que produzem uma única entrega observável.

Fonte: [quickstart.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/quickstart.md) e [templates de referência](https://github.com/andremjr/contentflow/tree/main/ecosystem/plugin-kit/templates).
