# ADR-005 — Progresso não assistido

## Status

Aceito

## Contexto

Uma unidade bloqueada, pausada ou aguardando recurso não deve congelar trabalho independente que já esteja elegível. A execução precisa progredir sem exigir supervisão contínua.

## Decisão

O scheduler procura continuamente unidades elegíveis, respeitando dependências, recursos, leases, limites e estados persistidos. Esperas estacionam apenas o escopo dependente; trabalho independente continua quando houver capacidade segura.

## Consequências

Elegibilidade, dependências e motivos de espera precisam ser explícitos e observáveis. Retomadas devem reconstruir o trabalho elegível a partir do estado persistido, sem depender da memória do processo anterior.

## O que esta decisão NÃO significa

Não significa paralelismo ilimitado, ignorar ordem ou dependências, nem executar a mesma unidade em vários perfis para aparentar progresso.

