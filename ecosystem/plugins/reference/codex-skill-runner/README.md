# Codex Skill Runner

Plugin independente compatível com ContentFlow Plugin API v1. Ele permite executar skills do Codex como operadores de blocos do Método, mantendo a sequência, os bindings, as tentativas e as entregas sob controle do ContentFlow.

Este pacote não é afiliado, patrocinado nem mantido pela OpenAI. “Codex” e “OpenAI” são usados apenas para identificar o provedor interoperado.

## O que a V1 entrega

- `run-production-skill`: usa uma skill para executar blocos `BUSCAR`, `CRIAR` e `VALIDAR`, com saída de texto ou dados estruturados.
- `choose-with-production-skill`: escolhe exatamente um item existente da Biblioteca Estratégica em blocos `ESCOLHER`.
- Invocação não interativa por `codex exec`, schema de saída obrigatório e sessão efêmera.
- Workspace e `CODEX_HOME` dedicados ao plugin; o perfil pessoal do usuário não é examinado nem reutilizado silenciosamente.

Arquivos, imagens, áudio e vídeo ainda não são outputs desta versão. Eles exigem uma capability própria que promova artifacts pelo protocolo do ContentFlow.

## Pré-requisitos

1. ContentFlow 0.3.5 ou superior.
2. Codex CLI oficial instalado e disponível como `codex` no `PATH` do aplicativo. A instalação do plugin não instala executáveis nem dependências.
3. Uma chave de API da OpenAI com acesso ao modelo escolhido. Salve-a como `OPENAI_API_KEY` no cofre da Central de Plugins.
4. Uma pasta de trabalho conectada ao plugin.

O login da aplicação Codex/ChatGPT não é reutilizado por esta versão. O executor de plugins do ContentFlow entrega um ambiente mínimo de propósito; a autenticação usa exclusivamente a chave autorizada no cofre.

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

O plugin não busca arquivos em `%USERPROFILE%`, não copia `~/.codex` e não extrai sessões ou credenciais pessoais.

## Segurança e permissões

O pacote solicita:

- `network`: comunicação do Codex com a OpenAI e, quando a skill possuir scripts autorizados, com os provedores declarados por ela;
- `filesystem:read` e `filesystem:write`: leitura da skill e estado temporário/dedicado dentro da pasta conectada;
- `process`: início do Codex CLI. Esta é uma permissão avançada; subprocessos possuem a autoridade normal do usuário.

O Codex é iniciado sem shell, com argumentos estruturados, aprovação `never`, sandbox `read-only` por padrão, configuração pessoal ignorada, sessão efêmera e `CODEX_HOME` isolado. Um provider efêmero lê `OPENAI_API_KEY` diretamente do ambiente autorizado; o valor não é gravado em `auth.json` nem em `config.toml`. Plugins remotos do Codex ficam desativados nessa execução. O modo `workspace-write` deve ser usado somente quando scripts da skill realmente precisarem gravar na pasta autorizada.

Prompts, entradas e conteúdo recuperado são tratados como dados não confiáveis. O plugin nunca envia `OPENAI_API_KEY` no prompt, resposta ou logs.

## Custos e dados

A execução usa a API da OpenAI e pode gerar cobrança por uso. O plugin não estima custo antecipadamente. Instruções e inputs do bloco são enviados à OpenAI; scripts contidos nas skills podem chamar outros provedores, por isso a permissão de rede deve ser revisada junto com o conteúdo de cada skill.

Consulte as políticas atuais do provedor em <https://platform.openai.com/docs/guides/your-data>.

## Instalação e teste

No ContentFlow, abra **Plugins → Instalar plugin → Usar pasta ao vivo**, selecione esta pasta, revise as permissões, conecte uma pasta de trabalho e cadastre `OPENAI_API_KEY`.

Na raiz do repositório:

```powershell
npm run plugin:kit -- validate ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/codex-skill-runner
npm run plugin:kit -- report ./ecosystem/plugins/reference/codex-skill-runner
```

A fixture usa **Modo de diagnóstico** e não chama a OpenAI. Para um smoke test real, desative esse modo em um bloco, conecte uma skill e execute um Projeto de teste.

## Revogação

Desative ou desinstale o plugin na Central de Plugins, remova `OPENAI_API_KEY` do cofre e revogue a chave no painel da OpenAI. A pasta de trabalho conectada pode ser desconectada ou apagada pelo usuário conforme sua política de retenção.

## Suporte

Compatibilidade inicial: Windows desktop, Node 26, ContentFlow 0.3.5 e Codex CLI com suporte aos flags documentados de `codex exec`.
