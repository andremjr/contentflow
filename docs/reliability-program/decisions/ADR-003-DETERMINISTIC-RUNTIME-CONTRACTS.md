# ADR-003 — Contratos determinísticos do runtime

## Status

Aceito

## Contexto

Inferências silenciosas no caminho de execução tornam resultados dependentes de aliases, nomes, formatos ou heurísticas difíceis de reproduzir e recuperar.

## Decisão

O runtime trabalha com contratos explícitos, bindings resolvidos e identificadores canônicos. Ambiguidade no caminho de execução é erro tipado. Heurísticas ficam restritas a sugestões de edição que o usuário confirma antes da execução; importação e runtime não completam contratos antigos.

## Consequências

Validação e resolução ocorrem antes do primeiro efeito. Dados operacionais persistidos podem exigir migrações de storage explícitas; contratos de Método e plugin anteriores aos vigentes permanecem inválidos. Contratos de entrada, saída e falha precisam ser testáveis.

## O que esta decisão NÃO significa

Não significa remover sugestões da experiência de edição nem apagar dados históricos. Significa que essas sugestões precisam virar bindings explícitos e que importadores aceitam somente Método v3 e Plugin API v2.

