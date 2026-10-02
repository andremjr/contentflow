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
  open?: true;
  fields: Array<{
    id: string;
    label: string;
    key: string;
    shape: ContentShape | ControlShape;
    required: boolean;
    referencesInputId?: string;
  }>;
};

type ValueShape = ContentShape | ControlShape | RecordShape;
```

`approval` e seleção editorial continuam sendo controle do `VALIDAR`. IDs, datas, URLs administrativas, parâmetros, estado e configuração de plugin não se tornam conteúdo. Registros descrevem estrutura e não uma quinta família. `open: true` existe somente em portas polimórficas de plugin: o Método continua declarando os campos concretos da entrega e a porta aceita essa estrutura sem inferir significado por nomes mágicos.

`referencesInputId` só é válido em campo `identifier`. Ele declara que cada ID desse campo deve pertencer aos itens concedidos à entrada indicada. O núcleo valida essa relação, persiste-a entre IDs de itens e propaga a proveniência; ele não interpreta o significado editorial da relação.

## Um contrato em todas as fronteiras

`BlockInputBinding`, `BlockFieldDefinition`, portas de plugin, `PluginInputContract`, `PluginFieldContract` e `ProjectDelivery` carregam `ValueShape` diretamente.

O mesmo shape vale para Humano, IA e Código. O executor muda; a semântica da entrega não muda. Uma saída humana `image/many` e uma saída de plugin `image/many` materializam deliveries equivalentes.

Métodos usam `contractVersion: 3`. Plugins usam `apiVersion: "2"`. Contratos anteriores não são adaptados pelo caminho canônico.

Cada porta de plugin declara exatamente um `shape`. Não existem `acceptedTypes`, `producedTypes`, `acceptedInputTypes`, `producedOutputTypes`, `multiple` ou `deliveryTypes`. A cardinalidade da porta está no próprio shape e a porta continua sendo a autoridade determinística do binding.

## Compatibilidade

Como regra, dois shapes são compatíveis somente quando:

- possuem o mesmo `kind` e a mesma cardinalidade;
- conteúdos possuem a mesma família e representação material compatível;
- restrições MIME/extensão se sobrepõem;
- controles possuem o mesmo tipo e opções compatíveis;
- registros satisfazem os campos obrigatórios por chave e shape.

Não há promoção implícita, inferência por label, coerção de escalar para coleção, seleção da primeira porta nem conversão automática de arquivo.

### Contração explícita de texto na entrada

Existe uma única operação de consumo entre cardinalidades: uma entrada `text/one/inline` (ou `either`) pode ligar-se a uma saída `text/many/inline`. Nesse caso, a saída continua sendo uma delivery `many`, com um ID por item, mas o runtime apresenta ao executor um único texto, unindo os itens em ordem com uma linha em branco. Para aquele Bloco, o valor recebido é uma unidade escalar; isso não reescreve a delivery de origem nem apaga seus IDs, e os itens completos continuam disponíveis em `inputDeliveries` para correlação estruturada.

A direção inversa não existe. A regra também não se aplica a imagem, áudio, vídeo, artifacts, controles ou registros. Converter várias mídias, selecionar um item ou produzir outro formato exige um Bloco/capability explícito.

## Saídas estruturadas e relações semânticas

O usuário escreve a intenção editorial do Bloco. Quando a saída exige `text/many` ou `record/many`, o executor é responsável por acrescentar a instrução técnica de serialização apropriada à ferramenta, analisar a resposta e devolver exatamente o valor tipado da porta. Texto introdutório, Markdown ou comentários não podem ser promovidos silenciosamente a itens.

O núcleo valida cardinalidade, estrutura, campos obrigatórios e IDs concedidos antes de aceitar a resposta. Ele não executa análise semântica. Uma associação como “personagem X aparece nas cenas A e C” é uma decisão do Bloco semanticamente capaz. Em contratos internos estruturados existentes, pode ser representada por um campo `identifier` com `referencesInputId`. Nos novos Métodos estratégicos, pode ser conteúdo de texto JSON com IDs: o plugin produtor fornece os IDs concedidos e valida seu formato, e o plugin consumidor resolve as referências pela proveniência das entregas. O Core não analisa esse texto nem escolhe os personagens. O plugin consumidor recebe os registros, as deliveries e seus IDs; cabe a ele traduzir a associação validada para o mecanismo específico da ferramenta, como anexar imagens de referência, aplicar legendas ou posicionar assets.

Quando uma capability é orquestrada item a item sobre uma saída `many`, cada unidade pode devolver um valor atômico ou várias variantes atômicas compatíveis com o mesmo shape. O núcleo valida cada variante, agrega todas na delivery e preserva em cada uma a mesma linhagem da unidade e do item de origem. Uma lista devolvida por uma unidade não autoriza misturar famílias, estruturas inválidas ou IDs não concedidos.

## Múltiplas famílias

Um Bloco que produz famílias diferentes usa portas diferentes. Exemplo:

```json
{
  "outputs": [
    {
      "key": "images",
      "shape": {
        "kind": "content",
        "family": "image",
        "cardinality": "many",
        "representation": "artifact"
      }
    },
    {
      "key": "videos",
      "shape": {
        "kind": "content",
        "family": "video",
        "cardinality": "many",
        "representation": "artifact"
      }
    }
  ]
}
```

Não existe porta genérica de assets ou mixed media.

## Apresentação

No editor estratégico de Métodos, entradas e saídas visíveis são exclusivamente conteúdo
(`text`, `image`, `audio`, `video`). Não há seletor de conteúdo/controle/registro nem
editor manual de estrutura nessa superfície. Controles e registros existentes continuam
preservados no contrato interno, nos bindings, na persistência e no runtime; a projeção
visual não os converte em texto nem os apaga. Sugestões substituem somente entregas
de conteúdo, preservando os campos internos e suas chaves.

Um JSON ou SRT pode ser uma entrega de texto, inline ou artifact, aceita explicitamente
pela porta do plugin. Isso não equivale a `RecordShape`: o núcleo não interpreta JSON
textual automaticamente como relações entre IDs. Reconhecimento e validação dessas
relações por uma nova interação devem ter contrato explícito antes da implementação.
Interações intuitivas de associação serão definidas separadamente; remover o seletor
não as torna disponíveis.

O Builder MCP publica essa regra em `strategicFields`, nas instruções e no contrato
consultável. Validação/aplicação rejeitam novos campos estratégicos `control`/`record`,
preservam shapes/bindings internos existentes e permitem os mecanismos nativos de
decisão de `VALIDAR`, identidade de `ESCOLHER` e Histórico do Canal. Os outputs oficiais
de Processo e o protocolo de plugins não são redefinidos por essa projeção de edição.

`presentation` escolhe apenas um renderer permitido. Ele não altera família, cardinalidade, representação ou formatos. Restrições MIME e extensões pertencem a `ContentShape.formats`.

Formulários humanos e viewers são derivados do mesmo `ValueShape` usado por plugins. Nenhuma UI cria um tipo semântico paralelo.
