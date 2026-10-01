# TASK-021 — Guardrails para contratos determinísticos

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Evidência inicial

- HEAD: `c1ebd64c1ffdd3ba89b5a201303ac3db83f35e3e`.
- Branch: `main`.
- Worktree principal em `C:/Users/andre/Downloads/contentflow`, inicialmente limpo (`git status --short` sem alterações).
- Node.js `v26.5.1`; npm `11.6.1`.

## Objetivo de produto

Delimitar e caracterizar os fallbacks heurísticos ainda presentes na resolução de contratos do runtime, sem removê-los nem ampliá-los, para que as TASKs 022–028 possam substituí-los gradualmente por contratos explícitos.

## Problema técnico observado

- `resolveBlockInputs()` respeita origins explícitas, mas ainda escolhe candidatos compatíveis por `labelScore()` quando a origem não está materializada.
- `selectPluginInputPort()` respeita `input.portKey`, mas ainda escolhe implicitamente por compatibilidade, identidade semântica, apresentação e ordem.
- A operação server-side ainda infere `outputContract` por `field.portKey`, tipo compatível, primeira porta ou `field.key`.
- `valuesForPluginResponse()` ainda aceita `responseValues.result`; `ESCOLHER` ainda aceita `selectedItemId ?? result`.
- `VALIDAR` ainda pode inferir target/output durante a normalização e usa primeiro output/primeira input port compatível na boundary do plugin.

Esses comportamentos são compatibilidade temporária e conflitam com o estado alvo do ADR-003, mas sua remoção pertence às próximas tasks.

## Decisões aplicáveis

- ADR-003: o runtime canônico converge para bindings e identificadores explícitos; ambiguidade não deve ser resolvida silenciosamente.
- ADR-007: compatibilidade histórica deve permanecer concentrada nas fronteiras e convergir para representação canônica.
- O Método e seu snapshot continuam autoridade da estratégia; plugins implementam capabilities e não escolhem origens, targets ou composição.
- O Execution Core permanece independente de contratos e heurísticas de integração com plugins.

## Escopo

- Proteger a precedência de binding/source explícito sobre `labelScore()`.
- Caracterizar um único fallback heurístico representativo de resolução de input.
- Proteger a precedência de `input.portKey` explícita.
- Caracterizar um único fallback implícito representativo de porta de input.
- Adicionar guardrails focais para concentrar `labelScore`, inferência de input/output ports, `responseValues.result`, fallback de `ESCOLHER` e fallbacks de `VALIDAR` nas boundaries atuais.
- Proteger o Execution Core contra dependência de heurística textual, manifestos e portas de plugin.
- Atualizar Current State, roadmap e invariantes arquiteturais ao concluir.

## Fora de escopo

- Remover ou reduzir qualquer fallback vigente.
- Criar binding canônico novo, adapter legado, migration ou campo obrigatório.
- Normalizar respostas de executor ou criar `normalizeExecutorResponse()` equivalente.
- Alterar formato persistido, snapshots históricos ou comportamento observável do produto.
- Iniciar a TASK-022.

## Arquivos prováveis

- `server/runtime-contract-runtime-inputs.test.ts`.
- `server/plugin-input-values.test.ts`.
- `src/lib/architecture-invariants.test.ts` ou um único teste dedicado, se ficar mais claro.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.
- Este registro.

## Invariantes permanentes

- Binding/source explícito vence qualquer sugestão ou fallback heurístico.
- `input.portKey` explícita vence inferência de porta.
- O Execution Core não conhece labels heurísticas, manifestos, portas ou respostas de plugin.
- Plugins não definem estratégia; o Método e seu snapshot continuam autoridade.
- Nenhum plugin aprende labels do Método como autoridade para escolher composição estratégica.

## Compatibilidade temporária delimitada

- `labelScore()` em `resolveBlockInputs()`.
- Seleção implícita em `selectPluginInputPort()`.
- Inferência de porta no `outputContract`.
- `responseValues.result` em `valuesForPluginResponse()`.
- `selectedItemId ?? result` em `ESCOLHER`.
- Inferência de target/output e primeira porta compatível em `VALIDAR`.

## Compatibilidade e migração

Não haverá migration, novo campo obrigatório, transformação de Métodos existentes, adapter legado novo ou reescrita de snapshots. Os fallbacks atuais permanecem semanticamente inalterados.

## Validação planejada

- `npm run typecheck`
- `npm run test:architecture`
- `npm run test:execution-state-machine`
- `npm run test:plugin-inputs`
- suites relacionadas de execução de plugin conforme o impacto observado
- `npm run lint`
- `npm run check` (aceitável somente a falha histórica idêntica em `test:shared-browser-v89`)

## Definition of Done

- Precedência de binding explícito e `portKey` explícita protegida.
- Um caso econômico de cada fallback temporário relevante caracterizado.
- Execution Core protegido contra heurísticas e contratos de integração.
- Fallbacks conhecidos localizados por guardrails focais, sem grep global ingênuo.
- Nenhuma heurística expandida ou removida.
- Nenhum comportamento, formato persistido ou migration alterado.
- TASK-021 `done`, TASK-022 `ready`, TASK-023..TASK-052 `pending`.

## Condições de `DECISION REQUIRED`

Registrar e interromper se a cobertura exigir alterar comportamento, autoridade entre Método/Core/plugin, formato persistido, compatibilidade histórica ou política permanente não definida pelos ADRs vigentes.

## Heurísticas encontradas

