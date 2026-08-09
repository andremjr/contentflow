# ContentFlow OS

[![CI](https://github.com/andremjr/contentflow-os/actions/workflows/ci.yml/badge.svg)](https://github.com/andremjr/contentflow-os/actions/workflows/ci.yml)

Aplicativo local para organizar a produção de vídeos. O frontend roda no navegador e a API roda localmente na máquina do usuário.

## Requisitos

- [Node.js 22 LTS](https://nodejs.org/) — use uma versão `22.x`.
- Git.

Versões futuras do Node podem ainda não possuir binários compatíveis com o SQLite local. Confirme com:

```sh
node --version
```

## Como usar

```sh
git clone https://github.com/andremjr/contentflow-os.git
cd contentflow-os
npm ci
npm run dev
```

Abra `http://127.0.0.1:8080`.

## Dados locais

Ao iniciar, o aplicativo cria automaticamente o banco SQLite em `data/contentflow-os.sqlite`. Essa pasta não é enviada ao GitHub, portanto cada pessoa mantém canais, projetos e métodos apenas na própria máquina.

Não há login nem sincronização em nuvem nesta fase.

Faça backup da pasta `data/` antes de atualizar ou trocar de computador. Para atualizar:

```sh
git pull
npm ci
npm run dev
```

## Privacidade e integrações

O ContentFlow OS não possui telemetria ou analytics. As informações permanecem locais, exceto quando o usuário aciona uma integração externa:

- a sincronização de canal consulta dados públicos do YouTube;
- plugins podem enviar as entradas do bloco ao provedor declarado;
- o plugin OpenAI utiliza a chave do próprio usuário, pode gerar cobranças na conta dele e envia o contexto necessário à API da OpenAI;
- links externos só são abertos quando clicados.

A chave OpenAI permanece somente na memória da sessão local e não é gravada no banco de dados.

Por padrão, cada upload pode ter até 256 MB e a pasta local de uploads pode ocupar até 10 GB. Usuários avançados podem ajustar esses limites antes de iniciar a API com `CONTENTFLOW_MAX_UPLOAD_MB` e `CONTENTFLOW_MAX_UPLOAD_STORAGE_GB`.

## Verificação do projeto

```sh
npm run check
```

## Documentação

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Protocolo de plugins](docs/PLUGIN_PROTOCOL.md)
- [Guia de desenvolvimento de plugins](docs/PLUGIN_DEVELOPMENT.md)
- [Roadmap estratégico de plugins](docs/PLUGIN_ROADMAP.md)
- [Segurança de plugins](docs/PLUGIN_SECURITY.md)
- [Governança do ecossistema](docs/PLUGIN_ECOSYSTEM.md)
- [Proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md)
- [Como contribuir](CONTRIBUTING.md)

## Licença

Copyright © 2026 André Marinho Jr. O ContentFlow OS é distribuído sob uma [licença proprietária source-available](LICENSE), não sob uma licença open source.

É permitido usar o produto original e desenvolver plugins independentes pelo protocolo público. Não é concedida autorização para clones, versões modificadas distribuídas, produtos concorrentes, white-label, rebranding ou reskins. Consulte também a [política para ferramentas de IA](AI_USAGE_POLICY.md).
