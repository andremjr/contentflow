# Contrato canônico de conteúdo

Este documento é a fonte normativa para entradas, saídas, portas de plugin, valores entre Blocos, outputs de Processo e deliveries do ContentFlow.

## Conteúdo

Todo conteúdo pertence a exatamente uma destas famílias:

- `text`
- `image`
- `audio`
- `video`

Não existem famílias `file`, `files`, `list`, `records`, `artifact`, `media`, `mixed` ou equivalentes.

Um conteúdo é descrito por um único `ContentShape`:

```ts
type ContentShape = {
  kind: "content";
  family: "text" | "image" | "audio" | "video";
  cardinality: "one" | "many";
  representation: "inline" | "artifact" | "either";
  formats?: {
    mimeTypes?: string[];
    extensions?: string[];
  };
};
```

Cardinalidade é sempre explícita. O runtime não a deduz de arrays, nomes, renderers ou MIME.

`artifact` é representação, não família. Texto pode ser inline ou artifact — por exemplo TXT, Markdown e SRT continuam sendo `family: "text"`. Imagem, áudio e vídeo usam representação `artifact`.

## Controle e estrutura

Valores que não são conteúdo usam contratos separados:

```ts
type ControlShape = {
  kind: "control";
  control:
    | "identifier"
    | "number"
    | "boolean"
    | "selection"
    | "datetime"
    | "url"
    | "approval"
    | "thumbnail_layout";
  cardinality: "one" | "many";
  options?: string[];
};

type RecordShape = {
  kind: "record";
  cardinality: "one" | "many";
  fields: Array<{
    id: string;
    label: string;
    key: string;
    shape: ContentShape | ControlShape;
    required: boolean;
  }>;
};

type ValueShape = ContentShape | ControlShape | RecordShape;
```

`approval` e seleção editorial continuam sendo controle do `VALIDAR`. IDs, datas, URLs administrativas, parâmetros, estado e configuração de plugin não se tornam conteúdo. Registros descrevem estrutura e não uma quinta família.

## Um contrato em todas as fronteiras

`BlockInputBinding`, `BlockFieldDefinition`, portas de plugin, `PluginInputContract`, `PluginFieldContract` e `ProjectDelivery` carregam `ValueShape` diretamente.

O mesmo shape vale para Humano, IA e Código. O executor muda; a semântica da entrega não muda. Uma saída humana `image/many` e uma saída de plugin `image/many` materializam deliveries equivalentes.

Métodos usam `contractVersion: 3`. Plugins usam `apiVersion: "2"`. Contratos anteriores não são adaptados pelo caminho canônico.

Cada porta de plugin declara exatamente um `shape`. Não existem `acceptedTypes`, `producedTypes`, `acceptedInputTypes`, `producedOutputTypes`, `multiple` ou `deliveryTypes`. A cardinalidade da porta está no próprio shape e a porta continua sendo a autoridade determinística do binding.

## Compatibilidade

Dois shapes são compatíveis somente quando:

- possuem o mesmo `kind` e a mesma cardinalidade;
- conteúdos possuem a mesma família e representação material compatível;
- restrições MIME/extensão se sobrepõem;
- controles possuem o mesmo tipo e opções compatíveis;
- registros satisfazem os campos obrigatórios por chave e shape.

Não há promoção implícita, inferência por label, coerção de escalar para coleção, seleção da primeira porta nem conversão automática de arquivo.

## Múltiplas famílias

Um Bloco que produz famílias diferentes usa portas diferentes. Exemplo:

```json
{
  "outputs": [
    { "key": "images", "shape": { "kind": "content", "family": "image", "cardinality": "many", "representation": "artifact" } },
    { "key": "videos", "shape": { "kind": "content", "family": "video", "cardinality": "many", "representation": "artifact" } }
  ]
}
```

Não existe porta genérica de assets ou mixed media.

## Apresentação

`presentation` escolhe apenas um renderer permitido. Ele não altera família, cardinalidade, representação ou formatos. Restrições MIME e extensões pertencem a `ContentShape.formats`.

Formulários humanos e viewers são derivados do mesmo `ValueShape` usado por plugins. Nenhuma UI cria um tipo semântico paralelo.

