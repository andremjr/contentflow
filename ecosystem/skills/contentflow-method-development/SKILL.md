---
name: contentflow-method-development
description: Criação, revisão e validação de Métodos compatíveis com os contratos atuais do ContentFlow.
---

# Desenvolvimento de Métodos no ContentFlow

Use esta skill para criar ou revisar a estratégia de um Processo Universal. Um **Method define estratégia**. Ele não executa plugins, não controla recovery do Core e não cria primitivas novas.

## Antes de desenvolver

Leia no checkout atual `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/CONTENT_CONTRACT.md`, `src/lib/domain.ts` e `src/lib/method-file.ts`. Quando a tarefa tocar execução, leia também os contratos vivos de deliveries/work units e o estado vigente do Reliability Program. Esses arquivos prevalecem sobre exemplos congelados desta skill.

Modelo atual:

- Processos, nessa ordem: `theme`, `title`, `thumbnail`, `script`, `narration`, `assets`, `editing`, `publishing`.
- Blocos: `BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`.
- Operadores: `Humano`, `IA`, `Código`.

Não crie uma nova primitiva quando o comportamento puder ser expresso pela composição dessas primitivas universais.

## Fronteiras de autoridade

`Method → define estratégia`

`Plugin → fornece capacidade declarada`

`Core → cria a execução, persiste identidade/proveniência/ordem, decide progressão e recovery`

O Method é congelado em `methodSnapshot` dentro da execução e pode integrar o `strategySnapshot` do Projeto. Não coloque fallback estratégico, avanço de Processo, retry técnico ou identidade de work units em configuração de plugin.

## Workflow

1. Identifique qual dos 8 Processos está sendo modelado. Um arquivo `contentflow-method` v3 contém um único `processType`.
2. Modele a estratégia com os quatro Blocos existentes e operadores compatíveis.
3. Declare `inputs` e `outputs` no próprio Bloco. Use bindings estruturais (`project`, `previous_process`, `previous_block`, `channel_history`, `channel_library`, `runtime`, `static`) conforme o schema vivo.
4. Use exclusivamente bindings estruturais explícitos. Contexto implícito e campos planos antigos são inválidos.
5. Ligue plugin/capability ao Bloco somente quando necessário. O binding escolhe capacidade; não transfere ao plugin autoridade sobre o fluxo.
6. Valide tipo, schema, cardinalidade, `portKey`, proveniência e ordem antes de conectar uma saída a uma entrada.
7. Para shapes `many`, trate items/work units como estado operacional criado e persistido pelo Core. O Método não inventa `itemId`, delivery ID ou identidade intermediária.
8. Valide o JSON com o parser real de `src/lib/method-file.ts` antes de entregar.

## VALIDAR e retry editorial

`VALIDAR` aponta para resultado anterior por `targetBlockId`/`targetOutputKey` e usa os modos vivos `approval`, `select_one` ou `select_many`. `onReject` aceita os valores definidos no contrato atual, hoje `retry_target` ou `pause`, com `maxAttempts` e `retryMode` quando aplicável.

Uma reprovação editorial pode gerar nova tentativa do alvo e feedback editorial. Isso é diferente de falha técnica de plugin. Não converta rejeição editorial em `retryable` técnico e não invente semântica futura.

## Inputs, outputs, deliveries e work units

Inputs/outputs pertencem aos Blocos. O Core resolve os bindings em runtime, materializa deliveries e cria/persiste work units antes de delegar efeitos ao executor. Plugins recebem valores e IDs concedidos pelo Core apenas para correlação.

## Portabilidade

Não serialize secrets, cookies, storage, caminhos locais, IDs físicos de perfil, `connectionId`, `collectionId` local, IDs de deliveries/work units ou estado transitório. Perfil/browser binding é estado local do Core e deve ser reassociado quando aplicável.

## Exemplo oficial

Use `templates/method-skeleton.json` como exemplo mínimo. Antes de reutilizá-lo, valide contra `src/lib/method-file.ts`; não copie campos de exemplos antigos sem conferir o contrato atual.

## Referências

- `docs/ARCHITECTURE.md`
- `src/lib/domain.ts`
- `src/lib/method-file.ts`
- `references/data-compatibility.md`
- `references/runtime-execution.md`

## Checklist

- composição usa apenas primitivas universais existentes;
- Method contém estratégia e Blocos, não política do executor;
- inputs/outputs pertencem aos Blocos e bindings são explícitos;
- VALIDAR diferencia reprovação editorial de falha técnica;
- nenhuma identidade intermediária é inventada fora do Core;
- configuração portátil não contém secrets nem identidade física local;
- exemplo/arquivo final passa pelo parser real do checkout.
