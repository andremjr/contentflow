# Dev Monitor

Infraestrutura local e opt-in para desenvolvimento e testes verticais. Não é
telemetria, suporte remoto ou interface de produto. Não envia dados para fora da
máquina, não decide execução e não substitui logging, BlockExecution ou SQLite.

O uso vigente está no [processo de desenvolvimento](DEVELOPMENT.md). Referências
de checks à Constituição ou à arquitetura-alvo preservam a origem histórica de
uma regra observada; não reativam o programa encerrado nem comprovam que todos
os objetivos desses documentos foram implementados.

## Operação

```powershell
npm run dev-monitor -- run human-theme
npm run dev-monitor -- run sandbox-faults
npm run dev-monitor -- inspect <run-id>
npm run dev-monitor -- evidence <run-id> CORE.BLOCK.REQUIRED_OUTPUTS
npm run dev-monitor -- diff <before-run-id> <after-run-id>
npm run dev-monitor -- verify <run-id>
npm run dev-monitor -- coverage
npm run test:dev-monitor
```

`human-theme` cria uma base temporária, inicia a API real, grava Canal, Projeto e
snapshot, conclui um Bloco Humano pela API, confirma delivery/output persistidos
e repete o mesmo command ID para verificar idempotência. Não acessa dados pessoais.
`sandbox-faults` executa a suite existente com o worker real e o plugin de teste.

Os bundles ficam em `.dev-monitor/runs/<id>/`, ignorado pelo Git. `run.json`
declara cenário, produtores, famílias, checks obrigatórios, SHA histórico e
integridade. `events.jsonl` é append-only. `projections.json`, `checks.json`,
`ai-digest.json` e `evidence/` são derivados. O SHA não inclui alterações locais;
preserve também o diff do checkout ao comparar revisões de código.

O runner drena stdout/stderr dos testes sem gravá-los nem mostrá-los por padrão.
Para falha funcional que não possa ser investigada por digest/projeção, execute
explicitamente o comando do cenário para obter sua asserção tradicional.
`verify` confere quantidade, schema, sequência do collector e SHA-256 do trace
persistido contra o manifesto, detectando truncamento ou alteração posterior.

O runner inicia o collector antes do processo testado, gera token efêmero e injeta
`CONTENTFLOW_DEV_MONITOR_RUN`, `CONTENTFLOW_DEV_MONITOR_ENDPOINT` e
`CONTENTFLOW_DEV_MONITOR_TOKEN`. As três variáveis são necessárias. `NODE_ENV`
sozinho não ativa nada. O endpoint aceita somente loopback IPv4 com porta aleatória.
Token não é salvo em bundle, arquivo ou stdout. Não configure essas variáveis em
uma instalação normal. O collector é iniciado somente pela ferramenta de testes.

## Camadas e protocolo v1

`server/dev-monitor/contract.ts` define um envelope estrito Zod transversal a
`core`, `profiles`, `browser_bridge`, `method` e `plugin`. IDs, entidade,
correlações e causalidade opcional são distintos de dados funcionais. O estado
de BlockExecution é identificado por executionId + blockId + tentativa; não
existe blockExecutionId independente no contrato atual.

`client.ts` oferece `devProbe()` e sink noop, sem dependência dos relatórios nos
componentes funcionais. Produtores se registram e emitem sourceSeq; o collector
atribui collectorSeq e receivedAt. ObservedAt nunca ordena a projeção.
`collector.ts` recebe frames JSONL via TCP local autenticado, limita frames,
fila de escrita e número de eventos. Não reconecta silenciosamente após erro.

O worker já usa stdout para serviços/partials. O SDK da Bridge encaminha eventos
sem payload DOM pelo prefixo interno `CONTENTFLOW_DEV_EVENT`, exclusivamente
quando o runner habilita `CONTENTFLOW_DEV_MONITOR_WORKER=1`. Cada frame possui
sequência do SDK; o runner valida e publica por um produtor proxy `bridge-sdk`,
correlacionando a invocação e a instância. O worker não recebe token do collector,
permissão nova de rede ou nova API pública de plugin. Registro/flush do proxy
ocorre no processo pai; não representa flush independente da extensão Chrome.

`projectors.ts` reconstrói entidades e lifecycles na ordem recebida, preservando
correlações e referências a eventos. `checks.ts` contém o registry versionado;
checks recebem projeções, não logs. Estado reconstruído é evidência descartável,
nunca uma fonte de verdade para runtime ou recovery.

## Pontos instrumentados

- Core: snapshots pós-commit nos comandos HTTP, criação canônica e principais
  commits de execução de plugin; Blocos/tentativas, itens, tentativas com IDs e
  deliveries, sem seus valores. Reutiliza `validateExecutionCoreInvariants()`.
- Method: versão canônica e estado dos Blocos do snapshot persistido. É um
  testemunho do mesmo commit, não uma máquina independente de Método.
- Plugin: início e terminal da invocação no runner, incluindo exceções;
  snapshots dos jobs associados aos commits observados.
- Profiles: aquisição/rejeição/liberação de lease; criação/readiness/fechamento
  e falha de startup de instâncias no BrowserSessionManager. Identidades físicas
  chegam por correlação explícita do job, nunca por inferência de pasta/alias.
- Bridge: sessão negociada e comandos com begin/end/outcome, inclusive resultado
  desconhecido. Não grava payloads do comando, URLs, seletores ou sessionToken.

