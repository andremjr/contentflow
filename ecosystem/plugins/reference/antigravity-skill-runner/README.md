# Antigravity Skill Runner

Plugin independente para ContentFlow Plugin API v1. Ele automatiza o agente Antigravity dentro dos blocos do Método como uma pessoa o usaria no terminal: conversa, pesquisa, análise, criação de scripts e edição no workspace, conforme as permissões concedidas. Skills são a especialização principal, mas não limitam as ferramentas do agente.

Este pacote não é afiliado, patrocinado nem mantido pelo Google. “Antigravity” identifica apenas o produto interoperado.

## Capacidades

- `run-production-skill`: executa blocos `BUSCAR`, `CRIAR` e `VALIDAR` com texto ou dados estruturados.
- `choose-with-production-skill`: escolhe exatamente um item existente em blocos `ESCOLHER`.
- JSON Schema nativo no modo headless, sem depender de extração frágil de texto.
- Continuidade opcional entre blocos com `conversation_id` e `--conversation`.
- Modelo, esforço e agente opcionais; vazio preserva o padrão da conta.
- Sessão OAuth já autenticada no Antigravity CLI, sem chave no ContentFlow.

Arquivos, imagens, áudio e vídeo ainda não são outputs do protocolo nesta versão. O agente pode trabalhar no workspace durante a etapa, mas promover mídia como entrega do ContentFlow exigirá capabilities próprias de artifacts.

## Pré-requisitos

1. ContentFlow 0.3.5 ou superior.
2. Antigravity CLI oficial instalado e disponível como `agy` no `PATH` do aplicativo.
3. Login concluído numa sessão interativa de `agy`.
4. Pasta de trabalho conectada ao plugin.

O plugin não pede, recebe nem armazena uma chave de API. Ele encaminha somente `PATH`, `SYSTEMROOT`, `TEMP` e `TMP` ao subprocesso e usa as credenciais em cache mantidas pelo CLI oficial.

## Skills, ferramentas e permissões

Skills de projeto ficam em `.agents/skills/<nome>/SKILL.md`. O campo **Nome da skill** pode pedir uma skill específica; vazio permite seleção pelo agente.

**Somente leitura** inicia o agente em modo de planejamento. **Ler e escrever no workspace** usa `--mode accept-edits`, permitindo criar e editar arquivos da pasta conectada. O terminal sempre usa `--sandbox`. O plugin nunca passa `--dangerously-skip-permissions`.

No modo headless, leitura e escrita no workspace seguem os padrões seguros do Antigravity. Comandos, URLs, automação web e MCP continuam sujeitos às regras finas em `~/.gemini/antigravity-cli/settings.json`; uma ação sem autorização pode ser negada sem interromper a resposta. Configure allowlists estreitas para as ferramentas realmente necessárias ao fluxo.

## Instalação e teste

Instale pela Central de Plugins, revise as permissões e conecte uma pasta de trabalho. Para validar o pacote:

```powershell
npm run plugin:kit -- validate ./ecosystem/plugins/reference/antigravity-skill-runner
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/antigravity-skill-runner
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/antigravity-skill-runner
npm run plugin:kit -- report ./ecosystem/plugins/reference/antigravity-skill-runner
```

A fixture usa modo de diagnóstico e não chama o Google. Um smoke test real exige `agy`, login concluído e diagnóstico desativado.

## Custos, dados e revogação

A execução fica sujeita aos limites e termos da conta conectada. Instruções e inputs são enviados ao Antigravity e, se uma ferramenta autorizada fizer isso, a outros provedores declarados pela skill.

Desative ou desinstale o plugin no ContentFlow. Para revogar a sessão, use o mecanismo de logout disponibilizado pelo Antigravity CLI.

Compatibilidade inicial: Windows desktop, Node 26, ContentFlow 0.3.5 e Antigravity CLI com headless JSON, JSON Schema e retomada por conversa.
