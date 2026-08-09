# Contrato de arquivo importável — ContentFlow OS

Use este contrato para criar um arquivo de método importável. O JSON representa **um único Processo Universal** por vez.

## Envelope obrigatório

```json
{
  "format": "contentflow-method",
  "version": 1,
  "name": "Nome legível do método",
  "exportedAt": "2026-08-08T12:00:00.000Z",
  "method": {
    "processType": "theme",
    "blocks": []
  }
}
```

| Campo | Regra |
| --- | --- |
| `format` | Sempre `contentflow-method`. |
| `version` | Sempre o número `1`. |
| `name` | Texto de até 200 caracteres. |
| `exportedAt` | Data/hora ISO 8601 válida. |
| `method.processType` | Um: `theme`, `title`, `thumbnail`, `script`, `narration`, `assets`, `editing`, `publishing`. |
| `method.blocks` | Lista com 1 a 200 blocos. |

## Bloco de ação

```json
{
  "id": "theme-search-references",
  "type": "BUSCAR",
  "operator": "Humano",
  "name": "Pesquisar referências",
  "instructions": "Liste referências recentes e anote o ângulo que torna cada uma relevante.",
  "inputs": [],
  "outputs": [],
  "parameters": [],
  "order": 0
}
```

| Campo | Regra |
| --- | --- |
| `id` | Texto único no arquivo. Use minúsculas e hífens. |
| `type` | Um: `BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`. |
| `operator` | Um: `IA`, `Humano`, `Código`. |
| `collectionId` | Opcional. Não gere este campo para arquivos portáveis. |
| `name` | Opcional; até 200 caracteres. |
| `instructions` | Opcional; até 20.000 caracteres. |
| `inputs`, `outputs`, `parameters` | Listas; `parameters` é obrigatória, mesmo vazia. |
| `validation` | Opcional; use apenas em bloco `VALIDAR`. |
| `order` | Inteiro não negativo; comece em 0 e siga sem saltos. |

## Parâmetro

```json
{
  "id": "theme-search-limit",
  "label": "Quantidade de referências",
  "key": "reference_limit",
  "type": "number",
  "value": 10,
  "placeholder": "De 5 a 15",
  "options": []
}
```

`type` aceita apenas `text`, `number`, `select`, `boolean`, `textarea`. O `value` deve ser texto, número ou booleano. Use `options` somente para `select` (máximo de 100 textos).

## Entrada (`inputs`)

```json
{
  "id": "theme-input-project-title",
  "label": "Tema inicial do projeto",
  "type": "text",
  "source": "project",
  "sourceKey": "title"
}
```

`source` aceita somente:

- `project`: use `sourceKey` `title` ou `deadline`;
- `previous_process`: use uma saída do processo anterior; informe `sourceKey`;
- `previous_block`: use saída de bloco anterior. `blockId` e `sourceKey` são opcionais; se presentes, devem existir;
- `channel_library`: reservado para configuração do canal; evite em JSON portátil;
- `static`: contexto fixo; informe `staticValue`.

O `type` de entrada aceita: `text`, `number`, `select`, `boolean`, `textarea`, `multiselect`, `list`, `records`, `datetime`, `url`, `file`, `image`, `audio`, `video`, `files`, `approval`, `thumbnail_layout`.

## Saída (`outputs`)

```json
{
  "id": "theme-output-candidates",
  "label": "Temas candidatos",
  "key": "theme_candidates",
  "type": "list",
  "required": true,
  "helpText": "Uma linha por tema, com ângulo e promessa.",
  "options": []
}
```

Toda saída tem `id`, `label`, `key`, `type` e `required`. `key` é uma chave técnica única dentro do bloco. Os tipos de saída são os mesmos tipos de entrada. Para `select` e `multiselect`, `options` é opcional (máximo 100). Para `records`, inclua `recordFields`.

## Campos de registro (`recordFields`)

Use apenas quando uma entrada ou saída tiver `type: "records"`.

```json
{
  "id": "script-scene-field-visual",
  "label": "Descrição visual",
  "key": "visual_description",
  "type": "textarea",
  "required": true
}
```

Os tipos de `recordFields` são: `text`, `textarea`, `number`, `boolean`, `select`, `datetime`, `url`, `file`, `image`, `audio`, `video`. Em `select`, `options` é opcional.

## Validação (`validation`)

Use em bloco `VALIDAR`:

```json
{
  "targetBlockId": "theme-create-proposal",
  "targetOutputKey": "selected_theme",
  "mode": "approval",
  "onReject": "retry_target",
  "maxAttempts": 2
}
```

- `targetBlockId` deve identificar um bloco anterior.
- `targetOutputKey` deve ser uma saída existente desse bloco.
- `mode`: `approval`, `select_one` ou `select_many`.
- `onReject`: `retry_target` ou `pause`.
- `maxAttempts`: inteiro entre 1 e 20.

## Regra exclusiva do bloco `ESCOLHER`

`ESCOLHER` só pode selecionar elementos pré-existentes de uma Coleção da Biblioteca Estratégica do mesmo canal e exige `collectionId`. Ele não tem entradas nem saídas configuráveis no método. Todo uso deve ser acompanhado, na prévia, da coleção esperada, justificativa de pré-existência e formato dos itens. Como um arquivo importável não conhece os IDs das coleções do canal de destino, **não use `ESCOLHER` em JSON portátil**. Para toda escolha de resultado pesquisado ou criado durante o fluxo, use `VALIDAR` com `select_one` ou `select_many`.

## Checklist antes de entregar

1. O arquivo tem exatamente um `processType` e ao menos um bloco?
2. Todos os enums e nomes de campos são exatamente os deste documento?
3. `parameters` existe em cada bloco?
4. IDs são únicos e `order` é sequencial?
5. Uma referência `blockId`, `optionsSourceBlockId` ou `targetBlockId` existe e aponta para bloco anterior?
6. Toda referência `sourceKey` ou `targetOutputKey` existe na saída indicada?
