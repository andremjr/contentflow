# ADR-002 — Autoridade do Core sobre a execução

## Status

Aceito

## Contexto

Quando interface, adaptadores, plugins ou executores assumem transições estratégicas por conta própria, o estado observável pode divergir e a recuperação deixa de ter uma autoridade única.

## Decisão

O Método define a estratégia e a ordem dos Blocos. Por decisão explícita do criador em 02/10/2026, suas edições são aplicadas imediatamente às execuções abertas, preservando resultados, identidades e tentativas. O campo persistido `methodSnapshot` é uma projeção sincronizada, sem autoridade para congelar essas definições. A ordem dos Processos do Projeto continua sendo um contrato separado. O Core é a única autoridade para identidade operacional, proveniência e transições da execução. UI, Orchestrator, adaptadores, plugins e executores enviam intenções, comandos, fatos e resultados; o Core valida e persiste a mudança de estado.

## Consequências

Estados relevantes precisam convergir para modelos canônicos do Core. Componentes externos devem ser projetados para correlação, idempotência e reconciliação, sem criar identidades concorrentes para unidades do ContentFlow.

## O que esta decisão NÃO significa

Não significa que o Core executa HTTP, SQL, DOM, FFmpeg ou outras integrações, nem que plugins deixam de possuir lógica própria da capability que oferecem.

