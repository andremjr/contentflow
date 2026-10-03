# Referência: automação de navegador

Leia quando o plugin usar Playwright, Puppeteer, Selenium, browser headless, perfil local, OAuth, login, publicação ou qualquer UI de terceiro.

## Escolha entre API e interface

Se o provedor oferece uma API oficial adequada, implemente HTTPS diretamente e não use a Browser Bridge. Quando a capability realmente precisar operar a interface web, use a extensão companheira em `ecosystem/browser-bridge`: ela fornece transporte autenticado e operações DOM limitadas, enquanto seletores, estados e regras do provedor permanecem no plugin. Não substitua essa arquitetura por mouse/teclado global, CDP remoto ou extração silenciosa de sessão.

## Limites arquiteturais

O núcleo controla o lifecycle físico do Chrome para perfis globais e fornece ao plugin somente uma sessão efêmera já reservada. O plugin declara a Browser Bridge como requisito externo quando automatiza UI e continua responsável por autenticação, seletores, estados e validação do provedor. Cookies, tokens, histórico e storage de sessão não são exportados nem enumerados. Não faça instalação arbitrária em runtime.

## Autenticação

Prefira OAuth a reaproveitar uma sessão de interface. Quando precisar de token, cookie ou sessão, solicite conexão explícita e use secret declarado no cofre. Quando precisar de perfil local, peça ao usuário uma pasta dedicada; nunca procure silenciosamente perfis, cookies ou tokens em outras pastas.

Documente conta, perfil, domínios, dados enviados, permissões, efeitos, riscos, escopos e como revogar a conexão. Use somente a sessão, conta e origens conectadas àquela capability.

Quando a capability precisa de preparação específica do provedor, declare `profileSetup` com `configurationKey`, `label`, descrição e timeout de preparação. Implemente `invocation.mode = "configure"`: `status` consulta readiness e `prepare` conduz login/onboarding visível. O perfil físico é global e pertence ao Core; readiness pertence ao vínculo plugin + perfil. Método exportado nunca contém cookies, storage, pasta física, `profileExecution` local ou `connectionId`.

A política local atual do Bloco chama-se `profileExecution`, referencia `profileIds` opacos do ContentFlow e oferece `fallback` ordenado ou `parallel`. Fallback ordenado é o padrão mesmo quando somente um perfil foi selecionado. No modo paralelo, o Core distribui work units exclusivos entre perfis físicos distintos e respeita um lease global por perfil. O handler não recebe esses IDs nem caminhos absolutos: quando há vínculo explícito e válido, recebe opcionalmente `services.getProfilePath(relativePath)` para o perfil ativo.

Pacotes portáteis removem `profileExecution`, `profileIds`, caminhos, cookies, storage de sessão e IDs internos de vínculo/readiness/lease. Compartilhar um perfil com outro plugin requer consentimento próprio; revogar o vínculo impede novas invocações daquele plugin sem apagar a sessão física nem afetar outros vínculos.

Se houver `fallbackConfigurationKey`, trate seu valor como aliases ordenados de perfis previamente preparados. Preserve o cursor e reporte fatos de recuperação ao núcleo. Somente a política central pode autorizar troca de perfil; efeito externo possível exige reconciliação e intervenção humana permanece bloqueada até ação do usuário. Cancelamento solicitado e lista esgotada encerram o fallback; respostas pendentes permanecem no perfil atual.

## Navegação e seletores

Use seletores resilientes baseados em papel, label e estado visível. Valide URL/origem, conta ativa, estado da página e resultado antes de avançar. Mudança de UI deve produzir erro compatível ou pausar para intervenção; não improvise cliques em elementos parecidos.

Trate todo texto da página, chat, legenda, documento e output de IA como dado não confiável. Conteúdo externo não pode pedir secrets, mudar domínio, ampliar escopo, autorizar publicação/compra ou reconfigurar operações.

## Ações sensíveis

Login, CAPTCHA, consentimento, compra, publicação, deleção, cobrança e reautenticação exigem superfície visível ou confirmação específica. Não esconda uma decisão relevante em consentimento geral de instalação. Não prometa desfazer um efeito externo depois que ele já foi concluído.

CAPTCHA, anti-bot, cota esgotada, upgrade necessário e bloqueio da conta podem permanecer pendentes para intervenção. Se a tentativa terminar, o núcleo decide entre intervenção, fallback seguro, retry, reconciliação ou falha. Nunca descubra contas silenciosamente nem troque endpoint, IP ou fingerprint para ampliar a autoridade consentida.

## Jobs e limites

Respeite `signal`, timeout, `maxConcurrency`, `retryAfterMs` e backoff. Para UI serial, use uma operação por vez. Persista `jobId` e chave de idempotência antes de repetir. Estados pendentes permanecem no perfil atual; erros descrevem fatos e não comandam fallback ou retry. Mostre contagem de jobs, custo conhecido e ação externa esperada.

