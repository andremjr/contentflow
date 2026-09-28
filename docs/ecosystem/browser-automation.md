# Plugins de automação de navegador e camadas de produtividade

Este guia define como planejar plugins que operam interfaces web de terceiros sem contornar planos, créditos, controles de acesso ou políticas do provedor. Ele complementa [`protocol.md`](protocol.md), [`development.md`](development.md) e [`security.md`](security.md).

Recibos de submissão, reconciliação, estados de intervenção, fallback, mídia, options, logs e fechamento de recursos seguem também [`automation-media-conventions.md`](automation-media-conventions.md).

Para o fluxo básico de criação e conversão, comece em [`quickstart.md`](quickstart.md). Este documento trata apenas dos riscos e decisões adicionais de automação de interface.

> Decisão de arquitetura: o núcleo controla o lifecycle físico do Chrome para perfis globais do ContentFlow e concede ao plugin apenas uma sessão efêmera já reservada. Uma extensão companheira Manifest V3, externa ao núcleo, oferece transporte e operações limitadas reutilizáveis aos plugins compatíveis. Cada plugin continua responsável por autenticação, seletores, estados, regras e validação do seu provedor. O ContentFlow não descobre nem entrega silenciosamente cookies, tokens ou sessões de outros perfis.

## 1. Princípio central

Uma camada de produtividade pode organizar uma fila, preencher formulários, acompanhar jobs e recolher resultados usando a conta do próprio usuário. Ela não ganha autoridade adicional por ser automatizada.

O limite efetivo de uma integração é sempre o mais restritivo entre:

1. a autorização expressa do usuário;
2. os termos, políticas e meios técnicos autorizados pelo provedor;
3. o plano, a cota, o rate limit e os controles da conta;
4. as permissões declaradas pelo plugin;
5. os limites impostos pelo ContentFlow.

Capacidade técnica não equivale a autorização. A ausência de um bloqueio visível também não prova que automação, endpoints privados ou reutilização de sessão sejam permitidos. O autor deve verificar e documentar as regras atuais de cada provedor antes de publicar o plugin.

## 2. Ordem de preferência da integração

Use a primeira opção que satisfaça a capacidade:

1. API pública e documentada com OAuth ou chave própria do usuário;
2. SDK oficial ou mecanismo de automação oficialmente documentado;
3. automação da interface, em sessão iniciada pelo usuário, quando o provedor permitir;
4. integração privada ou endpoint interno somente com autorização escrita e verificável do provedor.

Não trate chamadas observadas no DevTools como uma API pública. Endpoints internos podem mudar sem aviso, transportar tokens sensíveis e possuir regras diferentes da interface. Um plugin de catálogo não deve depender deles apenas porque são tecnicamente acessíveis.

## 3. O que é aceitável

Quando autorizado pelo provedor, um plugin pode:

- enfileirar tarefas dentro das cotas normais da conta;
- preencher e enviar um prompt por vez pela interface;
- acompanhar o estado apresentado ao próprio usuário;
- baixar ou importar resultados que a conta pode acessar legitimamente;
- pausar quando houver rate limit, crédito insuficiente, reautenticação ou revisão humana;
- manter IDs de jobs e checkpoints para retomar sem repetir cobranças;
- conectar, com consentimento explícito, uma sessão ou token pertencente à conta escolhida pelo próprio usuário;
- oferecer confirmação antes de publicação, compra, exclusão ou outra ação material.

O plugin deve preservar a mesma identidade, conta, plano e limites usados na experiência oficial. Concorrência local nunca autoriza concorrência superior à aceita pelo provedor.

## 4. O que não é compatível com o ecossistema

Plugins de referência e catálogos mantidos pelo projeto não aceitam capacidades que:

- contornar créditos, paywalls, rate limits, filas, regiões, feature flags ou níveis de assinatura;
- fazer uma conta gratuita obter recursos pagos;
- descobrir ou conectar silenciosamente contas, identidades, IPs ou fingerprints que o usuário não preparou para o plugin;
- burlar CAPTCHA, anti-bot, espera obrigatória ou verificação de identidade;
- varrer ou extrair silenciosamente cookies e tokens de perfis, contas ou serviços que o usuário não conectou àquele plugin;
- reutilizar credenciais de outra aplicação, pessoa, organização ou perfil;
- interceptar tráfego criptografado ou instalar certificados para capturar autenticação;
- chamar endpoint privado que o provedor não autorizou para integração;
- ocultar automação, tráfego, custos, terceiros ou finalidade dos dados;
- realizar scraping de dados que o usuário não poderia acessar manualmente.

