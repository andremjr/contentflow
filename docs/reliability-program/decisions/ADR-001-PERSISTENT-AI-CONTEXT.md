# ADR-001 — Contexto persistente para agentes

## Status

Aceito

## Contexto

Conversas, resumos de sessão e memória implícita não são uma base confiável para trabalhos longos ou retomados por outro agente. Decisões e estado operacional críticos precisam permanecer acessíveis no repositório.

## Decisão

O contexto necessário ao desenvolvimento é persistido em contratos normativos, [estado atual](../../CURRENT_STATE.md), [processo de desenvolvimento](../../DEVELOPMENT.md), decisões e evidências do cenário afetado. Cada trabalho atualiza as fontes pertinentes antes de ser encerrado.

Em 01/10/2026, o programa separado foi encerrado: a obrigação anterior de manter constituição, arquitetura-alvo, roadmap e sequência de tasks como contexto ativo foi substituída por leitura dirigida aos contratos e ao cenário vertical real. Os registros anteriores continuam históricos.

## Consequências

Uma retomada começa pela leitura dirigida desses documentos. O repositório passa a ser a referência compartilhada entre sessões, e divergências devem ser corrigidas nas fontes persistentes, não apenas explicadas em conversa.

## O que esta decisão NÃO significa

Não significa copiar conversas inteiras para o repositório, carregar todo o histórico em cada tarefa nem transformar detalhes temporários em política permanente.
