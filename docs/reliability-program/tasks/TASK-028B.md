# TASK-028B — Migrar dados locais para os contratos canônicos v3/v2

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Objetivo de produto

Preservar os dados reais já criados no ContentFlow enquanto a instalação local passa a usar os contratos canônicos atuais de Método v3, conteúdo/entrega e Plugin API v2, sem reintroduzir adapters no runtime normal e sem perder Canais, Projetos, execuções, Biblioteca, plugins ou perfis de navegador.

## Problema técnico observado

O checkout já opera com `ProcessMethod.contractVersion = 3`, `ValueShape`, bindings explícitos e portas explícitas de plugin. A base local ainda contém representações anteriores em `channels`, `projects`, `process_executions` e `library_collections`, incluindo `type`, `source*`, portas reutilizadas, snapshots antigos e deliveries sem `shape`.

O dry-run inicial de `scripts/migrate-user-data-v3.ts` examinou 9 Canais, 15 Projetos, 50 execuções e 9 coleções. Foram planejadas 68 atualizações, porém a escrita foi corretamente bloqueada por bindings e portas ainda ambíguos.

## Decisão arquitetural aplicável

- `docs/CONTENT_CONTRACT.md` é a autoridade exclusiva para conteúdo e `ValueShape`.
- Métodos antigos são convertidos explicitamente na fronteira de migração; o runtime canônico não recebe adapters v1/v2.
- Compatibilidade histórica permanece na fronteira, conforme ADR-007.
- O núcleo conserva identidade, ordem, estado, tentativas, deliveries e work units.
- Plugins recebem somente bindings/portas explícitos e continuam responsáveis apenas pela particularidade da ferramenta.
- Perfis físicos continuam identidades globais do núcleo. Binding, readiness e lease não são reinterpretados por esta migração.
- Browser Bridge continua protocolo compartilhado; cookies, tokens, storage de sessão e caminhos físicos não entram em snapshots ou configuração portátil.

## Ordem de execução

1. Converter campos antigos para `ValueShape` canônico.
2. Converter `source`, `sourceKey`, `sourceProcessType`, `blockId` e histórico para `BlockInputSourceBinding` explícito.
3. Converter dependências de `ESCOLHER` para campos reais da coleção selecionada quando o legado representava o item escolhido como contexto completo.
4. Materializar uma porta distinta e compatível para cada input/output de plugin.
5. Alinhar manifests/handlers usados pela instalação às capabilities reais da Plugin API v2 sem criar semântica de negócio no núcleo.
6. Converter `Project.strategySnapshot`, `ProcessExecution.methodSnapshot`, deliveries e coleções persistidas.
7. Auditar perfis, plugin-profile bindings, readiness, leases e Browser Bridge para confirmar que não dependem das taxonomias antigas de conteúdo.
8. Executar dry-run até zero diagnósticos.
9. Criar backup SQLite verificado, aplicar a migração em transação e repetir o planejamento pós-migração até zero updates/diagnósticos.
10. Validar contratos, plugins, persistência e fluxo vertical relevante.

## Fora de escopo

- Recovery TASK-029–038.
- Alterar política de retry, backoff, reconcile ou intervenção.
- Reescrever snapshots históricos sem necessidade para leitura canônica.
- Migrar cookies, tokens, storage de sessão ou credenciais.
- Release, tag, incremento de versão ou publicação.

## Invariantes

- Nenhum dado persistido é apagado para facilitar a conversão.
- Nenhum binding é escolhido apenas por label, ordem ou primeira porta compatível quando há mais de uma interpretação sem evidência histórica.
- `BlockFieldDefinition.key` continua estratégico; `portKey` continua correlação técnica.
- Cada porta de plugin usada pelo Método é explícita e shape-compatible.
- `ESCOLHER` continua selecionando item real da Biblioteca; blocos posteriores recebem campos explícitos desse item.
- Perfis físicos permanecem globais e só são compartilhados por vínculo explícito.

## Compatibilidade e recuperação

O script deve operar em dry-run por padrão. Antes de qualquer escrita ele executa `integrity_check`, cria backup em `migration-backups`, valida a cópia e aplica todas as alterações em uma única transação. Depois da escrita, um novo planejamento deve retornar zero diagnósticos e zero updates.

## Evidência de conclusão

- dry-run final antes da escrita: 9 Canais, 15 Projetos, 50 execuções, 9 coleções, 68 updates e zero diagnósticos;
- ensaio em cópia real do diretório de dados: 68 updates aplicados, backup verificado criado e replanejamento posterior com zero updates e zero diagnósticos;
- aplicação real concluída em 30/09/2026 com backup `migration-backups/contentflow-before-user-data-v3-2026-09-30T19-25-13-225Z.sqlite`;
- pós-migração real: `integrity_check = ok`, zero updates e zero diagnósticos;
- contagens preservadas após a escrita: 9 Canais, 15 Projetos, 50 execuções, 9 coleções, 22 perfis físicos, 21 vínculos plugin/perfil, 10 readiness, 74 plugin jobs e 559 receipts de comandos;
- perfis, vínculos, readiness e leases não possuem acoplamento à taxonomia antiga de conteúdo;
- os 68 `plugin_jobs` que ainda registram taxonomia anterior estão todos em estados terminais (`completed`, `failed`, `cancelled` ou `abandoned`) e foram preservados como evidência histórica;
- `execution_commands` com representações anteriores são receipts históricos idempotentes e também foram preservados, sem reescrever o resultado que foi observado na época;
- `npm run typecheck`, `npm run test:content-shape`, `npm run test:asset-generation`, `npm run test:i18n`, `npm run test:plugin-outputs`, `npm run test:channel-history`, `npm run test:plugin-package`, `npm run test:schema-migrations`, `npm run test:shared-browser-v43`, `npm run test:shared-browser-v72`, `npm run test:shared-browser-v73`, `npm run test:browser-bridge`, `npm run test:browser-plugins` e `npm run build` passaram.

## Evidências necessárias

- dry-run inicial registrado nesta task;
- testes focais do migrador e contratos;
- validação dos manifests/handlers alterados;
- dry-run final sem diagnósticos;
- caminho do backup verificado;
- aplicação real com pós-validação limpa;
- auditoria das tabelas de perfis/bindings/readiness/leases sem mudança semântica indevida.

## Definição de pronto

A base local é legível pelos contratos canônicos atuais sem fallback legado no runtime; plugins envolvidos aceitam exatamente as portas persistidas; a migração real possui backup recuperável; e os testes focais passam. A TASK-029 volta a ser a próxima missão `ready`.

## DECISION REQUIRED

Nenhuma decisão de produto está aberta no início da task. Se um dado antigo admitir mais de uma interpretação semanticamente válida e não houver evidência suficiente no próprio Método, coleção, capability ou histórico do runtime, a migração deve parar nesse item em vez de escolher silenciosamente.
