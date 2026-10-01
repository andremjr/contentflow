# TASK-028D — Consumo textual e relações explícitas entre itens

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md). A prova vertical parcial permanece parcial; o estado active original não constitui uma missão ativa do programa encerrado.

## Estado

`active`

## Objetivo de produto

Permitir que um Bloco consuma uma coleção de textos inline como um único texto e que Blocos semanticamente capazes produzam relações explícitas entre itens, preservando os IDs e a neutralidade semântica do núcleo.

## Problema técnico observado

Uma saída `text/many/inline` só pode alimentar uma entrada de cardinalidade idêntica. Isso força capabilities itemizadas a executar uma vez por texto mesmo quando o Bloco seguinte precisa analisar a coleção inteira. Além disso, os IDs das deliveries não chegam ao executor com valores/relações suficientes para uma IA produzir um mapa validável e para outro plugin aplicar esse mapa deterministicamente.

## Decisão arquitetural aplicável

- A saída do produtor permanece `many`; a cardinalidade da entrada declara a forma de consumo.
- A única contração automática é `text/many/inline → text/one/inline`, por concatenação determinística e sem alterar a delivery de origem.
- Imagens, áudios, vídeos, artifacts, controles e registros não recebem merge implícito.
- IDs e itens de origem viajam como metadados paralelos; não são incorporados à família de conteúdo.
- Um campo de registro pode declarar que seus identificadores referenciam uma entrada do mesmo Bloco.
- O executor semanticamente capaz recebe schema e IDs válidos e produz as relações.
- O núcleo valida somente existência/integridade referencial e materializa `DeliveryItem.references`; não interpreta personagens, cenas, legendas ou qualquer outro significado editorial.
- Plugins consumidores fazem apenas matching determinístico dos IDs declarados.

## Fora de escopo

- Inferência semântica no Core.
- Merge automático de mídia.
- Compatibilidade com Método v1/v2 ou Plugin API v1.
- Release, tag, incremento de versão ou publicação.

## Evidências necessárias

- testes de contrato para a contração textual e rejeição das demais famílias;
- testes de resolução preservando IDs/itens da delivery;
- testes de schema e integridade referencial dos registros;
- teste do plugin textual para instrução estruturada com IDs;
- teste do Flow para seleção de referências por item de cena;
- reprodução vertical do Método real de assets.

## Evidências observadas em 01/10/2026

- o Método real passou a consumir os 23 prompts como um único `text/one/inline`, preservando os 23 IDs na delivery de origem;
- o Bloco semântico devolveu 4 registros de personagens com relações explícitas para as cenas;
- a captura do ChatGPT foi ajustada para o DOM atual sem abandonar os seletores anteriores;
- o Flow iniciou 4 unidades de personagens, e não 23;
- o primeiro item revelou uma divergência genérica: o executor devolveu uma lista de artifacts para uma unidade de uma porta `image/many`, enquanto a boundary aceitava somente um artifact atômico;
- a boundary passou a aceitar uma ou mais variantes atômicas por unidade, validando cada uma e propagando a mesma linhagem;
- unidades de tentativas antigas que não pertencem ao job atual deixaram de contaminar a lista e o progresso do Bloco.
- artifacts/variantes incrementais deixaram de substituir o progresso do lote; o denominador permanece nas unidades obrigatórias da orquestração.
- a continuação revelou que falhas distintas da Browser Bridge eram achatadas e podiam provocar fallback de perfil sem relação com a conta;
- o cliente agora distingue Bridge ausente/incompatível, página indisponível antes de efeito e resultado incerto depois de comando mutável;
- o Core ganhou recarga controlada, limitada e no mesmo perfil para indisponibilidade pré-efeito, enquanto fallback ficou restrito a condições reais de conta/perfil;
- diretivas de recuperação fluem do Core para o plugin/cliente; plugins continuam reportando fatos e não escolhem a política.
- a fronteira de tradução foi explicitada: Bridge reporta transporte, plugin converte semântica específica da página em taxonomia universal e Core decide;
- Flow e Gemini deixaram de tratar atividade incomum/detecção anti-bot como rate limit repetível e agora reportam `PROVIDER_SECURITY_CHALLENGE`, que pede intervenção sem rotação de conta.

O teste vertical foi retomado com o item já concluído preservado. A task permanece ativa até o fluxo alcançar a próxima fronteira observável sem regressão contratual.

## Definição de pronto

Os prompts de cena podem ser analisados como um texto único, os personagens são registros relacionados explicitamente aos IDs das cenas e o plugin de geração anexa, em cada uma das 23 unidades, somente as referências relacionadas àquela cena.
