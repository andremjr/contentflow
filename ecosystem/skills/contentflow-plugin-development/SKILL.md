---
name: contentflow-plugin-development
description: Criação, revisão, teste e distribuição de plugins compatíveis com a ContentFlow Plugin API v1 atual.
---

# Desenvolvimento de Plugins no ContentFlow

Um **Plugin executa uma capability**. Ele não decide estratégia, próximo Bloco, próximo Processo, retry editorial, fallback estratégico ou progressão do Projeto.

## Antes de desenvolver

Leia no checkout atual `AGENTS.md`, `docs/ARCHITECTURE.md`, `src/lib/plugin-contract.ts`, `server/plugin-validation.ts`, `server/plugin-runner.ts` e `ecosystem/plugin-kit/`. Para navegador, leia também `ecosystem/browser-bridge/`, `server/plugin-profiles.ts`, `server/browser-profile-readiness.ts`, `server/browser-profile-leases.ts` e os contratos vivos de lanes/work units. O contrato vivo prevalece sobre esta skill e seus exemplos.

## Fronteiras

`Method → escolhe estratégia e capability`

`Plugin → executa capacidade e relata fatos/resultados`

`Core → possui execução, deliveries, work units, perfis, leases, progressão e recovery`

Plugins nunca inventam IDs universais de item/delivery, nem gerenciam diretamente identidade ou proveniência pertencente ao Core.

## Manifesto atual

Use `contentflow.plugin.json`, `apiVersion: "1"` e valide com `server/plugin-validation.ts`/Plugin Kit. Declare somente campos existentes no schema vivo.

Entre os contratos atuais estão:

- `capabilities[]`: `id`, `operator`, `blockTypes`, portas, `execution`, `sideEffects`, `cost`, `dataPolicy`, schemas e metadados opcionais suportados;
- `inputPorts[].acceptedTypes` e `outputPorts[].producedTypes`, associados pelo Core aos `portKey` dos Blocos;
- `permissions`, `networkHosts`, `secretKeys`/`optionalSecretKeys` quando realmente necessários;
- `sideEffects`, `cost` e `dataPolicy` como declaração factual de efeitos, custo e transferência de dados;
- `profileSetup`/`browserRuntime` somente para capacidades que realmente usam o fluxo de navegador suportado;
- `execution.itemOrchestration` apenas conforme o contrato atual, inclusive estratégias e elegibilidade de paralelismo quando declaradas.

Não mantenha campos retirados apenas porque aparecem em um exemplo antigo.

## Handler e recovery

Implemente `execute(request, services)` e leia entradas por `request.inputs[portKey]`. Retorne `success`, `pending` ou `error` no contrato atual.

Em erro, `retryable` e `recovery` descrevem fatos técnicos observados; não são ordens para repetir, trocar perfil ou avançar fluxo. A política de recovery pertence ao Core. Depois de possível efeito externo, preserve receipt/fatos de reconciliação quando o contrato permitir e não repita silenciosamente o efeito.

## Browser Bridge, perfis e leases

Fluxo: `Plugin → Browser Bridge → Browser/Profile/Page`.

A Browser Bridge é protocolo compartilhado e versionado. O Core abre/fecha o browser físico e seleciona o perfil autorizado; o plugin controla somente a página/capability concedida. Perfis são identidades locais globais. Binding do plugin e readiness são estados separados; autenticação, URL, seletores e preparo continuam específicos do plugin.

Um perfil físico suporta no máximo uma execução de navegador ativa por vez, protegida por lease global. Nunca copie cookies, storage ou credenciais para manifest, snapshot, pacote ou exportação.

## Multi-profile e work units

Quando a capability declara suporte, paralelismo multiperfil distribui **work units exclusivos** entre perfis físicos distintos. Não execute o Bloco inteiro nem a mesma unidade em cada perfil.

O Core cria/persiste identidade, ordem, tentativa e proveniência. O plugin só recebe/atualiza itens concedidos pelos serviços atuais (`registerItems`, `claimItems`, `publishItemUpdate`) quando negociados e disponíveis.

## Workflow

1. Escolha a capability mínima e a entrega observável.
2. Gere/parta dos templates atuais do Plugin Kit quando disponíveis.
3. Declare manifesto, portas, permissões e metadados honestamente.
4. Implemente handler sem estratégia de projeto embutida.
5. Teste erro, cancelamento, idempotência, artifacts, secrets e efeitos externos relevantes.
6. Para browser, teste preparação/readiness, lease, reconciliação e comportamento sem sessão pronta.
7. Rode `npm run plugin:kit -- check <plugin>` e `test-contract`; use sandbox test quando aplicável.

## Exemplo oficial

`templates/contentflow.plugin.json` + `templates/handler.mjs` formam o exemplo mínimo oficial. Valide-os com o validator real do checkout antes de copiar. Não inclua secrets, dados pessoais ou paths locais.

## Referências

- `docs/ARCHITECTURE.md`
- `src/lib/plugin-contract.ts`
- `server/plugin-validation.ts`
- `server/plugin-runner.ts`
- `ecosystem/plugin-kit/`
- `ecosystem/browser-bridge/`
- `references/protocol.md`
- `references/security.md`
- `references/browser-automation.md`

## Checklist

- plugin executa capability; estratégia/progressão ficam fora dele;
- manifesto e portas passam no validator atual;
- efeitos, custo, dados e permissões estão declarados conforme contrato vivo;
- Browser Bridge/perfis respeitam binding, readiness e lease do Core;
- multiperfil distribui work units exclusivos;
- recovery devolve fatos estruturados, sem decidir política do Core;
- pacote não contém secrets, estado de máquina, cookies, tokens ou caminhos locais.