Quando surgir um CAPTCHA, bloqueio antiabuso ou pedido de nova autenticação, o plugin pode manter o job pendente para intervenção. Se encerrar a tentativa como erro, o núcleo aplica o fallback configurado normalmente.

Múltiplas contas conectadas explicitamente são permitidas para continuidade operacional. Quando `fallbackConfigurationKey` estiver declarado, o núcleo preserva a ordem configurada e consulta a política central de recuperação. Apenas falhas seguras e associadas ao perfil podem avançar automaticamente; intervenção humana ou efeito externo incerto bloqueiam a troca até ação ou reconciliação. Cancelamento solicitado pelo usuário e esgotamento da lista encerram o fallback. Todas as contas precisam ser preparadas individualmente pelo usuário e permanecem em perfis dedicados separados.

Um autor pode escrever, compartilhar e instalar diretamente código que ignore essas regras. A documentação não afirma aprovar previamente nem controlar esse comportamento. Ela define o que recebe selo oficial, listagem nos catálogos do projeto e suporte. Independentemente da origem ou finalidade, todo plugin executado dentro do ContentFlow recebe somente os recursos consentidos; se tentar ampliar essa autoridade, a sandbox deve impedir ou encerrar a operação automaticamente.

## 5. Uma capacidade pode ser internamente complexa

Uma capacidade continua representando uma entrega observável de um bloco, mas pode realizar muitas etapas internas, por exemplo:

- `BUSCAR` + `Código`: importar resultados autorizados de uma biblioteca web;
- `CRIAR` + `IA`: enviar um prompt e aguardar um único job;
- `VALIDAR` + `Código`: conferir se um job terminou e se o arquivo esperado existe;
- `CRIAR` + `Código`: publicar um resultado depois de confirmação humana.
- `CRIAR` + `IA/Código`: gerar 300 imagens, acompanhar cada job, repetir as ausentes e entregar uma lista ordenada de artifacts;
- `CRIAR` + `IA`: pesquisar, estruturar e escrever um roteiro completo antes de devolver o texto final.

O plugin pode manter sua própria fila interna, checkpoints e subtarefas necessárias para produzir aquela entrega. A sequência externa entre blocos e Processos Universais, aprovações humanas e repetição editorial continuam visíveis no Método.

## 6. Arquitetura de navegador gerenciada pelo núcleo

A automação do navegador é uma implementação interna da capacidade do plugin:

```text
Método
  -> capacidade do plugin
  -> sessão de Chrome reservada pelo núcleo para o perfil físico
  -> extensão companheira MV3 e content script compartilhado
  -> adapter declarativo mantido pelo plugin
  -> autenticação conectada explicitamente pelo usuário
  -> interface do provedor
  -> resultado validado
  -> output do bloco
```

Responsabilidades do núcleo:

- validar manifesto, permissões, secrets, contratos de entrada e saída;
- adquirir o lease global do perfil antes de abrir o navegador;
- localizar, iniciar, monitorar e encerrar a instância física do Chrome;
- fornecer ao plugin apenas o endpoint efêmero da sessão reservada;
- mostrar e registrar o consentimento para `network`, `filesystem:*`, `process` e `native` quando declarados;
- oferecer cofre de secrets, pasta de trabalho escolhida e staging de artifacts;
- aplicar timeout, cancelamento e limites que a sandbox genérica conseguir impor;
- deixar efeitos materiais, provedores e política de dados visíveis ao usuário.

Responsabilidades do plugin:

- declarar a versão do protocolo da ponte, as origens necessárias e o adapter do provedor, sem baixar ou instalar código durante a execução;
- solicitar OAuth/secret ou conduzir login/preparação dentro da sessão fornecida pelo núcleo;
- documentar claramente conta, perfil, domínios, dados, efeitos e riscos envolvidos;
- pedir apenas operações necessárias à capacidade;
- usar seletores resilientes baseados em papel, label e estado visível;
- validar página, origem, conta e resultado antes de avançar;
- ao reutilizar conversa, aceitar somente referência HTTPS da origem declarada e da rota esperada do provedor;
- executar a rotina por mensagens e operações de DOM na aba identificada, sem depender de foco, teclado ou mouse do sistema;
- tratar mudanças de interface como erro compatível, não improvisar cliques;
- respeitar `signal`, timeout, idempotência e `maxConcurrency`;
- devolver `pending` enquanto o provedor processa o job;
- usar apenas a sessão, conta e origens que o usuário conectou àquela capacidade, sem enumerar outros perfis;
- nunca iniciar, encerrar ou reapontar fisicamente o Chrome do perfil por conta própria.

