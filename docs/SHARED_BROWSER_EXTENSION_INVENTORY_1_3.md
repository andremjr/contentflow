# Pacote 1.3 — inventário da extensão Browser Bridge

Data do levantamento: 2026-09-26. Branch observada: `main`.

Este documento registra o estado atual da ContentFlow Browser Bridge antes das fases de endurecimento, versionamento e execução multiperfil. O levantamento é descritivo: não altera manifesto, protocolo, runtime da extensão, clientes dos plugins, políticas, storage, timers, listeners, debugger ou comportamento em Chrome real.

## Resumo do desenho atual

- `ecosystem/browser-bridge/manifest.json` define uma única extensão Manifest V3, versão `0.4.0`, com `tabs`, `storage`, `debugger`, `alarms` e `power`.
- O mesmo conjunto de dez origens aparece em `host_permissions` e no `content_scripts.matches`: ChatGPT, Claude, Gemini, Grok, Flow, Labs, Meta AI nas duas origens, Microsoft AI Playground e Vibes.
- `service-worker.js` é a autoridade do protocolo da extensão. Ele expõe `globalThis.contentFlowBridge`, hoje com `bridgeId = com.contentflow.browser-bridge` e `protocolVersion = 2`.
- A allowlist real fica em `PLUGIN_POLICIES`: oito plugins oficiais possuem política própria de origem/aba; Flow adiciona `setPrompt`/`clickGenerate` e Vibes adiciona `setFiles` e as três ações de lease.
- `content-script.js` não executa automação da página. Ele mantém uma porta de keepalive, envia heartbeat a cada 20 segundos, reconecta após 500 ms e sinaliza `pagehide` para limpeza de lease.
- Sessões de bridge e ownership do debugger vivem em memória do Service Worker. Cache de comandos, cancelamentos e leases usam `chrome.storage.session`.
- O transporte cliente não possui hoje um pacote compartilhado. Existem sete arquivos `browser-bridge-client.mjs` copiados para plugins de referência; seis são idênticos entre si e o Vibes possui uma variante própria. O Google Flow contém sua implementação equivalente dentro de `handler.mjs`.
- A suíte atual exercita grande parte da lógica com mocks de Chrome/CDP. Existem scripts e validações reais pontuais, mas não existe um gate automatizado que carregue a extensão empacotada em Chrome real e prove lifecycle completo de Service Worker, suspensão/restart, debugger, alarms, `storage.session`, keepalive e leases.

## Manifesto, permissões e superfície instalada

| Superfície                                           | Estado atual                                                                                                             | Risco/lacuna                                                                                                                                | Fase dona |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `ecosystem/browser-bridge/manifest.json`             | MV3, versão `0.4.0`, `service_worker = service-worker.js`, `content-script.js` em `document_idle`, `all_frames = false`. | Versão da extensão e versão do protocolo são independentes e a compatibilidade mínima ainda é validada de formas diferentes pelos clientes. | 7.1–7.2   |
| `permissions`                                        | `tabs`, `storage`, `debugger`, `alarms`, `power`.                                                                        | `debugger` e `power` são permissões amplas; o controle efetivo depende das policies e da validação por comando no worker.                   | 7.2–7.5   |
| `host_permissions`                                   | Dez padrões HTTPS explícitos.                                                                                            | A lista precisa permanecer sincronizada com `content_scripts.matches` e `PLUGIN_POLICIES`; hoje não existe uma única fonte geradora.        | 7.1–7.2   |
| `content_scripts.matches`                            | Repete os dez padrões de `host_permissions`.                                                                             | Duplicação manual do manifesto pode aceitar uma origem no host e esquecer o heartbeat/pagehide, ou o inverso.                               | 7.1–7.2   |
| `ecosystem/browser-bridge/README.md` / `INSTALAR.md` | Instalação manual da pasta unpacked em cada perfil dedicado.                                                             | Não há instalação/upgrade atômico nem verificação automática de que todos os perfis usam a mesma build.                                     | 7.1, 10.1 |

## Policies por plugin

`PLUGIN_POLICIES` combina origem, padrões de aba, restrição opcional de path e conjunto de ações. Todas recebem `ping`, `inspect`, `setText`, `pressEnter` e `click` através de `COMMON_ACTIONS`.

