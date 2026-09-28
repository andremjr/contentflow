# ContentFlow Browser Bridge

Extensão companheira Manifest V3 única para todos os plugins de automação de navegador compatíveis com o ContentFlow. Ela é externa ao núcleo e não pertence a nenhum plugin individual.

## Regra de arquitetura

- existe uma única extensão instalada por perfil dedicado;
- cada comando identifica plugin, perfil, execução, origem, aba e versão do protocolo;
- apenas plugins, ações e origens registrados na allowlist da versão instalada são aceitos;
- novos provedores entram por atualização desta mesma extensão, nunca por uma segunda extensão;
- o núcleo do ContentFlow não recebe seletores, cookies, sessões ou regras de fornecedor.

A versão `0.4.0` acrescenta o Vibes aos provedores já atendidos. Para jobs longos, oferece uma lease genérica com heartbeat, TTL e liberação automática; para referências de mídia, oferece `setFiles` limitado a um `input[type=file]` validado. O protocolo v2 negocia lifecycle/snapshot, `condition-observer.v1` e `reload.v1`. `observeCondition` aguarda uma condição declarativa temporária com timeout/debounce e limites rígidos. `reload` exige `reconciliationState` explícito (`safe` ou `reconciled`), bloqueia `uncertain` com `RELOAD_BLOCKED_UNCERTAIN_EFFECT`, usa `commandId` idempotente, revalida a origem/URL após a carga e registra somente metadados redigidos no lifecycle. Comandos de efeito potencial persistem um marcador `in_flight` antes da ação; se o worker reiniciar sem recibo final, o replay responde `COMMAND_OUTCOME_UNKNOWN` e exige reconciliação em vez de repetir clique, envio, upload ou recarga. Recibos concluídos sobrevivem ao restart em `chrome.storage.session`, e o cache é limitado a 500 entradas com TTL e limpeza determinística. A ponte mantém apenas transporte, autenticação efêmera, isolamento por origem/aba/perfil, idempotência e operações de UI limitadas. O Service Worker localiza alvos com scripts efêmeros via CDP e entrega cliques, texto, arquivos, observações e recargas autorizadas com comandos fixos; o Content Script apenas desperta o worker e sinaliza `pagehide`. Seletores e regras de cada provedor continuam no adapter do respectivo plugin.

## Instalação

Consulte [INSTALAR.md](INSTALAR.md). Na V1, o usuário carrega manualmente esta pasta em cada perfil dedicado usando `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação**.

Scripts pessoais usados pelo mantenedor para preparar vários perfis de sua própria máquina ficam em `local-tools`, ignorados pelo Git, e não fazem parte do aplicativo ou da experiência dos usuários.
