# Contrato de Método — referência normativa

## Envelope

```json
{
  "format": "contentflow-method",
  "version": 1,
  "name": "Nome do Método",
  "exportedAt": "2026-08-12T12:00:00.000Z",
  "method": {
    "processType": "theme",
    "blocks": []
  }
}
```

`format` é sempre `contentflow-method`; `version` é `1`; `name` tem até 200 caracteres; `exportedAt` é ISO 8601; `processType` é `theme`, `title`, `thumbnail`, `script`, `narration`, `assets`, `editing` ou `publishing`; `blocks` contém 1–200 blocos.

## Bloco

```json
{
  "id": "theme-search",
  "type": "BUSCAR",
  "operator": "IA",
  "name": "Pesquisar candidatos",
  "instructions": "Recupere fontes e liste candidatos com seus ângulos.",
  "inputs": [],
  "outputs": [],
  "parameters": [],
  "order": 0
}
```

`id` deve ser string única e estável; minúsculas com hífens são recomendadas para legibilidade. `type` é `BUSCAR`, `ESCOLHER`, `CRIAR` ou `VALIDAR`. `operator` é `IA`, `Humano` ou `Código`. `name` tem até 200 caracteres; `instructions`, até 20.000. `parameters` é obrigatória. `validation` só deve aparecer em `VALIDAR`. `order` começa em 0 e segue sem saltos.

## Parameters

```json
{
  "id": "candidate-limit",
  "label": "Quantidade",
  "key": "candidate_limit",
  "type": "number",
  "value": 10,
  "placeholder": "Ex.: 10",
  "options": []
}
```

Tipos: `text`, `number`, `select`, `boolean`, `textarea`. `value` é string, number ou boolean. `placeholder` tem até 500 caracteres. `options` só existe em `select` e suporta no máximo 100 strings.

## Inputs

A forma mínima é `{id, label, type, source}`. As fontes são:

| Fonte | Campos adicionais |
| --- | --- |
| `project` | `sourceKey`: `title` ou `deadline`. |
| `previous_process` | `sourceProcessType`, `sourceKey` e opcionalmente `blockId`. |
| `previous_block` | `blockId` e `sourceKey` quando necessário. |
| `channel_history` | `records` com `sourceProcessType`, `blockId`, `sourceKey` e `historyLimit` de 1 a 100; somente em `ESCOLHER`/`CRIAR`. |
| `channel_library` | Coleção do canal; o vínculo local precisa ser reassociado após importar. |
| `static` | `staticValue`. |

Tipos de input: `text`, `number`, `select`, `boolean`, `textarea`, `multiselect`, `list`, `records`, `datetime`, `url`, `file`, `image`, `audio`, `video`, `files`, `approval`, `thumbnail_layout`.

Nunca gravar IDs de execução. Use referências estruturais; o runtime resolve `deliveryId` e `itemIds`.

## Outputs

Toda saída contém `id`, `label`, `key`, `type` e `required`. Pode conter `placeholder`, `helpText`, `options`, `optionsSourceBlockId`, `optionsSourceKey`, `recordFields` e `presentation`. `key` deve ser única no bloco.

`optionsSourceBlockId`/`optionsSourceKey` permitem que `select` ou `multiselect` use opções de uma saída anterior. Para VALIDAR, use convencionalmente `decision`, `selected_value`, `selected_values` e `feedback`.

Quando um bloco usa plugin com continuidade declarada, `plugin.conversation` pode ser `{ "mode": "new" }` ou `{ "mode": "reuse", "sourceProcessType": "script", "sourceBlockId": "draft-script" }`. A referência é estrutural e só pode apontar para bloco anterior que use o mesmo plugin. IDs de conversa do provedor e IDs de conexão local nunca pertencem ao arquivo portátil.

O binding portátil de plugin contém `pluginId`, `pluginVersion` opcional, `capabilityId`, `configuration`, `connectionRequired` opcional e `conversation` opcional. `configuration` aceita somente valores string, number ou boolean. A exportação remove `connectionId`; a importação exige associação local quando `connectionRequired` for verdadeiro.

## Records

Para `type: "records"`, declare `recordFields` com `id`, `label`, `key`, `type` e `required`. Tipos de record field: `text`, `textarea`, `number`, `boolean`, `select`, `datetime`, `url`, `file`, `image`, `audio`, `video`. Keys internas devem ser únicas e não vazias.

## Presentation

`presentation` não muda o tipo técnico. Renderers: `auto`, `text-short`, `text-long`, `list`, `tags`, `table`, `cards`, `file-list`, `image-gallery`, `audio-player`, `video-player`, `decision`. `itemType` pode ser `text`, `record`, `file`, `image`, `audio` ou `video`. `acceptedMimeTypes` é opcional. Não aceitar HTML, scripts ou componentes de interface.

## Validation

```json
{
  "validation": {
    "targetBlockId": "theme-search",
    "targetOutputKey": "candidates",
    "mode": "select_one",
    "onReject": "retry_target",
    "maxAttempts": 2
  }
}
```

`targetBlockId` deve identificar bloco anterior não-VALIDAR. `targetOutputKey` deve existir para `select_one`/`select_many`. `mode` é `approval`, `select_one` ou `select_many`; `onReject` é `retry_target` ou `pause`; `maxAttempts` é inteiro de 1 a 20.

## Regra especial de ESCOLHER

`ESCOLHER` seleciona somente item pré-existente de coleção estratégica do mesmo canal. Ele pode aparecer em JSON portátil para preservar a estrutura, mas a exportação remove `collectionId`; depois da importação, o usuário deve associar uma coleção local antes de executar. Para selecionar resultado recém-gerado, use `VALIDAR`.

## Outputs oficiais

| Processo | Key | Type |
| --- | --- | --- |
| `theme` | `theme` | `textarea` |
| `title` | `title` | `text` |
| `thumbnail` | `thumbnail` | `image` |
| `script` | `script` | `textarea` |
| `narration` | `audio` | `audio` |
| `assets` | `assets` | `files` |
| `editing` | `video` | `video` |
| `publishing` | `url` | `url` |
