# ContentFlow OS

[![CI](https://github.com/andremjr/contentflow-os/actions/workflows/ci.yml/badge.svg)](https://github.com/andremjr/contentflow-os/actions/workflows/ci.yml)

Aplicativo local para organizar a produção de vídeos. O frontend e a API rodam localmente na máquina do usuário.

## V0 para Windows — sem Node ou terminal

Usuários leigos podem baixar o instalador pronto na página [Releases](https://github.com/andremjr/contentflow-os/releases). O arquivo **Setup** é a opção recomendada: basta executar, escolher a pasta e abrir o atalho do ContentFlow OS. O arquivo **Portable** não instala nada, mas é mais lento para abrir porque descompacta o aplicativo a cada execução.

O aplicativo inclui uma cópia privada do Node 26, abre como um programa comum do Windows e guarda projetos, plugins e credenciais fora da pasta de instalação. Veja [`docs/DESKTOP_V0.md`](docs/DESKTOP_V0.md) para uso, atualização e compilação.

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

## Dados locais

No Windows, tanto a execução pelo código-fonte quanto a versão instalada usam o mesmo banco SQLite em `%APPDATA%\ContentFlow OS\data\contentflow-os.sqlite`. Assim, canais, projetos e métodos vistos no preview também aparecem no aplicativo compilado. Em outros sistemas, o desenvolvimento continua usando `data/contentflow-os.sqlite` dentro do repositório.

Na primeira execução da versão atual pelo código-fonte no Windows, um banco legado encontrado em `data/` é migrado automaticamente para a área compartilhada quando ainda não existe um banco no destino.

Não há login nem sincronização em nuvem nesta fase.

Faça backup de `%APPDATA%\ContentFlow OS\data` antes de atualizar ou trocar de computador. Para atualizar o código-fonte:

```sh
git pull
npm ci
npm run dev
```

## Privacidade e integrações

O ContentFlow OS não possui telemetria ou analytics. As informações permanecem locais, exceto quando o usuário aciona uma integração externa:

- a sincronização de canal consulta dados públicos do YouTube;
- plugins podem enviar as entradas do bloco ao provedor declarado;
- plugins oficiais de modelos utilizam a credencial do próprio usuário, podem gerar cobranças na conta dele e enviam ao provedor declarado o contexto necessário à execução;
- links externos só são abertos quando clicados.

Credenciais de plugins são armazenadas no cofre nativo do sistema operacional, nunca no SQLite ou no Método, e são entregues somente à invocação autorizada. O preenchimento transitório continua disponível quando o usuário não quiser persistir uma credencial.

Plugins não oficiais não são mantidos, revisados ou garantidos pelo ContentFlow OS apenas por serem carregados localmente. Eles não precisam de aprovação do projeto para ser criados, compartilhados, instalados ou ativados. A decisão é local: o aplicativo valida o manifesto, mostra as capacidades pedidas e só executa depois do consentimento do usuário, em um processo separado com a sandbox de permissões do Node. Autores e usuários respondem por seu código e uso conforme sua participação e a legislação aplicável; o núcleo continua responsável pelas proteções e dados que estiverem efetivamente sob seu controle. Consulte o [guia de desenvolvimento](docs/PLUGIN_DEVELOPMENT.md), o [plugin comunitário mínimo](plugins/examples/community-reference/README.md), a [governança do ecossistema](docs/PLUGIN_ECOSYSTEM.md) e a [proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md).

Por padrão, cada upload pode ter até 256 MB e a pasta local de uploads pode ocupar até 10 GB. Usuários avançados podem ajustar esses limites antes de iniciar a API com `CONTENTFLOW_MAX_UPLOAD_MB` e `CONTENTFLOW_MAX_UPLOAD_STORAGE_GB`.

## Verificação do projeto

```sh
npm run check
```

## Documentação

- [Arquitetura e visão de produto](docs/ARCHITECTURE.md)
- [V0 compilada para Windows](docs/DESKTOP_V0.md)
- [Protocolo de plugins](docs/PLUGIN_PROTOCOL.md)
- [Guia de desenvolvimento de plugins](docs/PLUGIN_DEVELOPMENT.md)
- [Automação de navegador e camadas de produtividade](docs/PLUGIN_BROWSER_AUTOMATION.md)
- [Revisão de manutenção de 2026-08-10](docs/MAINTENANCE_REVIEW_2026-08-10.md)
- [Roadmap estratégico de plugins](docs/PLUGIN_ROADMAP.md)
- [Segurança de plugins](docs/PLUGIN_SECURITY.md)
- [Governança do ecossistema](docs/PLUGIN_ECOSYSTEM.md)
- [Proteção jurídica e licenciamento](docs/LEGAL_AND_LICENSING.md)
- [Como contribuir](CONTRIBUTING.md)

## Licença

Copyright © 2026 André Marinho Jr. O ContentFlow OS é distribuído sob uma [licença proprietária source-available](LICENSE), não sob uma licença open source.

É permitido usar o produto original e desenvolver plugins independentes pelo protocolo público. Não é concedida autorização para clones, versões modificadas distribuídas, produtos concorrentes, white-label, rebranding ou reskins. Consulte também a [política para ferramentas de IA](AI_USAGE_POLICY.md).
