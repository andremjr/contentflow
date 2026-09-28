# ADR-003 — Contratos determinísticos do runtime

## Status

Aceito

## Contexto

Inferências silenciosas no caminho de execução tornam resultados dependentes de aliases, nomes, formatos ou heurísticas difíceis de reproduzir e recuperar.

## Decisão

O runtime trabalha com contratos explícitos, bindings resolvidos e identificadores canônicos. Ambiguidade no caminho de execução é erro tipado. Heurísticas ficam restritas a edição assistida, importação ou camadas de compatibilidade que produzam uma forma canônica antes da execução.

## Consequências

Validação e resolução ocorrem antes do primeiro efeito. Dados legados exigem adaptadores ou migrações explícitas, e os contratos de entrada, saída e falha precisam ser testáveis.

## O que esta decisão NÃO significa

Não significa remover sugestões da experiência de edição, proibir importadores tolerantes nem apagar formatos legados imediatamente.

