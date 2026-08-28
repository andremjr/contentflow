# ContentFlow

Gerenciador estratégico de métodos para organizar e executar a produção de vídeos. O frontend e a API rodam localmente na máquina do usuário.

## Estado atual

A versão `0.4.2` mantém os 8 Processos Universais, os 4 Blocos Essenciais e os 3 Operadores definidos na arquitetura. O aplicativo inclui:

- execução linear de Métodos com pausa humana, plugins automáticos, outputs universais e histórico do canal;
- Orquestrador de Projetos nos modos ponta a ponta e lote por processo, com fila persistente, parada, correção e retomada;
- retries de validação com novas tentativas identificadas sem reaproveitar jobs invalidados;
- execução sequencial de inputs em lote e fallback entre perfis explicitamente preparados somente para falhas técnicas permitidas;
- funcionamento completo como organizador de Métodos mesmo quando nenhum plugin está instalado.

Plugins são software externo ao ContentFlow. A release do núcleo não inclui nem instala plugins; integrações mantidas pelo autor para seus alunos são distribuídas separadamente e obedecem ao mesmo protocolo, consentimento e sandbox de qualquer outro plugin.

A descrição normativa do comportamento está em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). O contrato de integrações está em [`docs/PLUGIN_PROTOCOL.md`](docs/PLUGIN_PROTOCOL.md).

## V0 para Windows — sem Node ou terminal

