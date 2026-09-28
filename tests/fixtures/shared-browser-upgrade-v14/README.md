# Fixtures de atualização — pacote 1.4

Estas fixtures representam estados legados anteriores à migração de perfis globais. Elas existem para ensaiar as fases 2 e 3 sem depender de dados reais de usuário.

Cada cenário contém `data/contentflow.sqlite` e `expectations.json`. Quando o cenário possui sessão física, a árvore correspondente fica ao lado de `data/`. As expectativas registram contagens por tabela, SHA-256 dos payloads persistidos e caminhos relativos esperados para perfis. Caminhos relativos evitam incorporar diretórios pessoais ou específicos da máquina.

Regere o conjunto com:

```bash
node scripts/generate-shared-browser-upgrade-v14.mjs
```

O teste `server/shared-browser-upgrade-fixtures-v14.test.mjs` regenera o conjunto em uma pasta temporária, valida integridade SQLite, contagens, hashes, markers, aliases homônimos e a fila parcial.

Os 11 cenários correspondem diretamente aos estados do §7.4 do roadmap: sem perfis; perfil único; múltiplos perfis/fallbacks; aliases homônimos; Método principal/fallback; Projeto concluído; Projeto pausado; job interrompido; fila parcial; plugin ausente; workspace customizado.
