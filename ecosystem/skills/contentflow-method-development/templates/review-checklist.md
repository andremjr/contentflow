# Checklist de revisão de Método

## Estrutura

- [ ] O JSON é parseável.
- [ ] `format` é `contentflow-method` e `version` é `1`.
- [ ] Há exatamente um `processType` válido.
- [ ] `order` é sequencial e `parameters` existe em todos os blocos.

## Blocos

- [ ] Cada bloco tem `id`, `type`, `operator` e instrução observável.
- [ ] `BUSCAR`, `CRIAR`, `ESCOLHER` e `VALIDAR` foram escolhidos pela origem do item.
- [ ] `ESCOLHER` só usa coleção estratégica pré-existente do Canal.
- [ ] Cada bloco produz saída útil, salvo a exceção configurada de `ESCOLHER`.

## Contratos

- [ ] Toda saída tem `key` única, type e required.
- [ ] Todo input tem source válida e proveniência explícita.
- [ ] `channel_history` é `records`, está em `ESCOLHER`/`CRIAR` e usa origem/limite válidos.
- [ ] Cada output conectado tem type compatível com o input.
- [ ] Schema de `records` tem recordFields compatíveis e keys únicas.
- [ ] `select`/`multiselect` têm options compatíveis.
- [ ] Cardinalidade singular/coleção é preservada.
- [ ] `file`/`image`/`audio`/`video` e MIME foram validados.
- [ ] `thumbnail_layout` só chega a `image` depois de renderização explícita.
- [ ] Nenhuma coerção silenciosa foi usada.

## Execução

- [ ] `VALIDAR` aponta para bloco anterior não-VALIDAR.
- [ ] `targetOutputKey` existe nos modos de seleção.
- [ ] `onReject` e `maxAttempts` foram escolhidos conscientemente.
- [ ] Output oficial do processo é alcançável e está no tipo correto.
- [ ] Reutilização de conversa aponta para bloco anterior do mesmo plugin.
- [ ] O arquivo portátil não contém `connectionId`, `collectionId`, ID real de conversa ou secret.
- [ ] Dependências locais de plugin/conta/coleção estão documentadas para reassociação.
- [ ] Não há `deliveryId`, `itemId`, secrets ou valores transitórios.

## Teste

- [ ] O validador automático foi executado.
- [ ] Foi testado um caminho válido.
- [ ] Foi testado um conflito intencional de tipo e o validador o rejeitou.
- [ ] O Método foi importado em Canal de teste e executado com Projeto de teste.