Usar o perfil principal de um Chrome que esteja aberto pode causar bloqueio de arquivos, corrupção de estado ou acesso muito amplo. Prefira um perfil dedicado ao plugin. Se a capacidade aceitar um perfil existente, a seleção deve ser explícita, restrita à pasta escolhida e acompanhada de aviso compatível com a permissão avançada solicitada.

## 7. Sessões e autenticação

Autenticação deve ocorrer em uma superfície clara para o usuário e ser definida pelo próprio plugin. Quando a integração exigir cookie ou token de sessão, o usuário conecta a credencial explicitamente e o núcleo a entrega pelo cofre somente àquele plugin. Quando exigir um perfil local, o usuário escolhe a pasta e concede a permissão correspondente; o núcleo não procura perfis automaticamente.

Quando o perfil é referenciado por uma configuração do Método, o plugin pode declarar `profileSetup`. Nesse fluxo, os detalhes do plugin oferecem uma ação explícita para cadastrar o vínculo/readiness e concluir o login antes de qualquer Projeto ser executado. O núcleo abre a sessão física; o plugin conduz somente a preparação específica do provedor dentro dela. O Bloco apenas seleciona perfis já cadastrados. A execução normal deve falhar fechada quando o vínculo ainda não foi preparado ou quando a sessão expirou; nunca deve preencher um prompt enquanto a página estiver em login, onboarding, CAPTCHA ou reautenticação.

Na experiência padrão da V1, essa preparação aparece nos detalhes do plugin em **Perfis e contas**. O núcleo registra a identidade física local e o vínculo explícito com o plugin, abre uma sessão autorizada e solicita ao plugin que prepare a origem declarada. Cada conta é preparada separadamente; cookies e storage continuam confinados ao perfil físico. O mapa de Canais, Métodos e blocos é uma visão derivada das referências e não restringe onde o perfil pode ser reutilizado.

A extensão companheira é instalada manualmente uma vez em cada perfil dedicado do Chrome usado por automação, por **Carregar sem compactação**. O aplicativo deve oferecer seus arquivos públicos em uma pasta estável de dados, fora do checkout, para que atualizações e renomeações do código não invalidem a instalação. Depois de validar login e ponte, a preparação fecha o Chrome graciosamente, aguarda a gravação do perfil e não aceita como pronto um marcador cuja extensão aponte apenas para pastas inexistentes. Scripts pessoais que automatizem essa preparação na máquina do mantenedor são paralelos, não integram o produto e não alteram a experiência dos usuários. A extensão permanece externa e substituível; nenhum adapter de fornecedor migra para o núcleo.

Uma única extensão não significa autoridade irrestrita. Ela aceita somente plugins, versões de protocolo, origens e ações válidos; novas origens entram por atualização revisada da extensão. O adapter do plugin descreve como localizar e validar a interface, enquanto a ponte executa apenas operações genéricas autorizadas. O handler verifica ID, versão, origem e protocolo antes de usar a sessão e nunca baixa código durante a execução.

O canal entre handler, service worker e content script usa mensagens versionadas, origem e aba allowlisted, identificador de execução, token efêmero e validação estrutural. Content scripts são tratados como contexto menos confiável: não recebem secrets duráveis e não podem ampliar hosts, permissões, efeitos ou escopo da capability.

Plugins com vários perfis podem declarar `profileSetup.fallbackConfigurationKey`. O Bloco escolhe e ordena perfis já cadastrados; o campo interno contém somente seus aliases ordenados, nunca cookies ou credenciais. O núcleo valida cada alias separadamente, registra qual perfil foi usado e preserva o cursor e as entregas parciais. Uma resposta de erro só move o cursor quando a política central classifica a troca como segura.

