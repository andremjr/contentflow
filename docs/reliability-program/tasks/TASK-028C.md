# TASK-028C — Atualizar o Método ao refazer um Bloco

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

## Estado

`done`

## Objetivo de produto

Fazer a ação explícita “refazer este bloco” adotar a definição atual do Método a partir do Bloco escolhido, preservando o prefixo já concluído e sem apagar a evidência do snapshot usado antes da correção.

## Problema técnico observado

O retry manual hoje reabre o Bloco usando integralmente `ProcessExecution.methodSnapshot`. Uma correção salva no Método do Canal não alcança a execução que falhou, portanto o usuário repete o mesmo contrato defeituoso até reiniciar o Processo inteiro.

## Decisão arquitetural aplicável

- O snapshot continua imutável durante progressão automática, recovery técnico e retomada sem decisão humana.
- “Refazer este bloco” é uma decisão humana explícita e constitui a única fronteira desta task para incorporar a definição atual.
- O prefixo anterior ao alvo permanece material e semanticamente congelado.
- O alvo e o sufixo passam a usar a versão atual do Método, correlacionada pelo ID estável do Bloco.
- O snapshot anterior permanece registrado no histórico da execução.
- A estratégia do Projeto passa a guardar o Método atual completo para novos Processos/restarts; a execução corrente usa a composição prefixo antigo + sufixo atual.
- Escopos `remaining` e `selected` só podem reutilizar unidades quando a definição material do alvo não mudou.

## Fora de escopo

- Atualização automática do snapshot durante progressão normal.
- Inferência por nome, posição ou label quando o ID do Bloco-alvo não existe mais.
- Release, tag, incremento de versão ou publicação.

## Invariantes

- Blocos concluídos antes do alvo, seus values, attempts e deliveries permanecem intactos.
- Deliveries do alvo e do sufixo antigo são invalidadas antes da nova tentativa.
- Blocos do novo sufixo começam pendentes, exceto o alvo reativado.
- Uma composição com IDs duplicados ou processo incompatível é rejeitada sem mutação.
- A operação continua atômica com `ProcessExecution`, projeção de `Project` e receipt do comando.

## Evidências necessárias

- teste do Core para rebase pelo ID estável e preservação do prefixo;
- teste de adapter para adoção do Método atual do Canal e atualização da estratégia;
- regressão de retry sem mudança de definição;
- typecheck e suites focais de execução/retry.

## Definição de pronto

Uma execução que falhou pode ser retomada no Bloco corrigido sem reiniciar o Processo, usando o Método atual dali em diante, preservando prefixo e histórico e mantendo os invariantes do Core.

## Evidência de conclusão

- Core cobre rebase por ID, preservação do prefixo, reset do sufixo, histórico e bloqueio de retry parcial sob contrato alterado;
- adapter cobre adoção do Método atual do Canal e atualização da estratégia do Projeto;
- `npm run test:execution-core`, `npm run test:automatic-execution` e `npm run typecheck` passaram.