Usuários leigos podem baixar o instalador pronto na página [Releases](https://github.com/andremjr/contentflow-os/releases). O arquivo **Setup** é a opção recomendada: basta executar, escolher a pasta e abrir o atalho do ContentFlow. O arquivo **Portable** não instala nada, mas é mais lento para abrir porque descompacta o aplicativo a cada execução.

No aplicativo instalado, a página inicial permite verificar, baixar e instalar a release estável mais recente. A versão portátil abre a página oficial para baixar o instalador recomendado.

O aplicativo inclui uma cópia privada do Node 26 para executar o núcleo e isolar plugins externos, abre como um programa comum do Windows e guarda projetos, plugins instalados e credenciais fora da pasta de instalação. Veja [`docs/DESKTOP_V0.md`](docs/DESKTOP_V0.md) para uso, atualização e compilação.

## Requisitos para desenvolver o núcleo

- [Node.js 26](https://nodejs.org/) — use uma versão `26.x`. Essa versão é necessária para a sandbox negar também o acesso à rede quando o plugin não recebeu essa permissão.
- Git.

Confirme a versão ativa com:

```sh
node --version
```

## Como executar pelo código-fonte

```sh
git clone https://github.com/andremjr/contentflow-os.git
cd contentflow-os
npm ci
npm run dev
```

Abra `http://127.0.0.1:8080`.

## Criar ou converter um plugin

Comece por [`docs/PLUGIN_START_HERE.md`](docs/PLUGIN_START_HERE.md). O guia mostra o caminho mínimo, como adaptar JavaScript, APIs, n8n/Make, Python/FFmpeg e automações de navegador, e o que o núcleo já resolve para o autor.

```sh
npm run plugin:kit -- create ./meu-plugin --template text-transform
npm run plugin:kit -- check ./meu-plugin
```

Para criar com ChatGPT, Claude, Gemini ou outro agente, use o [pacote compacto para IA](docs/PLUGIN_AI_KIT.md). Não é necessário compartilhar o repositório inteiro com a IA.

## Dados locais

No Windows, tanto a execução pelo código-fonte quanto a versão instalada usam o mesmo banco SQLite em `%APPDATA%\ContentFlow\data\contentflow-os.sqlite`. Assim, canais, projetos e métodos vistos no preview também aparecem no aplicativo compilado. Em outros sistemas, o desenvolvimento continua usando `data/contentflow-os.sqlite` dentro do repositório.

Na primeira execução da versão atual pelo código-fonte no Windows, um banco legado encontrado em `data/` é migrado automaticamente para a área compartilhada quando ainda não existe um banco no destino.

Cada saída produzida no Projeto é registrada em **Produtos do projeto** com um ID universal de entrega e IDs individuais para suas subentregas. O construtor de Métodos pode selecionar qualquer saída anterior por Processo, Bloco e Entrega; o motor resolve os IDs reais em cada execução. Isso permite que plugins relacionem títulos, cenas, SRT, áudio, assets e cortes sem regras de produção fixas no núcleo.

O bloco `ESCOLHER` pode declarar **Histórico do canal** como contexto para consultar entregas escalares de outros Projetos do mesmo Canal antes de selecionar um item da Biblioteca Estratégica. O Método define a origem, a janela e se considera decisões concluídas ou apenas Projetos publicados; a regra editorial permanece nas instruções ou na configuração do plugin. Cada item escolhido passa a ser uma entrega histórica reutilizável.

Não há login nem sincronização em nuvem nesta fase.

Faça backup de `%APPDATA%\ContentFlow\data` antes de atualizar ou trocar de computador. Para atualizar o código-fonte:

```sh
git pull
npm ci
npm run dev
```

## Privacidade e integrações

O ContentFlow não possui telemetria ou analytics. As informações permanecem locais. Um plugin externo pode enviar entradas ao provedor declarado somente quando o usuário o instala, autoriza e executa; links externos só são abertos quando clicados.

Credenciais de plugins são armazenadas no cofre seguro do ambiente local, nunca no SQLite ou no Método, e são entregues somente à invocação autorizada. Cada Bloco do Método escolhe sua configuração funcional e referencia uma conexão local nomeada; o valor secreto permanece fora do Método. A página de Plugins cuida da instalação, atualização, permissões, ativação e remoção dos pacotes.

Nenhum plugin faz parte do núcleo ou recebe confiança implícita, inclusive os mantidos pelo autor do ContentFlow. Plugins não precisam de aprovação do projeto para ser criados ou compartilhados. A decisão de instalar e ativar é local: o aplicativo valida o manifesto, mostra as permissões pedidas e só executa depois do consentimento do usuário, em processo separado com a sandbox de permissões do Node. Autores e usuários respondem por seu código e uso conforme sua participação e a legislação aplicável; o núcleo continua responsável pelas proteções e dados sob seu controle. Consulte o [guia de desenvolvimento](docs/PLUGIN_DEVELOPMENT.md), o [plugin comunitário mínimo](plugins/examples/community-reference/README.md), a [governança do ecossistema](docs/PLUGIN_ECOSYSTEM.md) e a [proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md).

Por padrão, cada upload pode ter até 256 MB e a pasta local de uploads pode ocupar até 10 GB. Usuários avançados podem ajustar esses limites antes de iniciar a API com `CONTENTFLOW_MAX_UPLOAD_MB` e `CONTENTFLOW_MAX_UPLOAD_STORAGE_GB`.

## Verificação do projeto

```sh
npm run check
```

## Documentação

### Para autores de plugins

- [Comece aqui: criar ou converter um plugin](docs/PLUGIN_START_HERE.md)
- [Aula prática de 30 minutos](docs/PLUGIN_TUTORIAL_30_MIN.md)
- [Pacote compacto para criação com IA](docs/PLUGIN_AI_KIT.md)
- [Guia detalhado de desenvolvimento](docs/PLUGIN_DEVELOPMENT.md)
- [Protocolo normativo API v1](docs/PLUGIN_PROTOCOL.md)
- [Automação de navegador](docs/PLUGIN_BROWSER_AUTOMATION.md)
- [Segurança e permissões](docs/PLUGIN_SECURITY.md)
- [Distribuição e governança](docs/PLUGIN_ECOSYSTEM.md)
- [Roadmap e ideias por processo](docs/PLUGIN_ROADMAP.md)

### Produto e manutenção

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Roadmap de finalização da V1.0.0](docs/V1_ROADMAP.md)
- [V0 compilada para Windows](docs/DESKTOP_V0.md)
- [Tradutor de Métodos](docs/gpt-method-translator/GPT_CONFIGURATION.md)
- [Proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md)
- [Como contribuir](CONTRIBUTING.md)

## Licença

Copyright © 2026 André Marinho Jr. O ContentFlow é distribuído sob uma [licença proprietária source-available](LICENSE), não sob uma licença open source.

É permitido usar o produto original e desenvolver plugins independentes pelo protocolo público. Não é concedida autorização para clones, versões modificadas distribuídas, produtos concorrentes, white-label, rebranding ou reskins. Consulte também a [política para ferramentas de IA](AI_USAGE_POLICY.md).
