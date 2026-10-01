# ContentFlow

O ContentFlow é um gerenciador estratégico de Métodos para produção de conteúdo. Ele separa a estratégia — processos, blocos, operadores, prompts, parâmetros e aprovações — da execução funcional feita por pessoas ou por plugins independentes.

> O núcleo e os plugins são produtos separados. O aplicativo funciona sem plugins; nenhum pacote do ecossistema é incorporado, ativado ou tratado como confiável pela distribuição do núcleo.

## O que já faz

O aplicativo organiza Canais e Projetos, oferece um construtor visual de Métodos, Biblioteca Estratégica, importação/exportação v3, snapshots de execução, entregas tipadas, aprovações humanas e filas do Orquestrador. Métodos humanos funcionam sem plugins; operadores IA e Código usam capabilities instaladas e autorizadas pelo usuário.

A gramática combina oito Processos — Tema, Título, Thumbnail, Roteiro, Narração e Áudio, Assets Visuais, Edição e Publicação — com quatro Blocos (`BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`) e três Operadores (Humano, IA, Código). O Método define a estratégia; o plugin implementa a ferramenta usada em um Bloco.

O produto possui uso real relatado em temas, títulos, thumbnails e roteiros. Isso não comprova toda combinação de integração ou uma produção automática completa. Consulte [estado atual e limitações](docs/CURRENT_STATE.md): Métodos são lineares, recuperação automática não é universal e a cobertura real varia por cenário.

## Encontre o que precisa

