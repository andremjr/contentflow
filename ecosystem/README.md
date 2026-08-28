# Ecossistema ContentFlow

Esta pasta reúne tudo que interoperabiliza com o ContentFlow sem fazer parte do núcleo.

| Pasta | Finalidade |
| --- | --- |
| [`plugins/reference`](plugins/reference/) | Plugins iniciais completos, independentes e distribuídos como referência |
| [`plugins/examples`](plugins/examples/) | Exemplos mínimos para estudo e testes de contrato |
| [`browser-bridge`](browser-bridge/) | Extensão companheira Manifest V3 usada por plugins de navegador |
| [`plugin-kit`](plugin-kit/) | CLI, templates e fixtures para autores |
| [`skills`](skills/) | Instruções portáteis para agentes criarem plugins e Métodos |
| [`docs`](docs/) | Plugin API v1, segurança, automação e distribuição |

## Fronteira de responsabilidade

Nenhum item desta pasta é empacotado como parte confiável do núcleo. Os plugins de referência são disponibilizados como ponto de partida e demonstração, sem obrigação implícita de suporte ou manutenção contínua pelo autor do ContentFlow. Autores podem criar, publicar, vender e manter seus próprios plugins pelo protocolo público, com licença, suporte e responsabilidade próprios.

Para começar, leia [`docs/quickstart.md`](docs/quickstart.md) ou use uma das skills em [`skills`](skills/).
