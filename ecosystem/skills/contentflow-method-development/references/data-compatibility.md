# Compatibilidade de dados entre blocos

A compatibilidade entre blocos é um requisito de aceitação. Nunca conecte um output a um input apenas porque os labels são parecidos. Valide a conexão por `type`, schema interno, cardinalidade, obrigatoriedade, opções, proveniência e uso semântico.

## Regra de conexão

Para cada input conectado, registre mentalmente ou em uma matriz:

```text
origem: processo/bloco/output key
origem.type: tipo universal
origem.schema: recordFields/options/itemType/MIME
origem.cardinality: singular ou coleção
origem.required: obrigatoriedade declarada no output
↓ conversão explícita, se existir
entrada: bloco/input
entrada.type: tipo universal
entrada.schema: recordFields/options/itemType/MIME
entrada.cardinality: singular ou coleção
entrada.disponibilidade: a referência precisa ser resolvível para o bloco executar
```

A conexão só é válida se o tipo técnico e a forma do valor forem compatíveis. `label` e `helpText` não alteram o schema.

## Matriz de compatibilidade padrão

| Output → Input | Status | Observação |
| --- | --- | --- |
| mesmo tipo universal | Compatível | Ainda valide schema, cardinalidade e options. |
| `text` → `textarea` | Compatível com promoção | Texto curto pode ser consumido como texto longo. |
| `textarea` → `text` | Condicional | Só se houver limite explícito e validação de tamanho; prefira não conectar. |
| `list` → `list` | Compatível | Valide item type/schema; lista não é record automaticamente. |
| `records` → `records` | Compatível condicional | Keys, tipos e required dos `recordFields` devem ser compatíveis. |
| `select` → `select` | Compatível condicional | Options devem coincidir ou a entrada deve aceitar subset explicitamente. |
| `multiselect` → `multiselect` | Compatível condicional | Valide options e cardinalidade múltipla. |
| `list` → `multiselect` | Não conectar diretamente | Use bloco/conversão explícita que produza seleção tipada. |
| `select` → `text` | Não conectar diretamente | Use output textual explícito ou conversão declarada. |
| singular → coleção | Não conectar diretamente | Produza `list`, `files` ou `records` conforme o contrato. |
| coleção → singular | Não conectar diretamente | Use `VALIDAR/select_one` ou transformação explícita. |
| `file` → `image` | Condicional | Só se MIME e semântica garantirem que o arquivo é imagem. |
| `image` → `file` | Compatível condicional | Não perder tipo; prefira input `image` se a operação exige imagem. |
| `files` → `file` | Não conectar diretamente | Selecione um arquivo antes, ou mude o input para `files`. |
| `audio` → `video` | Incompatível | Não confundir mídia com container. |
| `video` → `image` | Incompatível sem extração | Exija bloco Código que extraia frame. |
| `thumbnail_layout` → `image` | Incompatível sem renderização | Use `CRIAR/Código` para renderizar layout. |
| `url` → `file` | Incompatível | URL pode ser referência; faça download controlado em bloco próprio. |
| `datetime` → `text` | Condicional | Só com formatação explícita e output text. |
| qualquer → `approval` | Não conectar como valor | `approval` é decisão de VALIDAR, não um recipiente genérico. |

A tabela é uma política de segurança de schema, não uma lista de coerções automáticas. Se uma conversão não estiver claramente prevista, crie um bloco intermediário com output no tipo esperado e explique a transformação.

## Records

Considere dois schemas de `records` compatíveis somente quando:

1. as keys necessárias existirem no destino;
2. cada key compartilhada tiver tipo compatível;
3. `required: true` no destino tiver origem garantida;
4. `select` tiver opções compatíveis;
5. records não mudarem de cardinalidade ou ordem sem regra explícita.

Um record com campos `topic`, `angle` e `source` não pode alimentar diretamente um record que exige `scene_id`, `voiceover`, `visual_description` e `duration_seconds`. Use `CRIAR` ou Código para transformar os registros.

## Selects e decisões

`select` e `multiselect` carregam opções. Não ligue uma lista de strings a um select sem declarar como as opções são derivadas. `VALIDAR/select_one` deve consumir a saída pesquisada/gerada e produzir um valor singular compatível com o próximo input. `VALIDAR/select_many` produz coleção de escolhas; não a conecte a input singular.

## Mídia e arquivos

Valide o tipo semântico e o MIME. `file` é genérico; `image`, `audio` e `video` são tipos especializados. `files` é coleção. `thumbnail_layout` é composição estruturada e não imagem. Para converter, use um bloco declarado e produza o output correto; não dependa apenas de extensão de arquivo.

## Proveniência e output oficial

`previous_process` aponta para uma entrega de processo anterior, não para qualquer texto parecido. Antes de conectar, confirme que a key existe na saída declarada e que o processo anterior aparece antes na ordem universal. `previous_block` deve apontar para bloco anterior do mesmo Método.

O output final oficial deve ser produzido no tipo esperado:

| Processo | Tipo esperado |
| --- | --- |
| `theme` | `textarea` |
| `title` | `text` |
| `thumbnail` | `image` |
| `script` | `textarea` |
| `narration` | `audio` |
| `assets` | `files` |
| `editing` | `video` |
| `publishing` | `url` |

## Política de falha

Se houver conflito de tipo, não “corrija” renomeando labels, não remova o campo obrigatório e não force uma coerção silenciosa. Pare a geração do JSON, descreva a origem do conflito e faça uma destas ações:

- alterar o output para o tipo realmente produzido;
- alterar o input para o tipo realmente consumido;
- inserir bloco intermediário de transformação;
- separar singular e coleção;
- declarar schema `recordFields` ou `options` compatível;
- pedir esclarecimento ao usuário.

Um Método só está pronto quando todas as conexões têm justificativa de compatibilidade.
