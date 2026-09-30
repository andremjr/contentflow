# Skills oficiais do ContentFlow

`ecosystem/skills/` é a fonte canônica distribuível de `contentflow-method-development` e `contentflow-plugin-development`. A árvore `.agents/skills/` é somente a cópia local derivada usada por agentes neste checkout.

Sincronize as duas cópias locais com `node scripts/sync-contentflow-plugin-skill.mjs`. Para verificar sem alterar arquivos, execute `npm run test:skill-sync`.

Para também atualizar as skills instaladas no Codex deste usuário, execute `node scripts/sync-contentflow-plugin-skill.mjs --install-user`. A opção mantém a fonte canônica no projeto, atualiza `.agents/skills/` e substitui as instalações correspondentes em `~/.codex/skills/`. Use `--check --install-user` para conferir os dois destinos sem alterá-los.

Para instalar uma skill separadamente, copie a pasta completa correspondente de `ecosystem/skills/` para o diretório de skills do agente. Para atualizar, substitua a instalação antiga pela versão atual da fonte oficial. Não há atualização externa automática implícita.

Nas releases, cada skill continua apta a distribuição independente.
