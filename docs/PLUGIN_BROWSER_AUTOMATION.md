# Plugins de automação de navegador e camadas de produtividade

Este guia define como planejar plugins que operam interfaces web de terceiros sem contornar planos, créditos, controles de acesso ou políticas do provedor. Ele complementa [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md), [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md) e [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).

Para o fluxo básico de criação e conversão, comece em [`PLUGIN_START_HERE.md`](PLUGIN_START_HERE.md). Este documento trata apenas dos riscos e decisões adicionais de automação de interface.

> Decisão de arquitetura: o núcleo não fornece um runtime ou broker específico de navegador. Cada plugin escolhe sua tecnologia de automação e seu mecanismo de autenticação — OAuth, login interativo, secret de sessão ou pasta de perfil escolhida pelo usuário — usando as permissões genéricas e o consentimento do protocolo. O ContentFlow OS não descobre nem entrega silenciosamente perfis, cookies ou sessões.

## 1. Princípio central

Uma camada de produtividade pode organizar uma fila, preencher formulários, acompanhar jobs e recolher resultados usando a conta do próprio usuário. Ela não ganha autoridade adicional por ser automatizada.

O limite efetivo de uma integração é sempre o mais restritivo entre:

1. a autorização expressa do usuário;
2. os termos, políticas e meios técnicos autorizados pelo provedor;
3. o plano, a cota, o rate limit e os controles da conta;
4. as permissões declaradas pelo plugin;
5. os limites impostos pelo ContentFlow OS.

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

Plugins oficiais e catálogos mantidos pelo projeto não aceitam capacidades que:

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

Um autor pode escrever, compartilhar e instalar diretamente código que ignore essas regras. A documentação não afirma aprovar previamente nem controlar esse comportamento. Ela define o que recebe selo oficial, listagem nos catálogos do projeto e suporte. Independentemente da origem ou finalidade, todo plugin executado dentro do ContentFlow OS recebe somente os recursos consentidos; se tentar ampliar essa autoridade, a sandbox deve impedir ou encerrar a operação automaticamente.

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
  -> navegador/runtime escolhido pelo plugin
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

- instalar ou incluir o navegador/runtime de que precisa, sem instalação arbitrária durante a execução;
- abrir login interativo, solicitar OAuth/secret ou pedir que o usuário escolha uma pasta de perfil quando necessário;
- documentar claramente conta, perfil, domínios, dados, efeitos e riscos envolvidos;
- pedir apenas operações necessárias à capacidade;
- usar seletores resilientes baseados em papel, label e estado visível;
- validar página, origem, conta e resultado antes de avançar;
- tratar mudanças de interface como erro compatível, não improvisar cliques;
- respeitar `signal`, timeout, idempotência e `maxConcurrency`;
- devolver `pending` enquanto o provedor processa o job;
- usar apenas a sessão, conta e origens que o usuário conectou àquela capacidade, sem enumerar outros perfis.

Usar o perfil principal de um Chrome que esteja aberto pode causar bloqueio de arquivos, corrupção de estado ou acesso muito amplo. Prefira um perfil dedicado ao plugin. Se a capacidade aceitar um perfil existente, a seleção deve ser explícita, restrita à pasta escolhida e acompanhada de aviso compatível com a permissão avançada solicitada.

## 7. Sessões e autenticação

Autenticação deve ocorrer em uma superfície clara para o usuário e ser definida pelo próprio plugin. Quando a integração exigir cookie ou token de sessão, o usuário conecta a credencial explicitamente e o núcleo a entrega pelo cofre somente àquele plugin. Quando exigir um perfil local, o usuário escolhe a pasta e concede a permissão correspondente; o núcleo não procura perfis automaticamente.

Requisitos:

- cookies, access tokens e refresh tokens nunca entram em `request`, `settings`, `configuration`, logs ou artifacts; quando necessários, são secrets obtidos em memória por `getSecret()`;
- o plugin não pode enumerar silenciosamente perfis, contas ou sessões fora da origem escolhida;
- o contexto fica preso ao plugin, provedor, conta e escopo consentidos;
- troca de conta ou ampliação de escopo exige novo consentimento;
- expiração ou revogação gera `AUTH_REQUIRED` e pausa recuperável;
- logout e remoção do plugin oferecem limpeza do estado criado pelo próprio plugin e orientação para revogar acesso no provedor;
- importação/exportação de Método nunca inclui estado autenticado.

Se um provedor oferecer OAuth, prefira OAuth a reaproveitar uma sessão da interface.

## 8. Headless e modo visível

O modo headless só deve ser usado quando permitido pelo provedor e quando não esconder do usuário uma decisão relevante. Login, CAPTCHA, consentimento, compra, publicação e reautenticação exigem uma etapa visível ou confirmação específica.

O plugin declara se a operação pode rodar em background e quais situações exigem interação visual. A capacidade deve reportar progresso pelo contrato do executor e pode abrir sua janela própria quando a tecnologia escolhida exigir login, CAPTCHA, diagnóstico ou confirmação.

## 9. Filas, limites e custos

O núcleo aplica o menor limite entre manifesto, configuração local e resposta do provedor. A implementação deve:

- iniciar um job por vez quando a interface oficial for serial;
- usar backoff e `retryAfterMs` reais;
- persistir `jobId` e chave de idempotência antes de repetir;
- interromper ao receber cota esgotada, upgrade necessário ou bloqueio da conta;
- nunca interpretar erro de limite como motivo para trocar endpoint, conta ou identidade;
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