No contrato alvo, a pasta física é um perfil global do ContentFlow e o acesso do plugin nasce de um vínculo explícito. A política local do Bloco chama-se `profileExecution` e usa `profileIds` opacos com os modos canônicos `fallback` e `parallel`. Fallback ordenado é o padrão mesmo quando a lista contém um único perfil; `single` é apenas um valor histórico aceito e normalizado durante a leitura. O handler nunca recebe esses IDs: depois de validar vínculo, readiness e revogação, o núcleo concede apenas `services.getProfilePath(relativePath)` para o perfil ativo e injeta o alias exigido por `profileSetup.configurationKey` para compatibilidade API v1.

Métodos antigos continuam resolvendo o perfil por `pluginId + alias`; a migração cria um perfil global distinto para cada registro legado e não funde aliases iguais de plugins diferentes. Métodos novos podem persistir `profileExecution` localmente, mas pacotes portáteis removem `profileExecution`, `profileIds` e qualquer outra referência local. No destino, o usuário associa novamente um perfil/vínculo compatível.

Requisitos:

- cookies, access tokens e refresh tokens nunca entram em `request`, `settings`, `configuration`, logs ou artifacts; quando necessários, são secrets obtidos em memória por `getSecret()`;
- o plugin não pode enumerar silenciosamente perfis, contas ou sessões fora da origem escolhida;
- o contexto fica preso ao plugin, provedor, conta e escopo consentidos;
- troca de conta ou ampliação de escopo exige novo consentimento;
- expiração ou revogação gera `AUTH_REQUIRED` e pausa recuperável;
- logout e remoção do plugin oferecem limpeza do estado criado pelo próprio plugin e orientação para revogar acesso no provedor;
- importação/exportação de Método nunca inclui estado autenticado.
- exportação também nunca inclui `profileId`, `profileExecution`, caminho absoluto, `storage_key`, cookies, storage de sessão, IDs de vínculo/readiness/lease ou alias resolvido como identidade local; leva apenas o requisito portátil de perfil/conexão.

Se um provedor oferecer OAuth, prefira OAuth a reaproveitar uma sessão da interface.

## 8. Background, modo visível e headless

O modo headless só deve ser usado quando permitido pelo provedor e quando não esconder do usuário uma decisão relevante. Login, CAPTCHA, consentimento, compra, publicação e reautenticação exigem uma etapa visível ou confirmação específica.

Na operação normal, o navegador dedicado inicia minimizado ou em background e não disputa foco com outros aplicativos. A extensão atua na aba explícita por content script; comandos rotineiros não usam `bringToFront`, ativação de target, coordenadas de tela nem fallback de teclado/mouse dependente do sistema operacional. A janela só é mostrada por uma transição explícita para login, reautenticação, diagnóstico ou confirmação.

O plugin declara se a operação pode rodar em background e quais situações exigem interação visual. A capacidade reporta progresso pelo contrato do executor. A mesma ponte de mensagens deve ser projetada para funcionar posteriormente em headless sem alterar o Método, mas incompatibilidade do runtime deve falhar de forma explícita em vez de degradar silenciosamente para automação que rouba foco.

## 9. Filas, limites e custos

O núcleo aplica o menor limite entre manifesto, configuração local e resposta do provedor. A implementação deve:

- iniciar um job por vez quando a interface oficial for serial;
- usar backoff e `retryAfterMs` reais;
- persistir `jobId` e chave de idempotência antes de repetir;
- relatar fatos de recuperação; o núcleo decide se a falha vira retry, fallback, reconciliação, intervenção ou falha final;
- nunca trocar endpoint, IP, fingerprint nem usar conta que não tenha sido preparada explicitamente pelo usuário;
- em lote declarado por `execution.itemOrchestration`, concluir e persistir um item antes de iniciar o próximo;
- mostrar ao usuário contagem de jobs, estado, custo conhecido e ação externa esperada.

Automação aumenta conveniência, não a franquia adquirida pelo usuário.

## 10. Robustez diante de mudanças da interface

Interfaces mudam com frequência. Para reduzir ações incorretas:

- valide origem, título, elemento principal e identidade da conta;
- prefira atributos acessíveis a classes CSS geradas;
- use máquinas de estado explícitas em vez de sequências cegas de cliques;
- capture somente evidências mínimas e redigidas para diagnóstico;
- mantenha fixtures para cada estado visual suportado;
- falhe fechado quando houver modal, página ou texto inesperado;
- versione o adapter do provedor separadamente da capacidade pública;
- desative remotamente apenas a versão afetada quando uma mudança tornar a automação insegura.

## 11. Prompt injection e conteúdo da página

