# TASK-028A — Contrato canônico de conteúdo

## Estado

`in_progress`

## Objetivo de produto

Reorganizar entradas, saídas e entregas do ContentFlow em torno das quatro famílias de conteúdo — texto, imagem, áudio e vídeo — com cardinalidade e representação explícitas, preservando contratos separados para controle, metadata e estrutura.

Humano, IA e Código devem produzir e consumir o mesmo contrato do Bloco. Depois da conclusão, nenhum consumidor pode precisar descobrir qual operador produziu a entrega.

## Problema técnico observado

O checkout atual usa `HumanFieldType` como taxonomia simultânea de conteúdo, controle, cardinalidade e apresentação. `list`, `files`, `file` e `textarea` carregam semântica implícita; `MANY_TYPES`, `legacyTypeListAccepts()` e `areHumanFieldTypesCompatible()` propagam essa modelagem por Método, plugins, runtime, deliveries e UI.

`src/lib/data-shape.ts` é uma camada transitória: ainda possui `artifact` como kind, `file` como família visual e infere cardinalidade pelo nome antigo. Portas de plugin duplicam a mesma informação em `acceptedTypes`, `producedTypes`, `multiple`, resumos de capability e `deliveryTypes`.

## Decisão arquitetural

- Conteúdo usa um único `ContentShape` discriminado, com `family`, `cardinality`, `representation` e restrições materiais opcionais.
- Controle e registros usam contratos discriminados próprios e não se tornam famílias de conteúdo.
- Campos de Bloco, portas de plugin, contratos materializados e deliveries usam o mesmo `ValueShape` canônico.
- Cardinalidade nunca é inferida do valor, de arrays, de renderer ou do nome de um tipo histórico.
- A apresentação recebe somente hints de renderer; MIME/extensão pertencem ao contrato material.
- Métodos e plugins anteriores não recebem adapter. O contrato v3/API v2 é a única representação aceita pelo caminho canônico.
- A Plugin API passa a declarar shapes por porta; portas continuam sendo a autoridade determinística.

## Escopo

- domínio e compatibilidade de shapes;
- contrato v3 de Método, Builder, importação/exportação e snapshots;
- contrato de plugins e validação das portas canônicas;
- normalização de respostas, runtime inputs, partials e item orchestration;
- deliveries, outputs oficiais e promoção;
- formulários humanos, visualização e apresentação;
- `VALIDAR` e `ESCOLHER` preservados em contratos próprios;
- documentação normativa do contrato;
- testes focais do contrato e do transporte entre Blocos e Processos.

## Fora de escopo

- novos Processos Universais, Blocos ou Operadores;
- reescrita do Execution Core, recovery ou Orchestrator;
- alteração de política de retry, perfil, lease ou efeito externo;
- versionamento, tag, release ou publicação;
- migração SQL sem evidência de necessidade.
- migração de Métodos, manifestos, fixtures e plugins históricos; eles podem permanecer inválidos até uma tarefa posterior de conversão.

## Invariantes

- exatamente quatro famílias de conteúdo: `text`, `image`, `audio`, `video`;
- `one` e `many` são sempre explícitos;
- texto pode ser `inline`, `artifact` ou `either`;
- arquivo não é família; renderer não define semântica;
- múltiplas famílias usam portas distintas;
- Humano e plugin materializam deliveries semanticamente equivalentes para o mesmo shape;
- bindings usam chaves explícitas e nunca labels/aliases;
- IDs, work units, tentativas, receipts, deliveries e items continuam pertencendo ao Core;
- `VALIDAR` continua editorial; `ESCOLHER` continua limitado à Biblioteca Estratégica.

## Ruptura deliberada

- novos Métodos usam `contractVersion: 3`;
- contratos v1/v2 e Plugin API v1 não entram no runtime novo;
- `file/files/list/textarea`, `acceptedTypes`, `producedTypes`, `multiple` e resumos redundantes não são adaptados;
- snapshots e payloads antigos não são reescritos nem interpretados pelo contrato novo;
- nenhuma coluna SQL será criada enquanto o payload JSON comportar o novo contrato.

## Provas obrigatórias

1. Humano e plugin para `text/one`, `text/many`, `image/one` e `image/many`.
2. Áudio e vídeo por Humano e plugin.
3. Texto inline e texto como artifact.
4. Delivery de bloco anterior e output de processo anterior.
5. Aprovação, rejeição e retry por `VALIDAR`.
6. Item orchestration com `text/many`.
7. Multiperfil sem duplicação de identidade.
8. Retry/resume e partials.
9. Múltiplas portas de famílias diferentes.
10. Rejeição explícita de contrato antigo no parser/validador novo.

## Definição de pronto

- `HumanFieldType`, `MANY_TYPES`, `legacyTypeListAccepts()` e `areHumanFieldTypesCompatible()` não participam do modelo canônico;
- `file`, `files`, `list` e `textarea` não são opções semânticas de conteúdo em novos contratos;
- portas e deliveries carregam `ValueShape` explícito;
- campos humanos derivam do mesmo shape das portas de plugin;
- redundâncias de plugin removidas;
- documentação e exemplos descrevem somente o modelo novo;
- testes obrigatórios e regressões relevantes passam, com limitações registradas sem serem apresentadas como sucesso.

## Evidência operacional inicial

- Branch: `main`.
- Worktree: limpo no início.
- Versão: `1.2.1`.
- O gate agregado possui falha preexistente documentada em `test:shared-browser-v89`; ela não será confundida com regressão desta task.

## Evidência desta implementação

- `npm run test:content-shape`: 15/15 testes passaram.
- O parser público serializa e aceita apenas envelope de Método v3 e rejeita v1/v2 e pseudotipos antigos.
- O validador de manifesto aceita Plugin API v2 e rejeita API v1 e listas antigas de tipos.
- Os exemplos e o template v2 foram validados por `validatePluginManifest()`.
- `git diff --check` passa sem erro de conteúdo.
- `npm run typecheck` permanece vermelho porque Builder, telas, executores, plugins e fixtures ainda consomem deliberadamente os símbolos removidos. A conversão desses consumidores está fora desta task e não será mascarada por adapters.

