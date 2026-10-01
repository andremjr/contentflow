# Referência: ContentFlow Plugin API v2

Leia [`docs/CONTENT_CONTRACT.md`](../../../../docs/CONTENT_CONTRACT.md) e [`docs/ecosystem/protocol.md`](../../../../docs/ecosystem/protocol.md).

Cada capability declara portas semânticas com `key`, `label`, `shape` e `required`. O `shape` é um `ContentShape`, `ControlShape` ou `RecordShape`. Não existem `acceptedTypes`, `producedTypes`, `acceptedInputTypes`, `producedOutputTypes`, `multiple` ou `deliveryTypes`.

O handler lê `request.inputs[portKey]` e devolve `values[portKey]`. Cardinalidade pertence ao shape da porta. Um plugin nunca infere cardinalidade por array nem devolve uma família genérica de arquivo/mídia.

Para saídas `text/many` e `record/many` produzidas por IA, o usuário descreve a intenção e o
plugin traduz o `outputContract` para instrução técnica estruturada, faz parsing estrito e devolve
somente o valor tipado. Introduções, Markdown ou comentários não podem virar itens por divisão de
linhas. Quando um campo `identifier` declara `referencesInputId`, use somente os IDs concedidos em
`inputDeliveries`; o Core valida a integridade e o plugin consumidor materializa a relação na
operação específica do fornecedor.

O request preserva contratos, deliveries, IDs e contexto concedidos pelo Core. O plugin não inventa IDs universais. `execution.itemOrchestration` pode operar um membro de uma porta `many`, mantendo a identidade atribuída pelo Core.

Em uma porta de saída `many` orquestrada item a item, uma unidade pode devolver um valor atômico
ou uma lista de variantes atômicas do mesmo shape. Não envolva um valor em lista por conveniência:
use a lista somente quando a ferramenta realmente produziu mais de uma variante para a unidade.
O Core valida cada variante e preserva a mesma linhagem de origem em todas elas.

Sucesso, pending, erro, cancelamento, idempotência, artifacts, profiles, Browser Bridge e services mantêm as regras de segurança do protocolo público. Artifacts são representações materiais de conteúdo; não são família.

Erros reportam códigos e fatos de recovery estruturados; nunca devolvem a ação desejada. Distinga `BRIDGE_MISSING`, `BRIDGE_INCOMPATIBLE`, `BRIDGE_PAGE_UNAVAILABLE` e `COMMAND_OUTCOME_UNKNOWN`, porque instalação, página transitória e efeito externo incerto possuem recuperações incompatíveis. O Core pode enviar `recoveryDirective.reload_page` somente depois de decidir que a recarga é segura; o cliente aplica a diretiva antes de validar novamente a Bridge. Mensagem humana não participa da política, e um plugin não escolhe retry, reload, fallback, reconciliação ou intervenção.

A Bridge reporta fatos técnicos; o plugin é a camada de tradução semântica do fornecedor. Normalize textos/códigos equivalentes para a taxonomia universal. Atividade incomum, tráfego suspeito e detecção anti-bot tornam-se `PROVIDER_SECURITY_CHALLENGE` com intervenção `provider_security_challenge`, não `RATE_LIMIT`; o Core decide o que fazer. Não envie texto específico para o Core interpretar e não classifique por conveniência quando a recuperação segura for diferente.

Mudança de shape ou porta é incompatível e exige nova major do plugin. A API v1 não é adaptada pelo runtime v2.