- `src/lib/runtime-contract.ts` — `resolveBlockInputs()` tenta primeiro `resolveExplicitInput()` e, sem binding resolvido, ordena candidatos compatíveis por `labelScore()`.
- `server/plugin-input-values.ts` — `selectPluginInputPort()` respeita `input.portKey`; sem ela, usa compatibilidade, `semanticIdentityScore()`, `presentationScore()` e ordem da porta.
- `server/index.ts` — `executePluginBlockInternal()` cria `outputContract` por `field.portKey`, porta compatível por tipo, primeira `outputPort` ou `field.key`; para `ESCOLHER`, usa a primeira output port ou `result`.
- `server/index.ts` — `valuesForPluginResponse()` aceita chave do campo, `contract.portKey` ou `responseValues.result`; `mappedPluginValues()` aceita `selectedItemId ?? result` para `ESCOLHER`.
- `src/lib/human-workflow.ts` — `normalizeMethodBlocks()` ainda pode escolher o último bloco não-`VALIDAR` e uma saída compatível/primeira saída.
- `server/index.ts` — a boundary de `VALIDAR` ainda pode escolher a primeira saída do target e a primeira input port compatível.

## Permanentes

- Binding/source explícito vence o fallback de labels.
- `input.portKey` explícita vence inferência de porta e uma porta explícita inválida não é mascarada por fallback.
- O Execution Core não conhece `labelScore`, fuzzy matching, input/output ports, `responseValues`, manifesto ou contratos de plugin.
- Resolução do Método ocorre antes do mapeamento para a capability e antes da criação do job.
- Plugins não escolhem a origem estratégica dos inputs nem o target de `VALIDAR`; o snapshot do Método continua autoridade.

## Temporárias

- `labelScore()` na resolução de inputs sem binding materializado.
- Seleção implícita de input port por semântica, apresentação, compatibilidade e ordem.
- Seleção implícita de output port por tipo ou primeira porta.
- `responseValues.result` como resposta genérica.
- `result` como fallback de `selectedItemId` em `ESCOLHER`.
- Inferência de target/output/porta para `VALIDAR`.

Esses comportamentos foram caracterizados e delimitados, não declarados como contratos permanentes.

## Guardrails implementados

O teste dedicado `src/lib/deterministic-contract-guardrails.test.ts`:

- percorre somente produção em `src/lib` e `server` para garantir que `labelScore`, scores semânticos e `selectPluginInputPort` permaneçam nos arquivos atuais;
- verifica a ordem estrutural em que binding explícito precede `labelScore` e `portKey` precede inferência;
- inspeciona as funções server-side atuais para localizar `responseValues.result`, `ESCOLHER`, output port e `VALIDAR`, sem grep global por termos genéricos;
- percorre especificamente `src/lib/execution-core/**` e proíbe conhecimento de heurísticas ou contratos de integração;
- comprova que a operação server-side resolve o Método antes de mapear portas e criar o job.

`npm run test:architecture` passou a executar esse arquivo junto de `architecture-invariants.test.ts`. O teste de invariantes também exige TASK-021 `done`, TASK-022 `ready` e TASK-023..TASK-052 `pending`.

## Characterization

Foram mantidos quatro casos focais:

1. binding explícito aponta para uma saída menos parecida semanticamente e vence o candidato que teria score maior;
2. `LEGACY / TEMPORARY CHARACTERIZATION`: input sem binding resolve pelo rótulo mais semelhante;
3. `input.portKey` explícita vence outra porta compatível que aparece antes;
4. `LEGACY / TEMPORARY CHARACTERIZATION`: input sem `portKey` escolhe implicitamente a porta de rótulo semântico.

Não foi criada characterization funcional separada para cada fallback de output, resposta e `VALIDAR`; as suites existentes continuam cobrindo esses fluxos e o novo teste estrutural delimita seus pontos de produção.

## Produção

Não houve alteração em código de produção, comportamento do produto, formato persistido, schema ou migration. A task alterou somente testes, guardrails, script de teste e documentação. Nenhuma heurística foi removida ou expandida, e nenhum adapter ou normalizador de resposta foi criado.

## Validação

| Comando | Resultado |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run test:architecture` | pass, 8/8 |
| `npm run test:execution-state-machine` | pass, 17/17 |
| `npm run test:plugin-inputs` | pass, 15/15 |
| `npm run test:automatic-execution` | pass, 7/7 |
| `npm run test:plugin-jobs` | pass |
| `npm run test:validation-retry` | pass, 14/14 |
| `npm run lint` | pass |
| `npm run check` | avançou sem regressão nova até `test:shared-browser-v89`; 3/4 passam e permanece a falha histórica idêntica: `incrementalStrategies` textual do ChatGPT é `undefined`, esperado `['per_item']` |

## Arquivos alterados

- `package.json`.
- `server/plugin-input-values.test.ts`.
- `server/runtime-contract-runtime-inputs.test.ts`.
- `src/lib/architecture-invariants.test.ts`.
- `src/lib/deterministic-contract-guardrails.test.ts`.
- `docs/reliability-program/tasks/TASK-021.md`.
- `docs/reliability-program/04-CURRENT-STATE.md`.
- `docs/reliability-program/02-RELIABILITY-ROADMAP.md`.

## Reliability Program

TASK-001..TASK-021 `done`; TASK-022 `ready`; TASK-023..TASK-052 `pending`. TASK-022 não foi iniciada. Sem commit, tag ou release.
