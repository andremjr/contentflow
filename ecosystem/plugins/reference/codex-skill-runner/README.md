# Codex Skill Runner

Plugin independente compatível com ContentFlow Plugin API v1. Ele automatiza o agente Codex dentro dos blocos do Método como uma pessoa o usaria no chat ou terminal: conversa, pesquisa, análise, criação de scripts e edição no workspace, conforme as permissões concedidas. Skills são a especialização principal, mas não limitam as ferramentas do agente.

Este pacote não é afiliado, patrocinado nem mantido pela OpenAI. “Codex” e “OpenAI” são usados apenas para identificar o provedor interoperado.

## O que a V1 entrega

- `run-production-skill`: usa uma skill para executar blocos `BUSCAR`, `CRIAR` e `VALIDAR`, com saída de texto ou dados estruturados.
- `choose-with-production-skill`: escolhe exatamente um item existente da Biblioteca Estratégica em blocos `ESCOLHER`.
- Invocação não interativa por `codex exec` e schema de saída obrigatório.
- Continuidade opcional entre blocos com o ID da thread e `codex exec resume`.
- Reutilização da autenticação oficial já configurada no Codex CLI, inclusive o acesso por assinatura do ChatGPT.

Arquivos, imagens, áudio e vídeo ainda não são outputs desta versão. Eles exigem uma capability própria que promova artifacts pelo protocolo do ContentFlow.

## Pré-requisitos

1. ContentFlow 0.3.5 ou superior.
2. Codex CLI oficial instalado e disponível como `codex` no `PATH` do aplicativo. A instalação do plugin não instala executáveis nem dependências.
3. Uma sessão válida no Codex CLI. Execute `codex login`, conclua o acesso com sua conta ChatGPT e confirme com `codex login status`.
4. Uma pasta de trabalho conectada ao plugin.

O plugin não pede, recebe nem armazena `OPENAI_API_KEY`. O Codex CLI resolve a autenticação pelo mecanismo oficial já configurado no computador — armazenamento de credenciais do sistema ou `~/.codex/auth.json`, conforme a configuração do próprio Codex.

## Reutilizar skills existentes

Na pasta de trabalho conectada ao plugin, use a convenção oficial de skills de repositório:

```text
workspace/
└── .agents/
    └── skills/
        └── minha-skill/
            ├── SKILL.md
            ├── scripts/       # opcional
            ├── references/    # opcional
            └── assets/        # opcional
```

Copie apenas as skills necessárias para esse workspace. Cada `SKILL.md` precisa declarar `name` e `description`. O campo **Nome da skill** do bloco pode invocá-la explicitamente; quando vazio, o Codex pode selecionar implicitamente uma skill compatível.

O plugin não lê, copia nem interpreta credenciais. Ele inicia o executável oficial, e o próprio Codex CLI acessa sua sessão já configurada. Além das skills, o agente pode pesquisar, analisar arquivos, criar scripts e editar o workspace quando essas capacidades forem autorizadas na configuração do bloco.

## Segurança e permissões

O pacote solicita:

- `network`: comunicação do Codex com a OpenAI e, quando a skill possuir scripts autorizados, com os provedores declarados por ela;
- `filesystem:read` e `filesystem:write`: leitura da skill e estado temporário/dedicado dentro da pasta conectada;
- `process`: início do Codex CLI. Esta é uma permissão avançada; subprocessos possuem a autoridade normal do usuário.

O Codex é iniciado sem shell, com argumentos estruturados, aprovação `never`, sandbox `read-only` por padrão e configuração pessoal ignorada. O flag `--ignore-user-config` evita carregar preferências pessoais, mas preserva a autenticação oficial do CLI. Plugins remotos do Codex ficam desativados nessa execução. O modo `workspace-write` deve ser usado somente quando o agente realmente precisar gravar na pasta autorizada. As sessões persistem apenas para permitir a continuidade explicitamente selecionada pelo Método.

Prompts, entradas e conteúdo recuperado são tratados como dados não confiáveis. Nenhuma credencial é inserida no prompt, na resposta ou nos logs pelo plugin.

## Custos e dados

A execução usa a conta já conectada ao Codex e fica sujeita aos limites, créditos ou cobrança do método de login escolhido no próprio Codex. O plugin não estima custo antecipadamente. Instruções e inputs do bloco são enviados à OpenAI; scripts contidos nas skills podem chamar outros provedores, por isso a permissão de rede deve ser revisada junto com o conteúdo de cada skill.

Consulte as políticas atuais do provedor em <https://platform.openai.com/docs/guides/your-data>.

## Instalação e teste

No ContentFlow, abra **Plugins → Instalar plugin → Usar pasta ao vivo**, selecione esta pasta, revise as permissões e conecte uma pasta de trabalho. Antes da primeira execução real, confirme no terminal que `codex login status` reconhece sua conta ChatGPT.

Na raiz do repositório:

```powershell
npm run plugin:kit -- validate ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- report ./ecosystem/plugins/reference/codex-skill-runner
```

A fixture usa **Modo de diagnóstico** e não chama a OpenAI. Para um smoke test real, desative esse modo em um bloco, conecte uma skill e execute um Projeto de teste.

## Revogação

Desative ou desinstale o plugin na Central de Plugins. Para encerrar também a sessão usada pelo CLI, execute `codex logout`. A pasta de trabalho conectada pode ser desconectada ou apagada pelo usuário conforme sua política de retenção.

## Suporte

Compatibilidade inicial: Windows desktop, Node 26, ContentFlow 0.3.5 e Codex CLI com suporte aos flags documentados de `codex exec`.