| Plugin                                       | Origem/padrão                                        | Regra adicional       | Ações adicionais                                         |
| -------------------------------------------- | ---------------------------------------------------- | --------------------- | -------------------------------------------------------- |
| `local.contentflow.chatgpt-browser-studio`   | `https://chatgpt.com/*`                              | —                     | —                                                        |
| `local.contentflow.claude-browser-text`      | `https://claude.ai/*`                                | —                     | —                                                        |
| `local.contentflow.gemini-browser-studio`    | `https://gemini.google.com/*`                        | —                     | —                                                        |
| `local.contentflow.google-flow-batch-images` | `https://flow.google.com/*`, `https://labs.google/*` | `requiredPath: "/"`   | `setPrompt`, `clickGenerate`                             |
| `local.contentflow.grok-browser-studio`      | `https://grok.com/*`                                 | —                     | —                                                        |
| `local.contentflow.meta-ai-browser-studio`   | `https://meta.ai/*`, `https://www.meta.ai/*`         | —                     | —                                                        |
| `local.contentflow.mai-playground-browser`   | `https://playground.microsoft.ai/*`                  | —                     | —                                                        |
| `local.contentflow.vibes-browser-studio`     | `https://vibes.ai/*`                                 | path `/projects/<id>` | `setFiles`, `leaseAcquire`, `leaseRenew`, `leaseRelease` |

O manifesto autoriza o Content Script por origem, enquanto o Service Worker autoriza cada efeito por `pluginId + origin/path + action`. Adicionar fornecedor exige hoje editar as duas camadas manualmente e, normalmente, também o cliente/handler correspondente.

## Handshake, sessão e correlação

`globalThis.contentFlowBridge.connect()` aceita somente plugin presente em `PLUGIN_POLICIES`, `protocolVersion === 2`, `profileId` textual de 1 a 128 caracteres e `sessionToken` hexadecimal/hifenizado de 32 a 64 caracteres. A resposta de identidade inclui `bridgeId`, `protocolVersion` e `extensionVersion` lida do manifesto.

O estado de sessão atual é:

- `activeSessions: Map<sessionToken, session>` em memória;
- TTL de sessão de duas horas (`SESSION_TTL_MS`);
- limite de 128 sessões (`MAX_ACTIVE_SESSIONS`), removendo a mais antiga quando necessário;
- `lastSeenAt` é renovado por comandos válidos;
- reconnect após suspensão do worker depende do cliente detectar `SESSION_MISMATCH` e executar `connect()` novamente;
- `disconnect()` remove a sessão, limpa leases e solta o debugger;
- `cancel()` valida plugin, protocolo, perfil e execution key, grava cancelamento, limpa leases e solta o debugger.

O handshake é efêmero: token e sessão não são persistidos. Após restart/suspensão real do Service Worker, o mapa `activeSessions` e os mapas de filas/debugger desaparecem, enquanto dados em `chrome.storage.session` podem permanecer. Essa assimetria é tratada parcialmente pelos clientes com reconnect, mas ainda não possui teste real de lifecycle do Chrome.

## Cache e idempotência

O cache usa `COMMAND_CACHE_KEY = contentflowCommandCacheV2` em `chrome.storage.session` e limita o conjunto a 500 entradas (`MAX_COMMAND_CACHE`). A chave externa é `commandId`; o replay só é aceito quando também coincidem `executionKey`, `pluginId`, `profileId`, validade e resposta previamente gravada.

`inFlight` evita duas execuções concorrentes do mesmo `pluginId + profileId + sessionToken + commandId` dentro da vida do worker. `tabQueues` serializa operações por aba. Essas duas estruturas são somente memória; o cache persistido cobre replay após conclusão, mas não transforma uma operação em voo interrompida por restart em resultado conhecido. Essa lacuna é relevante para o contrato alvo de reconciliação depois de efeito incerto.

Cancelamentos usam `contentflowCancelledExecutionsV2` em `storage.session`. A extensão consulta esse estado antes de ações de efeito e leases. O inventário não encontrou journal persistente de comando `submitted/acknowledged` equivalente ao estado de unidade previsto no núcleo.

