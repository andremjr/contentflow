# Validação e importação

## Auditoria do arquivo

Valide nesta ordem:

1. JSON ou pacote seguro com manifesto parseável; `format` = `contentflow-method` ou `contentflow-method-pack`; `version` = 3; `exportedAt` ISO 8601. Formatos anteriores são inválidos.
2. `processType` pertence aos oito processos e há 1–200 blocos.
3. IDs são únicos; `order` é 0, 1, 2…; `parameters` existe em todos os blocos.
4. Tipos de bloco, operadores, tipos de parâmetro, renderers e modos de validação são enums válidos.
5. Outputs têm `id`, `label`, `key`, `shape`, `required`; keys são únicas no bloco.
6. Inputs têm `shape`, `binding` canônico e campos necessários.
7. `previous_block` aponta para bloco anterior e output existente; `previous_process` declara processo e key.
8. `RecordShape.fields` tem keys únicas, shapes atômicos válidos e `required` coerente.
9. Controles de seleção têm opções compatíveis ou origem de opções anterior.
10. Cada conexão output→input é compatível em shape, schema, cardinalidade, opções, MIME e proveniência.
11. `VALIDAR` aponta para bloco anterior não-VALIDAR; `targetOutputKey` existe em modos de seleção.
12. `channel_history` usa `RecordShape`, aparece somente em `ESCOLHER`/`CRIAR` e declara origem e limite válidos.
13. Binding de plugin contém apenas campos portáteis; `connectionId`, secrets e IDs de conversa do provedor estão ausentes.
14. `plugin.conversation.reuse` aponta para bloco anterior do mesmo plugin; a mesma conexão será reassociada localmente.
15. `ESCOLHER` representa coleção pré-existente e informa que o `collectionId` precisa ser reassociado após importar.
16. Nenhum `deliveryId`, `itemId`, secret ou valor transitório está serializado.
17. Output oficial do processo é produzido no `ContentShape` correto ou há transformação explícita.

## Validação automática

Quando estiver no checkout oficial, valide com o parser/importador real de `src/lib/method-file.ts` e com as suites do repositório. O exemplo oficial desta skill é exercitado por `npm run test:skill-sync`. Não use um validador paralelo congelado como autoridade: o schema e os contratos vivos do ContentFlow prevalecem.

Use [data-compatibility.md](data-compatibility.md) para decisões que exigem transformação e confirme qualquer regra estrutural no código atual antes de gerar o arquivo final.

## Teste de aceitação mínimo

Teste um fluxo `BUSCAR/IA` → `VALIDAR/Humano`: a pesquisa produz `RecordShape/many`; a validação usa `select_one`; o output selecionado é singular e compatível com o próximo input. Teste também um caso inválido, como `image/many` → `image/one` ou `thumbnail_layout` → conteúdo `image` sem renderização; o validador deve rejeitá-lo.

## Importação

Salve preferencialmente como `nome-do-processo.contentflow-method.zip`; um conjunto usa `.contentflow-method-pack.zip`. Importe em Métodos do Canal → Processo → Importar ou na Biblioteca global de Métodos. Revise a prévia de processos anteriores, coleções e seus campos, plugins e conexões. Após importar, configure os vínculos locais e execute primeiro um Projeto de teste.
