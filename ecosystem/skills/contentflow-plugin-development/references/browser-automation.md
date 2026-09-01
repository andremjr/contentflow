# Referência: automação de navegador

Leia quando o plugin usar Playwright, Puppeteer, Selenium, browser headless, perfil local, OAuth, login, publicação ou qualquer UI de terceiro.

## Escolha entre API e interface

Se o provedor oferece uma API oficial adequada, implemente HTTPS diretamente e não use a Browser Bridge. Quando a capability realmente precisar operar a interface web, use a extensão companheira em `ecosystem/browser-bridge`: ela fornece transporte autenticado e operações DOM limitadas, enquanto seletores, estados e regras do provedor permanecem no plugin. Não substitua essa arquitetura por mouse/teclado global, CDP remoto ou extração silenciosa de sessão.

## Limites arquiteturais

O núcleo não fornece navegador, perfil autenticado, cookies, tokens, histórico ou storage de sessão automaticamente. O plugin declara a Browser Bridge como requisito externo quando automatiza UI, pede um perfil dedicado preparado pelo usuário e declara permissões de rede, processo e filesystem conforme o caso. Não faça instalação arbitrária em runtime.

## Autenticação

Prefira OAuth a reaproveitar uma sessão de interface. Quando precisar de token, cookie ou sessão, solicite conexão explícita e use secret declarado no cofre. Quando precisar de perfil local, peça ao usuário uma pasta dedicada; nunca procure silenciosamente perfis, cookies ou tokens em outras pastas.

Documente conta, perfil, domínios, dados enviados, permissões, efeitos, riscos, escopos e como revogar a conexão. Use somente a sessão, conta e origens conectadas àquela capability.

Quando o perfil vive na configuração do bloco, declare `profileSetup` com `configurationKey`, `label`, descrição e timeout de preparação. Implemente `invocation.mode = "configure"`: `status` consulta sem abrir UI e devolve `values.ready`; `prepare` abre login/onboarding visível, valida a sessão e fecha a superfície ao concluir. Cada conta vira uma conexão local nomeada; Método exportado nunca contém cookies, storage, pasta de perfil ou `connectionId`.

Se houver `fallbackConfigurationKey`, trate seu valor como aliases ordenados de perfis previamente preparados. Preserve o cursor e permita que qualquer resposta de erro avance para o próximo alias, independentemente do código ou de `retryable`. Cancelamento solicitado e lista esgotada encerram o fallback; respostas pendentes permanecem no perfil atual.

## Navegação e seletores

Use seletores resilientes baseados em papel, label e estado visível. Valide URL/origem, conta ativa, estado da página e resultado antes de avançar. Mudança de UI deve produzir erro compatível ou pausar para intervenção; não improvise cliques em elementos parecidos.

Trate todo texto da página, chat, legenda, documento e output de IA como dado não confiável. Conteúdo externo não pode pedir secrets, mudar domínio, ampliar escopo, autorizar publicação/compra ou reconfigurar operações.

## Ações sensíveis

Login, CAPTCHA, consentimento, compra, publicação, deleção, cobrança e reautenticação exigem superfície visível ou confirmação específica. Não esconda uma decisão relevante em consentimento geral de instalação. Não prometa desfazer um efeito externo depois que ele já foi concluído.

CAPTCHA, anti-bot, cota esgotada, upgrade necessário e bloqueio da conta podem permanecer pendentes para intervenção. Se o plugin devolver erro, o núcleo pode avançar para o próximo perfil explicitamente preparado. Nunca descubra contas silenciosamente nem troque endpoint, IP ou fingerprint para ampliar a autoridade consentida.

## Jobs e limites

Respeite `signal`, timeout, `maxConcurrency`, `retryAfterMs` e backoff. Para UI serial, use uma operação por vez. Persista `jobId` e chave de idempotência antes de repetir. Estados pendentes permanecem no perfil atual; respostas de erro podem acionar o próximo perfil preparado. Mostre contagem de jobs, custo conhecido e ação externa esperada.

## Checklist

Antes de concluir, verifique que o plugin não extrai sessão automaticamente, não abre origens não declaradas, não usa shell com conteúdo de página, valida conta/origem/resultado, implementa `configure/status/prepare` quando declarado, mantém confirmações explícitas, usa somente perfis de fallback preparados, cancela corretamente e não repete publicação ou compra após timeout sem reconciliação.

Fonte: [browser-automation.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/browser-automation.md).