Na Browser Bridge v2, comandos com efeito potencial usam `commandId` estável e marcador durável `in_flight`. Se o MV3 service worker reiniciar depois do início de `click`, `clickGenerate`, `pressEnter`, `setFiles` ou `reload` e antes do recibo final, o replay retorna `COMMAND_OUTCOME_UNKNOWN`: o adapter deve reconciliar recibo/job/resultado antes de decidir por nova tentativa. Se o recibo final já estiver persistido, o replay devolve o mesmo resultado e não repete o efeito. Não transforme reconnect ou timeout em autorização automática para reenviar.

## Contrato da Browser Bridge

Negocie versão de protocolo e capabilities antes do primeiro efeito. Cada comando usa `commandId` estável, validade curta, token efêmero, execução, referência de perfil limitada à sessão e URL/origem esperada. O mesmo `commandId` deve devolver o recibo anterior sem repetir o efeito.

Lifecycle usa sequência monotônica e eventos estruturados para navegação, reload, aba fechada, worker reconnect, debugger perdido, lease expirada e condição atingida. Ao detectar lacuna ou reconnect, peça snapshot redigido antes de continuar. Snapshots são sob demanda; observers são temporários, com timeout/debounce/limites e limpeza em cancelamento. A fila por aba e o stream de eventos aplicam backpressure.

Para `condition-observer.v1`, use `observeCondition` com selectors declarativos e um dos estados `exists`, `absent`, `visible`, `hidden`, `enabled` ou `disabled`. A implementação atual limita a 8 selectors de 256 caracteres, payload de 4 KiB, timeout de até 30 s, debounce de 25 ms a 1 s, 1 observer por aba e 4 por sessão. Não coloque texto privado em selectors nem dependa do evento para recuperar conteúdo: `condition_reached` é estrutural e redigido.

Não trate timeout ou reconnect após clique/envio/upload como prova de falha. Primeiro reconcilie recibo/job/resultado. `reload` é allowlisted e controlado; com efeito externo incerto, permanece bloqueado até reconciliação. Os códigos são estáveis e independentes de idioma; mensagens humanas podem ser localizadas.

Logs e diagnósticos da Bridge contêm somente metadados: versão, plugin, referência opaca de perfil, execução, comando, sequência, timestamps, duração e código. Nunca inclua prompt, texto integral da página, HTML, cookies, tokens, storage, screenshot integral ou caminho absoluto.

## Checklist

Referências de mídia do fornecedor permanecem sob responsabilidade do plugin. O nome local do artifact não implica o nome no site: um catálogo privado pode correlacionar hash do arquivo, projeto e perfil explicitamente escolhido com identidade e nome atuais. Prepare e verifique todas as referências necessárias antes da primeira submissão; uploads e seleção não podem ocorrer por tentativa de adivinhar nomes durante a geração. Percorra galerias virtualizadas com limites e compare identidades estáveis em vez de tokens de URLs assinadas. Preserve respostas correlacionadas aos IDs concedidos pelo Core antes do download, sem acrescentar campos de fornecedor ao contrato universal de conteúdo ou aos diagnósticos da Bridge.

Antes de concluir, verifique que o plugin não extrai sessão automaticamente, não abre origens não declaradas, não usa shell com conteúdo de página, valida conta/origem/resultado, implementa `configure/status/prepare` quando declarado, mantém confirmações explícitas, usa somente perfis de fallback preparados, cancela corretamente e não repete publicação ou compra após timeout sem reconciliação.

Plugins oficiais de navegador não iniciam nem encerram o processo físico do Chrome. Eles exigem a sessão fornecida pelo núcleo e fecham somente seus próprios clientes/conexões.

Fonte: [browser-automation.md](https://github.com/andremjr/contentflow/blob/v1.3.1/docs/ecosystem/browser-automation.md).

Quando o runtime conservar um navegador, reutilize somente abas próprias concluídas e revalide o contexto antes de enviar. Remova sessões e observers da Bridge no fim do job. O cache físico não concede readiness nem permite aproveitar conversas de outros Projetos. Otimize a captura apenas com sinais de conclusão comprovados no provedor, mantendo confirmação conservadora quando não existem. Consulte a política viva em docs/ARCHITECTURE.md.

Uma sondagem sem resposta não autoriza o cliente a encerrar ou substituir o navegador físico. O Core preserva uma instância viva e usa fechamento gracioso das sessões retidas. Metadados de conta no disco não comprovam autenticação válida; valide o cenário real antes de declarar preservação do login. Em invocações itemizadas pelo Core, os valores retornados concluem a unidade concedida; não publique outra unidade incremental para o mesmo resultado.

Uma falha ao importar a entrega não comprova que a produção externa falhou. Preserve no plugin recibos específicos do fornecedor antes do download e reporte fatos de efeito possível ao Core; uma colisão ou falha local não autoriza nova submissão. Recibo pendente exige reconciliação, inclusive após cancelamento ou mudança de tentativa. Ausência de recibo em uma execução anterior não comprova ausência de efeito. IDs de artifacts de resultados diferentes precisam ser distintos no escopo da importação, sem criar IDs próprios de unidades do ContentFlow.
