# Checklist de revisão de Método

## Estrutura

- [ ] O JSON é parseável.
- [ ] `format` é `contentflow-method`, `version` é `3` e o Método usa `contractVersion: 3`.
- [ ] Há exatamente um `processType` válido.
- [ ] `order` é sequencial e `parameters` existe em todos os blocos.

## Blocos

- [ ] Cada bloco tem `id`, `type`, `operator` e instrução observável.
- [ ] `BUSCAR`, `CRIAR`, `ESCOLHER` e `VALIDAR` foram escolhidos pela origem do item.
- [ ] `ESCOLHER` só usa coleção estratégica pré-existente do Canal.
- [ ] Cada bloco produz saída útil, salvo a exceção configurada de `ESCOLHER`.

## Contratos

- [ ] Toda saída tem `key` única, `shape` canônico e `required`.
- [ ] Todo input tem `binding` canônico e proveniência explícita.
- [ ] `channel_history` usa `shape` de registro, está em `ESCOLHER`/`CRIAR` e possui origem/limite válidos.
- [ ] Cada output conectado possui `ValueShape` compatível com o input.
- [ ] `shape.kind: "record"` declara campos compatíveis e chaves únicas.
- [ ] Contratos de controle declaram `kind: "control"`; opções continuam metadados do campo.
- [ ] A cardinalidade `one`/`many` é preservada explicitamente.
- [ ] Arquivos são representação de `image`/`audio`/`video`, com MIME validado.
- [ ] `thumbnail_layout` continua controle e só chega a conteúdo `image` depois de renderização explícita.
- [ ] Nenhuma coerção silenciosa foi usada.

## Execução

- [ ] `VALIDAR` aponta para bloco anterior não-VALIDAR.
- [ ] `targetOutputKey` existe nos modos de seleção.
- [ ] `onReject` e `maxAttempts` foram escolhidos conscientemente.
- [ ] Output oficial do processo é alcançável e está no `ContentShape` correto.
- [ ] Reutilização de conversa aponta para bloco anterior do mesmo plugin.
- [ ] O arquivo portátil não contém `connectionId`, `collectionId`, ID real de conversa ou secret.
- [ ] Dependências locais de plugin/conta/coleção estão documentadas para reassociação.
- [ ] Não há `deliveryId`, `itemId`, secrets ou valores transitórios.

## Teste

- [ ] O validador automático foi executado.
- [ ] Foi testado um caminho válido.
- [ ] Foi testado um conflito intencional de shape/cardinalidade e o validador o rejeitou.
- [ ] O Método foi importado em Canal de teste e executado com Projeto de teste.
