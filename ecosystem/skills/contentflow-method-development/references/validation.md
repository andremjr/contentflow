# Validação e importação

## Auditoria do arquivo

Valide nesta ordem:

1. JSON parseável; `format` = `contentflow-method`; `version` = 1; `exportedAt` ISO 8601.
2. `processType` pertence aos oito processos e há 1–200 blocos.
3. IDs são únicos; `order` é 0, 1, 2…; `parameters` existe em todos os blocos.
4. Types, operators, parameter types, field types, renderers e validation modes são enums válidos.
5. Outputs têm `id`, `label`, `key`, `type`, `required`; keys são únicas no bloco.
6. Inputs têm source válida e campos necessários.
7. `previous_block` aponta para bloco anterior e output existente; `previous_process` declara processo e key.
8. Records têm `recordFields` com keys únicas, tipos válidos e required coerente.
9. `select`/`multiselect` têm options compatíveis ou source de opções anterior.
10. Cada conexão output→input é compatível em tipo, schema, cardinalidade, options, MIME e proveniência.
11. `VALIDAR` aponta para bloco anterior não-VALIDAR; `targetOutputKey` existe em modos de seleção.
12. `channel_history` usa `records`, aparece somente em `ESCOLHER`/`CRIAR` e declara origem e limite válidos.
13. Binding de plugin contém apenas campos portáteis; `connectionId`, secrets e IDs de conversa do provedor estão ausentes.
14. `plugin.conversation.reuse` aponta para bloco anterior do mesmo plugin; a mesma conexão será reassociada localmente.
15. `ESCOLHER` representa coleção pré-existente e informa que o `collectionId` precisa ser reassociado após importar.
16. Nenhum `deliveryId`, `itemId`, secret ou valor transitório está serializado.
17. Output oficial do processo é produzido em tipo correto ou há transformação explícita.

## Validação automática

Use o script:

```bash
python scripts/validate_method_contract.py metodo.contentflow-method.json
```

O script verifica envelope, enums, IDs, ordem, parâmetros, outputs, referências, Histórico do Canal, bindings portáteis, continuidade de conversa, validação e conexões explícitas `previous_block`. Ele trata incompatibilidade de tipo como erro, não como aviso. Use a referência [data-compatibility.md](data-compatibility.md) para decisões que exigem transformação.

## Teste de aceitação mínimo

Teste um fluxo `BUSCAR/IA` → `VALIDAR/Humano`: a pesquisa produz `list`; a validação usa `select_one`; o output selecionado é singular e compatível com o próximo input. Teste também um caso inválido, como `files` → `file` ou `thumbnail_layout` → `image` sem renderização; o validador deve rejeitá-lo.

## Importação

Salve como `nome-do-processo.contentflow-method.json` e importe em Métodos do Canal → Processo → Importar. Após importar, configure no Canal as coleções estratégicas, plugins, contas, settings e secrets. Execute primeiro um Projeto de teste e confirme cada output pelo tipo e pelo conteúdo antes de produção.