## Integridade e verdicts

Registro ausente, produtor sem flush, sourceSeq com gap/reordenação, duplicata,
schema inválido, evento depois de flush, perda, frame truncado, armazenamento
com erro, domínio/família/check obrigatório ausente ou trace vazio tornam a
prova `INVALID_INSTRUMENTATION`. Ausência nunca equivale a sucesso.

`PASS` exige integridade, resultado funcional ok e checks aplicáveis sem falha.
`FAIL_SCENARIO` significa que a prova íntegra encontrou falha funcional.
`FAIL_INVARIANT` significa cenário funcional ok com violação de check.
`TIMEOUT` significa prazo excedido com prova íntegra. Incompletude prevalece:
timeout sem flush termina como `INVALID_INSTRUMENTATION`, com `functional: timeout`.
Checks sem entidades recebem `NOT_OBSERVED`, nunca PASS. `requiredChecks` do
cenário impede que um check prometido mas não exercitado valide a execução.

Flush ocorre no fim do processo testado. No Windows, encerrar um subprocesso
com kill pode impedir handlers: o teste vertical solicita um barrier autenticado
ao collector antes de encerrar a API. Eventos depois do barrier são inválidos.
O caller deve solicitá-lo somente depois das últimas asserções funcionais.

## Evidências, diff e coverage

Falhas geram slices com a entidade, correlações específicas e pais causais,
limitados a 64 eventos. `truncated` e `totalRelated` tornam o corte explícito.
O digest lista até 20 falhas e informa truncamento; `checks.json` retém todas.
O diff normaliza identidades por ordem de primeira observação e mantém relações.
Ignora timestamps e PIDs; mudanças de topologia continuam relevantes. Compara
somente cenários iguais e provas íntegras. Concorrência que mude a ordem de primeira
observação exige futuro identificador semântico explícito para comparação estável.

`coverage.ts` relaciona regras, fontes, projetores, checks e cenários que os
declaram obrigatórios. `coverageGap` indica check sem cenário; regras parciais,
adiadas e não verificáveis são distintas. É coverage de contrato, não de linhas.

## Extensão

Para novo evento: escolha uma fronteira semântica existente; use `devProbe()` e
IDs concedidos pelo Core. Proteja montagem cara com `probe.enabled`. Acrescente
metadados mínimos ao allowlist central, nunca copies de request/resposta.
Para novo check: adicione ID/version/reference/entityType/domain/evaluate ao
registry, proteja com um trace positivo e um negativo e declare cenário que o
exercita. Se faltar fato observável, classifique como parcial/deferred.
Para novo domínio: use o mesmo envelope/collector, registre produtor e flush e
declare domínio/famílias/produtores/checks mínimos no cenário. Não crie outro logger.
Para cenário vertical: registre comando fixo em `scenarios.ts`, timeout,
intenção, resultado funcional assertado e requisitos. Use base temporária e
execute o fluxo real pertinente; não promova fixture a prova de fornecedor real.

## Privacidade e desempenho

Payload é flat, pequeno e allowlisted. Envelopes e correlações são validados antes
de persistir. Não grava prompts, conteúdo de página, arquivos, DOM, screenshots,
cookies, secrets, headers, URLs ou caminhos físicos. Lease e externalReceipt
usam hash. Não implemente event kind/ID com texto de usuário ou credencial.

Inativo: sem socket, serialização, leitura de jobs ou projeção; apenas a consulta
de ativação e retorno noop nas fronteiras instrumentadas. Ativo: serialização
de metadados, buffer de socket limitado a 256 KiB, frames até 64 KiB, fila de
disco até 1 MiB e até 100.000 eventos em memória. Exceder limite invalida o run.
Não há polling do produto. O barrier usa espera curta somente no shutdown.
Não foi feita medição de CPU/RAM em hardware i3; estes limites são do devtool,
não uma nova política de concorrência do produto.

## Limites explícitos do rollout

Os cenários reais iniciais cobrem Core/Method e Plugin. Profiles e Bridge têm
instrumentação e checks, mas ainda não possuem cenário monitorado de Chrome
real com provider autenticado. Testes existentes de Bridge usam doubles de CDP;
isso não comprova uma jornada real dos cinco domínios.

Binding/readiness persistidos, heartbeat/expiração recuperada, crash depois de
startup, reconexão/snapshot/reconciliação da extensão, criação/claim de unidade
antes do efeito, recovery/retry e renderer ainda não possuem todos os eventos
necessários. Caminhos de preparação/cancelamento/lanes que não fornecem profileId
explícito permanecem com correlação parcial. A política funcional dessas áreas
nunca é inferida ou alterada pelo monitor. Outputs required são verificados por
presença, não por revalidação material; a boundary continua sua autoridade.
Nem todo caminho de persistência legado passa pelos commits instrumentados.
É por esses motivos concretos que a matriz não declara coverage completa.

## Uso pela skill

`development-contentflow` identifica a fronteira afetada, seleciona o cenário e
lê primeiro ai-digest. PASS não justifica abrir logs completos. Para falha, segue
checks específicos → slices → projeções relevantes → events.jsonl somente se
necessário → logs tradicionais. Instrumentação inválida é investigada antes de
confiar no cenário. Depois da correção, repete o mesmo cenário e usa diff para
comprovar resolução, integridade e ausência de novas violações.
