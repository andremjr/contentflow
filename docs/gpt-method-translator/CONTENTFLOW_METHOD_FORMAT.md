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

| Campo                | Regra                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------- |
| `format`             | Sempre `contentflow-method`.                                                                 |
| `version`            | Sempre o número `1`.                                                                         |
| `name`               | Texto de até 200 caracteres.                                                                 |
| `exportedAt`         | Data/hora ISO 8601 válida.                                                                   |
| `method.processType` | Um: `theme`, `title`, `thumbnail`, `script`, `narration`, `assets`, `editing`, `publishing`. |
| `method.blocks`      | Lista com 1 a 200 blocos.                                                                    |

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

| Campo                             | Regra                                                  |
| --------------------------------- | ------------------------------------------------------ |
| `id`                              | Texto único no arquivo. Use minúsculas e hífens.       |
| `type`                            | Um: `BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`.          |
| `operator`                        | Um: `IA`, `Humano`, `Código`.                          |
| `collectionId`                    | Opcional. Não gere este campo para arquivos portáveis. |
| `name`                            | Opcional; até 200 caracteres.                          |
| `instructions`                    | Opcional; até 20.000 caracteres.                       |
| `inputs`, `outputs`, `parameters` | Listas; `parameters` é obrigatória, mesmo vazia.       |
| `validation`                      | Opcional; use apenas em bloco `VALIDAR`.               |
| `order`                           | Inteiro não negativo; comece em 0 e siga sem saltos.   |

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
  "id": "title-input-theme",
  "label": "Tema aprovado",
  "type": "text",
  "source": "previous_process",
  "sourceProcessType": "theme",
  "sourceKey": "theme"
}
```

`source` aceita somente:

- `project`: use `sourceKey` `title` ou `deadline`;
- `previous_process`: use uma entrega de qualquer Processo Universal anterior; informe `sourceProcessType` e `sourceKey`. `blockId` é opcional em arquivo portátil; use `__process_output__` apenas para exigir o output oficial;
- `previous_block`: use saída de bloco anterior. `blockId` e `sourceKey` são opcionais; se presentes, devem existir;
- `channel_history`: use somente como contexto de `ESCOLHER`; consulta entregas escalares de outros Projetos do mesmo Canal antes da seleção. Informe `sourceProcessType`, `blockId`, `sourceKey`, `historyLimit` (1–100) e `historyEligibility` (`completed` ou `published`). A entrada usa `type: "records"` e declara campos `value`, `project_id`, `project_title` e `recorded_at`;
- `channel_library`: origem legada reservada; a Biblioteca Estratégica continua sendo consumida exclusivamente por `ESCOLHER` e esta fonte não deve ser gerada;
- `static`: contexto fixo; informe `staticValue`.

O `type` de entrada aceita: `text`, `number`, `select`, `boolean`, `textarea`, `multiselect`, `list`, `records`, `datetime`, `url`, `file`, `image`, `audio`, `video`, `files`, `approval`, `thumbnail_layout`.

O arquivo guarda a referência estrutural `Processo / Bloco / Entrega`, nunca os IDs de uma execução. Na produção, o núcleo resolve essa referência para `deliveryId` e `itemIds` reais. Em um arquivo portátil, só declare `blockId` de outro processo quando esse ID fizer parte de um conjunto de Métodos distribuído em conjunto e for estável no canal de destino; caso contrário, prefira `sourceProcessType` + `sourceKey`.

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

## Apresentação opcional (`presentation`)

Entradas e saídas podem escolher uma forma de apresentação sem alterar o `type` técnico:

```json
{
  "type": "files",
  "presentation": {
    "renderer": "image-gallery",
    "itemType": "image",
    "acceptedMimeTypes": ["image/*"]
  }
}
```

`renderer` aceita `auto`, `text-short`, `text-long`, `list`, `tags`, `table`, `cards`, `file-list`, `image-gallery`, `audio-player`, `video-player` e `decision`. `itemType` e `acceptedMimeTypes` são restrições opcionais. Omita todo o objeto ou use `auto` quando não houver preferência; arquivos antigos sem esse campo continuam válidos. O núcleo ignora combinações incompatíveis e nunca aceita HTML, scripts ou componentes de interface nesse contrato.

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

`ESCOLHER` só pode selecionar elementos pré-existentes de uma Coleção da Biblioteca Estratégica do mesmo canal e exige `collectionId`. Ele pode receber inputs de contexto, inclusive `channel_history`, mas não possui outputs configuráveis: o núcleo materializa o item escolhido como `selectedItemId` e só aceita o ID de um item real da coleção. Todo uso deve ser acompanhado, na prévia, da coleção esperada, justificativa de pré-existência e formato dos itens. Como um arquivo importável não conhece os IDs das coleções do canal de destino, **não use `ESCOLHER` em JSON portátil**. Para toda escolha de resultado pesquisado ou criado durante o fluxo, use `VALIDAR` com `select_one` ou `select_many`.

## Checklist antes de entregar

1. O arquivo tem exatamente um `processType` e ao menos um bloco?
2. Todos os enums e nomes de campos são exatamente os deste documento?
3. `parameters` existe em cada bloco?
4. IDs são únicos e `order` é sequencial?
5. Uma referência `blockId`, `optionsSourceBlockId` ou `targetBlockId` existe e aponta para bloco/processo anterior compatível?
6. Toda referência `sourceKey` ou `targetOutputKey` existe na saída indicada?
