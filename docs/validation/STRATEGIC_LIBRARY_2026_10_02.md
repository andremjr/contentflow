# Biblioteca Estratégica — validação local em 02/10/2026

Implementação local sobre HEAD `b274d99fb744e6b09c59159727526217a4e375a0`, preservando as alterações anteriores do checkout. Sem versão, commit, tag ou release.

## Comportamento validado

- Criação de coleção fixa ou consumível; coleções anteriores sem `usage` permanecem fixas.
- Seleção humana ou por workers reais de plugins locais de IA/Código. Reserva exclusiva na escolha; consumo somente ao concluir o Processo com seu output oficial.
- Espera por output, falha e cancelamento conservam o item. Cancelamento, reset e exclusão de execução foram exercitados pela API; falha foi protegida por regressão de domínio. Restart real da API com a mesma base preservou a reserva.
- O snapshot preserva política, campos e valores escolhidos. As entradas do Bloco seguinte continuam resolvendo os valores tipados após excluir o registro consumido, inclusive sem consultar a coleção original.
- Itens reservados não podem ser alterados/excluídos nem escolhidos por outra execução. Coleções com reservas não podem ser editadas/excluídas.
- Lotes inválidos não inserem nenhuma linha. Repetir o ID de importação não duplica itens nem recria itens já consumidos.
- A interface importou imagens primeiro, depois textos/links por coluna, revisou uma linha e adicionou outra por preenchimento direto e upload individual. Ordem e valores foram conferidos após salvar/recarregar.
- PT-BR, inglês e espanhol validados; nomes de coleção/campos e conteúdo do usuário permaneceram intactos.

## Verificações

| Verificação | Resultado |
| --- | --- |
| `npx playwright test tests/e2e/strategic-library.spec.ts` | 3 testes passaram |
| `node --import tsx --test server/strategic-library.integration.test.ts` | PASS; API real, workers locais reais e restart |
| `node --import tsx --test src/lib/strategic-library.test.ts src/lib/app-preferences.test.ts` | 27 testes passaram, incluindo 4 regressões novas de domínio |
| `npm run test:i18n` | 29 testes passaram |
| Suites selecionadas de deliveries, histórico, entradas, normalização de respostas de plugin, shapes, Método v3, arquitetura, conclusão/retry e arquivos de Método | 78 testes passaram |
| `npm run typecheck` | PASS |
| `npm run build` | PASS |
| ESLint de todos os arquivos de implementação/testes afetados | PASS |
| `npm run lint` | 15 erros de formatação preexistentes em `.tmp/flow-options-live.mjs` e `.tmp/prepare-flow-options-live.mjs`; arquivos preservados |

O run final do Dev Monitor foi `strategic-library-565a0bc1-b515-4f59-8b10-0f15bae327c0`: **PASS**, integridade válida, Core/Method/Plugin observados, 57 checks aprovados, zero falhas, dez checks `NOT_OBSERVED`. Estes últimos não são aprovações.

O primeiro run simultâneo à preparação dos testes de browser não iniciou a API dentro do timeout de startup e foi classificado `INVALID_INSTRUMENTATION`; não foi usado como prova. O teste recebeu um prazo de startup maior. Um run posterior íntegro identificou que o cancelamento persistido não era observado antes de excluir/resetar a execução; a observação pós-commit foi acrescentada no caminho canônico. O diff entre `strategic-library-a79ec75f-12ff-4524-9a6f-2ae3c51394f7` e `strategic-library-03624722-6f5f-4bf4-9253-c78766920c3a` foi comparável: duas violações de observação resolvidas e nenhuma nova. O cenário foi depois ampliado aos workers reais e à exclusão de execução.

## Auditoria e limites

Código, regressões e a seção 10 de `ARCHITECTURE.md` registram o mesmo ciclo de vida. `DEV_MONITOR.md` documenta o cenário e suas fronteiras. As skills de desenvolvimento e referências especializadas foram conferidas: continuam subordinadas à arquitetura viva; não exigiram atualização. Não houve alteração das famílias de conteúdo, cardinalidade, portas de plugin, versão dos Métodos ou gramática de Blocos/Processos/Operadores.

Os testes usaram bases temporárias, sem contas, credenciais ou dados pessoais. Os workers de IA/Código são fixtures determinísticas da API v2; não comprovam um provedor externo autenticado. O monitor não observa renderer nem restart: essas evidências vêm, respectivamente, do Playwright e da execução direta da suite HTTP. Não houve ensaio de atualização de uma instalação desktop completa nem validação de release.
