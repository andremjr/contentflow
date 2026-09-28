# Current State

Estado verificado em 28/09/2026 contra o checkout real, incluindo alterações ainda não commitadas.

| Campo | Estado atual |
| --- | --- |
| Baseline original observado | `4ba92a834daef05d8c57fa871530ba935c5c9422` |
| Commit atual | `4ba92a834daef05d8c57fa871530ba935c5c9422` em `main` |
| Versão | `1.2.1` |
| Working tree | Não limpa; o diagnóstico considera o conteúdo atual do checkout, não apenas o commit |
| Task concluída | TASK-000 |
| Task ativa | Nenhuma |
| Próxima | TASK-001 (`ready`), ainda não iniciada |

Este arquivo representa somente o estado atual. O histórico de cada trabalho pertence à respectiva especificação em `tasks/` e ao Git; fatos substituídos devem ser removidos daqui em vez de acumulados como changelog.

## Product validation already observed

O ContentFlow já foi usado em aulas e testes reais com alunos para executar Métodos diferentes que produziram:

- temas;
- títulos;
- thumbnails;
- roteiros.

Narração e assets visuais ainda não receberam a mesma amplitude de validação real, principalmente pelo custo superior de geração e teste.

Consequentemente, o produto não é apenas conceitual e o início do pipeline já possui validação de uso real. O foco atual do programa é consolidar arquitetura e confiabilidade sem ampliar a gramática ou adicionar features desconectadas desse objetivo.

## Architecture currently present

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) continua sendo a fonte normativa do domínio atual: 8 Processos Universais, 4 Blocos Essenciais, 3 Operadores e 3 interfaces de domínio.
- Projetos podem congelar a ordem e os Métodos do Canal em `strategySnapshot`; cada `ProcessExecution` também conserva seu `methodSnapshot`.
- A máquina de execução atual está dividida entre `server/execution-commands.ts`, funções e rotas de `server/index.ts`, scheduler de jobs de plugin e reconciliação do Orchestrator.
- O Orchestrator novo cria filas com `strategyVersion = 5`, ordem congelada e slots elegíveis. Versões históricas continuam aceitas.
- O núcleo persiste execuções, jobs, unidades, deliveries, perfis, bindings, readiness, leases, filas e journals em SQLite, ainda com parte relevante do comportamento concentrada no servidor HTTP.
- Plugin API, Browser Bridge, React, Express, SQLite, filesystem e formatos históricos ainda não estão completamente isolados do Core canônico descrito na arquitetura-alvo.

## Reliability capabilities already present

As capacidades abaixo existem no checkout atual e constituem base a preservar, caracterizar e convergir:

- **strategy snapshots:** `Project.strategySnapshot`, captura da ordem e dos Métodos e `ProcessExecution.methodSnapshot`;
- **work units:** `BlockExecutionItem` com identidade do núcleo, proveniência, tentativa, estado durável, receipt e histórico;
- **deliveries:** `ProjectDelivery` e `DeliveryItem`, incluindo materialização, invalidação e promoção de outputs;
- **durable plugin jobs:** tabela/store `plugin_jobs`, claims, deadlines, retries, partials, artifacts, cancelamento e recuperação após restart;
- **browser profiles globais:** identidades físicas em `browser_profiles`, separadas dos plugins;
- **plugin-profile bindings:** vínculos explícitos em `plugin_profile_bindings`, sem fusão silenciosa por alias;
- **readiness por vínculo:** estado específico de plugin + perfil;
- **leases:** lock persistente por perfil físico, token, TTL, heartbeat e liberação;
- **profile lanes:** pool multiperfil, distribuição exclusiva de unidades, falha de lane e reconciliação;
- **recovery policy:** `decideExecutionRecovery()` distingue `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`;
- **migration journal:** schema versionado com journal, passos, estados `started/completed/failed` e recuperação de migração interrompida;
- **Orchestrator V5:** elegibilidade por slots, ordem congelada e retomada de filas persistidas;
- **testes extensos:** 117 arquivos de teste e 79 scripts `test*` no `package.json` no momento da inspeção.

Existência não significa convergência completa com a arquitetura-alvo. Essas capacidades ainda passam por caminhos de aplicação diferentes e precisam de characterization tests antes de consolidação.

## Known convergence gaps

### Servidor concentrado

`server/index.ts` possui atualmente 8.907 linhas e 102 declarações de rotas Express. O arquivo combina HTTP, persistência, lifecycle de plugins, criação e aplicação de execuções, recovery, Orchestrator, reconciliação e inicialização de storage.

Os números são uma fotografia, não invariantes. O problema arquitetural é a concentração de responsabilidades, não atingir uma contagem específica de linhas.

