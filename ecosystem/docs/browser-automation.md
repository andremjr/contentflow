# Plugins de automação de navegador e camadas de produtividade

Este guia define como planejar plugins que operam interfaces web de terceiros sem contornar planos, créditos, controles de acesso ou políticas do provedor. Ele complementa [`protocol.md`](protocol.md), [`development.md`](development.md) e [`security.md`](security.md).

Para o fluxo básico de criação e conversão, comece em [`quickstart.md`](quickstart.md). Este documento trata apenas dos riscos e decisões adicionais de automação de interface.

> Decisão de arquitetura: o núcleo não fornece runtime, extensão ou broker específico de navegador. Uma extensão companheira Manifest V3, externa ao núcleo, oferece transporte e operações limitadas reutilizáveis aos plugins compatíveis. Cada plugin continua responsável por autenticação, seletores, estados, regras e validação do seu provedor. O ContentFlow não descobre nem entrega silenciosamente perfis, cookies ou sessões.

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
- alternar contas, identidades, IPs ou fingerprints para ampliar cota;
- burlar CAPTCHA, anti-bot, espera obrigatória ou verificação de identidade;
- varrer ou extrair silenciosamente cookies e tokens de perfis, contas ou serviços que o usuário não conectou àquele plugin;
- reutilizar credenciais de outra aplicação, pessoa, organização ou perfil;
- interceptar tráfego criptografado ou instalar certificados para capturar autenticação;
- chamar endpoint privado que o provedor não autorizou para integração;
- ocultar automação, tráfego, custos, terceiros ou finalidade dos dados;
- realizar scraping de dados que o usuário não poderia acessar manualmente.

Quando surgir um CAPTCHA, bloqueio antiabuso ou pedido de nova autenticação, o job deve pausar. Esses eventos são limites operacionais, não falhas a serem contornadas.

Múltiplas contas conectadas explicitamente são permitidas para continuidade operacional. A troca automática fica restrita a falhas técnicas transitórias (`UPSTREAM_UNAVAILABLE`, `TIMEOUT` e `JOB_FAILED`) e não pode ser usada em resposta a CAPTCHA, autenticação, rate limit, cota, upgrade ou bloqueio. Todas as contas precisam ser preparadas individualmente pelo usuário e permanecem em perfis dedicados separados.

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

## 6. Arquitetura gerenciada pelo plugin

A automação do navegador é uma implementação interna da capacidade do plugin:

```text
Método
  -> capacidade do plugin
  -> navegador/runtime dedicado escolhido pelo plugin
  -> extensão companheira MV3 e content script compartilhado
  -> adapter declarativo mantido pelo plugin
  -> autenticação conectada explicitamente pelo usuário
  -> interface do provedor
  -> resultado validado
  -> output do bloco
```

Responsabilidades do núcleo:

- validar manifesto, permissões, secrets, contratos de entrada e saída;
- mostrar e registrar o consentimento para `network`, `filesystem:*`, `process` e `native` quando declarados;
- oferecer cofre de secrets, pasta de trabalho escolhida e staging de artifacts;
- aplicar timeout, cancelamento e limites que a sandbox genérica conseguir impor;
- deixar efeitos materiais, provedores e política de dados visíveis ao usuário.

Responsabilidades do plugin:

- declarar a versão do protocolo da ponte, as origens necessárias e o adapter do provedor, sem baixar ou instalar código durante a execução;
- abrir login interativo, solicitar OAuth/secret ou pedir que o usuário escolha uma pasta de perfil quando necessário;
- documentar claramente conta, perfil, domínios, dados, efeitos e riscos envolvidos;
- pedir apenas operações necessárias à capacidade;
- usar seletores resilientes baseados em papel, label e estado visível;
- validar página, origem, conta e resultado antes de avançar;
- executar a rotina por mensagens e operações de DOM na aba identificada, sem depender de foco, teclado ou mouse do sistema;
- tratar mudanças de interface como erro compatível, não improvisar cliques;
- respeitar `signal`, timeout, idempotência e `maxConcurrency`;
- devolver `pending` enquanto o provedor processa o job;
- usar apenas a sessão, conta e origens que o usuário conectou àquela capacidade, sem enumerar outros perfis.

