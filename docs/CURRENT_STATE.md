# Estado atual e limites de validação

Revisão documental: 01/10/2026. Esta descrição corresponde ao checkout inspecionado, incluindo alterações locais; não afirma que todas elas estejam em uma release publicada. Versão declarada em `package.json`: `1.3.1`. HEAD, branch e alterações devem ser consultados ao vivo.

## Produto disponível

O ContentFlow organiza Canais e Projetos, permite criar, importar e compartilhar Métodos v3 e executar Blocos humanos sem plugins. Biblioteca Estratégica, snapshots, entregas tipadas, aprovações e filas compõem o produto atual. Plugins independentes da API v2 acrescentam automação por APIs, código local ou Browser Bridge, após instalação, configuração e consentimento.

O checkout contém criação e transições canônicas em `src/lib/execution-core/`, comandos em `server/execution-commands.ts`, jobs persistentes, normalização de respostas, deliveries e persistência SQLite. `server/index.ts` integra essas operações à API, scheduler e Orchestrator. O scheduler atual usa até quatro workers de plugin; limites de capability e leases por perfil também se aplicam. Isso não constitui um governador adaptativo global de recursos.

Perfis físicos globais, bindings explícitos de plugin, readiness por vínculo, leases exclusivos e lanes sobre perfis distintos estão implementados. A Browser Bridge negocia protocolo/capabilities e transporta operações autorizadas; particularidades de página permanecem nos plugins. Veja [arquitetura](ARCHITECTURE.md), [contrato de conteúdo](CONTENT_CONTRACT.md) e [automação de navegador](ecosystem/browser-automation.md).

## Limitações funcionais e arquiteturais

- Métodos são lineares; o canvas não oferece ramificações, junções, loops ou dependências genéricas entre unidades. Paralelismo de perfis distribui unidades de um Bloco, sem duplicar o Método. Checkpoints humanos intercalados em cada unidade de uma capability não são uma primitiva genérica do canvas.
- A fila do Orchestrator avança um item por vez. Espera humana ou erro pausa a fila afetada; outras filas/Canais podem avançar independentemente. Não há promessa de progresso independente de todos os Projetos dentro da mesma fila.
- A política `decideExecutionRecovery()` distingue reconciliação e intervenção, mas o caminho principal de erro de plugin ainda as materializa como falha com mensagem específica. `PluginJobStatus` não possui estados duráveis próprios para essas duas decisões. Reconciliação/retomada automática universal não está comprovada nem deve ser prometida.
- Parte da coordenação permanece concentrada em `server/index.ts`; a existência do Core puro não significa isolamento completo de todos os caminhos de execução. Filas históricas e migrações operacionais ainda possuem tratamento específico.
- Métodos v1/v2 e Plugin API v1 são inválidos. Preservação e migração recuperável de storage operacional não equivalem a adaptação desses contratos.
- Automação depende de configuração local, login, cotas e comportamento do provedor. A extensão é carregada manualmente por perfil; headless universal não é uma capacidade garantida. Mudança de DOM, CAPTCHA ou desafio de segurança pode exigir intervenção.
- Distribuição documentada: Windows x64. A versão portátil não se substitui automaticamente; o aviso do Windows pode ocorrer enquanto não houver assinatura digital comercial.

## Limites das evidências

O [registro anterior de uso](reliability-program/04-CURRENT-STATE.md) relata aulas e cenários reais de tema, título, thumbnail e roteiro. Narração e assets não tiveram a mesma amplitude de validação. Esse relato é histórico, não um novo teste executado por esta revisão documental.

O cenário de assets com análise textual, relações entre personagens/cenas e geração no Flow possui [evidência parcial](reliability-program/tasks/TASK-028D.md); a jornada completa de referências para todas as cenas não foi demonstrada nesse registro. Encerrar o programa não encerra nem aprova esse cenário.

Há suites de contratos, execução, persistência, plugins, Browser Bridge, perfis e migrações. Não há evidência única abrangente de oito Processos automáticos, cinco vídeos desacompanhados, restart em todas as fronteiras, efeitos incertos, endurance e recursos em hardware fraco. Isso delimita afirmações de validação; não cria um backlog obrigatório.

O [Dev Monitor](DEV_MONITOR.md) cobre inicialmente `human-theme` (HTTP/Core/delivery) e `sandbox-faults` (worker real). Chrome/provedor autenticado, renderer e várias fronteiras de recovery, binding/readiness, heartbeat e restart têm cobertura parcial ou ausente. O monitor não mediu CPU/RAM em i3 e não revalida materialmente todos os outputs; sua matriz de coverage explicita esses limites.

Melhorias são escolhidas e validadas no [fluxo de desenvolvimento vertical](DEVELOPMENT.md). Ideias de integração e tarefas históricas não são capacidades disponíveis nem pré-requisitos para usar o produto.

