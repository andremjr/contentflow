# Plugins oficiais

Esta pasta contém os plugins oficiais distribuídos junto com o ContentFlow.

Todos os plugins desta pasta são carregados automaticamente e executam como código confiável, sem a sandbox reservada a plugins locais e instalados. A inclusão aqui exige revisão integral do pacote, das dependências, permissões, efeitos externos, subprocessos e política de dados.

Cada plugin oficial segue o contrato descrito em [`docs/PLUGIN_PROTOCOL.md`](../../docs/PLUGIN_PROTOCOL.md) e continua sujeito às mesmas regras públicas de capacidades, permissões e dados.

O catálogo atual cobre modelos de linguagem, automações de navegador, busca de mídia, transcrição, narração, remoção de silêncio, execução de skills e montagem de vídeo. A identidade, versão, capacidades, permissões e política de dados de cada integração ficam exclusivamente no respectivo `contentflow.plugin.json`; este README não mantém uma segunda lista de manifestos.

O caminho inicial para criar ou converter um plugin está em [`docs/PLUGIN_START_HERE.md`](../../docs/PLUGIN_START_HERE.md). O passo a passo detalhado, exemplos de manifesto e fixtures estão em [`docs/PLUGIN_DEVELOPMENT.md`](../../docs/PLUGIN_DEVELOPMENT.md).

Os requisitos obrigatórios de isolamento e publicação estão em [`docs/PLUGIN_SECURITY.md`](../../docs/PLUGIN_SECURITY.md) e [`docs/PLUGIN_ECOSYSTEM.md`](../../docs/PLUGIN_ECOSYSTEM.md).

A sequência recomendada dos plugins oficiais está em [`docs/PLUGIN_ROADMAP.md`](../../docs/PLUGIN_ROADMAP.md).