Texto exibido por uma página, por um chat ou por um resultado é dado não confiável. Ele não pode ampliar escopo, pedir secrets, mudar domínio, autorizar compra/publicação ou reconfigurar a automação.

O adapter usa instruções fixas e operações estruturadas. Conteúdo recuperado é delimitado e só entra no output previsto. Navegação para uma origem não declarada deve ser bloqueada mesmo quando um texto ou modelo de IA a solicitar.

## 12. Manifesto e permissões

A API v1 não possui nem precisa de uma permissão especial de navegador. O manifesto declara os recursos genéricos realmente usados: `network` e `networkHosts`, secrets, `filesystem:read`, `filesystem:write`, `process`, `worker` ou `native`. Permissões amplas como `process` e `native` mudam o nível de confiança e devem ser justificadas no README e no consentimento.

O núcleo não promete isolar uma pasta de perfil além dos limites efetivos da sandbox concedida. Mudança de domínio, conta, efeito, secret ou conjunto de permissões exige configuração ou consentimento renovado quando aplicável.

## 13. Contrato da Browser Bridge

A Browser Bridge é um protocolo independente da API de plugins. A API v1 descreve a capability e a invocação; a Bridge transporta operações genéricas entre o cliente do plugin, a extensão companheira e uma aba explicitamente autorizada. Seletores, estados do provedor e decisões como “pronto”, “enviado”, “gerando” ou “concluído” permanecem no adapter do plugin.

O contrato alvo usa quatro identidades separadas:

- `pluginId`: identifica o pacote autorizado;
- `executionKey`: identifica a execução lógica sem revelar conteúdo;
- `profileRef`: referência limitada à sessão da Bridge, derivada do perfil já resolvido pelo núcleo; não é o `profileId` local persistente e não pode ser usada para enumerar outros perfis;
- `sessionToken`: token efêmero, rotacionável e válido somente para a sessão negociada.

### 13.1. Handshake e negociação

Antes do primeiro comando que possa produzir efeito, o cliente realiza handshake e negocia:

```text
client -> extension
  pluginId
  executionKey
  profileRef
  protocol: { min, max }
  clientVersion
  requestedCapabilities[]
  sessionToken

extension -> client
  ok
  protocolVersion
  bridgeVersion
  capabilities[]
  sessionId
  lastSequence
```

A extensão escolhe uma versão contida na interseção suportada. Sem interseção, responde `PROTOCOL_MISMATCH`. Uma capability requerida pelo cliente e ausente encerra a negociação antes de qualquer clique, escrita, upload, tecla ou recarga. `bridgeVersion` descreve a implementação da extensão; `protocolVersion` descreve o contrato de mensagens e evolui independentemente da versão do plugin.

As capabilities da Bridge são nomes de primitivas de transporte, por exemplo `snapshot.v1`, `lifecycle-events.v1`, `condition-observer.v1`, `reload.v1` e `idempotent-replay.v1`. Elas não incluem nomes de fornecedor nem estados editoriais.

### 13.2. Envelope de comando, ordem e idempotência

Todo comando contém `commandId` estável, `issuedAt`, `expiresAt`, `sessionToken`, `pluginId`, `executionKey`, `profileRef`, URL/origem esperada, ação e payload validado. A fila é serial por aba para operações mutáveis. O mesmo `commandId` repetido na mesma sessão lógica devolve o recibo previamente persistido em cache limitado e não repete o efeito.

O cliente não interpreta timeout como prova de que a ação não ocorreu. Clique, envio, upload, tecla de submissão e outras operações com efeito potencial passam para reconciliação quando a resposta se perde. O cache de idempotência tem limite de quantidade e TTL; ao expirar, um replay de efeito não idempotente exige reconciliação em vez de nova execução cega.

Antes de `click`, `clickGenerate`, `pressEnter`, `setFiles` ou `reload`, a Bridge persiste em `chrome.storage.session` um marcador limitado `in_flight` com escopo de plugin, perfil, execução, ação e `commandId`. Se o MV3 service worker reiniciar antes de persistir o recibo final, o replay do mesmo comando devolve `COMMAND_OUTCOME_UNKNOWN` com reconciliação obrigatória e não repete o efeito. Quando o recibo final já foi persistido, inclusive se apenas a resposta ao cliente foi perdida, o replay devolve esse recibo com `replayed: true`. Entradas expiradas são removidas por acesso e pelo alarme periódico; acima do limite, a ordem de remoção é determinística por `storedAt` e `commandId`.

