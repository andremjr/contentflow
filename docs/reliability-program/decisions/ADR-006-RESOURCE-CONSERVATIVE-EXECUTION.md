# ADR-006 — Execução conservadora de recursos

## Status

Aceito

## Contexto

Máquinas com pouca memória, CPU limitada ou rede instável são ambientes válidos do produto. Concorrência agressiva e espera ativa podem transformar capacidade nominal em falhas sistêmicas.

## Decisão

A execução adota limites conservadores, backpressure, espera barata e liberação previsível de recursos. Concorrência deve ser limitada por tipo de recurso e ajustável por evidência, preservando progresso e recuperação em máquinas fracas.

## Consequências

Novos workers, pools e leases precisam declarar consumo e encerramento. Medições reais orientam ajustes posteriores; segurança e estabilidade prevalecem sobre throughput teórico.

## O que esta decisão NÃO significa

Não significa fixar para sempre um número mínimo de workers, eliminar paralelismo ou impedir configurações mais amplas quando houver capacidade demonstrada.

