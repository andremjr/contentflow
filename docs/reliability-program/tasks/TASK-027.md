# TASK-027 — Adapter para Métodos legados

## Estado

`done`

## Evidência inicial

- HEAD: `27c21dbcd91489595ea82ab8cdaaee5d9a2c47cb`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.
- Versão do produto: `1.2.1`.

## Objetivo de produto

Manter utilizáveis os Métodos históricos legitimamente produzidos por versões anteriores do ContentFlow por meio de uma boundary explícita, determinística e testável que entrega `ProcessMethod` canônico ao Builder, ao snapshot novo e ao runtime, sem espalhar conhecimento legado pelo Execution Core ou reinterpretar dados ambíguos.

## Problema técnico observado

O checkout inicia a TASK com compatibilidade histórica distribuída:

- `BlockInputBinding` conserva `source`, `sourceKey`, `sourceProcessType`, `blockId`, `staticValue`, `historyLimit` e `historyEligibility` ao lado de `binding`;
- `authoritativeInputSource()` e `canonicalInputBindingFromLegacy()` são usados por runtime, normalização, dependências e arquivos;
- `resolveBlockInputs()` ainda possui um caminho `legacy explicit`;
- `normalizeActionBlock()` materializa binding plano, filtra `channel_library` e converte `parameters` históricos em outputs;
- o Builder materializa portas ausentes com contexto de capability;
- schemas modernos de arquivo já exigem `VALIDAR.targetBlockId`, embora arquivos anteriores usem o mesmo envelope v1/v2 sem versão própria do contrato de Método;
- canais, `Project.strategySnapshot` e `ProcessExecution.methodSnapshot` são JSONs persistidos sem versão própria do contrato de Método;
- leitura de storage é feita por `JSON.parse()` e os snapshots podem chegar ao runtime sem uma adaptação única;
- packages transportam o manifesto sem interpretar o Método, enquanto import/export/transfer preservam os contratos contidos nele.

## Inventário concreto de representações históricas confirmadas

1. **Origem plana de input** — confirmada no domínio, testes e fixture 1.2.1. É adaptável somente quando os identificadores exigidos por `canonicalInputBindingFromLegacy()` estão completos.
2. **`channel_library` como input histórico** — confirmada pelo filtro de `normalizeActionBlock()`. Continua compatibilidade especializada de `ESCOLHER`/Biblioteca e não vira `BlockInputSourceBinding` comum.
3. **Outputs derivados de `parameters`** — confirmados em `normalizeActionBlock()` como representação anterior à lista explícita de outputs.
4. **Input de plugin sem `portKey`** — semântica histórica confirmada no parent de TASK-024; o runtime escolhia por tipo, identidade, apresentação, MIME e ordem. A TASK-027 não reproduzirá esse ranking: só materializará quando restar exatamente uma porta válida e desocupada.
5. **Output normal de plugin sem `portKey`** — semântica histórica confirmada no parent de TASK-025; havia cadeia por tipo/primeira porta/`field.key`. O adapter só aceitará uma candidata válida.
6. **`VALIDAR` sem target explícito** — semântica histórica confirmada no parent de TASK-026: o normalizador usava o último Bloco anterior não-`VALIDAR`. Essa recuperação só será permitida para Método sem versão de contrato, reconhecido pela boundary como histórico.
7. **`VALIDAR` de seleção sem output explícito** — o formato histórico escolhia output por tipo e depois por primeira posição. O adapter não reproduzirá a preferência posicional: somente um único output elegível pode ser materializado.
8. **`VALIDAR` de plugin sem `targetPortKey`** — confirmada no parent de TASK-026; será materializada somente quando existir exatamente uma porta compatível e livre.
9. **Contrato sintético de `ESCOLHER`** — confirmado e guardado como compatibilidade especializada da Biblioteca Estratégica. Não será convertido em output binding normal e não terá response mapping alterado.

## Fixture 1.2.1

A fixture persistente contém:

- Canal, `strategySnapshot` e `methodSnapshot` com input plano `previous_block + blockId + sourceKey`;
- output de plugin já com `portKey`;
- `VALIDAR` humano já com `targetBlockId` e `targetOutputKey`;
- Métodos humanos sem portas técnicas, como esperado.

Ela é prova real para adaptação de source binding e preservação de snapshots, mas não cobre sozinha portas ausentes nem `VALIDAR` sem target. Esses formatos exigem fixtures focais baseadas no código histórico versionado.

## Boundaries de entrada encontradas

