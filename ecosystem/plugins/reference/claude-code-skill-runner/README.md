# Claude Code Skill Runner

Plugin independente para ContentFlow Plugin API v1. Ele executa o agente Claude Code em blocos do Método e devolve entregas tipadas. Skills são o caminho principal, mas o agente também pode pesquisar, analisar arquivos, escrever código e criar scripts quando essas ferramentas forem autorizadas no bloco.

Este pacote não é afiliado, patrocinado nem mantido pela Anthropic. “Claude” e “Claude Code” identificam apenas o provedor interoperado.

## Capacidades

- `run-production-skill`: executa blocos `BUSCAR`, `CRIAR` e `VALIDAR` com texto ou dados estruturados.
- `choose-with-production-skill`: escolhe exatamente um item existente em blocos `ESCOLHER`.
- Saída validada por JSON Schema nativo do Claude Code.
- Continuidade opcional: o plugin devolve o `session_id` e usa `--resume` quando o bloco solicita reutilizar a conversa.
- Autenticação oficial da conta conectada ao Claude Code, sem chave de API no ContentFlow.

Arquivos, imagens, áudio e vídeo ainda não são outputs desta versão. Eles exigem capabilities próprias de artifacts.

## Pré-requisitos

1. ContentFlow 0.3.5 ou superior.
2. Claude Code oficial instalado e disponível como `claude` no `PATH` do aplicativo.
3. Sessão válida no Claude Code. Execute `claude` no terminal e conclua o login oficial.
4. Pasta de trabalho conectada ao plugin.

O plugin não pede, recebe nem armazena `ANTHROPIC_API_KEY`. A variável também não é encaminhada ao subprocesso, evitando substituir acidentalmente o acesso da assinatura por cobrança de API.

## Skills e ferramentas

O campo **Nome da skill** pode exigir uma skill específica; vazio permite que o Claude Code escolha uma skill compatível. Skills de projeto ficam em `.claude/skills/<nome>/SKILL.md`; skills pessoais ficam em `~/.claude/skills/<nome>/SKILL.md`.

O modo padrão libera somente `Read`, `Glob` e `Grep`. **Pesquisa web ao vivo** adiciona `WebSearch` e `WebFetch`. **Ler e escrever no workspace** adiciona `Write`, `Edit` e `Bash`, permitindo que o agente crie scripts e arquivos temporários da etapa. Essas permissões não autorizam publicação, compra ou exclusão externa.

## Segurança

O pacote solicita `network`, `filesystem:read`, `filesystem:write` e `process`. O Claude Code é iniciado sem shell e recebe um ambiente mínimo. Em leitura, usa `--permission-mode dontAsk`; com escrita explicitamente configurada, usa `acceptEdits`. A allowlist de ferramentas é montada pelo plugin e nunca usa bypass de permissões.

Prompts e conteúdo recuperado são tratados como dados não confiáveis. O output precisa satisfazer o contrato do bloco. Scripts de skills podem chamar outros provedores; revise a skill e as permissões antes de instalá-la.

## Instalação e teste

Instale pela Central de Plugins, revise as permissões e conecte uma pasta de trabalho. Para validar este pacote na raiz do repositório:

```powershell
npm run plugin:kit -- validate ./ecosystem/plugins/reference/claude-code-skill-runner
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/claude-code-skill-runner
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/claude-code-skill-runner
npm run plugin:kit -- report ./ecosystem/plugins/reference/claude-code-skill-runner
```

A fixture usa modo de diagnóstico e não chama a Anthropic. Um smoke test real exige o CLI instalado, login concluído e diagnóstico desativado.

## Custos, dados e revogação

A execução usa a conta conectada ao Claude Code e fica sujeita aos limites ou cobrança dessa conta. Instruções e inputs são enviados à Anthropic e, se uma ferramenta autorizada fizer isso, a outros provedores declarados pela skill.

Desative ou desinstale o plugin no ContentFlow. Para encerrar a sessão do provedor, use o comando de logout disponibilizado pela versão instalada do Claude Code.

Compatibilidade inicial: Windows desktop, Node 26, ContentFlow 0.3.5 e Claude Code com `-p`, `--output-format json`, `--json-schema` e `--resume`.
