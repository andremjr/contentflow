# Skills oficiais do ContentFlow

`ecosystem/skills/` é a fonte canônica distribuível de `contentflow-method-development` e `contentflow-plugin-development`. A árvore `.agents/skills/` é somente a cópia local derivada usada por agentes neste checkout.

A skill [development-contentflow](development-contentflow/SKILL.md) orienta o desenvolvimento assistido por IA do produto oficial. O [processo vigente](../../docs/DEVELOPMENT.md) usa cenários verticais reais; skills auxiliam o trabalho interno e não são necessárias para executar o ContentFlow.

Sincronize as duas cópias locais com `node scripts/sync-contentflow-plugin-skill.mjs`. Para verificar sem alterar arquivos, execute `npm run test:skill-sync`.

Para também atualizar as skills instaladas no Codex deste usuário, execute `node scripts/sync-contentflow-plugin-skill.mjs --install-user`. A opção mantém a fonte canônica no projeto, atualiza `.agents/skills/` e substitui as instalações correspondentes em `~/.codex/skills/`. Use `--check --install-user` para conferir os dois destinos sem alterá-los.

Para instalar uma skill fora do checkout, extraia seu ZIP oficial e copie a pasta completa, incluindo a documentação empacotada, para o diretório de skills do agente. A cópia direta da fonte `ecosystem/skills/` usa a documentação viva do checkout e não inclui o snapshot documental gerado no ZIP. Para atualizar, substitua a instalação antiga pela versão correspondente da fonte oficial. Não há atualização externa automática implícita.

Nas releases, cada skill continua apta a distribuição independente.

## Preparação para 1.3.1

Os dois ZIPs incluem `docs/`, `AGENTS.md`, `LICENSE`, `AI_USAGE_POLICY.md` e
`DOCUMENTATION.json` dentro da pasta da skill. O empacotador copia as fontes atuais
e registra commit, alterações locais e hashes; não mantenha cópias normativas à mão.
Leia `references/documentation.md` após extrair. Links públicos usam `v1.3.1` e
podem ficar indisponíveis até publicação da tag; a documentação incluída funciona offline.

O [guia de migração](../../docs/UPGRADE_GUIDE_1_3_1.md) cobre backup, Método v3,
API v2, nova major de plugin quando shapes/portas mudam, validadores e recuperação.
As skills não incluem os validadores do Core nem afirmam aprovação de uma atualização real.

Para gerar somente as skills, sem empacotar plugins/Bridge nem alterar a versão do Core:

```powershell
node scripts/package-ecosystem.mjs release/skills-validation --skills-only --docs-version=1.3.1
node --test ecosystem/skills/tests/package-skills.test.mjs
```

Sem `--skills-only`, `npm run ecosystem:package` mantém o empacotamento completo.
A versão documental padrão vem de `package.json` após o bump pelo responsável pela release.
`--docs-version=1.3.1` prepara este alvo sem incrementar o Core. Auditorias e histórico
não integram o pacote normativo; `CURRENT_STATE.md` é observacional, com aviso
no manifesto quando registra outra versão. O guardrail acompanha os ZIPs em `guardrails/`.
A saída deve ser uma subpasta dedicada de `release/`, pois seu conteúdo é substituído.
