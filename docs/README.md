# Documentação do ContentFlow

Esta pasta concentra a documentação do produto e do ecossistema. O código e os pacotes externos ficam separados em [`../ecosystem`](../ecosystem/README.md).

## Autoridade e classificação

As categorias abaixo evitam que planejamento ou evidência histórica seja interpretado como arquitetura vigente.

| Classe | Uso | Documentos |
| --- | --- | --- |
| **A — Normativo vigente** | Define o produto, contratos e regras atuais. | [`ARCHITECTURE.md`](ARCHITECTURE.md), [`PLUGIN_INTERFACE.md`](PLUGIN_INTERFACE.md), [`ecosystem/protocol.md`](ecosystem/protocol.md), [`ecosystem/schemas/contentflow-plugin-v1.schema.json`](ecosystem/schemas/contentflow-plugin-v1.schema.json), [`ecosystem/security.md`](ecosystem/security.md), [`ecosystem/browser-automation.md`](ecosystem/browser-automation.md), [`ecosystem/automation-media-conventions.md`](ecosystem/automation-media-conventions.md) e [`ecosystem/distribution.md`](ecosystem/distribution.md). |
| **B — Operacional vigente** | Orienta desenvolvimento, distribuição, uso ou ensino do produto atual. | [`DESKTOP.md`](DESKTOP.md), [`LEGAL_AND_LICENSING.md`](LEGAL_AND_LICENSING.md), [`ecosystem/README.md`](ecosystem/README.md), quickstart, development, tutorial, guia de IA, exemplos, proveniência de ícones e guias conceituais. |
| **C — Evidência histórica útil** | Registra compatibilidade, reprodução, baseline ou validação; não define o comportamento atual. | [`releases/`](releases/), [`ecosystem/asset-generation-evidence/`](ecosystem/asset-generation-evidence/), [`SHARED_BROWSER_PROFILES_AND_PLUGIN_CONFIGURATION_ROADMAP.md`](SHARED_BROWSER_PROFILES_AND_PLUGIN_CONFIGURATION_ROADMAP.md) e os inventários/baselines `SHARED_BROWSER_*`. |
| **D — Planejamento ativo** | Contém trabalho real ainda não concluído; não substitui fontes normativas. | [`ecosystem/roadmap.md`](ecosystem/roadmap.md), [`FLOW_VISUAL_ASSET_METHOD_CATALOG.md`](FLOW_VISUAL_ASSET_METHOD_CATALOG.md) e planos operacionais de demonstração ainda identificados como tal. |

O arquivo [`../LICENSE`](../LICENSE) é a autoridade jurídica. [`../AI_USAGE_POLICY.md`](../AI_USAGE_POLICY.md) e [`../AGENTS.md`](../AGENTS.md) governam o uso de IA e alterações no repositório.

## Reliability Program

[`ARCHITECTURE.md`](ARCHITECTURE.md) continua sendo a fonte normativa da arquitetura e do domínio canônico. O [`Reliability Program`](reliability-program/README.md) é a consolidação atual do trabalho de confiabilidade: reúne constituição, arquitetura-alvo, Current State, decisões, roadmap, cenários e protocolo de trabalho sem substituir a arquitetura vigente antes da implementação correspondente.

Para extensões e integrações, use a documentação do ecossistema em [`docs/ecosystem/`](ecosystem/README.md), subordinada aos contratos normativos do Core e da Plugin API.

## Regra de leitura

Para arquitetura e domínio, leia primeiro `ARCHITECTURE.md`. Para a segunda superfície de configuração aberta a partir de um Bloco, leia `PLUGIN_INTERFACE.md`. Para integrações externas, use o protocolo e os documentos normativos do ecossistema.

Planejamentos ativos devem declarar estado e pendências. Evidências, inventários, baselines e notas de release preservam fatos do momento em que foram produzidos, mas nunca prevalecem sobre uma fonte normativa atual.

O roadmap de perfis compartilhados permanece apenas para compatibilidade e rastreabilidade das implementações anteriores ao Reliability Program. O roadmap do ecossistema continua ativo exclusivamente como catálogo estratégico de plugins, e o catálogo de Métodos de assets visuais continua como planejamento funcional de Métodos e plugins; nenhum deles governa o Core.

## Desenvolvimento de Métodos e plugins

- Métodos: [`../ecosystem/skills/contentflow-method-development`](../ecosystem/skills/contentflow-method-development/).
- Plugins: [`../ecosystem/skills/contentflow-plugin-development`](../ecosystem/skills/contentflow-plugin-development/).
- Protocolo público: [`ecosystem/protocol.md`](ecosystem/protocol.md).