- leitura de Métodos persistidos em `Channel.methods`;
- captura de `Project.strategySnapshot` a partir do Canal;
- criação de nova `ProcessExecution.methodSnapshot` manual, pelo Orchestrator e standalone;
- leitura de `ProcessExecution.methodSnapshot` histórico para retomada/retry;
- `contentflow-method` v1, pack v1 e bundle v2 em `src/lib/method-file.ts`;
- ZIP em `server/method-package.ts`, que transporta o manifesto;
- aplicação/cópia de transferência em `copyImportedBlocks()`, `copyImportedMethods()` e `/api/method-transfers/apply`;
- validação/materialização do Builder;
- save de Método do Canal.

## Decisões arquiteturais aplicáveis

- ADR-003: o runtime recebe contrato explícito; ambiguidade é diagnóstico.
- ADR-007: legado fica nas boundaries e converge para modelo canônico sem reescrever significado histórico.
- `ProcessMethod.contractVersion = 2` distinguirá contratos canônicos produzidos após esta task de representações históricas sem marcador.
- Método com `contractVersion: 2` nunca recebe fallback legado; ausência ou invalidade de binding/porta/target é erro moderno.
- Método sem marcador só é adaptado quando entra por boundary explicitamente autorizada como histórica.
- A adaptação é pura, idempotente e retorna diagnóstico/proveniência; não persiste nem migra por conta própria.
- Capabilities são contexto da boundary, não do Core. Uma adaptação de porta exige capability identificada e, para snapshots retomados, versão de plugin congelada compatível quando a porta ainda precisa ser reconstruída.
- `Project.strategySnapshot` e snapshots históricos persistidos não serão reescritos. Novas execuções podem congelar a projeção canônica produzida antes de nascerem.

## Escopo

- Criar uma boundary única `Método histórico → Método canônico` com diagnósticos tipados.
- Introduzir versão do contrato canônico de Método sem alterar a versão do produto.
- Materializar bindings estratégicos legados determinísticos.
- Materializar portas de plugin somente com uma candidata válida.
- Adaptar `VALIDAR` histórico somente nas condições inequivocamente comprovadas.
- Preservar a especialização de `channel_library` e `ESCOLHER`.
- Fazer runtime, normalização canônica e validação de dependências consumirem apenas bindings canônicos.
- Integrar a boundary em arquivos/import/package/transfer, Builder, criação de snapshots e leitura de snapshots históricos necessária à execução.
- Adicionar guardrails, fixture focal e provas de idempotência, ambiguidade, round-trip e snapshot.
- Atualizar Current State e roadmap após todas as provas.

## Fora de escopo

- response mapping geral, `responseValues.result`, `selectedItemId ?? result` e TASK-028;
- redefinição de `ESCOLHER` ou `VALIDAR`;
- nova primitiva de domínio;
- mudança de retry/recovery/attempts/cancelamento/Orchestrator;
- migration SQLite global, rewrite ansioso de canais ou snapshots;
- remoção física imediata dos campos planos históricos;
- release, versão do produto, tag, publicação ou GitHub Actions.

## Arquivos prováveis

- novo módulo em `src/lib/` para adaptação e seus testes;
- `src/lib/domain.ts`;
- `src/lib/input-source-binding.ts`;
- `src/lib/runtime-contract.ts`;
- `src/lib/human-workflow.ts`;
- `src/lib/process-order.ts`;
- `src/lib/method-file.ts`;
- `server/builder-methods.ts`;
- `server/index.ts` e helpers focais de boundary;
- testes de Method file/package/transfer, plugin ports, validação, fixture 1.2.1 e guardrails;
- `package.json` somente se uma suite focal for adicionada;
- documentos do Reliability Program.

## Invariantes

- `contractVersion: 2` é canônico e não recebe adaptação corretiva.
- Adapter nunca usa label, score, MIME, proximidade, primeira porta, primeira saída ou ordem como desempate.
- Contagem de candidatas segue `0 → diagnóstico`, `1 → materialização`, `>1 → ambiguidade`.
- `BlockFieldDefinition.key` permanece identidade estratégica; `portKey` permanece correlação técnica.
- `VALIDAR.targetBlockId` e outputs de seleção chegam explícitos ao runtime.
- `ESCOLHER` continua exclusivamente ligado à Biblioteca Estratégica.
- Execution Core não importa adapter, manifest, capability, porta nem campos planos históricos.
- Snapshot persistido antigo não é reescrito apenas por ser lido.
- Adaptar duas vezes produz o mesmo Método canônico.

## Estratégia de compatibilidade

1. Classificar o Método pela versão do contrato e pela boundary de origem.
2. Validar estrutura histórica mínima sem converter Método canônico inválido.
3. Materializar inputs, outputs históricos e targets usando apenas fatos estruturais.
4. Quando houver plugin, resolver a capability exata e materializar somente portas únicas.
5. Normalizar apresentação/defaults canônicos depois da adaptação.
6. Entregar o `ProcessMethod` versionado ao Builder/snapshot/runtime.
7. Preservar o objeto persistido original em leituras históricas; persistência só grava o canônico quando o usuário salva explicitamente o Método ou quando nasce um snapshot novo.

