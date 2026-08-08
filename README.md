# ContentFlow OS

Aplicativo local para organizar a produção de vídeos. O frontend roda no navegador e a API roda localmente na máquina do usuário.

## Como usar

Você precisa ter Node.js 22.12 ou mais recente instalado.

```sh
git clone https://github.com/andremjr/contentflow-os.git
cd contentflow-os
npm install
npm run dev
```

Abra `http://127.0.0.1:8080`.

## Dados locais

Ao iniciar, o aplicativo cria automaticamente o banco SQLite em `data/contentflow-os.sqlite`. Essa pasta não é enviada ao GitHub, portanto cada pessoa mantém canais, projetos e métodos apenas na própria máquina.

Não há login nem sincronização em nuvem nesta fase.

## Documentação

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [Protocolo de plugins](docs/PLUGIN_PROTOCOL.md)
- [Guia de desenvolvimento de plugins](docs/PLUGIN_DEVELOPMENT.md)
- [Roadmap estratégico de plugins](docs/PLUGIN_ROADMAP.md)
- [Segurança de plugins](docs/PLUGIN_SECURITY.md)
- [Governança do ecossistema](docs/PLUGIN_ECOSYSTEM.md)
- [Proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md)

## Licença

Copyright © 2026 André Marinho Jr. O ContentFlow OS é distribuído sob uma [licença proprietária source-available](LICENSE), não sob uma licença open source.

É permitido usar o produto original e desenvolver plugins independentes pelo protocolo público. Não é concedida autorização para clones, versões modificadas distribuídas, produtos concorrentes, white-label, rebranding ou reskins. Consulte também a [política para ferramentas de IA](AI_USAGE_POLICY.md).