## Leases, power e limpeza

As leases da própria extensão usam `contentflowLeasesV1` em `storage.session`. O TTL padrão é 60 segundos e o máximo é cinco minutos. A lease fica associada a sessão, execução, plugin, perfil, aba e origem/path; adquirir ou renovar solicita `chrome.power.requestKeepAwake("display")` e a última remoção chama `releaseKeepAwake()`.

Limpeza ocorre por quatro caminhos:

1. `chrome.alarms` cria `contentflow-lease-cleanup` a cada 0,5 minuto e remove leases expiradas;
2. `chrome.tabs.onRemoved` limpa leases da aba removida;
3. `chrome.tabs.onUpdated` limpa quando a aba sai da policy/origem/path vinculados;
4. `content-script.js` envia `pagehide`, que também limpa leases da aba.

Essas leases pertencem à Browser Bridge e à aba do provedor. Elas ainda não são o `profile_runtime_lease` global previsto no roadmap para impedir dois navegadores/processos do núcleo de abrirem o mesmo perfil físico.

## Debugger, execução e timers

`debuggerSessionsByTab` mantém ownership em memória. `withJobDebugger()` anexa `chrome.debugger` com CDP `1.3`, mantém o debugger anexado durante o job e só solta no cancel/disconnect/troca de aba. Quando o worker reinicia e o Chrome informa `already attached`, o código tenta soltar o attachment anterior desta extensão e anexar novamente uma vez.

`tabQueues` serializa comandos por aba. `withTimeout()` usa `setTimeout` para limitar a espera do comando ao intervalo derivado de `expiresAt` entre 1 e 30 segundos. O Content Script usa `setInterval(..., 20_000)` para heartbeat e `setTimeout(..., 500)` para reconnect da porta. O Service Worker também usa o alarme periódico de 30 segundos para leases.

Listeners instalados atualmente:

- `chrome.runtime.onMessage` para `wake` e `pagehide` vindos da página autorizada;
- `chrome.runtime.onConnect` para a porta `contentflow-provider-page` e heartbeat;
- `chrome.alarms.onAlarm` para expiração de leases;
- `chrome.tabs.onRemoved` para limpeza de leases;
- `chrome.tabs.onUpdated` para invalidar lease quando URL/origem/path mudam;
- `port.onMessage` no canal de keepalive;
- `port.onDisconnect` no Content Script para reconnect;
- `window/page addEventListener("pagehide")` no Content Script.

## Cópias do cliente nos plugins

Há oito plugins de referência com `profileSetup` e todos aparecem neste inventário:

| Plugin                       | Implementação do cliente da bridge           | Estado de sincronização observado                                                |
| ---------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| `chatgpt-browser-studio`     | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `claude-browser-text`        | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `gemini-browser-studio`      | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `grok-browser-studio`        | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `mai-playground-browser`     | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `meta-ai-browser-studio`     | `browser-bridge-client.mjs`                  | cópia comum                                                                      |
| `vibes-browser-studio`       | `browser-bridge-client.mjs`                  | variante própria; adiciona validação de projeto/versão e helpers de lease/upload |
| `google-flow-browser-images` | lógica equivalente embutida em `handler.mjs` | implementação separada, sem arquivo cliente compartilhado                        |

Em 2026-09-26, os seis clientes comuns possuem o mesmo SHA-256 `08C70C39D7972CCB80936C9EA6AD962C6409C0B70E5D6EA8014C19184E4767B1` e 366 linhas. A variante do Vibes possui SHA-256 `DDF194359233BF148365F3694C7780037DFDC86E8235215A18866AD117FDB64F` e 347 linhas. Esses hashes são fotografia do levantamento, não contrato de versão.

`server/browser-bridge-client.test.mjs` já protege igualdade byte a byte somente entre os seis clientes comuns. Ele não inclui Vibes por design e não cobre a implementação embutida do Google Flow. Logo, mudanças de protocolo podem exigir hoje três caminhos de atualização: cópia comum, variante Vibes e implementação do Flow.

## Cobertura de testes atual e lacunas para Chrome real

