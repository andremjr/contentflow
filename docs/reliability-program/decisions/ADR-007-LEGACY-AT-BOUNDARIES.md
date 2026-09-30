# ADR-007 — Legado nas fronteiras

## Status

Aceito

## Contexto

Instalações existentes contêm representações históricas de perfis físicos, filas, jobs, work units, snapshots e outros estados operacionais que precisam ser preservados durante a evolução do produto. Isso não transforma contratos antigos de Método ou plugin em formatos suportados.

## Decisão

Migrações de estado operacional ficam nas fronteiras de storage. Antes de entrar no domínio canônico, esses dados são validados e migrados sem reinterpretar seu significado histórico, preservando proveniência, backup e caminho de recuperação. Importadores e runtime rejeitam Método v1/v2 e Plugin API v1; não existe adapter desses contratos.

## Consequências

Migrações precisam ser versionadas e testadas. O Core opera sobre poucos modelos canônicos, enquanto transições de storage seguem fases recuperáveis e compatíveis com instalações anteriores.

## O que esta decisão NÃO significa

Não significa apagar dados antigos, reescrever snapshots históricos no mesmo passo ou migrar tudo de forma ansiosa. Também não significa aceitar, inferir ou converter automaticamente contratos antigos de Método ou plugin.

