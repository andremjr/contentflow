# Contrato de Método v3

O envelope usa `format: "contentflow-method"`, `version: 3` e um `method` com `contractVersion: 3`, um Processo Universal e 1–200 Blocos.

Novas entradas e entregas estratégicas no editor e no Builder MCP usam somente `ContentShape` (`text`, `image`, `audio`, `video`). Controles/registros persistidos são internos e devem ser preservados, sem conversão automática ou edição de schema pelo usuário. JSON/SRT são texto quando a porta aceita; o Core não deduz relações a partir de JSON textual.

Cada input e output declara `shape: ValueShape`; nunca declara `type`. Veja [`docs/CONTENT_CONTRACT.md`](documentation.md).

Exemplo:

```json
{
  "id": "drafts",
  "label": "Rascunhos",
  "key": "drafts",
  "shape": {
    "kind": "content",
    "family": "text",
    "cardinality": "many",
    "representation": "inline"
  },
  "required": true,
  "portKey": "drafts"
}
```

Texto como TXT, Markdown ou SRT usa `family: "text"` e `representation: "artifact"`, com MIME/extensões opcionais em `formats`. Imagem, áudio e vídeo usam `artifact`. Internamente, número, booleano, seleção, data, URL, approval, IDs e layout usam `ControlShape`. Estrutura interna tabular usa `RecordShape`.

`presentation` contém apenas `renderer`; não contém família, cardinalidade, representação, MIME nem qualquer outra semântica do valor.

Bindings estratégicos, plugin/capability, validação, parâmetros, conversa e regras de `ESCOLHER` mantêm os contratos vigentes. `VALIDAR` opera sobre o shape do alvo e registra a aprovação internamente; seleção entrega os valores escolhidos com cardinalidade explícita.

O arquivo não contém IDs de execução, delivery/item IDs, secrets, cookies, caminhos físicos ou contas locais.
