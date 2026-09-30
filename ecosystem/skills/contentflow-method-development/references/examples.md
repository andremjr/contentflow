# Exemplos de contratos sem conflito

## Tema: pesquisar e selecionar

O padrão correto é produzir candidatos estruturados e validar uma seleção por identificador:

```json
{
  "format": "contentflow-method",
  "version": 3,
  "name": "Tema pesquisado e validado",
  "exportedAt": "2026-08-12T12:00:00.000Z",
  "method": {
    "contractVersion": 3,
    "name": "Tema pesquisado e validado",
    "processType": "theme",
    "blocks": [
      {
        "id": "theme-search",
        "type": "BUSCAR",
        "operator": "IA",
        "name": "Pesquisar temas",
        "instructions": "Pesquise candidatos e retorne identificador, tema, ângulo e fonte.",
        "inputs": [],
        "outputs": [
          {
            "id": "candidates",
            "label": "Candidatos",
            "key": "candidates",
            "shape": {
              "kind": "record",
              "cardinality": "many",
              "fields": [
                { "id": "candidate-id", "key": "id", "label": "ID", "shape": { "kind": "control", "control": "identifier", "cardinality": "one" }, "required": true },
                { "id": "candidate-theme", "key": "theme", "label": "Tema", "shape": { "kind": "content", "family": "text", "cardinality": "one", "representation": "inline" }, "required": true },
                { "id": "candidate-angle", "key": "angle", "label": "Ângulo", "shape": { "kind": "content", "family": "text", "cardinality": "one", "representation": "inline" }, "required": true },
                { "id": "candidate-source", "key": "source", "label": "Fonte", "shape": { "kind": "content", "family": "text", "cardinality": "one", "representation": "inline" }, "required": true }
              ]
            },
            "required": true
          }
        ],
        "parameters": [],
        "order": 0
      },
      {
        "id": "theme-select",
        "type": "VALIDAR",
        "operator": "Humano",
        "name": "Selecionar tema",
        "instructions": "Selecione um candidato para o vídeo atual.",
        "inputs": [],
        "outputs": [
          {
            "id": "selected",
            "label": "Tema escolhido",
            "key": "selected_candidate_id",
            "shape": { "kind": "control", "control": "identifier", "cardinality": "one" },
            "required": true,
            "optionsSourceBlockId": "theme-search",
            "optionsSourceKey": "candidates"
          }
        ],
        "validation": {
          "targetBlockId": "theme-search",
          "targetOutputKey": "candidates",
          "mode": "select_one",
          "onReject": "retry_target",
          "maxAttempts": 2
        },
        "parameters": [],
        "order": 1
      }
    ]
  }
}
```

A seleção não transforma o registro em texto: ela produz um identificador de controle que referencia um item da delivery de candidatos.

## Registros: criar e consumir cenas

Um bloco que produz `shape.kind: "record"`, `cardinality: "many"` e campos como `scene_id`, `voiceover`, `visual_description` e `duration_seconds` pode alimentar outro bloco que exige o mesmo shape. Se o consumidor exigir `asset_id`, crie um bloco de enriquecimento e produza outro schema; não reinterprete o registro original.

## Mídia: layout para imagem

`thumbnail_layout` é controle estrutural. Um bloco que exige conteúdo da família `image` não pode consumi-lo diretamente. Insira `CRIAR/Código` com renderização e output `ContentShape` de imagem. Da mesma forma, vídeo não vira imagem sem bloco explícito de extração de frame.

## Arquivos

Arquivo não é família de conteúdo. Imagem, áudio e vídeo usam suas famílias canônicas com `representation: "artifact"`; `cardinality: "many"` representa vários artifacts. Para selecionar somente um item, use `VALIDAR/select_one` ou um bloco Código com output singular.

## Exemplo inválido intencional

```json
{
  "inputs": [
    {
      "id": "input-assets",
      "label": "Imagens",
      "shape": { "kind": "content", "family": "image", "cardinality": "one", "representation": "artifact" },
      "binding": {
        "kind": "previous_block",
        "blockId": "asset-search",
        "outputKey": "images"
      }
    }
  ]
}
```

Se `asset-search.images` tiver `cardinality: "many"`, a conexão é inválida. Corrija selecionando uma imagem ou alterando o input para `cardinality: "many"`.
