# Reliability Program

Esta pasta preserva a memória estável do programa de confiabilidade do ContentFlow. Conversas, prompts e resumos de sessão ajudam durante um trabalho, mas não são fontes permanentes nem substituem documentos versionados.

As fontes centrais do programa são:

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md), fonte normativa principal do domínio atual;
2. [`00-PRODUCT-CONSTITUTION.md`](00-PRODUCT-CONSTITUTION.md), promessas de produto e confiabilidade que governam o programa;
3. [`01-TARGET-ARCHITECTURE.md`](01-TARGET-ARCHITECTURE.md), direção arquitetural que deve emergir ao longo do programa;
4. [`02-RELIABILITY-ROADMAP.md`](02-RELIABILITY-ROADMAP.md), missões e estados oficiais;
5. [`03-ACCEPTANCE-SCENARIOS.md`](03-ACCEPTANCE-SCENARIOS.md), resultados observáveis que orientam as provas;
6. [`04-CURRENT-STATE.md`](04-CURRENT-STATE.md), fotografia substituível do checkout e dos gaps atuais;
7. [`05-WORKING-PROTOCOL.md`](05-WORKING-PROTOCOL.md), ordem de leitura e disciplina oficial para TASK-001–TASK-052.
8. [`decisions/`](decisions/README.md), ADRs permanentes que complementam a arquitetura com escolhas explícitas de confiabilidade.

Continuam obrigatórios [`../../AGENTS.md`](../../AGENTS.md), [`../../LICENSE`](../../LICENSE), [`../../AI_USAGE_POLICY.md`](../../AI_USAGE_POLICY.md) e, quando aplicável, [`../PLUGIN_INTERFACE.md`](../PLUGIN_INTERFACE.md).

## Autoridade

`ARCHITECTURE.md` descreve o produto e o domínio vigentes. A Constituição não a substitui: ela estabelece os compromissos que orientam o Reliability Program. A Target Architecture traduz esses compromissos em fronteiras técnicas desejadas e não afirma, por si só, que a implementação atual já chegou ao estado alvo.

Em caso de divergência, não escolha silenciosamente uma interpretação. Preserve o comportamento vigente, identifique a diferença e trate a mudança na task autorizada correspondente.

## Disciplina de contexto

Antes de uma task, siga a ordem completa e as regras de contexto de `05-WORKING-PROTOCOL.md`. As especificações detalhadas são criadas just-in-time em [`tasks/`](tasks/).

Leia documentos históricos, evidências e roadmaps de outros subsistemas somente quando a task precisar daquela compatibilidade, baseline ou decisão. Eles não devem ser carregados indiscriminadamente nem usados para competir com fontes normativas atuais.

Os ADRs iniciais ficam em [`decisions/`](decisions/README.md). Especificações em [`tasks/`](tasks/) são criadas apenas quando uma tarefa autorizada exigir esse registro.