### 13.3. Eventos de lifecycle e snapshots

Eventos são pequenos, estruturados e possuem `sequence` monotônico por sessão/aba. O conjunto mínimo cobre:

- `navigation`;
- `reload`;
- `tab_closed`;
- `worker_reconnected`;
- `debugger_lost`;
- `lease_expired`;
- `condition_reached`;
- `session_cancelled`.

O evento transporta somente metadados necessários: sequência, tipo, instante, origem/URL redigida quando aplicável, IDs opacos e código normalizado. Texto integral da página, prompt, HTML, cookies, tokens, storage, screenshot e caminho físico nunca são enviados espontaneamente.

Se o cliente observar lacuna de sequência, reconnect ou perda do worker, ele solicita um snapshot atual antes de continuar. O snapshot é sob demanda e contém apenas campos declarados: URL/origem, título quando necessário e estados booleanos/enum de controles solicitados pelo adapter. Snapshot não é dump de DOM.

### 13.4. Observadores limitados e backpressure

`observeCondition` é temporário e existe somente durante um comando ou job ativo. A condição é declarativa, com selector/estado permitido, timeout e debounce. A Bridge impõe limites de duração, quantidade simultânea, frequência de eventos e tamanho de payload; cancelamento, navegação, desconexão, fechamento da aba ou fim do job removem o observador.

Na implementação atual de `condition-observer.v1`, cada condição aceita no máximo 8 selectors de até 256 caracteres e payload total de até 4 KiB. Os estados suportados são `exists`, `absent`, `visible`, `hidden`, `enabled` e `disabled`; o timeout fica entre 250 ms e 30 s, o debounce entre 25 ms e 1 s e a reavaliação por mutação é limitada a uma amostra a cada 50 ms. A Bridge mantém no máximo 1 observador ativo por aba e 4 por sessão. O resultado informa somente estado e índice do selector que satisfez a condição; o evento `condition_reached` não transporta selector, texto da página ou outro conteúdo privado.

Backpressure é obrigatório em duas camadas: a fila de comandos por aba possui tamanho máximo e os eventos possuem janela/ritmo máximo. Ao exceder limite, a Bridge rejeita trabalho novo com `BACKPRESSURE` ou agrega progresso não material. Eventos materiais de lifecycle não são descartados silenciosamente; uma lacuna detectável força snapshot/reconciliação.

Sem job ativo não existe polling de DOM, observer permanente pesado nem heartbeat de alta frequência. Heartbeat só permanece ativo enquanto houver sessão/job que precise dele.

### 13.5. Recarga controlada

`reload` é uma ação genérica allowlisted, idempotente no sentido de que repetir o mesmo `commandId` não dispara uma segunda recarga. Ela nunca é fallback universal.

Antes de uma submissão confirmada, o adapter pode autorizar recarga depois de reinspeção e espera curta. Depois que a unidade entra em estado de efeito externo possível, o cliente deve reconciliar recibo/job/resultado primeiro. Enquanto a unidade estiver em efeito incerto, a Bridge rejeita recarga não autorizada com `RELOAD_BLOCKED_UNCERTAIN_EFFECT`.

Depois de qualquer recarga, o cliente revalida origem, URL, conta esperada e estado da página antes de executar outra ação mutável.

### 13.6. Códigos de erro

Os códigos são estáveis, independentes de idioma e apropriados para decisão de retry/reconciliação. A mensagem humana pode ser localizada. O conjunto base inclui os códigos já utilizados pela Bridge — `HANDSHAKE_REJECTED`, `PROTOCOL_MISMATCH`, `SESSION_MISMATCH`, `PROFILE_MISMATCH`, `ORIGIN_NOT_ALLOWED`, `INVALID_COMMAND`, `UNKNOWN_ACTION`, `COMMAND_EXPIRED`, `COMMAND_TIMEOUT`, `COMMAND_OUTCOME_UNKNOWN`, `CANCELLED`, `LEASE_UNAVAILABLE`, `LEASE_NOT_FOUND`, `CONTROL_NOT_FOUND`, `EDITOR_NOT_FOUND`, `EDITOR_WRITE_FAILED`, `FILE_INPUT_NOT_FOUND` e `INVALID_RESPONSE` — e reserva para o contrato endurecido `BACKPRESSURE`, `EVENT_GAP`, `TAB_CLOSED`, `NAVIGATION_CHANGED`, `DEBUGGER_LOST`, `OBSERVER_LIMIT` e `RELOAD_BLOCKED_UNCERTAIN_EFFECT`.

