# Ecossistema ContentFlow

Esta pasta reúne tudo que interoperabiliza com o ContentFlow sem fazer parte do núcleo.

| Pasta                                     | Finalidade                                                      |
| ----------------------------------------- | --------------------------------------------------------------- |
| [`plugins/reference`](plugins/reference/) | Coleção atual de plugins completos e independentes              |
| [`plugins/examples`](plugins/examples/)   | Exemplos mínimos para estudo e testes de contrato               |
| [`browser-bridge`](browser-bridge/)       | Extensão companheira Manifest V3 usada por plugins de navegador |
| [`plugin-kit`](plugin-kit/)               | CLI, templates e fixtures para autores                          |
| [`skills`](skills/)                       | Instruções portáteis para agentes criarem plugins e Métodos     |
| [`docs`](docs/)                           | Plugin API v1, segurança, automação e distribuição              |

## Fronteira de responsabilidade

Nenhum item desta pasta é empacotado como parte confiável do núcleo. Os plugins são disponibilizados separadamente, sem obrigação implícita de suporte ou manutenção contínua pelo autor do ContentFlow. Qualquer participante da comunidade, inclusive o autor do aplicativo, pode criar, publicar, vender e manter plugins pelo protocolo público, com licença, suporte e responsabilidade próprios. A identidade do autor não muda o fluxo de instalação nem concede confiança especial.

## Distribuição

O aplicativo principal, os plugins e a Browser Bridge são distribuídos separadamente. As releases
podem oferecer `ContentFlow-Plugins.zip` e `ContentFlow-Browser-Bridge.zip` como atalhos de download,
mas todo plugin é instalado da mesma forma em **Plugins → Instalar plugin**, por uma pasta que
contenha `contentflow.plugin.json`, seguida da mesma validação, consentimento e ativação local.

O pacote de plugins é apenas uma coleção conveniente de pastas independentes. Ele não é incorporado
ao executável, não é instalado automaticamente e pode ser substituído por qualquer plugin compatível
criado ou compartilhado pela comunidade.

Para começar, leia [`docs/quickstart.md`](docs/quickstart.md) ou use uma das skills em [`skills`](skills/).
