# Especificações das tasks do Reliability Program

Esta pasta recebe as especificações detalhadas das missões do [`roadmap`](../02-RELIABILITY-ROADMAP.md).

O roadmap não é um prompt de Codex. Ele registra missões, ordem e estado. A especificação executável de uma missão é criada just-in-time, imediatamente antes de seu início autorizado, usando o commit, o worktree, os testes e o diagnóstico reais daquele momento.

Regras:

- nunca criar antecipadamente 52 prompts;
- não preencher uma task futura com implementação especulativa;
- inspecionar o código atual antes de escrever `TASK-NNN.md`;
- registrar escopo, invariantes, compatibilidade, testes, definição de pronto e decisões necessárias;
- manter a especificação concluída como registro de objetivo, evidências e resultado;
- atualizar fatos mutáveis em [`../04-CURRENT-STATE.md`](../04-CURRENT-STATE.md), sem reescrever a task histórica;
- usar [`../05-WORKING-PROTOCOL.md`](../05-WORKING-PROTOCOL.md) como regra de preparação, autonomia, fechamento e recalibração.

Esta pasta contém o registro de encerramento da [`TASK-000`](TASK-000.md), mas ainda não contém `TASK-001.md`. Criar a próxima especificação ou iniciar sua implementação exige autorização explícita.
