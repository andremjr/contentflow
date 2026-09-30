# Quickstart — Plugin API v2

1. Leia [`protocol.md`](protocol.md), [`../CONTENT_CONTRACT.md`](../CONTENT_CONTRACT.md) e [`security.md`](security.md).
2. Crie um manifesto com `apiVersion: "2"`.
3. Declare cada input/output port com um único `shape` explícito.
4. Implemente `execute(request, services)` lendo e escrevendo somente por `portKey`.
5. Valide o pacote com o Plugin Kit atualizado para API v2.
6. Teste sucesso, shape/cardinalidade inválidos, timeout, cancelamento, idempotência e artifacts.

Exemplo mínimo de porta textual:

```json
{
  "key": "content",
  "label": "Conteúdo",
  "shape": {
    "kind": "content",
    "family": "text",
    "cardinality": "one",
    "representation": "inline"
  },
  "required": true
}
```

Não use a taxonomia da API v1. Arquivo é representação; coleção é cardinalidade; renderer é apresentação.