Um código não autoriza retry por si só. Depois de efeito potencial, `COMMAND_TIMEOUT`, reconnect, perda de debugger ou resposta ausente exigem reconciliação antes de repetir a ação.

### 13.7. Recursos e diagnóstico redigido

Cada implementação documenta limites para fila por aba, cache de comandos, observers, tamanho de snapshot, frequência de heartbeat e TTLs. O soak test mede 1, 3 e 5 perfis, jobs curtos e longos e confirma que timers, sessions, debugger, caches e observers retornam à linha de base depois da execução.

Diagnóstico local pode registrar: versão de protocolo/Bridge, plugin, referência opaca de perfil, execução, `commandId`, ação, sequência, timestamps, duração, código, reconnect, reload e estado de reconciliação. Não registra prompt, texto privado, HTML, cookies, tokens, storage, screenshot integral nem caminho absoluto.

### 13.8. Fluxo completo e recuperação

```text
plugin handler
  |
  | 1. cliente recebe profileRef/sessionToken já autorizados
  v
bridge client
  |
  | 2. handshake + versão + capabilities
  v
MV3 service worker
  |
  | 3. valida plugin, sessão, origem, aba, comando e backpressure
  v
content script / CDP limitado
  |
  | 4. snapshot, observação limitada ou ação genérica
  v
aba allowlisted do provedor
  |
  | 5. recibo + sequence/eventos redigidos
  v
bridge client -> plugin

worker suspende / conexão cai
  -> reconnect
  -> renegociar sessão compatível
  -> comparar lastSequence
  -> se houver lacuna: snapshot
  -> se comando era somente leitura: repetir se necessário
  -> se comando podia produzir efeito: reconciliar recibo/job/resultado
  -> somente com prova de não submissão, repetir
  -> se continuar incerto: preservar estado de efeito incerto e pedir recuperação segura
```

Esse fluxo não altera o ownership dos itens: `itemId`, tentativa, revisão, lease global do perfil e decisão de redistribuir pertencem ao núcleo. A Bridge apenas transporta operações da lane já autorizada.

## 14. Testes mínimos

Além dos testes gerais do protocolo, cubra:

- login ausente, expirado, revogado e conta diferente da esperada;
- página, idioma, layout e experimento visual inesperados;
- redirect para outra origem e tentativa de abrir URL privada;
- CAPTCHA, anti-bot, rate limit e cota esgotada;
- fila serial, cancelamento e retomada após reinício;
- timeout depois do envio com reconciliação antes de repetir;
- download incompleto, tipo incorreto e arquivo hostil;
- prompt injection no conteúdo visível;
- confirmação de publicação, compra, exclusão e envio externo;
- ausência de cookies, tokens, prompts privados e screenshots integrais nos logs;
- isolamento entre contas, canais, projetos e plugins;
- usuário digitando, clicando e alternando janelas enquanto a automação permanece minimizada, sem vazamento de input entre aplicativos;
- ausência de ativação de janela, `bringToFront` e fallbacks de teclado/mouse na execução rotineira;
- extensão ausente, incompatível, atualizada ou desconectada durante uma execução;
- mudança de interface que deve falhar sem clicar em alvo ambíguo.

## 15. Checklist para proposta de um plugin

- [ ] O provedor e o plano permitem a automação proposta.
- [ ] API ou OAuth oficiais foram avaliados primeiro.
- [ ] A capacidade é atômica e cabe em um bloco existente.
- [ ] Domínios, conta, dados enviados, retenção, custos e efeitos estão documentados.
- [ ] Cookies, tokens ou perfis, se indispensáveis, são conectados explicitamente e nunca extraídos silenciosamente.
- [ ] Cotas e serialização do provedor são preservadas.
- [ ] CAPTCHA, bloqueio e upgrade pausam o job.
- [ ] Ações materiais exigem confirmação específica.
- [ ] Jobs são idempotentes, retomáveis e reconciliáveis.
- [ ] Mudanças inesperadas da interface falham de forma segura.
- [ ] Existe plano de testes, manutenção, desativação e suporte.
- [ ] A integração não depende de endpoint interno sem autorização escrita.
