# ADR-007 — Legado nas fronteiras

## Status

Aceito

## Contexto

Representações antigas precisam continuar legíveis durante a evolução do produto, mas ramificações legadas espalhadas pelo domínio tornam o comportamento canônico difícil de compreender e testar.

## Decisão

Compatibilidade legada fica nas fronteiras de leitura, importação, adaptação e migração. Antes de entrar no domínio canônico, dados antigos são validados e adaptados sem reinterpretar seu significado histórico, preservando proveniência e caminho de recuperação.

## Consequências

Adaptadores e migrações precisam ser versionados e testados. O Core opera sobre poucos modelos canônicos, enquanto transições de storage seguem fases recuperáveis e compatíveis com instalações anteriores.

## O que esta decisão NÃO significa

Não significa apagar dados antigos, reescrever snapshots históricos no mesmo passo, migrar tudo de forma ansiosa ou quebrar compatibilidade sem uma estratégia explícita.

