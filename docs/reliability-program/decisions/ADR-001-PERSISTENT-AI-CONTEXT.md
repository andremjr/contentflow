# ADR-001 — Contexto persistente para agentes

## Status

Aceito

## Contexto

Conversas, resumos de sessão e memória implícita não são uma base confiável para trabalhos longos ou retomados por outro agente. Decisões e estado operacional críticos precisam permanecer acessíveis no repositório.

## Decisão

O contexto necessário para executar o Reliability Program será persistido em documentos versionados: constituição, arquitetura-alvo, estado atual, protocolo de trabalho, roadmap, cenários, tarefas e ADRs. Cada tarefa deve atualizar as fontes afetadas antes de ser encerrada.

## Consequências

Uma retomada começa pela leitura dirigida desses documentos. O repositório passa a ser a referência compartilhada entre sessões, e divergências devem ser corrigidas nas fontes persistentes, não apenas explicadas em conversa.

## O que esta decisão NÃO significa

Não significa copiar conversas inteiras para o repositório, carregar todo o histórico em cada tarefa nem transformar detalhes temporários em política permanente.

