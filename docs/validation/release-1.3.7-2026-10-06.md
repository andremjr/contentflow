# Preparação da v1.3.7 — 06/10/2026

## Escopo

Autorização explícita do criador: atualizar o GitHub e fazer a release v1.3.7. O conjunto contém a inclusão do Bloco VALIDAR com alvo ainda pendente no workspace, a preservação do rascunho recuperado e Suporte e diagnóstico em Preferências. Não há novas mudanças de migração, perfis, leases, filas, work units ou contratos de conteúdo. Plugins e Métodos independentes mantêm versões e catálogos.

## Evidências

Os registros [VALIDAR](method-add-validation-2026-10-05.md) e [logs](support-diagnostics-2026-10-06.md) documentam os cenários verticais e limites. Nesta preparação, os três cenários web de VALIDAR passaram novamente com API real e base isolada, em PT-BR, inglês e espanhol. Foram aprovados typecheck, 22 testes de content-shape/contratos, seis testes do writer/exportação de suporte e a regressão de jobs persistentes.

A execução de `npm run release:verify` aprovou i18n e parou no lint com 389 problemas de formatação preexistentes. Esse resultado coincide com a limitação já registrada no HEAD da base 1.3.6 em CURRENT_STATE. As falhas gerais anteriormente documentadas não são consideradas corrigidas por esta release. Não se afirma aprovação integral do check ou de todas as suites E2E. A publicação deve conservar essa informação em suas notas.

Nenhum workflow versionado existe em `.github/workflows`; a montagem e publicação não usam GitHub Actions. A atualização dos links do site gh-pages deve apontar diretamente para o Setup da 1.3.7, preservando comunidade, assinatura e downloads independentes.

Este registro é de preparação; a conclusão exige conferência pública de assets, integridade, latest.yml e links do site.
