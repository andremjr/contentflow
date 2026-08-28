# ContentFlow

O ContentFlow é um gerenciador estratégico de Métodos para produção de conteúdo. Ele separa a estratégia — processos, blocos, operadores, prompts, parâmetros e aprovações — da execução funcional feita por pessoas ou por plugins independentes.

> O núcleo e os plugins são produtos separados. O aplicativo funciona sem plugins; nenhum pacote do ecossistema é incorporado, ativado ou tratado como confiável pela distribuição do núcleo.

## Encontre o que precisa

| Área         | Conteúdo                                                                         | Comece aqui                                                                                            |
| ------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Núcleo       | Interface React, API local, execução de Métodos, persistência e desktop Electron | [`docs/README.md`](docs/README.md)                                                                     |
| Ecossistema  | Protocolo público, plugins, exemplos, Browser Bridge, Plugin Kit e skills        | [`ecosystem/README.md`](ecosystem/README.md)                                                           |
| Criar plugin | Guia rápido, templates, testes e contratos da Plugin API v1                      | [`ecosystem/docs/quickstart.md`](ecosystem/docs/quickstart.md)                                         |
| Criar Método | Skill portátil para modelar e validar arquivos `.contentflow-method.json`        | [`ecosystem/skills/contentflow-method-development/`](ecosystem/skills/contentflow-method-development/) |
| Releases     | Instaladores e versões portáteis para Windows                                    | [GitHub Releases](https://github.com/andremjr/contentflow/releases)                                    |

## Quero apenas usar o ContentFlow no Windows

Você não precisa instalar Git, Node, npm nem abrir terminal.

1. Abra a [release estável mais recente](https://github.com/andremjr/contentflow/releases/latest).
2. Em **Assets**, baixe o arquivo que termina em `x64-Setup.exe` — esta é a opção recomendada.
3. Instale e abra o ContentFlow. O aviso do Windows pode aparecer enquanto o aplicativo ainda não possui assinatura digital comercial; confirme que o download veio deste repositório oficial.
4. Crie um Canal, monte ou importe um Método e crie seu primeiro Projeto.
5. Plugins são opcionais e baixados separadamente. O aplicativo funciona sem eles; quando quiser automação, abra **Plugins** e siga a instalação guiada.

Projetos, plugins e credenciais ficam na área de dados do usuário e são preservados nas atualizações. Veja o [guia completo para Windows](docs/DESKTOP_V0.md) e, se algo falhar, consulte primeiro as mensagens exibidas no próprio bloco ou plugin.

## Estrutura do repositório

```text
contentflow/
├── src/                 interface e domínio compartilhado do núcleo
├── server/              API local, persistência e motor de execução
├── desktop/             shell Electron, empacotamento e atualização
├── docs/                arquitetura, produto, desktop e licenciamento
├── ecosystem/           tudo que é externo ao núcleo
│   ├── plugins/         pacotes de referência e exemplos comunitários
│   ├── browser-bridge/  extensão companheira para automação de navegador
│   ├── plugin-kit/      CLI e templates para autores
│   ├── skills/          skills de criação de plugins e Métodos
│   └── docs/            protocolo, segurança e guias do ecossistema
└── .github/             automações e governança do repositório
```

As pastas `src`, `server` e `desktop` compõem o produto ContentFlow. A pasta `ecosystem` contém ferramentas e pacotes interoperáveis, publicados no mesmo repositório apenas para facilitar descoberta, estudo e desenvolvimento.

## Plugins

Os pacotes atualmente disponíveis em [`ecosystem/plugins/reference`](ecosystem/plugins/reference/) são plugins independentes disponibilizados separadamente. Eles não fazem parte do núcleo e sua presença neste repositório não representa promessa de manutenção contínua, suporte, disponibilidade de provedores ou compatibilidade futura. Cada plugin possui identidade, versão, permissões, dependências e licença próprias; quem cria ou distribui um plugin é responsável por seu pacote.

O ContentFlow valida todos os plugins pela mesma Plugin API v1, solicita consentimento local e executa o código em processo separado com a sandbox de permissões do Node. APIs oficiais, automações de navegador, FFmpeg, Python e regras específicas de fornecedores permanecem dentro dos respectivos plugins.

Não existe categoria especial baseada no autor: os plugins criados pelo autor do ContentFlow e os
criados por qualquer participante da comunidade usam o mesmo download por pasta, a mesma validação,
o mesmo consentimento, a mesma ativação e a mesma sandbox.

## Desenvolvimento local

Requisitos: Node.js 26 e npm 10 ou superior.

```sh
git clone https://github.com/andremjr/contentflow.git
cd contentflow
npm ci
npm run dev
```

Antes de enviar alterações:

```sh
npm run check
```

Para criar e validar um plugin:

```sh
npm run plugin:kit -- create ./meu-plugin
npm run plugin:kit -- check ./meu-plugin
```

## Documentação essencial

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Roadmap do produto](docs/V1_ROADMAP.md)
- [Plugin API v1](ecosystem/docs/protocol.md)
- [Segurança de plugins](ecosystem/docs/security.md)
- [Automação de navegador](ecosystem/docs/browser-automation.md)
- [Distribuição e responsabilidades](ecosystem/docs/distribution.md)
- [Licença e uso de IA](LICENSE)

## Licença

O núcleo é source-available proprietário, não open source. Leia [`LICENSE`](LICENSE) e [`AI_USAGE_POLICY.md`](AI_USAGE_POLICY.md) antes de usar ou alterar o código. Plugins independentes podem adotar suas próprias licenças dentro dos limites do protocolo público e da exceção de interoperabilidade prevista na licença.
