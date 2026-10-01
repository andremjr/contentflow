# Documentação do ContentFlow

Comece pelo produto disponível e escolha o guia do seu objetivo. O ContentFlow organiza a estratégia em Métodos e executa Blocos humanos ou capabilities de plugins independentes.

| Objetivo                                        | Referência                                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instalar, atualizar e usar no Windows           | [DESKTOP.md](DESKTOP.md) e [primeiros passos](../README.md#quero-apenas-usar-o-contentflow-no-windows)                                                                                                                                                                                  |
| Entender o que existe e os limites de validação | [CURRENT_STATE.md](CURRENT_STATE.md)                                                                                                                                                                                                                                                    |
| Entender conceitos, componentes e execução      | [ARCHITECTURE.md](ARCHITECTURE.md)                                                                                                                                                                                                                                                      |
| Criar, validar, importar e executar um Método   | [Formato v3](../ecosystem/skills/contentflow-method-development/references/method-format.md), [validação](../ecosystem/skills/contentflow-method-development/references/validation.md) e [execução](../ecosystem/skills/contentflow-method-development/references/runtime-execution.md) |
| Criar e testar um plugin                        | [Quickstart](ecosystem/quickstart.md), [tutorial](ecosystem/tutorial.md) e [desenvolvimento](ecosystem/development.md)                                                                                                                                                                  |
| Configurar a capability de um Bloco             | [PLUGIN_INTERFACE.md](PLUGIN_INTERFACE.md)                                                                                                                                                                                                                                              |
| Entender Bridge, perfis, vínculos e instâncias  | [Arquitetura §6 e §12](ARCHITECTURE.md#6-arquitetura-de-parâmetros-e-plugins), [automação](ecosystem/browser-automation.md) e [instalação da extensão](../ecosystem/browser-bridge/INSTALAR.md)                                                                                         |
| Desenvolver e validar cenários reais            | [DEVELOPMENT.md](DEVELOPMENT.md), [CONTRIBUTING.md](../CONTRIBUTING.md) e [Dev Monitor interno](DEV_MONITOR.md)                                                                                                                                                                         |
| Consultar decisões e fases anteriores           | [Índice histórico](history/README.md) e [ADRs](reliability-program/decisions/README.md)                                                                                                                                                                                                 |

## Autoridade atual

A [arquitetura](ARCHITECTURE.md) define produto, domínio e responsabilidades. O [contrato de conteúdo](CONTENT_CONTRACT.md) é a fonte exclusiva de entradas, saídas, portas, valores e deliveries. A [interface do plugin](PLUGIN_INTERFACE.md) define a segunda superfície de configuração do Bloco.

O [protocolo da Plugin API v2](ecosystem/protocol.md), seu [schema](ecosystem/schemas/contentflow-plugin-v2.schema.json), [segurança](ecosystem/security.md), [automação de navegador](ecosystem/browser-automation.md), [convenções de mídia/automação](ecosystem/automation-media-conventions.md) e [distribuição](ecosystem/distribution.md) regem integrações. Guias desktop, tutoriais e referências de Métodos orientam o uso dessas fontes; não criam contratos paralelos.

[LICENSE](../LICENSE) é a autoridade jurídica. [AI_USAGE_POLICY.md](../AI_USAGE_POLICY.md) e [AGENTS.md](../AGENTS.md) governam o uso de IA e alterações no repositório. Decisões explícitas mais recentes do criador prevalecem sobre documentação anterior; divergências com o código exigem investigação e correção da fonte apropriada.

## Atual versus histórico

O [programa separado de confiabilidade foi encerrado](reliability-program/README.md). Seu roadmap, arquitetura-alvo, protocolos e tasks são históricos. A evolução atual é guiada por Métodos/plugins e cenários verticais; não depende da conclusão de uma sequência antiga.

O [índice histórico](history/README.md) distingue registros arquivados, ADRs consultáveis, inventários, propostas, baselines, evidências e releases. Arquivos históricos podem conter planos ou gaps daquele momento: consulte [CURRENT_STATE.md](CURRENT_STATE.md) antes de tratá-los como limitações presentes. Propostas não são integrações disponíveis.

O [ecossistema](ecosystem/README.md) contém guias atuais; os [manifestos dos plugins](../ecosystem/plugins/reference/README.md) identificam suas capabilities reais. Skills são ferramentas de desenvolvimento assistido, sem requisito operacional para usar o aplicativo.