### O que os mocks já provam

- `ecosystem/browser-bridge/test.mjs` executa `service-worker.js` em `vm.runInNewContext` com mocks de `chrome.runtime`, `storage.session`, `tabs`, `alarms`, `power`, `windows` e `debugger`.
- Esse teste cobre handshake, allowlist, expiração, mismatch de perfil/sessão, replay de commandId, 300+ comandos, fila, click CDP e fallback DOM, cancelamento, detach, providers, uploads, leases e listeners registrados.
- `server/browser-bridge-client.test.mjs` prova reconnect de sessão e isolamento de duas execuções sobre o cliente comum usando alvo `service_worker` e Runtime.evaluate simulados.
- Testes dos plugins, incluindo ChatGPT, Google Flow e Vibes, simulam `Target.getTargets`, worker CDP e respostas de `contentFlowBridge` para validar integração do handler.
- `server/browser-profile-readiness.test.ts` cobre detecção do diretório da extensão pelo `Secure Preferences` e manifesto local.

### O que ainda não é provado automaticamente em Chrome real

1. suspensão e recriação reais do MV3 Service Worker durante comando, lease e debugger anexado;
2. semântica real de retenção/limpeza de `chrome.storage.session` entre suspensão do worker, fechamento de aba, fechamento do Chrome e reinício do perfil;
3. precisão de `chrome.alarms` a 0,5 minuto sob throttling/minimização e após wakeup;
4. estabilidade do heartbeat de 20 segundos e reconnect de porta em páginas que navegam, entram em BFCache ou recriam frames;
5. comportamento real de `chrome.debugger.attach/detach` quando o worker some com attachment ativo e quando DevTools/outro debugger concorre pela aba;
6. comportamento de `chrome.power.requestKeepAwake("display")` e release em crash/restart, inclusive sem lease restante;
7. ordering real entre `tabs.onUpdated`, `pagehide`, `onRemoved` e cleanup de lease durante navegações rápidas;
8. replay/reconciliação de comando cujo efeito ocorreu na página, mas cuja resposta se perdeu antes de `cacheResponse()`;
9. limite de 128 sessões e cache de 500 entradas sob múltiplos perfis/processos reais;
10. instalação/atualização da mesma build da extensão em vários perfis e compatibilidade entre `extensionVersion` e clientes divergentes.

`ecosystem/plugins/reference/google-flow-browser-images/scripts/probe-extension-runtime.mjs` e scripts live de plugins fornecem diagnóstico manual/real útil, mas não formam um gate reproduzível do pacote da extensão isolada.

## Decisões derivadas para as próximas fases

- A fase 7 deve definir uma única matriz de versão/capabilities para o handshake antes de ampliar o conjunto de comandos; hoje `protocolVersion = 2` é comum, mas clientes também fazem validações próprias de `extensionVersion`.
- A allowlist do manifesto e `PLUGIN_POLICIES` precisa ter uma fonte verificável ou teste estrutural para impedir drift de origem/permissão/policy.
- Um transporte compartilhado/versionado deve substituir a manutenção manual de seis cópias idênticas, da variante Vibes e do cliente embutido do Flow, preservando diferenças realmente necessárias como adapters finos.
- Reconnect após `SESSION_MISMATCH` não resolve sozinho efeito incerto. O contrato alvo precisa de sequência/ack/snapshot ou outra forma explícita de reconciliação antes de repetir comandos de efeito.
- Leases da extensão continuam sendo leases de aba/job; o lock global de perfil físico deve ser implementado no núcleo e não deduzido destas leases.
- A fase de hardening precisa incluir um harness de Chrome real para lifecycle MV3, debugger, alarms, storage, keepalive e navegação, mantendo os mocks como testes rápidos de contrato.

## Fora do escopo do pacote 1.3

Não foram alterados manifesto, permissões, policies, protocolo, cache, storage, sessão, lease, debugger, timers, listeners, cliente de plugin, instalação da extensão, perfil físico ou runtime do núcleo. Também não foram criados locks globais, handshake novo, eventos sequenciados, snapshots, backpressure ou harness de Chrome real. Esses efeitos pertencem às fases posteriores do roadmap.
