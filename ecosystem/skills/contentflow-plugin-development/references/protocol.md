# Referência: ContentFlow Plugin API v2

Leia [`docs/CONTENT_CONTRACT.md`](../../../../docs/CONTENT_CONTRACT.md) e [`docs/ecosystem/protocol.md`](../../../../docs/ecosystem/protocol.md).

Cada capability declara portas semânticas com `key`, `label`, `shape` e `required`. O `shape` é um `ContentShape`, `ControlShape` ou `RecordShape`. Não existem `acceptedTypes`, `producedTypes`, `acceptedInputTypes`, `producedOutputTypes`, `multiple` ou `deliveryTypes`.

O handler lê `request.inputs[portKey]` e devolve `values[portKey]`. Cardinalidade pertence ao shape da porta. Um plugin nunca infere cardinalidade por array nem devolve uma família genérica de arquivo/mídia.

O request preserva contratos, deliveries, IDs e contexto concedidos pelo Core. O plugin não inventa IDs universais. `execution.itemOrchestration` pode operar um membro de uma porta `many`, mantendo a identidade atribuída pelo Core.

Sucesso, pending, erro, cancelamento, idempotência, artifacts, profiles, Browser Bridge e services mantêm as regras de segurança do protocolo público. Artifacts são representações materiais de conteúdo; não são família.

Mudança de shape ou porta é incompatível e exige nova major do plugin. A API v1 não é adaptada pelo runtime v2.
