# TASK-005 — Fixture persistente representativa da 1.2.1

## Objetivo

Criar uma baseline persistente, versionada, portátil e reiniciável de uma instalação plausível do ContentFlow 1.2.1 para futuras provas de compatibilidade e upgrade.

## Estado

`done`

## Evidência Git/ambiente

- SHA inicial: `c024507ead156ec2126bbc73fe9c5f0fea9998cf`.
- Branch: `main`.
- Worktree inicial: limpo (`git status --short` sem saída).
- Node.js: `v26.5.1`.
- npm: `11.6.1`.
- Versão do produto: `1.2.1` em `package.json`.

## Design da fixture

A fixture é gerada deterministicamente em diretório temporário por `scripts/build-reliability-v121-fixture.ts`. O script usa as migrations vigentes, cria o schema persistente da aplicação, insere IDs, timestamps e dados sintéticos fixos, fecha e compacta o SQLite e materializa somente `contentflow.sqlite`, `manifest.json` e `README.md` em `test-fixtures/reliability/v1.2.1/`.

Duas gerações consecutivas produziram o mesmo SHA-256 do banco: `9F554CD07C3725457DD12AADA9E6F7FC7E6B14D2795B74BB279FF44FF8FA6CCA`. A prova oficial continua sem depender do hash binário: o teste valida estrutura e significado. O banco possui 282.624 bytes.

## Entidades incluídas

- um Canal `Fixture 1.2.1 Channel`, com ordem completa dos oito Processos e oito Métodos;
- um Projeto `Fixture 1.2.1 Project`, com `strategySnapshot` completo e revisão congelada;
- quatro `ProcessExecution`: Tema, Título e Thumbnail concluídos; Roteiro aguardando humano;
- quatro deliveries válidas, incluindo uma lista de pesquisa com dois itens;
- dois work units concluídos, com identidade, proveniência, tentativa e timestamps;
- um job de plugin terminal e sintético, com attempt, deadline, retry count, progresso e timeline;
- um perfil global sintético, vínculo explícito, readiness `not_prepared` e lease expirado;
- um Orchestrator V5 terminal `cancelled`, com plano congelado e cursor preservado;
- uma coleção estratégica e um item de Biblioteca;
- preferências globais e de Canal.

## Estado semântico representado

O Projeto representa `Tema → Título → Thumbnail` concluídos e `Roteiro` parcialmente executado. No Roteiro, `script-research` está concluído com delivery e work units, `script-draft` aguarda conclusão humana com rascunho persistido e `script-validation` continua pendente. Narração, Assets, Edição e Publicação não foram iniciados.

O job associado à pesquisa já está concluído e não pode disparar efeito externo. O Orchestrator está cancelado e não é retomado pelo bootstrap. O perfil não aponta para pasta real, não contém sessão e não está preparado.

## Schema e migration journal

O checkout vigente declara `CONTENTFLOW_SCHEMA_VERSION = 4`. A fixture é criada por `runSchemaMigrations()` e contém as quatro entradas `completed` do journal com seus passos completos. O bootstrap real executa `runSchemaMigrationsForStartup()` sobre a cópia, mantém versão/journal e não cria migration nova.

## Comportamento no primeiro bootstrap

O servidor real inicia sobre uma cópia temporária da fixture. Migrations são idempotentes; Canal, Projeto, snapshots, executions, deliveries, work units, job, perfil/vínculo/readiness, Orchestrator, Biblioteca e preferências permanecem acessíveis. As reconciliações de título, itens, work units e Biblioteca não reescrevem os payloads de domínio.

O único ajuste esperado é a remoção do lease expirado por `recoverExpired()`. Isso caracteriza a reconciliação segura sem abrir navegador ou iniciar produção.

## Comportamento após restart

Depois do primeiro encerramento, o mesmo diretório é aberto novamente pelo servidor real. O snapshot semântico completo obtido pelas APIs e pelo SQLite é idêntico ao estado após o primeiro bootstrap, e os payloads de domínio continuam byte a byte iguais aos da cópia inicial.

## Achados/gaps

- `ExecutionOrchestratorStatus` não possui estado `paused`; a fixture usa o estado existente `cancelled`, seguro e terminal, sem inventar contrato.
- O bootstrap remove o lease expirado, como esperado; perfis, vínculo e readiness permanecem.
- A limpeza normal apaga jobs terminais cujo índice `updated_at` tenha mais de sete dias. Para impedir que uma fixture histórica decaia com o relógio, o payload preserva timestamps realistas e somente a coluna operacional desnormalizada de retenção usa o anchor fixo `9999-12-31T23:59:59.999Z`, declarado no manifest e README.
- A referência de thumbnail contém somente metadata para um placeholder deliberadamente inexistente; nenhum binário de mídia foi incluído.
- A falha preexistente de `test:shared-browser-v89` continua fora do escopo.

## Arquivos alterados

- `scripts/build-reliability-v121-fixture.ts`;
- `server/reliability-v121-fixture.integration.test.ts`;
- `test-fixtures/reliability/v1.2.1/contentflow.sqlite`;
- `test-fixtures/reliability/v1.2.1/manifest.json`;
- `test-fixtures/reliability/v1.2.1/README.md`;
- `package.json`;
- `src/lib/architecture-invariants.test.ts`;
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`;
- `docs/reliability-program/04-CURRENT-STATE.md`;
- este registro histórico.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 4/4 no estado `in_progress` e repetido no estado final |
| `npm run test:v121-fixture` | pass, 2/2: estrutura/portabilidade/secrets e bootstrap/restart reais |
| `npm run test:schema-migrations` | pass, 31/31 |
| `npm run test:data-migration` | pass, 2/2 |
| `npm run test:execution-state-machine` | pass, 13/13 |
| `npm run test:validation-retry` | pass, 11/11 |
| `npm run test:fault-injection` | pass, 15/15 |
| `npm run check` | primeiro failure real conhecido em `test:shared-browser-v89`; 3/4 testes dessa suíte passam |

O gate agregado passou pela nova fixture e por todos os gates anteriores. Parou quando a capability textual do ChatGPT retornou `incrementalStrategies = undefined`, enquanto o teste espera `["per_item"]`.

## Evidência final

- banco SQLite íntegro, com schema 4, journal 4/4 completo e tamanho abaixo de 1 MiB;
- gerador repetido com hash binário estável no ambiente observado;
- ausência de caminhos pessoais e padrões óbvios de secrets validada;
- primeiro bootstrap real provou migrations idempotentes e remoção somente do lease expirado;
- restart real preservou integralmente o snapshot semântico pós-bootstrap;
- nenhum código de produção, schema, migration, contrato, versão, tag ou release foi alterado.

## Definition of Done

- [x] Fixture persistente e versionada criada.
- [x] Dados sintéticos, determinísticos, portáteis e sem secrets.
- [x] Canal, Projeto, snapshots, executions, deliveries e work unit presentes.
- [x] Estado terminal seguro de plugin, perfil/binding/readiness e Orchestrator presentes.
- [x] Bootstrap real e restart preservam o estado semântico.
- [x] Migrations aceitam a fixture sem alteração destrutiva.
- [x] Validações obrigatórias executadas e registradas.
- [x] Current State e roadmap atualizados.

## Próxima missão

TASK-006 — Criar módulo canônico do Core de execução. Está `ready`, mas não foi iniciada.