Usar o perfil principal de um Chrome que esteja aberto pode causar bloqueio de arquivos, corrupção de estado ou acesso muito amplo. Prefira um perfil dedicado ao plugin. Se a capacidade aceitar um perfil existente, a seleção deve ser explícita, restrita à pasta escolhida e acompanhada de aviso compatível com a permissão avançada solicitada.

## 7. Sessões e autenticação

Autenticação deve ocorrer em uma superfície clara para o usuário e ser definida pelo próprio plugin. Quando a integração exigir cookie ou token de sessão, o usuário conecta a credencial explicitamente e o núcleo a entrega pelo cofre somente àquele plugin. Quando exigir um perfil local, o usuário escolhe a pasta e concede a permissão correspondente; o núcleo não procura perfis automaticamente.

Quando o perfil é referenciado por uma configuração do Método, o plugin pode declarar `profileSetup`. Nesse fluxo, o construtor oferece uma ação explícita para abrir o navegador e concluir o login antes de qualquer Projeto ser executado. A execução normal deve falhar fechada quando o perfil ainda não foi preparado ou quando a sessão expirou; nunca deve preencher um prompt enquanto a página estiver em login, onboarding, CAPTCHA ou reautenticação.

Na experiência padrão da V1, essa preparação aparece no Bloco como **Adicionar conta** ou **Conectar conta**. O núcleo cria automaticamente a pasta dedicada dentro da raiz controlada do plugin, registra uma conexão local nomeada e solicita ao plugin que abra a origem declarada para autenticação. Cada conta é preparada separadamente e o Bloco guarda somente o `connectionId`; cookies e storage continuam confinados ao perfil dedicado.

A extensão companheira é instalada manualmente uma vez em cada perfil dedicado do Chrome usado por automação, por **Carregar sem compactação**. Scripts pessoais que automatizem essa preparação na máquina do mantenedor são paralelos, não integram o produto e não alteram a experiência dos usuários. A extensão permanece externa e substituível; nenhum adapter de fornecedor migra para o núcleo.

Uma única extensão não significa autoridade irrestrita. Ela aceita somente plugins, versões de protocolo, origens e ações válidos; novas origens entram por atualização revisada da extensão. O adapter do plugin descreve como localizar e validar a interface, enquanto a ponte executa apenas operações genéricas autorizadas. O handler verifica ID, versão, origem e protocolo antes de usar a sessão e nunca baixa código durante a execução.

O canal entre handler, service worker e content script usa mensagens versionadas, origem e aba allowlisted, identificador de execução, token efêmero e validação estrutural. Content scripts são tratados como contexto menos confiável: não recebem secrets duráveis e não podem ampliar hosts, permissões, efeitos ou escopo da capability.

Plugins com vários perfis podem declarar `profileSetup.fallbackConfigurationKey`. O campo contém aliases ordenados, nunca cookies ou credenciais. O núcleo valida e prepara cada alias separadamente, registra qual perfil foi usado e preserva o cursor e as entregas parciais ao fazer um fallback técnico permitido.

Requisitos:

- cookies, access tokens e refresh tokens nunca entram em `request`, `settings`, `configuration`, logs ou artifacts; quando necessários, são secrets obtidos em memória por `getSecret()`;
- o plugin não pode enumerar silenciosamente perfis, contas ou sessões fora da origem escolhida;
- o contexto fica preso ao plugin, provedor, conta e escopo consentidos;
- troca de conta ou ampliação de escopo exige novo consentimento;
- expiração ou revogação gera `AUTH_REQUIRED` e pausa recuperável;
- logout e remoção do plugin oferecem limpeza do estado criado pelo próprio plugin e orientação para revogar acesso no provedor;
- importação/exportação de Método nunca inclui estado autenticado.

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
- interromper ao receber cota esgotada, upgrade necessário ou bloqueio da conta;
- nunca interpretar erro de limite como motivo para trocar endpoint, conta ou identidade;
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

## 13. Testes mínimos

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

## 14. Checklist para proposta de um plugin

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
