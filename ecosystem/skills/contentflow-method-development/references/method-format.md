# Contrato de Método v3

O envelope usa `format: "contentflow-method"`, `version: 3` e um `method` com `contractVersion: 3`, um Processo Universal e 1–200 Blocos.

Cada input e output declara `shape: ValueShape`; nunca declara `type`. Veja [`docs/CONTENT_CONTRACT.md`](../../../../docs/CONTENT_CONTRACT.md).

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

Texto como TXT, Markdown ou SRT usa `family: "text"` e `representation: "artifact"`, com MIME/extensões opcionais em `formats`. Imagem, áudio e vídeo usam `artifact`. Número, booleano, seleção, data, URL, approval, IDs e layout usam `ControlShape`. Estrutura tabular usa `RecordShape`.

`presentation` contém apenas `renderer`; não contém família, cardinalidade, representação, MIME nem qualquer outra semântica do valor.

Bindings estratégicos, plugin/capability, validação, parâmetros, conversa e regras de `ESCOLHER` mantêm os contratos vigentes. `VALIDAR` opera sobre o shape do alvo e produz controle de approval ou seleção com cardinalidade explícita.

O arquivo não contém IDs de execução, delivery/item IDs, secrets, cookies, caminhos físicos ou contas locais.