### Autoridade de execução duplicada

- `server/execution-commands.ts` cria `ProcessExecution` para o fluxo de comandos e conclui trabalho humano.
- `startOrchestratedProcess()` em `server/index.ts` possui outra construção de `ProcessExecution`.
- `POST /api/executions` ainda aceita e persiste uma representação recebida pela borda legada.
- conclusão e avanço de plugin permanecem aplicados por caminhos próprios em `server/index.ts`.

O comportamento converge em vários pontos, mas ainda não existe um único módulo canônico que decida e aplique todas as transições.

### Resolução heurística de inputs

`resolveBlockInputs()` em `src/lib/runtime-contract.ts` ainda seleciona candidatos compatíveis e os ordena por `labelScore()`. Isso permite que semelhança textual participe da escolha em runtime quando não existe binding explícito, em conflito com o estado alvo de bindings determinísticos.

### Mapeamento permissivo de outputs

`valuesForPluginResponse()` em `server/index.ts` ainda tenta, nesta ordem, chave do campo, `portKey` do contrato e o fallback genérico `responseValues.result`. O caminho de `ESCOLHER` também aceita `selectedItemId ?? result`. Esse comportamento pode transformar resposta ambígua em aparente sucesso e precisa migrar para outputs explícitos com adapter legado delimitado.

### Recovery decidido de forma mais rica do que é aplicado

`decideExecutionRecovery()` produz seis decisões: `cancel`, `reconcile`, `intervene`, `switch_profile`, `retry` e `fail`.

Nos principais caminhos de falha de plugin em `server/index.ts`, somente `switch_profile` e `retry` recebem aplicação dedicada. As demais decisões terminam, em geral, no mesmo caminho `markPluginJobFailed()`, embora a mensagem de produto varie. `PluginJobStatus` ainda não possui estados duráveis próprios para `reconcile` e `intervene`.

Assim, a política já reconhece efeito incerto e intervenção, mas sua aplicação e retomada não são ainda simétricas, universais e duráveis.

### Compatibilidade histórica dentro dos caminhos normais

- `ExecutionOrchestrator.strategyVersion` aceita versões 1, 2, 3, 4 e 5.
- o servidor mantém caminhos específicos para V5 e planejamento/reconciliação das versões anteriores;
- `legacyItemOrchestration()` reconstrói identidade depois da conclusão de handlers agregados antigos;
- o startup executa reconciliação de títulos, itens armazenados, normalização de work units e migração de itens da Biblioteca;
- conexões e perfis antigos continuam passando por resolvers e migrações de compatibilidade.

Esses caminhos preservam instalações existentes, mas parte da reconciliação semântica ainda ocorre no bootstrap e no fluxo principal em vez de convergir por adapters delimitados.

## Known test gaps

Existem suites importantes para arquitetura, ordem de Processos, jobs persistentes, restart de componentes, Browser Bridge, perfis, lanes, migrações, plugins e contratos. Ainda não existe um gate único que prove, em conjunto:

- jornada automática completa dos 8 Processos;
- fault injection determinístico;
- restart em todos os estados relevantes;
- cinco vídeos desacompanhados;
- efeito externo incerto e reconciliação;
- endurance;
- comportamento de recursos em máquina fraca.

Testes parciais de restart e efeito incerto existem, especialmente em jobs, Orchestrator e Browser Bridge. Eles não substituem o Reliability Gate integrado definido para TASK-052.

O `npm run check` não está verde no worktree atual: a execução observada na TASK-000F parou no lint com 135 erros de Prettier e um warning de Fast Refresh em arquivos preexistentes ao escopo documental. TASK-001 deve congelar esse fato com evidência atualizada, sem misturar formatação ampla e não revisada ao baseline.

## Governing references

As decisões permanentes não são duplicadas neste snapshot. Consulte a [`Constituição`](00-PRODUCT-CONSTITUTION.md), a [`Arquitetura-alvo`](01-TARGET-ARCHITECTURE.md) e os [`ADRs`](decisions/README.md). A sequência oficial permanece TASK-001–TASK-052, com TASK-052 como Reliability Gate final; especificações são criadas just-in-time conforme o [`Working Protocol`](05-WORKING-PROTOCOL.md).

## Blockers

Não há blocker externo confirmado para preparar a especificação da TASK-001. Sua criação e implementação ainda exigem autorização explícita.

O worktree não está limpo e o gate agregado `npm run check` não está verde. Isso é uma condição de baseline a ser registrada e tratada explicitamente, não permissão para resetar, sobrescrever ou formatar em massa trabalho existente.
