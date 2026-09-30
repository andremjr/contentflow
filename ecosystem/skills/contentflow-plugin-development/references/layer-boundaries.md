# Fronteiras entre capability, Core e Browser Bridge

Use esta referência ao decidir se operações do provedor pertencem a uma capability ou devem ser expostas como entregas separadas para composição no Método.

## Papéis

| Camada         | Autoridade                                                                                          |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Método/Bloco   | intenção, composição, bindings e entregas estratégicas                                              |
| Core           | estado, IDs, work units, deliveries, artifacts, perfis, leases, tentativas, distribuição e recovery |
| Plugin         | regras do provedor e subtarefas necessárias para cumprir a capability                               |
| Browser Bridge | transporte versionado de operações autorizadas na sessão reservada                                  |
| Perfil         | recurso físico local do Core, concedido ao plugin por vínculo explícito                             |

O plugin recebe trabalho e relata fatos. Ele não escolhe progressão, retry, fallback ou perfil seguinte. A Bridge não conhece a estratégia nem regras editoriais.

## Uma capability pode conter

- várias chamadas ou jobs do mesmo objetivo;
- navegação, upload, polling, download e parsing;
- checkpoints internos e continuação assíncrona;
- processamento de muitos work units concedidos pelo Core;
- uso da sessão efêmera do perfil ativo e comandos da Browser Bridge.

Esses passos permanecem internos quando produzem uma única entrega estratégica.

## Quando separar

Ofereça capabilities/portas separadas quando um intermediário precisar ser conectado, validado editorialmente, substituído, reutilizado ou preservado sem repetir a etapa anterior. Separe também efeitos externos com consentimentos ou significados independentes.

Não separe apenas por haver muitos itens, perfis, páginas, cliques ou tentativas. Portas `many`, `execution.itemOrchestration`, jobs assíncronos e a política de perfis do Core existem para absorver essa complexidade operacional sem multiplicar Blocos.

## Validação

- URL, origem, conta, estado da página, schema, arquivo, MIME e receipt: validação técnica do plugin/contrato.
- qualidade, aprovação, seleção ou reprovação do conteúdo: decisão editorial expressa por `VALIDAR`.

Uma capability combinada é correta quando mantém uma intenção e entrega observável. É incorreta quando esconde um Método inteiro, decide etapas seguintes ou impede que um intermediário estrategicamente relevante seja preservado.