## Tratamento de ambiguidade

O adapter retorna diagnóstico estável com path e código. Não existe escolha automática quando:

- faltam IDs de origem;
- há zero ou várias portas compatíveis;
- há zero ou vários outputs possíveis para uma seleção histórica;
- target histórico não pode ser provado;
- capability/plugin exato necessário não está disponível;
- uma referência aponta para Bloco/output inexistente ou posterior.

## Política para snapshots

- `Project.strategySnapshot` histórico permanece congelado e não é atualizado na leitura.
- Uma nova execução adapta o Método selecionado antes de `createCanonicalProcessExecution()` e congela o resultado canônico.
- Uma execução histórica é adaptada em uma visão de boundary antes de entrar no caminho canônico; a representação persistida original não é substituída por uma leitura.
- Adaptação dependente de capability em snapshot antigo exige identidade/versionamento suficiente para não variar silenciosamente entre restarts; ausência dessa evidência falha com diagnóstico.

## Provas planejadas

- contrato moderno canônico inalterado e idempotente;
- moderno inválido sem fallback;
- inputs planos determinísticos adaptados; incompletos recusados;
- `channel_library` preservado como especialização;
- input/output/target ports únicas materializadas e ambiguidades recusadas;
- `VALIDAR` histórico recuperável adaptado; target/output ambíguos recusados;
- `ESCOLHER` sem expansão semântica;
- arquivos v1/v2, packages e transfer preservam modernos e adaptam históricos;
- snapshot antigo lido sem rewrite; nova execução recebe snapshot canônico;
- fixture 1.2.1 continua legível e executável no cenário coberto;
- guardrails removem legado do runtime/Core e impedem novas branches espalhadas.

## Definition of Done

1. Boundary explícita e testada existe.
2. Método moderno não depende dela.
3. Método moderno inválido não recebe fallback histórico.
4. Representações recuperáveis chegam canônicas ao caminho normal.
5. Ambiguidade falha explicitamente.
6. Runtime não escolhe origem/porta/target por heurística.
7. Execution Core permanece sem legado.
8. Snapshots relevantes permanecem seguros e estáveis.
9. Import/export/package/transfer afetados passam.
10. Fixture 1.2.1 passa.
11. `ESCOLHER` preserva Biblioteca Estratégica.
12. `VALIDAR` moderno preserva TASK-026.
13. TASK-028 não é antecipada.
14. Regressões 022–026 passam.
15. Guardrails impedem reexpansão.
16. Current State representa o resultado real.
17. Roadmap marca TASK-027 `done`.
18. TASK-028 vira `ready` somente depois das provas.
19. Este arquivo registra comandos e resultados reais.

## Condições de `DECISION REQUIRED`

Parar se for necessário escolher entre duas interpretações históricas, reescrever snapshots, descartar dados, inventar semântica histórica de `VALIDAR`, mudar regra de produto, ampliar `ESCOLHER`, antecipar response mapping, criar migration destrutiva ou adicionar primitiva arquitetural não determinada.

## Evidências finais

- `npm run typecheck`: passou.
- `npm run lint`: passou.
- `npm run build`: passou.
- `npm run test:legacy-method-adapter`: 9/9 testes passaram.
- `npm run test:architecture`: 8/8 testes passaram.
- `npm run test:builder-mcp`: 13/13 testes passaram.
- `npm run test:method-file`: 23/23 testes passaram.
- `npm run test:method-transfer`: 2/2 testes passaram.
- `npm run test:plugin-inputs`: 19/19 testes passaram.
- `npm run test:plugin-outputs`: 5/5 testes passaram.
- `npm run test:validation-retry`: 22/22 testes passaram.
- `npm run test:process-order`: 12/12 testes passaram.
- `npm run test:v121-fixture`: 2/2 testes passaram, incluindo bootstrap e restart reais; a API expôs o binding canônico enquanto a comparação byte a byte dos payloads de domínio confirmou ausência de rewrite por leitura.
- O adapter puro e versionado está em `src/lib/legacy-method-adapter.ts`; Builder, persistência, snapshots novos, arquivos e transferências passam pela boundary antes do caminho canônico.
- Leitura de execução histórica mantém a representação persistida original por meio de uma referência não enumerável usada na serialização, evitando rewrite por leitura.
- `resolveBlockInputs()`, `normalizeActionBlock()` e `process-order` não resolvem mais campos planos legados.
- Ambiguidade de origem, target, output ou porta produz diagnóstico; não há ranking por label, MIME, ordem ou primeira candidata.
- `valuesForPluginResponse()` e a compatibilidade especializada de `ESCOLHER` não foram alterados; a TASK-028 não foi antecipada.
