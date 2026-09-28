# Decisões do Reliability Program

Este diretório reúne decisões arquiteturais permanentes do Reliability Program. Um ADR deve ser criado quando uma escolha afetar fronteiras de autoridade, contratos do runtime, recuperação, compatibilidade ou outra propriedade que precise sobreviver à tarefa e à conversa em que surgiu.

ADRs não substituem `docs/ARCHITECTURE.md`. A arquitetura continua sendo a fonte normativa do produto; estes registros tornam explícitas decisões complementares de confiabilidade e seus limites.

## Índice

- [ADR-001 — Contexto persistente para agentes](ADR-001-PERSISTENT-AI-CONTEXT.md)
- [ADR-002 — Autoridade do Core sobre a execução](ADR-002-CORE-EXECUTION-AUTHORITY.md)
- [ADR-003 — Contratos determinísticos do runtime](ADR-003-DETERMINISTIC-RUNTIME-CONTRACTS.md)
- [ADR-004 — Efeitos externos incertos](ADR-004-UNCERTAIN-EXTERNAL-EFFECTS.md)
- [ADR-005 — Progresso não assistido](ADR-005-UNATTENDED-PROGRESS.md)
- [ADR-006 — Execução conservadora de recursos](ADR-006-RESOURCE-CONSERVATIVE-EXECUTION.md)
- [ADR-007 — Legado nas fronteiras](ADR-007-LEGACY-AT-BOUNDARIES.md)

## Quando criar outro ADR

Crie outro ADR somente quando houver uma decisão permanente e relevante que não esteja coberta pela arquitetura ou pelos registros existentes. Se a decisão ainda não tiver sido tomada, registre `DECISION REQUIRED` na tarefa ou no Current State; não invente uma política para preencher a lacuna.