| Área         | Conteúdo                                                                         | Comece aqui                                                                                          |
| ------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Núcleo       | Interface React, API local, execução de Métodos, persistência e desktop Electron | [`docs/README.md`](docs/README.md)                                                                   |
| Estado atual | Capacidades presentes, limitações e alcance das evidências                       | [`docs/CURRENT_STATE.md`](docs/CURRENT_STATE.md)                                                     |
| Ecossistema  | Protocolo público, plugins, exemplos, Browser Bridge, Plugin Kit e skills        | [`ecosystem/README.md`](ecosystem/README.md)                                                         |
| Criar plugin | Guia rápido, templates, testes e contratos da Plugin API v2                      | [`docs/ecosystem/quickstart.md`](docs/ecosystem/quickstart.md)                                       |
| Criar Método | Formato v3, contratos, validação e execução                                      | [Referência de Métodos](ecosystem/skills/contentflow-method-development/references/method-format.md) |
| Desenvolver  | Cenários verticais, regressões e ferramentas internas                            | [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                                                         |
| Releases     | Instaladores e versões portáteis para Windows                                    | [GitHub Releases](https://github.com/andremjr/contentflow/releases)                                  |

## Quero apenas usar o ContentFlow no Windows

Você não precisa instalar Git, Node, npm nem abrir terminal.

1. Abra a [release estável mais recente](https://github.com/andremjr/contentflow/releases/latest).
2. Em **Assets**, baixe o arquivo que termina em `x64-Setup.exe` — esta é a opção recomendada.
3. Instale e abra o ContentFlow. O aviso do Windows pode aparecer enquanto o aplicativo ainda não possui assinatura digital comercial; confirme que o download veio deste repositório oficial.
4. Crie um Canal, monte ou importe um Método e crie seu primeiro Projeto.
5. Plugins são opcionais e baixados separadamente. O aplicativo funciona sem eles; quando quiser automação, abra **Plugins**, baixe o pacote, extraia-o e instale todos de uma vez informando a pasta raiz.

Projetos, plugins e credenciais ficam na área de dados do usuário e são preservados nas atualizações. Por isso, quem atualiza continua vendo os plugins que já instalou. Em uma instalação realmente nova, com a área de dados vazia, a tela **Plugins** começa zerada: os plugins não estão no instalador nem no portátil e só aparecem depois que a pessoa baixa o ZIP separado e instala cada pacote pelo aplicativo. Veja o [guia completo para Windows](docs/DESKTOP.md) e, se algo falhar, consulte primeiro as mensagens exibidas no próprio bloco ou plugin.

## Como usar e estender

No Canal, associe um Método a cada Processo e configure a ordem da estratégia. No editor, combine Blocos, escolha operadores e conecte entradas às saídas compatíveis. Ao iniciar um Projeto, o núcleo congela a estratégia, executa os Blocos e apresenta entregas e pendências humanas. Acompanhe o resultado no Projeto e forneça os inputs ou aprovações solicitados.

Um Método é uma composição declarativa de ações; um plugin é um pacote executável independente que oferece capabilities. Para criar um Método, consulte [formato](ecosystem/skills/contentflow-method-development/references/method-format.md), [validação](ecosystem/skills/contentflow-method-development/references/validation.md) e [execução](ecosystem/skills/contentflow-method-development/references/runtime-execution.md). Para plugins, siga o [tutorial com Plugin Kit, sandbox e execução no aplicativo](docs/ecosystem/tutorial.md).

## Como os componentes se relacionam

```text
Método / Blocos → snapshot → Core de execução → Humano ou plugin
                                 ↑                  ↓
                        estado e deliveries ← resultado validado
Plugin → API / código local / Browser Bridge → página do navegador
Perfil físico → vínculo explícito + readiness → lease → instância Chrome
Orquestrador → agenda Projetos conforme estratégia congelada e recursos
```

O Core controla estado, identidades e decisões universais; o plugin conhece a ferramenta; a Bridge transporta operações autorizadas. Cada perfil físico atende uma execução de navegador por vez. Paralelismo usa perfis distintos e unidades exclusivas. A [arquitetura](docs/ARCHITECTURE.md) detalha responsabilidades e contratos.

## Estrutura do repositório

```text
contentflow/
├── src/                 interface e domínio compartilhado do núcleo
├── server/              API local, persistência e motor de execução
├── desktop/             shell Electron, empacotamento e atualização
├── docs/                documentação do núcleo e do ecossistema
│   └── ecosystem/       Plugin API, segurança, guias e evidências
├── ecosystem/           tudo que é externo ao núcleo
│   ├── plugins/         pacotes de referência e exemplos comunitários
│   ├── browser-bridge/  extensão companheira para automação de navegador
│   ├── plugin-kit/      CLI e templates para autores
│   ├── skills/          skills de criação de plugins e Métodos
│   └── tests/           validações integradas do ecossistema
└── .github/             automações e governança do repositório
```

As pastas `src`, `server` e `desktop` compõem o produto ContentFlow. A pasta `docs` concentra toda a documentação, com o protocolo público isolado em `docs/ecosystem`. A pasta `ecosystem` contém apenas ferramentas, testes e pacotes interoperáveis, publicados no mesmo repositório para facilitar descoberta, estudo e desenvolvimento.

## Plugins

Os pacotes atualmente disponíveis em [`ecosystem/plugins/reference`](ecosystem/plugins/reference/) são plugins independentes disponibilizados separadamente. Eles não fazem parte do núcleo e sua presença neste repositório não representa promessa de manutenção contínua, suporte, disponibilidade de provedores ou compatibilidade futura. Cada plugin possui identidade, versão, permissões, dependências e licença próprias; quem cria ou distribui um plugin é responsável por seu pacote.

O ContentFlow valida todos os plugins pela mesma Plugin API v2, solicita consentimento local e executa o código em processo separado com a sandbox de permissões do Node. APIs oficiais, automações de navegador, FFmpeg, Python e regras específicas de fornecedores permanecem dentro dos respectivos plugins.

O instalador aceita tanto a pasta de um plugin quanto a raiz extraída de `ContentFlow-Plugins.zip`. No segundo caso, valida o conjunto antes de instalar, adiciona todos os plugins novos em lote e preserva sem sobrescrever os que já estavam instalados.

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

O desenvolvimento atual parte de Métodos/plugins e cenários verticais reais: observar resultado e invariantes, investigar falhas, corrigir na autoridade correta, acrescentar regressão quando aplicável e repetir o cenário. Veja o [processo de desenvolvimento](docs/DEVELOPMENT.md).

## Documentação essencial

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Estado atual e limitações](docs/CURRENT_STATE.md)
- [Desenvolvimento e validação vertical](docs/DEVELOPMENT.md)
- [Mapa e autoridade da documentação](docs/README.md)
- [Interface do plugin](docs/PLUGIN_INTERFACE.md)
- [Plugin API v2](docs/ecosystem/protocol.md)
- [Segurança de plugins](docs/ecosystem/security.md)
- [Automação de navegador](docs/ecosystem/browser-automation.md)
- [Distribuição e responsabilidades](docs/ecosystem/distribution.md)
- [Licença e uso de IA](LICENSE)

Registros de fases anteriores estão no [índice histórico](docs/history/README.md), separados da documentação de uso e dos contratos atuais.

## Licença

O núcleo é source-available proprietário, não open source. Leia [`LICENSE`](LICENSE) e [`AI_USAGE_POLICY.md`](AI_USAGE_POLICY.md) antes de usar ou alterar o código. Plugins independentes podem adotar suas próprias licenças dentro dos limites do protocolo público e da exceção de interoperabilidade prevista na licença.
