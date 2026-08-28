# Exemplos de contratos sem conflito

## Tema: pesquisar e selecionar

O padrão correto é pesquisa em lista, seguida de validação singular:

```json
{
  "format": "contentflow-method",
  "version": 1,
  "name": "Tema pesquisado e validado",
  "exportedAt": "2026-08-12T12:00:00.000Z",
  "method": {
    "processType": "theme",
    "blocks": [
      {
        "id": "theme-search",
        "type": "BUSCAR",
        "operator": "IA",
        "instructions": "Pesquise candidatos e retorne uma lista com tema, ângulo e fonte.",
        "outputs": [{"id":"candidates","label":"Candidatos","key":"candidates","type":"list","required":true}],
        "parameters": [],
        "order": 0
      },
      {
        "id": "theme-select",
        "type": "VALIDAR",
        "operator": "Humano",
        "instructions": "Selecione um candidato para o vídeo atual.",
        "outputs": [{"id":"selected","label":"Tema escolhido","key":"selected_value","type":"text","required":true,"optionsSourceBlockId":"theme-search","optionsSourceKey":"candidates"}],
        "validation":{"targetBlockId":"theme-search","targetOutputKey":"candidates","mode":"select_one","onReject":"retry_target","maxAttempts":2},
        "parameters": [],
        "order": 1
      }
    ]
  }
}
```

A seleção é válida porque `list` é a fonte de opções e `select_one` produz um valor singular `text`. Não conecte `candidates` diretamente a um input `text` de um bloco seguinte; use o output `selected_value`.

## Records: criar cenas e consumir cenas

Um bloco que produz `records` com `scene_id`, `voiceover`, `visual_description` e `duration_seconds` pode alimentar outro bloco que também exige esses campos. Se o consumidor exigir novos campos, como `asset_id`, crie um bloco de enriquecimento e produza novo schema; não reinterprete o record original.

## Mídia: layout para imagem

`thumbnail_layout` descreve composição. Um bloco que exige `image` não pode consumi-lo diretamente. Insira `CRIAR/Código` com renderização e output `image`. Da mesma forma, `video` não vira `image` sem bloco de extração de frame.

## Arquivos

`files` é coleção e não pode alimentar `file` sem seleção. Use `VALIDAR/select_one` ou um bloco Código que produza um arquivo único; declare o MIME e o output como `file`.

## Exemplo inválido intencional

```json
{
  "inputs": [{"id":"input-assets","label":"Asset","type":"file","source":"previous_block","blockId":"asset-search","sourceKey":"assets"}]
}
```

Se `asset-search.assets` for `files`, a conexão é inválida: cardinalidade coleção → singular. Corrija selecionando um arquivo ou alterando o input para `files`.
