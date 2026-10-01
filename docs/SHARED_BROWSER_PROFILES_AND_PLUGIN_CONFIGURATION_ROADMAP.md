# Roadmap — perfis compartilhados, itens duráveis, execução multiperfil, Browser Bridge e configuração de plugins

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](./ARCHITECTURE.md), o [estado e limitações](./CURRENT_STATE.md) e o [processo de desenvolvimento](./DEVELOPMENT.md).

> **Classificação: C — evidência histórica útil.** Este documento preserva a sequência, as decisões e as pendências observadas durante a implementação que antecedeu o Reliability Program. Ele não é plano vigente do Core. Problemas ainda observados são tratados pelo [desenvolvimento vertical](DEVELOPMENT.md); para o estado atual, consulte [`CURRENT_STATE.md`](CURRENT_STATE.md).

**Estado em 2026-09-26:** os pacotes 0.1 a 0.5, 1.1 a 1.5, 2.1 a 2.4, 3.1 a 3.4, 4.1 a 4.4, 5.1 a 5.8 e 6.1 foram implementados localmente. A adaptação de código do 6.2 (Flow) também está implementada e coberta por testes, mas seu gate real permanece aberto até concluir `prepare` e uma geração controlada no perfil compartilhável com a Browser Bridge atualizada. O pacote 5.8 e a implementação da fase 5 estão encerrados: ChatGPT, Flow, Gemini, Claude, Grok, Meta, MAI e Vibes coletam incrementalmente somente os códigos redigidos permitidos e preservam o cursor no workspace entre retomadas. Materialização universal de itens, scheduler multiperfil, UI e validação de atualização real continuam em fases posteriores. Este documento define a sequência proposta para evoluir perfis de navegador, distribuição de trabalho entre perfis e a superfície de configuração de plugins no editor de Métodos. Ele não afirma que os demais recursos já existem e não autoriza versão, tag ou release.

**Escopo autorizado:** evolução do produto oficial ContentFlow. Permanecem válidas as fronteiras de `LICENSE`, `AI\_USAGE\_POLICY.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` e do protocolo público de plugins. Não são criados novos Processos Universais, Blocos ou Operadores.

## 1\. Objetivo

Entregar quatro evoluções relacionadas, em ordem segura:

1. transformar a pasta/sessão de navegador em um perfil local global reutilizável por vários plugins, mantendo preparação, URL e regras específicas em cada plugin;
2. consolidar no núcleo a identidade e o estado durável de toda unidade intermediária, independentemente da estabilidade do plugin executor;
3. permitir que um Bloco distribua unidades independentes entre vários perfis selecionados, em paralelo, como alternativa explícita à fila de fallback atual, apoiado por uma Browser Bridge auditada e confiável;
4. mover a configuração de plugin do painel expansível do Bloco para uma janela própria, mantendo inicialmente os mesmos componentes declarativos e comportamentos, para permitir melhorias posteriores sem sobrecarregar o editor.

O primeiro usuário que cadastrar um perfil poderá reutilizá-lo em outro plugin sem criar outra pasta do Chrome. A associação a cada plugin continuará explícita. Um perfil compartilhado poderá, por exemplo, manter a mesma sessão Google e abrir ChatGPT e Flow em suas respectivas URLs.

## 2\. Limites e decisões já fechadas

### 2.1. Perfil físico e vínculo de plugin são conceitos diferentes

O núcleo passa a distinguir:

- **perfil de navegador:** identidade global e pasta física que contém a sessão local;
- **vínculo de plugin:** autorização explícita para um plugin utilizar aquele perfil;
- **preparação do vínculo:** estado específico daquele plugin/provedor naquele perfil;
- **seleção no Método:** política local do Bloco que escolhe perfis vinculados e seu modo de execução.

O plugin continua responsável por sua URL, autenticação, estado da página, seletores, validação e resultado. O núcleo continua responsável por identidade, persistência, consentimento, acesso à pasta, locks, fila, itens, retries, retomada e consolidação.

### 2.2. Não identificar nem fundir contas silenciosamente

Nome, alias e e-mail visível não provam que duas sessões são a mesma conta. O ContentFlow não deve inspecionar cookies, descobrir contas Google ou fundir pastas automaticamente.

A fonte de verdade é a escolha explícita do usuário: vincular um perfil global existente a outro plugin. Perfis legados com o mesmo nome continuam distintos até que o usuário escolha qual reutilizar.

### 2.3. Criar não significa vincular a todos

Ao criar um perfil dentro dos detalhes de um plugin:

- nasce um perfil global;
- ele é vinculado somente ao plugin atual;
- aparece como candidato nos outros plugins compatíveis;
- nenhum outro vínculo é criado automaticamente.

Isso preserva a experiência atual e acrescenta a opção de compartilhamento sem ampliar autoridade silenciosamente.

### 2.4. Preparação continua específica por plugin

Compartilhar a pasta não torna todos os serviços prontos. Cada vínculo executa seu próprio `configure/status/prepare`:

- ChatGPT abre e valida o ChatGPT;
- Flow abre e valida o Flow;
- Gemini abre e valida o Gemini;
- todos podem reutilizar a mesma sessão de navegador quando o usuário assim escolher.

Marcadores de preparação deixam de ser um único arquivo por pasta e passam a ser isolados por plugin/vínculo. Preparar um plugin não pode sobrescrever nem invalidar outro.

### 2.5. Um perfil físico não executa dois navegadores concorrentes

O mesmo perfil físico recebe um lock global. Dois plugins ou jobs não podem abrir simultaneamente a mesma pasta do Chrome. Paralelismo significa usar **perfis físicos distintos** ao mesmo tempo.

### 2.6. Todo trabalho intermediário pertence ao núcleo

O alvo arquitetural é universal: toda unidade intermediária de trabalho e todo resultado endereçável possuem identidade estável criada pelo núcleo. O plugin nunca inventa essa identidade nem decide se uma unidade já foi concluída.

É importante separar os níveis:

- o **Bloco** é uma ação estratégica e possui uma `BlockExecution` estável;
- uma execução escalar possui uma unidade de trabalho;
- uma entrada em lista possui uma unidade para cada texto, registro, arquivo ou mídia;
- uma entrega escalar possui uma entrega e um item de entrega;
- uma entrega em lista possui uma entrega e um item de entrega para cada elemento;
- cada artifact fica ligado à entrega e, quando aplicável, ao item que o produziu;
- outputs oficiais dos Processos usam as mesmas identidades, em vez de criar uma cópia paralela sem proveniência.

Assim, uma cena de Roteiro, um prompt, uma imagem, um vídeo, um trecho de áudio e um arquivo são itens exclusivos. Quando Roteiro for um único texto, ele é uma unidade escalar; quando for uma lista de cenas/registros, cada cena é uma unidade própria. O Bloco em si não é confundido com um elemento da lista: ele continua sendo a ação que contém essas unidades.

Antes de chamar o plugin, o núcleo materializa as unidades conhecidas, atribui IDs, ordem, origem e estado. O plugin pode receber a coleção em uma única execução contínua e trabalhar vários itens sem fechar navegador, perfil, conversa ou projeto. Conforme cada item avança, o plugin publica eventos incrementais correlacionados aos IDs do núcleo. Persistência, retry, distribuição, fallback, retomada, consolidação e prevenção de duplicação pertencem ao núcleo.

O modo simultâneo não executa o Bloco completo em cada perfil. Ele distribui unidades pendentes exclusivas entre perfis físicos distintos e reconstrói a saída pela identidade e ordem originais.

O manifesto descreve portas e informa quais estratégias de coleção o handler aceita. Para automação de navegador, a estratégia preferida é uma sessão contínua com atualizações por item; chamadas separadas por item continuam possíveis para APIs ou executores em que isso seja mais eficiente. Isso é compatibilidade técnica, não transferência de propriedade: identidade e fila continuam sendo do núcleo. Quando houver várias listas ou saídas e a correlação não for inequívoca, a configuração genérica do Bloco define qual coleção é distribuída e como a saída é agregada; o plugin não cria sua própria fila invisível.

Quando novas unidades só puderem ser descobertas durante a execução — por exemplo, trechos criados ao dividir um roteiro conforme o limite de caracteres de um provedor — o plugin registra primeiro um plano de itens derivados. O núcleo valida, cria IDs filhos e persiste a relação com o item/entrada de origem antes de qualquer geração externa. Depois disso, cada trecho usa o mesmo ciclo incremental e pode ser repetido isoladamente.

Regra de consumo: sempre que uma saída tipada contiver vários elementos, qualquer Bloco que a receba vê uma coleção de itens do núcleo, não um array opaco pertencente ao plugin. O núcleo preserva os IDs da entrega de origem e materializa o estado de processamento daquele Bloco para cada elemento antes de iniciar o executor.

### 2.7. A janela de configuração não permite UI arbitrária de plugin

A nova janela continua renderizando componentes padronizados e validados pelo núcleo a partir do manifesto. Plugins não fornecem React, HTML ou scripts de interface.

Esta entrega apenas separa e organiza a superfície existente. Remoção de redundâncias entre inputs do Bloco, portas, parâmetros e campos de plugin fica expressamente fora deste roadmap até nova decisão do titular.

### 2.8. Critério de universalidade

Nenhuma primitiva nova pode se chamar ou depender conceitualmente de Flow, imagem, narração ou de um fornecedor. Antes de aprovar uma mudança, ela precisa responder positivamente:

1. funciona para texto, records, arquivos e mídias tipadas?
2. funciona com operador IA ou Código e continua legível quando o executor é Humano?
3. preserva identidade, proveniência, tentativa e entrega sem conhecer o provedor?
4. permite implementação por navegador, API ou processo local sem mudar o Método?
5. mantém o núcleo como autoridade de estado e o plugin como executor de capability?
6. resolve tanto itens recebidos de uma entrega anterior quanto itens derivados durante a execução?
7. pode ser retomada depois de crash sem memória global do plugin?

Flow e clips de narração são cenários de validação dessas primitivas, não regras embutidas no núcleo.

## 3\. Estado atual que será substituído

Hoje:

- `plugin\_profiles` pertence diretamente a `plugin\_id`;
- aliases são únicos apenas dentro do plugin;
- o workspace padrão de perfil fica sob `plugin-workspaces/profiles/<plugin-id>`;
- Métodos persistem o alias principal e aliases de fallback dentro da configuração do plugin;
- handlers usam `services.getWorkspacePath()` tanto para estado privado quanto para a pasta do navegador;
- plugins de navegador gravam `.contentflow-profile-ready.json` na pasta física;
- o editor mostra perfis em um seletor e fallback ordenado;
- a configuração do plugin aparece em uma área expansível dentro do Bloco.

Esse desenho impede compartilhamento real, mistura estado privado com sessão física e não possui coordenação global para concorrência entre plugins.

## 4\. Contrato alvo

### 4.1. Persistência

Modelo proposto, sujeito a nomes finais na fase de contrato:

```text
browser\_profiles
  id
  name
  alias
  storage\_kind       # managed | legacy
  storage\_key        # relativo à raiz de dados; nunca exportado
  created\_at
  updated\_at

plugin\_profile\_bindings
  plugin\_id
  profile\_id
  created\_at
  updated\_at

plugin\_profile\_readiness
  plugin\_id
  profile\_id
  state              # metadado não secreto; sessão real continua na pasta
  checked\_at
  prepared\_at
  metadata

profile\_runtime\_leases
  profile\_id
  owner\_type
  owner\_id
  acquired\_at
  heartbeat\_at
  expires\_at
```

Secrets, cookies e storage de sessão não entram no SQLite. O banco guarda identidade, vínculos e estado operacional não secreto.

### 4.2. Armazenamento físico

Perfis novos:

```text
%APPDATA%/ContentFlow/data/browser-profiles/<profile-id>/
```

Estado privado do plugin permanece em:

```text
%APPDATA%/ContentFlow/data/plugin-workspaces/...
```

Perfis migrados não precisam ser copiados imediatamente. Um registro `storage\_kind = legacy` pode apontar por chave relativa para sua pasta atual. Isso evita mover gigabytes de cache e sessão durante a atualização. Compartilhar um perfil legado utiliza a localização preservada; uma futura compactação física, se necessária, será outro trabalho explícito e recuperável.

### 4.3. Serviço restrito para o plugin

Evoluir o executor de forma aditiva para separar:

```text
services.getWorkspacePath(relativePath)  -> estado privado do plugin
services.getProfilePath(relativePath)    -> perfil global selecionado e autorizado
```

`getProfilePath` só existe quando a invocação possui um vínculo válido. O runner e a sandbox autorizam somente a raiz daquele perfil, sem permitir enumerar outros perfis globais.

O caminho absoluto não entra no Método, exportação, snapshot portátil ou configuração do Bloco. O núcleo resolve o perfil local antes de iniciar a invocação.

### 4.4. Política de perfis pertencente ao núcleo

A seleção local do Bloco deve evoluir para um contrato genérico, separado dos parâmetros funcionais do plugin:

```text
profileExecution:
  mode: single | fallback | parallel
  profileIds: \[perfil principal, ...]
  maxParallel?: número limitado aos perfis selecionados
```

Esse objeto é local e não sai em pacotes de Métodos. O núcleo injeta somente o alias ativo na `configurationKey` declarada pelo plugin em cada chamada.

Compatibilidade API v1:

- configurações antigas com `configurationKey` e `fallbackConfigurationKey` continuam legíveis;
- um adaptador materializa a política equivalente sem reescrever snapshots antigos;
- ao salvar novamente, a política nova pode ser persistida mantendo o que o plugin precisa receber;
- exportações continuam levando apenas o requisito de perfil/conexão, nunca IDs locais.

### 4.5. Contrato de coleção contínua e paralelismo

Toda `BlockExecution` deve materializar suas unidades no núcleo, inclusive quando houver apenas uma. Materialização individual não exige uma invocação separada por item.

O protocolo deve aceitar duas estratégias universais:

1. **sessão contínua:** uma invocação permanece ativa, recebe/reivindica vários itens e publica o andamento de cada um; é o padrão esperado para navegador;
2. **chamada por item:** o núcleo faz uma invocação por unidade; permanece útil para APIs, processos curtos e compatibilidade.

Uma capability declara a correlação entre a coleção de entrada e a entrega acumulada e quais estratégias aceita. A forma final deve evoluir `execution.itemOrchestration` com o mínimo necessário, por exemplo:

```text
execution.itemOrchestration:
  inputPort: prompts
  outputPort: images
  strategies: \[continuous\_session, per\_item]
  preferredStrategy: continuous\_session
  profileParallelism:
    supported: true
    maxProfiles: 4
```

O nome final será definido junto ao schema. Um handler legado que recebe a lista inteira continua compatível, mas só ganha atualização item a item se publicar correlações válidas. Plugins oficiais de navegador serão adaptados individualmente para sessão contínua incremental antes de habilitar paralelismo.

Se o Bloco tiver mais de uma coleção candidata, a janela de configuração apresenta a escolha genérica da coleção distribuída e da entrega acumulada entre portas estruturalmente compatíveis. Essa associação pertence à configuração do Método e é validada pelo núcleo. Não se infere pareamento por posição quando a identidade de origem estiver disponível.

### 4.6. Distribuição de trabalho

No modo `parallel`:

1. o núcleo materializa todos os itens e suas identidades;
2. adquire um lease para cada perfil disponível;
3. inicia no máximo uma execução contínua de navegador por perfil;
4. cada lane mantém perfil, extensão, aba e projeto abertos durante seu lote;
5. a lane reivindica itens pendentes do núcleo ou recebe uma partição persistida;
6. ao concluir cada item, publica uma atualização e aguarda confirmação de persistência;
7. a lane segue para o próximo item sem desconectar/reconectar ou recarregar a página por rotina normal;
8. perfis mais rápidos podem consumir mais itens quando a estratégia usar reivindicação dinâmica;
9. a entrega final é ordenada pela identidade/posição original, não pela ordem de conclusão.

Para 30 prompts e 3 perfis, a distribuição tende a aproximadamente 10 por perfil. A implementação pode usar partições persistidas ou reivindicação dinâmica, mas cada perfil mantém uma única sessão contínua. Uma nova invocação só ocorre em retomada, falha, intervenção ou troca de perfil, não entre itens saudáveis da mesma esteira.

### 4.7. Falhas, retry e intervenção

O contrato da fase de execução deve fechar estes casos:

- item concluído nunca é repetido silenciosamente;
- erro em uma lane registra perfil, item, tentativa e mensagem;
- item ainda não submetido volta à fila;
- efeito externo incerto exige reconciliação antes de redistribuição;
- perfil com falha pode sair do pool sem interromper itens concluídos pelos demais;
- cancelamento para todas as lanes e impede novos itens;
- CAPTCHA, login e intervenção humana não são tratados como sucesso nem contornados por identidade não autorizada;
- se todos os perfis saírem, o Bloco preserva parciais e pausa/falha conforme o estado real;
- retomada após reinício reconstrói lanes a partir dos itens persistidos, nunca da memória do processo.

### 4.8. Estados mínimos de uma unidade

Cada unidade materializada precisa, no mínimo, de:

```text
id
blockExecutionId
sourceDeliveryId/sourceItemId
order
input
status: planned | pending | leased | submitted | awaiting\_result | completed | failed | awaiting\_human | cancelled
attempt
activeProfileId
externalReceipt
output
artifacts
error
attemptHistory
createdAt/updatedAt
```

Itens derivados passam antes por `planned`, recebem ID e só então ficam `pending`. `submitted` significa que um efeito pode ter ocorrido na página e impede retry cego. `externalReceipt` é opaco e opcional, usado para reconciliar jobs externos. Uma nova tentativa acrescenta histórico; não apaga a tentativa anterior nem troca o ID lógico da unidade.

### 4.9. Autoridade e correlação

O núcleo entrega `itemId`, índice, total, tentativa e proveniência. Em sessão contínua, a invocação recebe uma coleção de descritores ou reivindica itens por um serviço do executor. O plugin repete o `itemId` somente como correlação em cada evento; não escolhe outro ID. O núcleo rejeita atualização que não possa ser associada deterministicamente a uma unidade concedida àquela invocação/perfil.

Para uma lista, a conclusão do Bloco exige que cada unidade obrigatória esteja concluída ou que o usuário aceite explicitamente uma entrega parcial válida. A conclusão do processo nunca é inferida apenas porque o handler terminou sem lançar erro.

### 4.10. Serviços incrementais do executor

Os nomes finais serão definidos no protocolo, mas o comportamento precisa cobrir:

```text
services.registerItems(parent, plannedItems) -> IDs criados pelo núcleo
services.claimItems(limit)                   -> itens pendentes concedidos à lane
services.publishItemUpdate(update)           -> confirmação após persistência durável
services.publishPartial(update)              -> compatibilidade e snapshots agregados
```

`registerItems` atende subdivisões descobertas pelo plugin sem entregar a ele autoridade de identidade. `claimItems` permite que uma mesma invocação pegue novos trabalhos sem reabrir o navegador. `publishItemUpdate` só confirma depois que estado, valor e artifacts aceitos forem persistidos; após a confirmação, o núcleo incrementa sua revisão e a interface atualiza o item correspondente.

Eventos muito frequentes de progresso podem ser limitados/debounced, mas transições materiais — item criado, submetido, concluído, falho ou aguardando humano — não podem existir somente em memória nem ser perdidas por debounce.

### 4.11. Itens derivados e agregação final

Um plugin pode transformar uma unidade de origem em várias unidades filhas sem codificar “áudio”, “imagem” ou outro domínio no núcleo. Cada filho possui `parentItemId`, ordem, entrada própria e entregas tipadas.

Exemplo genérico de narração:

```text
roteiro de origem
  -> plano persistido de trechos 1..N
  -> clip 1 concluído
  -> clip 2 concluído
  -> clip 3 concluído
  -> clip 4 falhou / foi regenerado
  -> agregador produz a entrega final após todos os filhos obrigatórios
```

A agregação pode ser responsabilidade da mesma capability ou de outra composição do Método, mas não apaga os clips nem sua proveniência. Regenerar um filho invalida somente as entregas dependentes necessárias e permite recomputar a agregação sem repetir os irmãos concluídos.

## 5\. Auditoria e endurecimento da Browser Bridge

A Browser Bridge é infraestrutura compartilhada por todos os plugins de navegador e precisa ser tratada como um produto de protocolo, não como um conjunto de cliques auxiliares. Antes de voltar à evolução específica do Flow, este roadmap exige uma fase própria para medir, testar e endurecer extensão, cliente e integração com os plugins.

### 5.1. Base existente a preservar e verificar

A versão atual já possui elementos relevantes que precisam de testes mais amplos antes de serem considerados garantias:

- Manifest V3 com service worker e content script compartilhados;
- protocolo de bridge versionado;
- allowlist de plugin, origem, rota e ação;
- handshake com plugin, perfil, execução e token efêmero;
- cache idempotente de comandos;
- cancelamento persistido na sessão da extensão;
- serialização de comandos por aba;
- sessão CDP mantida durante o job e liberada no final;
- leases com heartbeat, TTL, alarme de limpeza e prevenção de descarte da aba;
- heartbeat do content script para manter comunicação durante jobs longos;
- limpeza em fechamento de aba, navegação, cancelamento e desconexão;
- operações genéricas limitadas de inspeção, texto, clique, tecla e arquivo.

O inventário da fase de auditoria deve confirmar cada comportamento no Chrome real, não apenas em mocks.

### 5.2. Monitoramento eficiente

“Monitorar tudo” significa observar todos os **estados relevantes declarados**, não capturar continuamente cada mutação do DOM ou conteúdo da página.

O contrato alvo combina:

1. eventos baratos do navegador: navegação, recarga, fechamento de aba, desconexão, mudança de origem, suspensão/reconexão do worker e perda do debugger;
2. snapshots sob demanda: URL, título, presença/estado de controles e indicadores que o adapter do plugin solicitar;
3. observadores temporários e limitados: um plugin pode pedir que a ponte aguarde uma condição declarativa durante um comando, com timeout, debounce e escopo de elemento;
4. heartbeat somente enquanto houver sessão/job ativo;
5. sequência monotônica de eventos para detectar perda e solicitar novo snapshot;
6. nenhum envio espontâneo de texto integral, prompts, cookies, tokens, HTML ou screenshots.

Seletores e a máquina de estados “pronto → enviado → gerando → concluído/falhou” pertencem ao adapter do plugin. A extensão fornece transporte, eventos de ciclo de vida e primitivas genéricas de observação. Isso permite ao Flow evoluir suas regras sem transformar a extensão em adapter de fornecedor.

### 5.3. Canal bidirecional

O protocolo precisa cobrir claramente:

- plugin → extensão: conectar, inspecionar, executar comando, iniciar observação limitada, cancelar, desconectar;
- extensão → plugin: confirmação, progresso estrutural, condição atingida, navegação, aba perdida, lease expirada, sessão reiniciada e erro normalizado;
- reconexão: plugin recupera a sessão, compara sequência de eventos e solicita snapshot atual;
- compatibilidade: cliente, extensão e plugin negociam versão e capabilities antes do primeiro efeito;
- backpressure: fila por aba e limites de eventos evitam crescimento sem controle;
- idempotência: comando repetido com mesmo ID devolve o recibo anterior e não repete o efeito.

### 5.4. Escada de recuperação

Atualizar a página pode ser uma recuperação válida, mas não é seguro como fallback universal. A política deve considerar a fase da unidade:

```text
antes de submeter
  -> reinspecionar
  -> aguardar condição curta
  -> repetir operação idempotente
  -> atualizar página se o adapter permitir
  -> revalidar origem, conta e estado
  -> reiniciar navegador/perfil se necessário
  -> trocar de perfil

depois de submeter
  -> nunca reenviar imediatamente
  -> reinspecionar e reconciliar recibo/job/resultado
  -> atualizar somente se o adapter declarar recuperação segura
  -> procurar o resultado existente
  -> marcar efeito incerto quando não houver prova
  -> intervenção ou troca de perfil apenas para a unidade ainda não concluída
```

O plugin define a política por estado do provedor; o núcleo impõe o limite de tentativas e preserva a unidade; a extensão executa `reload` ou outras primitivas somente quando declaradas, allowlisted e vinculadas à URL esperada. O comando de recarga deve ser idempotente, auditável e seguido de nova validação de conta/origem.

### 5.5. Orçamento de recursos

A auditoria deve medir, com navegador minimizado e visível:

- CPU e memória sem job;
- custo do heartbeat por 1, 3 e 5 perfis;
- custo de snapshots e observadores temporários;
- crescimento do cache de comandos, cancelamentos, leases e sessões;
- tempo para suspender/recriar o service worker;
- impacto de jobs de 30 minutos, 2 horas e duração longa controlada;
- comportamento com várias abas do mesmo provedor;
- consumo quando o ContentFlow não está executando nada.

Critérios numéricos são definidos a partir da linha de base medida. Sem job ativo, a extensão não mantém polling de DOM nem observador permanente pesado. Durante job, frequência e payload são limitados e documentados.

### 5.6. Matriz de confiabilidade da extensão

Testar ao menos:

- service worker suspenso entre dois comandos;
- content script desconectado e reconectado;
- debugger destacado externamente;
- aba fechada, recarregada ou navegada;
- origem correta com rota errada;
- duas abas compatíveis e escolha determinística;
- comando duplicado antes, durante e depois da conclusão;
- comando expirado na fila;
- cancelamento durante espera, escrita, clique, upload e download;
- Chrome minimizado sem roubar foco;
- máquina bloqueada/suspensa e retomada;
- internet offline, lenta e intermitente;
- alteração do DOM entre localização e ação;
- extensão atualizada durante uma sessão;
- plugin/cliente mais antigo que a extensão e vice-versa;
- cinco perfis em paralelo, cada um com uma extensão independente;
- job longo sem vazamento de sessão, debugger, lease, timer ou memória.

### 5.7. Observabilidade segura

Cada comando/evento pode registrar localmente apenas metadados redigidos: versão, plugin, perfil opaco, execução, comando, ação, timestamps, duração, código e mecanismo usado. Conteúdo do prompt, texto da página, cookies, tokens, HTML e caminho local não entram em telemetria.

Um diagnóstico exportável deve permitir responder: qual comando falhou, em qual estado, se houve recarga, se o efeito foi submetido, qual versão estava ativa e por que houve troca de perfil — sem revelar conteúdo do usuário.

## 6\. Experiência proposta

### 6.1. Gerenciador de Plugins

Dentro da área existente **Perfis e contas** de cada plugin:

- mostrar perfis vinculados ao plugin;
- manter visualmente o formulário existente de criação e adicionar nele apenas um select para
  escolher um perfil global ainda não vinculado;
- manter o campo de nome e **Adicionar perfil** para criar e vincular um novo exatamente no mesmo
  fluxo já existente;
- não criar inventário, seção de candidatos, aba ou reformulação visual na página de plugins;
- mostrar de forma derivada quais plugins e Métodos usam o perfil;
- preparar/verificar o serviço do plugin atual;
- renomear apenas o nome visual global, preservando alias e referências;
- remover significa primeiro desvincular do plugin;
- se for o último vínculo, explicar a remoção do registro sem apagar automaticamente a pasta de sessão;
- desinstalar plugin remove seus vínculos e readiness, nunca o perfil usado por outros plugins.

O vínculo exige aviso claro de que aquele plugin passará a utilizar a mesma sessão local do perfil.

### 6.2. Editor de Métodos

Na seleção de perfis do Bloco:

- modo padrão continua equivalente ao comportamento atual;
- seleção de perfil principal;
- fallback ordenado continua disponível;
- toggle **Executar perfis simultaneamente** aparece somente para capability compatível;
- ao ativar, o usuário seleciona dois ou mais perfis vinculados e preparados;
- a interface informa quantos workers serão usados e qual entrada será distribuída;
- se não houver lista/contrato compatível, o toggle fica ausente ou desabilitado com explicação;
- mudar de `parallel` para `fallback` preserva perfis selecionados quando isso puder ser feito sem ambiguidade;
- nomes e conteúdo criados pelo usuário não são traduzidos; toda moldura nova possui pt-BR, inglês e espanhol.

### 6.3. Janela de configuração do plugin

Substituir a área expansível por uma janela aberta a partir do Bloco. Na primeira entrega, ela contém os elementos já existentes, sem redesenhar seus significados:

1. seleção do plugin;
2. seleção da capability;
3. conexão local, quando aplicável;
4. perfil e política single/fallback/parallel;
5. campos declarados em `blockConfigSchema`;
6. opções dinâmicas;
7. informações e estados já apresentados hoje.

Requisitos da janela:

- renderer reutilizável e isolado do card do Bloco;
- estado de rascunho local, com **Cancelar** sem gravar e **Aplicar** atômico;
- nenhum autosave parcial enquanto a janela estiver aberta;
- preservar foco, teclado, scroll, validação e comportamento responsivo;
- resumo compacto no Bloco depois de aplicar;
- funcionar com plugin ausente/desativado e manter configuração histórica legível;
- permitir fixtures/preview de desenvolvimento usando o mesmo renderer real;
- não adicionar componentes arbitrários fornecidos pelo plugin.

**Ponto final deste roadmap para essa interface:** janela criada, comportamento atual preservado e base de preview disponível. Limpeza de campos redundantes, nova hierarquia, agrupamentos e revisão de inputs/outputs serão planejadas depois.

## 7\. Estratégia de migração sem perda

### 7.1. Princípios

- nunca apagar a tabela ou pasta antiga na primeira versão da migração;
- backup verificável antes da primeira alteração estrutural;
- migração idempotente, versionada e retomável;
- transação para cada mudança de banco;
- nenhuma dependência de rede ou plugin durante a migração;
- não abrir Chrome nem validar login durante startup;
- falha mantém os dados antigos e inicia recuperação explícita;
- não reescrever Projetos, snapshots e jobs quando um resolvedor compatível puder interpretá-los;
- não inferir compartilhamento entre perfis legados homônimos.

### 7.2. Conversão de registros existentes

Para cada linha antiga de `plugin\_profiles`:

1. criar um `browser\_profile` global distinto;
2. preservar nome e alias;
3. registrar `storage\_kind = legacy` e a chave relativa da pasta usada por aquele plugin;
4. criar `plugin\_profile\_binding` para o plugin original;
5. conservar a linha antiga durante a janela de compatibilidade;
6. registrar a versão da migração e o resultado.

Aliases iguais em plugins diferentes geram perfis globais diferentes. Isso garante que nenhuma pasta/sessão seja trocada sem autorização.

### 7.3. Métodos, Projetos, execuções e filas existentes

- Métodos antigos continuam com aliases em suas configurações;
- o resolvedor usa `pluginId + alias` para localizar o vínculo migrado;
- snapshots antigos não são reescritos;
- conversas opacas continuam associadas ao plugin, conexão e alias originais;
- jobs persistidos e fallback antigo continuam usando seu cursor;
- itens e artifacts concluídos permanecem intactos;
- uma execução iniciada antes da atualização deve retomar no mesmo perfil físico;
- somente uma edição posterior do Bloco cria a política local nova quando necessário.

### 7.4. Atualização e recuperação

Antes de recomendar release, validar a atualização sobre cópias isoladas de bancos representativos:

- instalação sem perfis;
- um plugin com um perfil;
- vários perfis e fallbacks;
- aliases iguais em plugins diferentes;
- Métodos usando principal e fallback;
- Projeto concluído;
- Projeto pausado;
- job de plugin interrompido;
- fila com itens parciais;
- plugin desinstalado ou ausente;
- workspace personalizado.

O processo de atualização deve produzir backup em `migration-backups`, validar contagens e vínculos e somente então marcar a migração como concluída. Se a abertura seguinte detectar estado incompleto, retoma ou restaura de forma controlada; não cria duplicatas.

## 8\. Fases, pacotes de trabalho e gates

Cada identificador abaixo representa uma tarefa pequena e revisável. Um modelo deve receber apenas um pacote por vez, mais o contexto mínimo indicado. Não deve implementar o pacote seguinte “por conveniência”. Nenhuma fase autoriza publicação.

### Regras para executar qualquer pacote

Antes de editar:

1. ler `LICENSE`, `AI\_USAGE\_POLICY.md`, `AGENTS.md`, `docs/ARCHITECTURE.md` e as referências diretamente exigidas pelo pacote;
2. registrar branch, `git status` e alterações preexistentes que não podem ser sobrescritas;
3. confirmar o contrato de entrada/saída e o gate do pacote;
4. localizar usos reais com `rg`, sem presumir que a lista deste roadmap é exaustiva.

Ao concluir:

1. listar arquivos alterados e explicar a responsabilidade de cada mudança;
2. listar testes executados com resultado, incluindo o teste focado novo;
3. informar explicitamente o que não foi implementado;
4. atualizar o status deste roadmap somente com evidência;
5. não incrementar versão, criar tag, publicar ou modificar trabalho alheio.

### Fase 0 — documentação normativa e contrato mestre

**Meta:** tornar o novo modelo inequívoco antes de alterar dados ou runtime.

#### 0.1 — Invariantes em `AGENTS.md`

- adicionar regras de perfil global, vínculo explícito, item pertencente ao núcleo, lock por perfil e migração recuperável;
- exigir validação de atualização a partir de base antiga antes de release;
- registrar que paralelismo distribui unidades, nunca repete o Bloco inteiro;
- não alterar implementação.

**Teste/gate:** revisão textual contra este roadmap; nenhuma regra contradiz licença ou política de release.

**Estado:** concluído em 2026-09-26. `AGENTS.md` agora registra perfil global com vínculo explícito, readiness separado, identidade de itens pertencente ao núcleo, lock/lease por perfil físico, paralelismo por unidades exclusivas, migração recuperável e validação de atualização a partir de base antiga antes de release. Nenhuma implementação de runtime ou dados foi alterada neste pacote.

#### 0.2 — Arquitetura de domínio

- atualizar `docs/ARCHITECTURE.md` com os níveis `BlockExecution`, unidade de trabalho, entrega, item de entrega e artifact;
- declarar perfil global, vínculo, readiness e política local;
- declarar que toda unidade intermediária recebe identidade do núcleo;
- preservar 8 Processos, 4 Blocos, 3 Operadores e 3 interfaces.

**Teste/gate:** teste de invariantes arquiteturais atualizado; exemplos escalar, lista de cenas e lista de assets revisados.

**Estado:** concluído em 2026-09-26. `docs/ARCHITECTURE.md` agora distingue `BlockExecution`, unidade de trabalho, entrega, item de entrega e artifact; define perfil global, vínculo explícito, readiness por vínculo, política local `single/fallback/parallel` e lock/lease por perfil físico; reafirma que toda identidade intermediária pertence ao núcleo; e inclui exemplos universais escalar, lista de cenas e lista de assets. O teste de invariantes arquiteturais cobre o novo contrato documental e continua garantindo 8 Processos, 4 Blocos, 3 Operadores e exatamente 3 interfaces de domínio. Nenhum runtime, schema, persistência ou migração foi alterado neste pacote.

#### 0.3 — Protocolo e schema de itens

- especificar sessão contínua incremental, chamada por item opcional, correlação, estados, tentativas, partials e consolidação;
- especificar `registerItems`, `claimItems` e confirmação durável de atualização;
- definir compatibilidade de handler agregado legado;
- definir associação genérica quando houver múltiplas listas/saídas;
- atualizar types, schema JSON e exemplos apenas depois de aprovar o texto.

**Teste/gate:** fixtures de manifesto válido/inválido; ausência do novo campo continua válida na API v1.

**Estado:** concluído em 2026-09-26. O protocolo público e a referência da skill agora definem as estratégias aditivas `continuous\_session` e `per\_item`, preferência de estratégia, elegibilidade de paralelismo por perfil, associações alternativas de coleção/entrega, estados duráveis, tentativa/revisão e os serviços reservados `registerItems`, `claimItems` e `publishItemUpdate`, preservando `publishPartial` e o executor legado. `src/lib/plugin-contract.ts`, `server/plugin-validation.ts` e `docs/ecosystem/schemas/contentflow-plugin-v1.schema.json` foram ampliados de forma compatível: manifestos sem `itemOrchestration` continuam válidos e o campo legado `mode: "sequential"` permanece aceito. As fixtures `tests/fixtures/item-orchestration-v03/valid-manifest.json` e `invalid-manifest.json` são cobertas por `server/plugin-item-contract-v03.test.ts`; o teste focado passou com 4/4 casos, `npm run typecheck`, `npm run test:plugin-options`, `npm run test:plugin-fallback` e `npm run test:plugin-kit` também passaram. Nenhum serviço incremental foi implementado no runner, nenhuma persistência/scheduler foi alterada e nenhum plugin foi adaptado para sessão contínua neste pacote.

#### 0.4 — Protocolo de perfil global

- fechar nomes de `profileExecution`, `getProfilePath` e IDs locais;
- documentar consentimento, sandbox, revogação e exportação;
- definir resolução de alias legado e vínculo novo;
- definir dados que nunca entram em request/snapshot/exportação.

**Teste/gate:** matriz de API v1, Método antigo, Método novo e pacote portátil sem referência local.

**Estado:** concluído em 2026-09-26. O protocolo público e as referências de segurança/automação fecham `profileExecution` como política local do Bloco, `profileIds`/`profileId` como identificadores locais opacos do núcleo e `services.getProfilePath(relativePath)` como a raiz restrita concedida somente após vínculo explícito válido. A compatibilidade API v1 resolve Métodos antigos por `pluginId + alias` sem fundir aliases homônimos; Métodos novos usam a política local e injetam ao handler apenas o alias ativo esperado pelo plugin. Consentimento, sandbox e revogação por vínculo foram documentados, assim como a exclusão de cookies, storage de sessão, secrets, caminhos, chaves de storage, IDs locais e `profileExecution` de requests e pacotes portáteis. `PluginExecutionServices` reserva `getProfilePath` opcional sem implementá-lo no runner. O teste focado `server/plugin-global-profile-contract-v04.test.ts` cobre API v1, Método antigo, Método novo, portabilidade e limites de autoridade. Nenhuma persistência, migração, resolução em runtime ou UI de perfis foi implementada neste pacote.

#### 0.5 — Contrato da Browser Bridge

- documentar lifecycle, comandos, eventos, sequência, snapshots, observadores limitados e backpressure;
- definir negociação de versão/capabilities;
- definir códigos de erro estáveis;
- definir recarga como ação controlada, não fallback universal;
- definir orçamento de recursos e dados redigidos.

**Teste/gate:** diagrama completo plugin ↔ cliente ↔ extensão ↔ aba, incluindo reconnect e efeito incerto.

**Estado:** concluído em 2026-09-26. `docs/ecosystem/browser-automation.md` agora fecha handshake com negociação de versão/capabilities, identidade de sessão sem expor o `profileId` local ao handler, envelope idempotente de comando, lifecycle sequenciado, snapshots sob demanda, observers limitados, backpressure, códigos estáveis, recarga controlada, orçamento de recursos, diagnóstico redigido e o diagrama completo plugin → cliente → extensão → aba com reconnect e reconciliação de efeito incerto. `docs/ARCHITECTURE.md`, `protocol.md`, `security.md`, a referência da skill e `AGENTS.md` foram alinhados. O schema API v1 foi deliberadamente mantido sem estado de sessão da Bridge ou `profileExecution`, porque esses dados são locais/runtime e não configuração portátil de manifesto. `server/browser-bridge-contract-v05.test.mjs` cobre o gate documental e foi incluído em `npm run test:browser-bridge`. Nenhum código da extensão/cliente, runtime, persistência ou migração foi alterado neste pacote.

**Gate da fase 0:** arquitetura, protocolo, segurança, browser automation, schema e `AGENTS.md` concordam. Nenhum dado foi migrado.

### Fase 1 — inventário, linha de base e fixtures

#### 1.1 — Inventário de perfis

- mapear tabela, stores, APIs, UI, builder MCP, exportação, desinstalação, aliases e usos em Métodos;
- mapear cada cálculo de pasta física e workspace customizado;
- produzir tabela arquivo → responsabilidade → risco → fase dona.

**Teste/gate do pacote:** inventário documental cobre as superfícies centrais e todo plugin de referência que declara `profileSetup`; nenhuma migração ou mudança de runtime é introduzida.

**Estado:** concluído em 2026-09-26. `docs/SHARED\_BROWSER\_PROFILES\_INVENTORY\_1\_1.md` registra tabela/store, APIs atuais e legadas, UI da Central, seletor do editor, Builder MCP, portabilidade de Métodos, desinstalação, aliases, usos em Métodos, workspace customizado, sandbox e migração de diretório. O inventário também documenta o cálculo de pasta física dos oito plugins de referência que declaram `profileSetup`, incluindo overrides e layouts divergentes (`<alias>`, `browser-profiles/<alias>`, `profiles/<alias>` e o root do Flow para `default`). O teste focado `server/shared-browser-profile-inventory-v11.test.mjs` mantém essas superfícies mínimas e exige que qualquer plugin de referência com `profileSetup` apareça no inventário. Nenhuma tabela global, vínculo, readiness novo, migração, `getProfilePath()`, lock, mudança de UI, adaptação de plugin ou movimentação de pasta foi implementada neste pacote.

#### 1.2 — Inventário de itens

- mapear `BlockExecution`, deliveries, delivery items, execution items, jobs, partials e artifacts;
- identificar onde listas ainda são tratadas como valor opaco;
- identificar inferências por índice que precisam de identidade explícita.

**Estado:** concluído em 2026-09-26. `docs/SHARED\_BROWSER\_ITEMS\_INVENTORY\_1\_2.md` registra a persistência atual em `process\_executions.payload` e `plugin\_jobs.payload`, as identidades de `BlockExecutionItem`, `ProjectDelivery` e `DeliveryItem`, a correlação de partials/artifacts e as APIs de edição/retry por item. O inventário enumera os arrays ainda opacos em `RuntimeValue`, inputs e partials, além dos fallbacks por posição/igualdade usados por orchestration, retomada legada, deliveries e reorder. `server/shared-browser-items-inventory-v12.test.mjs` exige que essas superfícies e inferências permaneçam documentadas enquanto existirem. Nenhuma tabela, migração, serviço incremental novo, scheduler ou mudança de runtime/UI foi implementada neste pacote.

#### 1.3 — Inventário da extensão

- mapear manifesto, permissões, policies, handshake, cache, sessões, leases, debugger, timers e listeners;
- medir quais cópias do cliente existem nos plugins e como permanecem sincronizadas;
- registrar lacunas entre mocks e Chrome real.

**Estado:** concluído em 2026-09-26. `docs/SHARED\_BROWSER\_EXTENSION\_INVENTORY\_1\_3.md` registra manifesto MV3, permissões e hosts, `PLUGIN\_POLICIES`, handshake/protocolo, cache idempotente, cancelamentos, sessões em memória, leases em `storage.session`, ownership do debugger, filas por aba, timers e todos os listeners do Service Worker/Content Script. O inventário mede as sete cópias físicas de `browser-bridge-client.mjs` (seis idênticas e a variante do Vibes), registra a implementação equivalente embutida no handler do Google Flow e enumera as lacunas que os mocks atuais não cobrem em Chrome real. `server/shared-browser-extension-inventory-v13.test.mjs` mantém essas superfícies, os oito plugins de referência com `profileSetup` e a topologia atual dos clientes explicitamente documentados. Nenhum manifesto, protocolo, policy, storage, sessão, lease, debugger, timer, listener, cliente de plugin ou runtime foi alterado neste pacote.

#### 1.4 — Fixtures de atualização

- criar bases sintéticas dos estados do §7.4;
- incluir aliases homônimos, workspace customizado, perfil pronto, marker antigo, jobs e itens parciais;
- guardar expectativas de contagem, hash de payload e pasta resolvida.

**Estado:** concluído em 2026-09-26. `tests/fixtures/shared-browser-upgrade-v14/` contém 11 bases sintéticas, uma para cada estado de atualização do §7.4, incluindo aliases homônimos entre plugins, principal/fallback, perfil pronto, marker legado, job interrompido, fila parcial, plugin ausente e workspace customizado. Cada cenário registra em `expectations.json` as contagens relevantes, SHA-256 dos payloads persistidos e caminhos relativos esperados para a pasta física. `scripts/generate-shared-browser-upgrade-v14.mjs` regenera o conjunto de forma determinística e `server/shared-browser-upgrade-fixtures-v14.test.mjs` valida integridade SQLite, cobertura, hashes, markers e casos críticos. Nenhuma migração de produção, tabela global, vínculo, readiness novo ou alteração de runtime/UI foi introduzida neste pacote.

#### 1.5 — Linha de base de recursos

- medir UI, SQLite, job simples e extensão sem job;
- medir 1, 3 e 5 perfis e command volume controlado;
- documentar ambiente genérico, versão do Chrome e variação sem identificar o hardware local.

**Estado:** concluído em 2026-09-26. `scripts/benchmark-shared-browser-v15.mjs` cria ambientes temporários e mede a rota de Plugins com inventário renderizado, operações indexadas no schema atual de `plugin_profiles`, um job imediato pelo `plugin-runner`, volume controlado de 100 comandos por perfil na Browser Bridge real em contextos VM e Chrome isolado com a extensão unpacked ociosa para 1, 3 e 5 perfis. `docs/SHARED_BROWSER_RESOURCE_BASELINE_1_5.md` registra ambiente genérico, Chrome 153.0.8010.54, dispersão das amostras, resultados e limites da evidência sem identificar o hardware local; `server/shared-browser-resource-baseline-v15.test.mjs` mantém o contrato de cobertura e garante que o benchmark não reutilize dados reais. Nenhuma migração de produção, tabela global, vínculo, readiness novo, lease persistente, scheduler ou alteração de runtime/UI foi implementada neste pacote.

**Gate da fase 1:** inventários completos, fixtures reproduzíveis e números de base. Nenhuma migração de produção.

### Fase 2 — infraestrutura de migração e recuperação

#### 2.1 — Versionamento e journal

- introduzir versão de schema/migração sem mudar a fonte de verdade;
- registrar `started/completed/failed` e etapa atual;
- tornar reentrada idempotente.

**Estado:** concluído em 2026-09-26. `server/schema-migrations.ts` introduz versão explícita do schema de migração e journal persistente com estados `started/completed/failed`, etapa atual e lista de passos concluídos. Cada passo roda em transação própria; uma falha preserva os passos anteriores, desfaz o passo corrente e permite retomar sem repeti-los. O bootstrap do servidor executa a infraestrutura antes das tabelas atuais, e a migração v1 apenas estabelece a baseline, sem converter `plugin\_profiles`, reescrever payloads, mover pastas ou alterar a fonte de verdade. `server/schema-migrations.test.ts` cobre baseline, reentrada idempotente, falha/retomada e sequência de versões. Backup verificável e falhas injetadas sobre a migração real permanecem nos pacotes 2.2 e 2.3.

#### 2.2 — Backup verificável

- criar backup antes da primeira escrita estrutural;
- verificar se o arquivo abre e contém tabelas/contagens esperadas;
- não sobrescrever o único backup válido.

**Estado:** concluído em 2026-09-26. `server/migration-backup.ts` cria o backup versionado antes da
primeira escrita estrutural declarada pela migração, abre a cópia em modo somente leitura, executa
`PRAGMA quick\_check` e compara inventário de tabelas e contagens com um manifesto persistido. Backups
válidos existentes são reutilizados na reentrada; arquivos existentes nunca são sobrescritos e, quando
um nome já está ocupado por uma cópia inválida/incompleta, um novo sufixo é usado. O bootstrap passou a
usar essa infraestrutura em vez do backup ad hoc anterior à criação de `plugin\_profiles`. A baseline v1
continua sem converter a fonte de verdade, mas instalações já existentes recebem a cópia verificável antes
da criação da infraestrutura versionada. `server/schema-migrations.test.ts` cobre ordem do backup, abertura
e contagens, reentrada sem sobrescrita e preservação de arquivo preexistente. Falhas injetadas em pontos da
migração real e prova de preservação das pastas do Chrome permanecem no pacote 2.3.

#### 2.3 — Falhas injetadas

- interromper depois de backup, criação de tabela, metade da cópia e antes do commit final;
- provar rollback/retomada sem duplicatas;
- provar que pastas do Chrome não são alteradas.

**Estado:** concluído em 2026-09-26. `server/schema-migrations.ts` expõe checkpoints
determinísticos de migração depois do backup, depois de cada passo confirmado e antes do commit
final de versão. `server/schema-migration-fault-injection-v23.test.ts` executa os quatro pontos de
interrupção exigidos sobre uma cópia isolada da fixture de múltiplos perfis: depois do backup,
depois da criação da tabela, no meio da cópia transacional e antes do commit final. Em cada caso a
origem permanece byte-equivalente no conteúdo legado observado, a cópia parcial sofre rollback
quando aplicável, a retomada completa sem duplicar linhas e uma segunda execução mantém o mesmo
resultado. A árvore física de perfis é comparada por SHA-256 antes da falha, depois da falha e
depois da retomada, provando que os arquivos de sessão do Chrome não são alterados. O pacote não
introduz ainda tabelas globais de produção, vínculos, readiness ou movimentação de pastas.

#### 2.4 — Diagnóstico de recuperação

- mensagem segura e acionável quando migração não concluir;
- logs sem paths sensíveis ou conteúdo do usuário;
- inicialização não continua sobre schema parcialmente migrado.

**Estado:** concluído em 2026-09-26. `server/schema-migrations.ts` agora oferece um guard de
inicialização que converte qualquer falha de migração em diagnóstico estruturado com código estável,
versões, etapa e status do journal, sem propagar mensagem original, conteúdo do usuário ou caminho
físico. `server/index.ts` registra somente esse diagnóstico redigido, fecha o SQLite e encerra o processo
antes da criação das demais tabelas quando a migração não conclui. `server/schema-migrations.test.ts`
cobre vazamento deliberado de path/token no erro subjacente, mensagem acionável e bloqueio explícito da
continuação do bootstrap sobre schema parcial. Nenhuma tabela global, vínculo, readiness ou movimentação
de pasta foi introduzida neste pacote.

**Gate da fase 2:** executar migração simulada duas vezes mantém o mesmo resultado; cada falha injetada preserva a origem.

### Fase 3 — identidade global, vínculos e leitura compatível

#### 3.1 — Tabelas e stores globais

- criar perfis, vínculos e readiness com constraints e índices;
- testar create/list/get/rename/link/unlink sem API HTTP.

**Estado:** concluído em 2026-09-26. A migração de schema v2 em `server/schema-migrations.ts`
cria `browser\_profiles`, `plugin\_profile\_bindings` e `plugin\_profile\_readiness` com constraints,
índices para alias/storage e consultas por plugin/perfil, além de relação de readiness por vínculo.
`server/browser-profiles.ts` adiciona stores internos para create/list/get/rename, link/unlink e
readiness sem criar API HTTP. O unlink remove somente o readiness do vínculo e preserva o perfil e
outros vínculos; aliases homônimos globais continuam permitidos para que a conversão 3.2 não funda
perfis legados silenciosamente. `server/browser-profiles.test.ts` cobre essas operações, integridade
do vínculo/readiness e a presença das estruturas. `plugin\_profiles` e as rotas atuais permanecem
inalterados como fonte legada até os pacotes 3.2–3.4; nenhuma pasta física foi movida.

#### 3.2 — Conversão dos registros antigos

- um perfil global distinto por linha legada;
- localização `legacy` relativa preservada;
- vínculo com o plugin original;
- nenhum merge por nome/alias.

**Estado:** concluído em 2026-09-26. A migração de schema v3 em `server/schema-migrations.ts`
converte cada linha existente de `plugin\_profiles` em um `browser\_profiles` distinto com identidade
determinística derivada exclusivamente do ID legado, preserva nome, alias e timestamps, registra
`storage\_kind = legacy` e mantém a chave relativa do workspace padrão legado
`plugin-workspaces/profiles/<plugin-id-sanitizado>/<alias>`. Cada perfil recebe somente o vínculo com
seu plugin de origem; aliases homônimos entre plugins geram perfis globais separados. A tabela
`plugin\_profiles`, Métodos, snapshots, jobs, payloads e pastas físicas não são reescritos nem movidos.
Quando existe `plugin\_workspaces.directory` customizado, o registro antigo permanece intacto para que
o resolvedor 3.3/serviço 4.1 preserve essa raiz externa sem serializar caminho absoluto em
`storage\_key`. `server/browser-profile-migration-v32.test.ts` cobre homônimos, vínculo original,
workspace customizado, payload legado e instalação nova sem tabela legada; a suíte de migração passa
junto com as regressões 2.x/3.1.

#### 3.3 — Resolvedor legado

- resolver `pluginId + alias` para vínculo e pasta originais;
- detectar ambiguidade e inconsistência sem escolher silenciosamente;
- não reescrever Método, snapshot ou job.

**Estado:** concluído em 2026-09-26. `server/browser-profiles.ts` agora expõe o resolvedor
compatível `resolveLegacyBrowserProfile`, que interpreta `pluginId + alias` sem alterar a
configuração persistida, exige exatamente um vínculo global válido e valida que registros migrados
continuem apontando para a identidade `legacy:<id>` e `storage\_key` esperadas. O cálculo preserva a
pasta física anterior tanto no workspace padrão quanto em `plugin\_workspaces.directory` customizado,
sem serializar esse caminho externo no perfil global. Estados ausentes, ambíguos ou divergentes
falham com códigos explícitos (`not\_found`, `ambiguous`, `inconsistent`) em vez de escolher um perfil
silenciosamente. `server/browser-profile-legacy-resolver-v33.test.ts` cobre resolução case-insensitive,
workspace customizado, múltiplos vínculos homônimos, corrupção/inconsistência e preservação byte a byte
dos payloads de Método, job e snapshot durante a resolução; a suíte `test:schema-migrations` inclui o
novo contrato. Este pacote não integra ainda `getProfilePath`, sandbox, leases, APIs HTTP globais ou
alterações de UI, que permanecem nas fases seguintes.

#### 3.4 — Ciclo de vida

- renomear nome visual sem mudar alias;
- desvincular respeitando usos;
- desinstalar plugin sem apagar perfil compartilhado;
- tratar último vínculo sem apagar pasta automaticamente.

**Estado:** concluído em 2026-09-26. O ciclo de vida global preserva a identidade física do perfil:
`BrowserProfileStore.rename` altera somente o nome visual e mantém alias/storage; unlink de vínculo
remove somente readiness e vínculo daquele plugin; e `PluginProfileBindingStore.unlinkPlugin`
remove em transação todos os vínculos/readiness de um plugin durante a desinstalação sem apagar
`browser\_profiles`. A rota de desinstalação integra essa limpeza antes de remover a fonte legada
`plugin\_profiles`; nenhum código remove a pasta física quando cai o último vínculo. A proteção de
uso existente continua impedindo remoção pela UI enquanto Métodos referenciam o alias. Os testes em
`server/browser-profiles.test.ts` cobrem rename sem troca de alias/storage, perfil compartilhado
preservado após desinstalação e último vínculo removido sem apagar identidade/storage. APIs globais
de inventário/vínculo e a UI de compartilhamento permanecem para a fase 7.

**Gate da fase 3:** toda fixture antiga aponta para a mesma pasta de antes; hashes de payload permanecem; homônimos continuam separados.

### Fase 4 — runtime, sandbox e leases de perfil

#### 4.1 — `getProfilePath`

- adicionar serviço tipado ao runner e worker;
- fornecê-lo somente em invocação com perfil resolvido;
- manter `getWorkspacePath` separado.

**Estado:** concluído em 2026-09-26. O contrato tipado `PluginExecutionServices` preserva
`getProfilePath(relativePath)` como serviço opcional, e o runner agora aceita a raiz física apenas
como autoridade efêmera da invocação. `server/index.ts` reutiliza
`resolveLegacyBrowserProfile(pluginId + alias)` para resolver o perfil efetivamente ativo antes de
start/resume/cancel, preparação, opções dinâmicas e regeneração de item; em fallback, a resolução usa
o alias já selecionado para aquela tentativa. Perfis legados materializados pelo inventário ou
criados pela UI depois da migração 3.2 recebem sua identidade/vínculo global no mesmo fluxo, sem
alterar Método ou alias. O worker só adiciona `getProfilePath` ao objeto
`services` quando essa raiz foi concedida e mantém `getWorkspacePath` em uma raiz independente.
Nenhum `profileId`, `storage\_key` ou caminho físico foi adicionado ao request serializável do
plugin. `server/plugin-profile-path-v41.test.ts` cobre presença/ausência condicional do serviço,
persistência na raiz concedida e separação entre perfil global e workspace privado. As regras
completas contra symlink/traversal e a matriz de permissões permanecem no pacote 4.2.

#### 4.2 — Permissões de filesystem

- autorizar apenas workspace privado e perfil selecionado;
- rejeitar traversal, symlink externo, raiz vizinha e perfil não vinculado;
- testar read/write conforme permissões declaradas.

**Estado:** concluído em 2026-09-26. O worker resolve caminhos de workspace, perfil e
output com contenção por `path.relative` e valida cada componente existente por `realpath`,
rejeitando traversal para raiz vizinha e links simbólicos/junctions que escapem da raiz
concedida. O permission model do Node recebe apenas as raízes efêmeras da invocação:
workspace privado e, quando resolvido por vínculo explícito, o perfil selecionado; leitura e
escrita são concedidas separadamente conforme `filesystem:read` e `filesystem:write`. Para
plugins write-only, o runner faz um preflight das raízes concedidas antes de iniciar o worker,
e o worker bloqueia criação de symlinks/hardlinks durante a invocação; isso fecha o escape por
junction observado no permission model do Node 26 no Windows sem transformar escrita em
permissão de leitura.
`server/plugin-filesystem-permissions-v42.test.ts` cobre leitura-only, escrita-only, negação
cruzada, traversal, symlink externo nas duas raízes e perfil global sem vínculo.
`server/plugin-profile-path-v41.test.ts` continua cobrindo a separação física entre workspace
e perfil. O pacote não adiciona IDs ou caminhos físicos ao request serializável e não altera
leases, que permanecem no pacote 4.3.

**Auditoria de 2026-09-27:** o caminho de erro do worker foi corrigido para fechar também a
interface de entrada antes de devolver `PLUGIN_WORKER_ERROR`. Sem isso, uma negação legítima do
sandbox podia manter o processo vivo até o timeout e bloquear a pasta temporária no Windows. A
matriz 4.1–4.2 passou novamente depois da correção.

#### 4.3 — Lease persistente

- adquirir atomicamente por `profileId` antes de abrir navegador;
- heartbeat, expiração, cancelamento e recuperação após crash;
- bloquear plugin/job concorrente no mesmo perfil;
- permitir perfis distintos em paralelo.

**Estado:** concluído em 2026-09-26. A migração de schema v4 adiciona
`browser\_profile\_leases`, com chave exclusiva por `profile\_id`, token opaco, proprietário,
heartbeat e expiração. `BrowserProfileLeaseStore` faz aquisição em transação `IMMEDIATE`, renova
leases do mesmo proprietário, rejeita outro job enquanto o lease está válido, libera por token ou
proprietário e remove leases expirados após crash. O runtime resolve o perfil global efetivamente
ativo antes do job, mantém heartbeat de 10 s com TTL de 30 s, preserva o lease enquanto o job está
`starting/pending/cancel\_requested`, troca/libera o lease quando o fallback muda de perfil e libera
automaticamente em `completed/failed/cancelled/abandoned`. Jobs concorrentes de plugins distintos
que resolvam para o mesmo `profileId` são adiados sem consumir retry; perfis físicos distintos
podem continuar em paralelo. `server/browser-profile-leases-v43.test.ts` cobre exclusão mútua,
paralelismo entre perfis, heartbeat/expiração/recuperação e liberação por cancelamento/encerramento.
O teste focado passou 4/4, a suíte de migrações passou 29/29 e `npm run typecheck` passou. O lint
global ainda falha por erros de Prettier preexistentes em arquivos de pacotes anteriores; os arquivos
alterados neste pacote foram formatados isoladamente. Snapshot persistente de `profileId` no job,
liberação explícita entre etapas de fallback e continuidade de conversa permanecem no pacote 4.4.

#### 4.4 — Integração com jobs

- snapshot do job registra `profileId` opaco e alias usado;
- fallback libera lease anterior antes do próximo;
- retry do mesmo item não troca identidade;
- conversa continua validando plugin, conexão e perfil.

**Estado:** concluído em 2026-09-26. Jobs novos persistem um snapshot local com `profileId` opaco e
alias ativo sem inserir o ID no request do plugin. O runtime valida esse snapshot antes de cada
lease, impedindo que retry/poll do mesmo job troque silenciosamente de perfil físico se o vínculo
mudar. Avanços de fallback resolvem e persistem a identidade do próximo perfil e liberam o lease
anterior imediatamente após salvar a transição. Referências locais de conversa agora guardam também
o `profileId` quando disponível; continuidade exige o mesmo plugin, conexão e perfil físico, mantendo
compatibilidade com conversas antigas que só possuem alias. Os testes focados cobrem persistência do
snapshot, estabilidade em retry e rejeição de conversa quando o alias permanece igual mas a
identidade física muda.

**Gate da fase 4:** testes de isolamento e corrida; dois perfis executam juntos, o mesmo perfil nunca abre duas vezes.

### Fase 5 — Browser Bridge confiável

Cada pacote desta fase deve alterar primeiro testes/fixtures e depois o mínimo de extensão/cliente necessário.

#### 5.1 — Harness de Chrome real

- criar cenário automatizado/local controlado para instalar a extensão, abrir página fixture e executar handshake/comando;
- cobrir service worker suspend/resume e navegador minimizado;
- manter mocks atuais como testes rápidos, não como única evidência.

**Estado:** concluído em 2026-09-26. Foi adicionado um harness local que inicia uma instalação
temporária da Browser Bridge em um navegador Chromium real, serve uma fixture HTTP controlada e adapta apenas
a allowlist da cópia temporária para essa origem de teste. O cenário valida a identidade da extensão,
handshake e comando CDP com a janela minimizada, confirma o efeito na fixture, interrompe os service
workers via CDP, recarrega a página para acordar a extensão e repete handshake/comando após a retomada.
Os testes de VM/mocks existentes permanecem como cobertura rápida e o teste real ficou disponível em
`npm run test:browser-bridge-v51`, separado da suíte portátil porque exige um executável Chromium
local. O harness usa o Chromium instalado pelo Playwright e aceita `CONTENTFLOW\_CHROME\_PATH` para
validar explicitamente Chrome/Chrome for Testing compatível com extensões unpacked. Nenhum arquivo da
extensão de produção é modificado pelo harness.

#### 5.2 — Negociação de versão

- handshake devolve protocolo, versão e capabilities;
- cliente rejeita incompatibilidade antes do primeiro efeito;
- matriz extensão antiga/cliente novo e inversa.

**Estado:** concluído em 2026-09-26. A Browser Bridge agora anuncia intervalo de protocolo,
`bridgeVersion` e capabilities de transporte e negocia a maior versão compatível solicitada pelo
cliente. O handshake falha com `PROTOCOL\_MISMATCH` quando não há interseção e com
`CAPABILITY\_MISMATCH` quando falta uma primitiva requerida, antes de criar a sessão ou despachar
qualquer comando. Os clientes compartilhados dos Browser Studios, o cliente do Vibes e o adapter do
Flow exigem as capabilities de transporte implementadas pela fase atual, validam a identidade da extensão antes de `connect` e validam
novamente a resposta negociada antes do primeiro `ping`. A matriz mantém cliente legado v2
compatível com a extensão nova; no sentido inverso, cliente novo rejeita a extensão antiga que não
declara capabilities antes de qualquer efeito. Cobertura adicionada aos testes rápidos da Bridge e
dos clientes; `npm run test:browser-bridge` e `npm run test:browser-plugins` passam integralmente.

#### 5.3 — Eventos de lifecycle

- emitir eventos estruturados para navegação, reload, aba fechada, worker reconnect, debugger perdido e lease expirada;
- número de sequência e snapshot de recuperação;
- nenhum conteúdo privado no evento.

**Estado:** concluído em 2026-09-26. A Browser Bridge mantém um journal limitado por sessão em
`chrome.storage.session`, com sequência monotônica e retenção máxima de 128 eventos. Os hooks reais de
`chrome.tabs`, `chrome.debugger` e limpeza de leases emitem `navigation`, `reload`, `tab\_closed`,
`worker\_reconnected`, `debugger\_lost` e `lease\_expired`. Navegação é redigida para `origin + pathname`;
query, hash, texto da página, prompts, cookies, tokens, storage e caminhos físicos não entram no evento.
O protocolo expõe `events({ afterSequence })` com detecção de lacuna (`snapshotRequired`) e
`snapshot()` com estado estrutural atual, e anuncia `lifecycle-events.v1` e `snapshot.v1` na negociação.
Os clientes compartilhados dos Browser Studios, o cliente do Vibes e o adapter do Flow exigem essas
capabilities e expõem leitura incremental de lifecycle e snapshot de recuperação. Não houve migração de
dados persistentes nem mudança de UI. Cobertura atualizada em `ecosystem/browser-bridge/test.mjs`,
`server/browser-bridge-client.test.mjs` e testes dos clientes; `npm run test:browser-bridge`,
`npm run test:browser-plugins` e `npm run test:browser-bridge-v51` passam. O harness Chromium 5.1 também
foi ajustado para aguardar o encerramento do processo antes de remover o perfil temporário no Windows.
`condition\_reached`, observers limitados e seus limites permanecem para o pacote 5.4.

#### 5.4 — Espera de condição limitada

- primitiva genérica com selector/estado declarativo, timeout e debounce;
- observador vive somente durante o comando/job;
- limite de frequência, payload e quantidade;
- limpeza garantida em cancelamento/desconexão.

**Estado:** concluído em 2026-09-26. A Browser Bridge anuncia `condition-observer.v1` e aceita
`observeCondition` somente nas origens/abas já autorizadas. A condição usa até 8 selectors de 256
caracteres, payload de até 4 KiB, estados `exists`, `absent`, `visible`, `hidden`, `enabled` e
`disabled`, timeout máximo de 30 s e debounce entre 25 ms e 1 s. Há no máximo 1 observador ativo por
aba e 4 por sessão; mutações são amostradas no máximo a cada 50 ms e somente `condition\_reached`
estrutural entra no journal, sem selector ou conteúdo da página. Cancelamento, desconexão, navegação,
fechamento da aba, perda do debugger e expiração encerram ou descartam o observador, e o próprio
observer possui timeout local para não sobreviver indefinidamente a uma perda de canal. Os clientes
compartilhados dos Browser Studios, Vibes e o adapter do Flow negociam a nova capability e expõem
`observeCondition`. A cobertura inclui sucesso, payload inválido, limpeza por cancel/disconnect,
evento redigido e execução no Chromium real minimizado via `npm run test:browser-bridge-v51`.

#### 5.5 — Recarga controlada

- ação genérica `reload` allowlisted;
- proibida/adiada quando a unidade está em efeito incerto sem reconciliação;
- revalidar URL, conta e estado depois da carga;
- comando idempotente e auditável.

**Estado:** concluído em 2026-09-26. A Browser Bridge anuncia `reload.v1` e aceita `reload`
somente nas abas/origens já allowlisted. O comando exige `reconciliationState` explícito:
`safe` antes de efeito externo possível ou `reconciled` depois que recibo/job/resultado já
foi conciliado; `uncertain` falha fechado com `RELOAD\_BLOCKED\_UNCERTAIN\_EFFECT`. A recarga
é serializada pela fila da aba, usa o cache de `commandId` para impedir uma segunda recarga em
replay, solta o debugger da própria sessão antes da navegação, aguarda a aba voltar a `complete`
e revalida origem/rota allowlisted antes de devolver sucesso. O lifecycle registra somente
`executionKey`, `commandId`, localização redigida e o marcador `controlled`. Os clientes
compartilhados dos Browser Studios, Vibes e Flow negociam `reload.v1`; os fallbacks de inicialização
que usavam `Page.reload` direto passam pela Bridge com estado `safe` e fazem novo `ping` antes
de continuar. A cobertura prova bloqueio em efeito incerto, replay idempotente, auditoria redigida
e ausência de `Page.reload` direto nos adapters.

#### 5.6 — Reconexão e idempotência

- comando em voo, worker reiniciado, resposta perdida e replay;
- cache limitado e limpeza determinística;
- não repetir clique/envio confirmado.

**Estado:** concluído em 2026-09-26. A Bridge persiste em `chrome.storage.session` um estado
`in\_flight` antes de `click`, `clickGenerate`, `pressEnter`, `setFiles` e `reload`.
Se o service worker reiniciar antes do recibo final, o mesmo `commandId` retorna
`COMMAND\_OUTCOME\_UNKNOWN` com reconciliação obrigatória, sem repetir o efeito. Se apenas a
resposta ao cliente for perdida depois da conclusão, o recibo persistido é devolvido com
`replayed: true`. O cache aceita recibos legados, mantém no máximo 500 entradas, usa TTL de
12 horas para concluídos e 10 minutos para comandos órfãos e remove entradas expiradas/antigas
deterministicamente por `storedAt + commandId`, inclusive no alarme periódico. Os clientes
compartilhados de ChatGPT, Claude, Gemini, Grok, Meta, MAI, Vibes e Flow preservam
`COMMAND\_OUTCOME\_UNKNOWN` para que o adapter/núcleo entre em reconciliação. A suíte da extensão
simula worker reiniciado com comando de clique em voo, prova ausência de segundo clique, replay do
recibo após resposta perdida e limite determinístico do cache. Não houve migração de dados nem
mudança de UI.

#### 5.7 — Recursos e soak test

- 1, 3 e 5 perfis; jobs curtos e longos;
- medir CPU, memória, timers, cache, sessions, debugger e leases;
- provar ausência de polling/observer pesado sem job;
- registrar limites aceitos.

**Estado:** concluído localmente em 2026-09-26, sem migração de dados nem alteração de UI.
O harness `scripts/soak-shared-browser-v57.mjs` usa perfis Chromium temporários e uma
fixture em `127.0.0.1`, executa comandos reais de `setText` pela extensão em 1, 3 e 5 perfis
(12 comandos por perfil no cenário curto; 60 no longo), coleta CPU, RSS e processos da árvore
do navegador e mede cache, sessões, timers, debugger e leases com instrumentação do worker.
As portas locais são apenas do servidor da fixture e do CDP dos navegadores temporários; o
harness usa Chromium headless e remove os perfis temporários ao fim. O relatório emitido não
contém modelo de CPU, número de núcleos, memória total, conta, prompt privado ou caminho de
perfil; nenhuma característica do computador é gravada no código ou neste roadmap.

**Resultado da execução completa:** 12/60 comandos por perfil concluídos nos seis cenários;
os sete gates passaram. Nos cenários longos, a variação agregada de RSS entre a primeira
amostra e a amostra após estabilização foi de -1%, -10% e -11% para 1, 3 e 5 perfis,
respectivamente, sem crescimento contínuo observado nessa janela. O cache ficou em no máximo
60 recibos por perfil neste teste, abaixo do limite de 500; sessões/lifecycle ficaram dentro
dos limites de 128; timers ativos, leases e anexos de debugger terminaram em zero. CPU e
quantidade de processos foram medidos, mas são características do ambiente de execução, não
limites do produto. O teste `server/browser-bridge-idle-v57.test.mjs` confirmou que o content
script não cria heartbeat ocioso e o ativa somente entre `job-active` e `job-idle`/disconnect;
o `MutationObserver` continua restrito ao comando de observação. O limite de regressão local
aceito para variação de RSS no fim do cenário longo é +15%, não uma exigência de hardware nem
um limite de uso do aplicativo. O soak é reproduzível com
`npm run benchmark:shared-browser-v57`; o teste do heartbeat, com
`npm run test:browser-bridge-v57`. Também passaram `npm run test:browser-bridge` e
`npm run test:browser-plugins` (252 testes).

Um ensaio exploratório com perfis reais de ChatGPT e Flow foi iniciado a pedido do titular,
mas retirado do gate deste pacote: a instalação unpacked apontava aos arquivos atuais, porém
um worker em memória ainda anunciava capabilities antigas e o cliente Flow bloqueou o efeito
até a recarga da extensão. Após a recarga, a negociação passou. O ensaio foi interrompido
quando um único prompt de teste já havia sido submetido ao Flow; o resultado externo ficou
incerto e não foi reenviado. A tentativa ChatGPT terminou com `UPSTREAM\_UNAVAILABLE`, sem
conclusão confirmada. Esses resultados não validam geração, detecção de cota, fallback,
persistência parcial nem recuperação. Os cenários reais integrados permanecem no gate da
fase 13, depois dos pacotes de itens duráveis e scheduler. Nenhum perfil real foi vinculado
automaticamente a outro plugin.

#### 5.8 — Diagnóstico redigido

- timeline local de metadados por execução;
- exportação de diagnóstico sem conteúdo/pasta/token;
- códigos permitem saber por que houve refresh, restart ou troca de perfil.

**Concluído localmente em 2026-09-26.** Os oito handlers de navegador leem eventos
incrementais antes de devolver `success`, `pending` ou `error`, retornam somente
`BRIDGE\_CONTROLLED\_RELOAD` e `BRIDGE\_WORKER\_RESTART` como `{ code }` e persistem
`lastSequence` no workspace para não reenviar eventos depois de `resume`. A regressão
`server/browser-plugin-diagnostics-v58.test.mjs` cobre reload, restart, redação e retomada
separadamente para ChatGPT, Flow, Gemini, Claude, Grok, Meta, MAI e Vibes. O gate
`npm run test:browser-bridge-v58` passa com 13 testes.

**Auditoria de 2026-09-27:** o cliente compartilhado do ChatGPT foi realinhado às demais cópias do
transporte. O estado redigido de diagnóstico volta a viajar somente no request interno da execução,
como nos outros adapters, e as seis cópias cobertas pela regressão são byte a byte idênticas. Os
testes da Bridge e os 252 testes dos plugins de navegador passaram após a correção.

**Gate da fase 5:** matriz do §5.6 aprovada em mocks e Chrome real; soak test sem crescimento contínuo; atualização não quebra perfis preparados.

### Fase 6 — adaptação da camada de perfil nos plugins de navegador

Executar um plugin por pacote; o Flow pode ser o primeiro depois da infraestrutura.

#### 6.1 — Fixture contratual de perfil

- criar suíte reutilizável para perfil global, workspace privado, readiness, cancelamento e bridge;
- cada plugin continua com testes específicos do provedor.

**Estado:** concluído localmente em 2026-09-26. A suíte reutilizável
`server/test-support/shared-browser-profile-contract-v61.ts` cria uma instalação sintética com
perfil global compartilhado, dois vínculos de plugins e workspace privado separado. O contrato
prova que `getProfilePath()` e `getWorkspacePath()` permanecem fisicamente isolados, que readiness
é independente por `pluginId + profileId` e que desvincular um plugin remove somente seu readiness
sem apagar o perfil físico nem o estado do outro vínculo. A mesma fixture cobre cancelamento da
invocação pelo `AbortSignal` do runner e fornece um stub reutilizável de CDP/Browser Bridge para
validar negociação antes de comandos. `server/shared-browser-profile-contract-v61.test.ts` exerce
o harness contra o runner, os stores globais e o cliente compartilhado da Bridge; o gate local é
`npm run test:shared-browser-v61`, validado com 4/4 testes; `npm run typecheck` e a regressão de
perfis existente (`npm run test:plugin-profiles`, 7/7) também passam. Nenhum plugin de provedor foi
adaptado neste pacote e os testes específicos de cada provedor continuam pertencendo aos pacotes

#### 6.2 — Flow

- usar perfil global e workspace privado;
- readiness próprio;
- preservar comportamento funcional vigente nesta fase;
- validar preparação e uma geração real controlada no mesmo perfil compartilhável.

**Estado local em 2026-09-26:** a adaptação de código está implementada. O Flow passa a usar
`services.getProfilePath()` quando o núcleo concede um perfil global e mantém checkpoints,
diagnósticos e o marcador novo de readiness no workspace privado do plugin. A leitura do marcador
legado dentro do perfil físico foi preservada apenas como compatibilidade de migração. O teste
`server/shared-browser-flow-v62.test.ts` reutiliza a fixture contratual do pacote 6.1 e prova que
duas áreas privadas podem apontar para o mesmo perfil físico sem compartilhar o novo readiness;
`npm run test:shared-browser-v62`, o teste específico do Flow, `plugin:kit check`, a regressão 6.1
e o typecheck passam localmente.

O gate real ainda não está encerrado. No perfil local `flow-e2e`, `status` confirmou o vínculo
global migrado e readiness existente, mas a primeira geração controlada parou antes de enviar o
prompt porque o worker da Browser Bridge carregado nesse perfil anunciava capabilities antigas.
Uma preparação subsequente permaneceu aguardando interação e foi encerrada sem validar nova
geração. Nenhum resultado real deve ser declarado até recarregar a extensão desse perfil,
concluir `prepare` e executar uma geração controlada com sucesso.

#### 6.3 em diante — demais plugins

- repetir apenas a adaptação de perfil, um plugin por tarefa: ChatGPT, Gemini, Claude, Grok, Meta, MAI, Vibes e outros existentes;
- manter cada pacote independente e testável.

**Pacote 6.3 — ChatGPT, estado local em 2026-09-26:** adaptação de código implementada. O
ChatGPT passa a usar `services.getProfilePath()` quando o núcleo concede um perfil global e grava
o novo marcador de readiness no workspace privado do plugin. A leitura do marcador legado dentro
da pasta física foi mantida somente para compatibilidade de migração. A regressão
`server/shared-browser-chatgpt-v63.test.ts` reutiliza a fixture contratual do pacote 6.1 e verifica
que duas áreas privadas podem apontar para o mesmo perfil físico sem compartilhar o novo readiness.
O gate local deste pacote é `npm run test:shared-browser-v63`, acompanhado do teste específico do
ChatGPT, `plugin:kit check`, regressão 6.1 e typecheck. A validação real de preparação e geração
controlada permanece pendente até o perfil real estar com a Browser Bridge atual carregada.

**Gate da fase 6:** cada plugin adaptado usa perfil global sem misturar readiness ou workspace. Estratégia incremental de coleção ainda não é alterada aqui.

### Fase 7 — APIs e interface de compartilhamento

#### 7.1 — APIs de inventário

- separar vinculados, candidatos e usos;
- não retornar pasta física;
- paginação/ordenação apenas se a medição justificar.

**Estado:** concluído localmente em 2026-09-26. A nova rota aditiva
`GET /api/plugins/:pluginId/profile-inventory` separa `linked`, `candidates` e `uses` sem alterar a
rota legada `/profiles` usada pela interface atual. Perfis públicos expõem apenas identidade local,
nome, alias e timestamps; `storageKind`, `storageKey`, diretórios físicos e `metadata` arbitrário de
readiness não entram na resposta. `linked` inclui o vínculo e readiness sanitizado do plugin atual,
`candidates` contém os perfis globais ainda não vinculados ao plugin com os IDs dos plugins já
vinculados, e `uses` deriva por vínculo os usos em Métodos existentes. A ordem continua determinística
pelos stores existentes e não foi adicionada paginação, pois a linha de base não justificou esse custo
neste pacote. `server/shared-browser-profile-inventory-v71.test.ts` cobre o contrato de domínio e a
rota HTTP isolada, incluindo ausência de caminhos físicos e preservação da API legada. O gate local é
`npm run test:shared-browser-v71`; a regressão `npm run test:plugin-profiles` e o typecheck também
passam. Comandos de criar/vincular/renomear/desvincular perfis globais, consentimento de sessão
compartilhada, preparação por vínculo e UI permanecem nos pacotes 7.2–7.4.

#### 7.2 — Comandos de vínculo

- criar, vincular existente, renomear e desvincular;
- validação de revisão/concorrência;
- consentimento explícito para sessão compartilhada.

**Estado local em 2026-09-26:** implementado. A API aditiva
`/api/plugins/:pluginId/profile-bindings` cria perfis globais `managed` já vinculados somente ao
plugin atual; o comando de vínculo de perfil existente exige `sharedSessionConsent: true` e a
revisão `profileUpdatedAt` observada no inventário. Renomear preserva alias/storage e também exige
a revisão do perfil; desvincular exige `bindingUpdatedAt`, bloqueia perfis ainda usados por Métodos,
remove somente o readiness do vínculo e preserva a identidade/pasta global mesmo no último vínculo.
Conflitos de revisão e aliases que tornariam a resolução `pluginId + alias` ambígua retornam 409.
As rotas legadas `/profiles` permanecem inalteradas. O gate local é
`npm run test:shared-browser-v72`, acompanhado de 7.1, regressão de perfis e typecheck.

#### 7.3 — Preparação por vínculo

- status/prepare usa plugin + profileId;
- readiness isolado;
- Browser Bridge inspeciona a pasta global correta.

**Estado local em 2026-09-26:** implementado. A nova rota aditiva
`POST /api/plugins/:pluginId/profile-bindings/:profileId/:action` resolve diretamente o vínculo global
por `pluginId + profileId`, injeta no handler somente a pasta física concedida por esse vínculo e mantém
o alias apenas como valor de compatibilidade da `configurationKey`. `status` e `prepare` persistem
readiness separado por plugin/perfil, preservando `preparedAt` entre verificações posteriores; preparar
um plugin não altera o estado de outro plugin que compartilha o mesmo perfil físico. A inspeção da
Browser Bridge passou a aceitar a pasta física exata do perfil, sem redescobri-la pelo workspace/alias.
As rotas legadas de perfis continuam disponíveis e não foram reescritas. A regressão
`server/shared-browser-profile-preparation-v73.test.ts` verifica uso da pasta global exata, Bridge
instalada nessa pasta e isolamento de readiness. O gate local é `npm run test:shared-browser-v73`,
acompanhado de 7.1, 7.2, regressão de perfis e typecheck. A UI continua para o pacote 7.4.

#### 7.4 — UI nos detalhes do plugin

- preservar o painel e o fluxo visual já existentes;
- acrescentar somente um select de perfis globais no formulário existente de adicionar perfil;
- o campo de nome continua criando um perfil novo; o select vincula um perfil já existente;
- não criar lista/seção visual de candidatos nem redesenhar a página de plugins;
- manter loading, vazio, cards, preparação, edição, remoção e usos como já apareciam;
- confirmação explícita ao compartilhar a sessão existente com outro plugin;
- pt-BR, inglês e espanhol;
- não criar nova aba global.

**Estado local corrigido em 2026-09-27:** implementado sem reformular a página. O painel existente
`Perfis e contas`, seu campo `Nome do novo perfil`, o botão `Adicionar perfil`, os cards e os estados
visuais anteriores foram preservados. A única adição visual é um select no mesmo formulário: ele
lista perfis globais ainda não vinculados ao plugin atual. Digitar um nome cria e vincula um perfil
novo; escolher no select vincula explicitamente o perfil global existente e solicita confirmação
antes de permitir que o plugin utilize a sessão local já presente. Não há seção de candidatos,
inventário visual, nova aba, preview nem configuração funcional de plugin nessa página.

Internamente, o painel consome o inventário global da fase 7.1. A criação e o vínculo usam os comandos
da fase 7.2; renomear/desvincular usam revisão observada; preparação e status usam `pluginId +
profileId` da fase 7.3, mantendo readiness específico do plugin. As duas mensagens novas do select e a
confirmação possuem pt-BR, inglês e espanhol sem traduzir nomes de perfil ou plugin.
`server/shared-browser-profile-ui-v74.test.ts` cobre o contrato visual restrito e
`src/lib/app-preferences.test.ts` cobre a regressão de internacionalização. O gate local do pacote é
`npm run test:shared-browser-v74`, acompanhado de `npm run test:i18n`, typecheck e regressões 7.1–7.3.
O cenário integrado completo do gate da fase 7 ainda deve ser validado no aplicativo com dois plugins
reais antes de declarar a fase encerrada para fins de prontidão de release.

**Gate da fase 7:** criar em A, vincular em B, preparar URLs distintas, remover A e continuar em B.

### Fase 8 — materialização universal de unidades

Esta fase é pré-requisito do paralelismo e deve funcionar também com um único perfil.

#### 8.1 — Modelo persistente e hierárquico

- unificar/normalizar unidade escalar, item de lista, item derivado, tentativa e proveniência sem duplicar entregas existentes;
- definir migração/normalização de jobs atuais;
- IDs gerados somente pelo núcleo.

**Estado local em 2026-09-27:** implementado. `BlockExecutionItem` passa a ser o modelo persistente
comum de unidade de trabalho dentro do snapshot de `ProcessExecution`, agora com `kind`, hierarquia
por `parentItemId`, proveniência sem copiar `ProjectDelivery`/`DeliveryItem` e identidade estável de
tentativa atribuída pelo núcleo. A normalização idempotente de inicialização absorve `workItems`,
`incrementalItems` e o formato legado `itemIds + items + accumulatedItems` dos `plugin_jobs`, preserva
IDs já concedidos pelo núcleo e grava a forma normalizada no bloco sem remover a representação antiga
do job. Itens derivados são ligados ao item de lote pai; delivery continua sendo a fonte da entrega,
sem uma segunda delivery dentro da unidade. Novos caminhos de item orchestration e updates incrementais
já persistem os metadados canônicos. O gate local é `npm run test:shared-browser-v81`, acompanhado de
`npm run test:plugin-fallback`, `npm run test:plugin-partials`, `npm run test:deliveries` e typecheck.
Materialização universal de escalares/listas na entrada fica no 8.2; registro antecipado de novos
filhos derivados fica no 8.3.

#### 8.2 — Materialização de inputs recebidos

- escalar gera uma unidade;
- listas geram uma unidade por elemento;
- arquivos/mídias preservam `sourceItemId`;
- ordem é metadado, nunca identidade única.

**Estado local em 2026-09-27:** implementado. Antes de criar o job do plugin, o núcleo agora
materializa toda porta efetivamente recebida em `BlockExecutionItem`: valores escalares geram uma
unidade `scalar` e arrays geram uma unidade `list_item` por elemento, inclusive listas com um único
elemento. Quando a porta veio de uma única delivery com cardinalidade alinhada, `sourceItemId`,
`sourceDeliveryId` e `sourceDeliveryItemId` são preservados. Em retries, a identidade é reaproveitada
primeiro pela proveniência de origem e, quando ela não existe, pelo valor dentro da mesma porta; `order`
é somente posição dentro da porta e não participa da identidade. `itemOrchestration` reutiliza os IDs
já materializados em vez de criar uma segunda identidade, e updates posteriores do job mesclam seus
itens com as demais unidades do bloco para não apagar escalares ou outras portas. O gate local é
`npm run test:shared-browser-v82`, acompanhado de 8.1, regressão de item orchestration,
`npm run test:plugin-inputs`, `npm run test:deliveries` e typecheck. Registro antecipado de filhos
derivados permanece no 8.3; conclusão incremental e correlação final de outputs agregados permanecem
nos pacotes 8.5–8.7.

#### 8.3 — Registro de itens derivados

- plugin propõe parent, ordem, entrada e chave semântica antes do efeito externo;
- núcleo valida e devolve IDs persistidos;
- retry da mesma tentativa lógica não duplica filhos;
- testar divisão de texto em trechos sem codificar narração no núcleo.

**Estado local em 2026-09-27:** implementado. `services.registerItems` agora atravessa o worker
isolado por um canal request/response com o núcleo: o plugin envia somente `parentItemId`, ordem,
entrada e chave semântica; o núcleo valida o pai contra as unidades já materializadas do bloco,
atribui IDs, persiste os filhos em `plugin_jobs.payload` e no snapshot de `BlockExecution` e somente
então devolve os descritores ao handler. Filhos usam `kind: "derived"`, `parentItemId`,
`semanticKey` e proveniência `plugin_derived`, sem codificar semântica de narração no núcleo. Uma
segunda chamada da mesma tentativa lógica com o mesmo `parent + semanticKey + order + input`
reutiliza o mesmo ID; mutação da mesma chave é rejeitada. O teste focado divide texto em trechos
dentro de um plugin fixture e verifica que o efeito posterior só ocorre depois que o callback do
núcleo registrou os IDs. O gate local é `npm run test:shared-browser-v83`; 8.1, 8.2,
`npm run test:plugin-jobs` e typecheck também passam. A regressão ampla
`plugin-account-fallback.integration.test.ts` continua falhando antes de alcançar este contrato, em
`ensureJobProfileLease`, porque o perfil físico resolvido diverge do snapshot do job; essa pendência
é anterior e permanece fora do escopo do 8.3. Concessão contínua, revisões materiais e
`publishItemUpdate` permanecem nos pacotes 8.4–8.5.

#### 8.4 — Sessão contínua e concessão de trabalho

- request inicial leva a coleção materializada e contextos compartilhados, ou a lane usa `claimItems`;
- uma invocação processa vários itens mantendo recursos externos abertos;
- plugin recebe `itemId/index/total/attempt` para cada concessão;
- concessão pertence à invocação/perfil até commit, erro, cancelamento ou expiração;
- chamadas por item permanecem estratégia alternativa.

**Estado local em 2026-09-27:** implementado. Capabilities que declaram `continuous_session` como
`preferredStrategy` passam a receber o request inicial com a coleção materializada inteira, sem o
`batch` unitário do executor legado. `services.claimItems(limit)` atravessa o worker isolado pelo mesmo
canal request/response usado por `registerItems`, seleciona somente unidades persistidas ainda não
concluídas, marca a tentativa como em andamento e persiste uma concessão interna ligada à invocação e,
quando aplicável, ao `profileId` físico já fixado no job. Chamadas sucessivas de `claimItems` na mesma
invocação recebem itens distintos com `itemId/index/total/attempt`; concessões expiradas deixam de
bloquear novas seleções e concessões sem conclusão voltam a `pending` ao encerrar com erro. Em sucesso,
uma única resposta pode concluir todas as unidades concedidas naquela sessão e reconstruir o prefixo
acumulado sem reabrir o worker entre itens. `per_item` permanece o padrão para manifestos legados e
para capabilities que não preferem sessão contínua. O gate local é `npm run test:shared-browser-v84`;
8.1–8.3, `npm run test:plugin-jobs` e typecheck também passam. A confirmação durável por item durante
a própria invocação, incluindo revisão material e estado de efeito externo incerto, permanece no 8.5.

#### 8.5 — Persistência incremental antes de avançar

- `publishItemUpdate` importa e grava resultado/artifacts antes de confirmar;
- confirmação atualiza a interface sem encerrar a invocação;
- crash entre plugin e commit é efeito incerto, não item pendente comum;
- conclusão da lista deriva dos estados persistidos.

**Estado local em 2026-09-27:** implementado. `services.publishItemUpdate(update)` agora atravessa o
worker isolado pelo canal request/response e só recebe confirmação depois que o núcleo valida
`itemId + expectedRevision`, importa artifacts pela mesma esteira segura das entregas parciais,
incrementa a revisão e persiste a transição tanto em `plugin_jobs.payload` quanto no snapshot de
`BlockExecution`. O ciclo fino fica em `durableState` (`leased`, `submitted`,
`awaiting_result`, `awaiting_human` e terminais) sem ampliar os estados visuais legados do item.
Uma concessão ainda apenas `leased` volta a `pending` se a invocação cair; depois de
`submitted`, a liberação preserva o estado incerto e impede retry cego. Resultados e artifacts
concluídos passam a aparecer no snapshot persistido e nas deliveries parciais durante a própria
invocação, e uma sessão contínua não pode encerrar com sucesso enquanto houver unidade concedida sem
estado durável `completed`. O gate local é `npm run test:shared-browser-v85`; 8.1–8.4,
`npm run test:plugin-jobs`, `npm run test:plugin-partials` e typecheck também passam. A
consolidação final, tratamento editorial de partials e regeneração seletiva permanecem no 8.6.

#### 8.6 — Consolidação e regeneração seletiva

- reconstruir outputs escalares/listas pela ordem e contrato;
- partials não viram conclusão silenciosa;
- “Usar entrega atual” continua explícito.
- regenerar um filho preserva irmãos concluídos;
- agregação final é recalculada somente depois das dependências obrigatórias.

**Estado local em 2026-09-27:** implementado. A consolidação de `itemOrchestration` agora parte das
raízes materializadas pelo núcleo e percorre filhos derivados em ordem, tratando as folhas como
dependências obrigatórias da entrega. `claimItems` e `publishItemUpdate` passam a operar também sobre
filhos registrados, sem promover esses filhos para `workItems` da coleção raiz. Snapshots parciais
reconstroem somente outputs já concluídos; uma sessão contínua que termina com qualquer dependência
obrigatória sem confirmação durável falha e preserva a entrega parcial para a decisão explícita
“Usar entrega atual”. Regeneração/atualização de um filho recalcula a coleção e o output combinado a
partir das identidades persistidas, preservando irmãos concluídos e sua ordem. O gate local é
`npm run test:shared-browser-v86`, acompanhado de 8.3–8.5 e typecheck. Compatibilidade de handlers
agregados legados e limitação de updates tardios permanecem no 8.7.

#### 8.7 — Compatibilidade agregada

- handler legado que recebe lista inteira continua funcionando;
- núcleo materializa outputs devolvidos e registra a limitação de updates tardios;
- paralelismo/update em tempo real só é habilitado quando a correlação incremental for suportada.

**Estado local em 2026-09-27:** implementado. Handlers agregados sem
`execution.itemOrchestration` continuam recebendo a coleção inteira, sem `request.batch`. Quando a
resposta final possui exatamente uma coleção de entrada e uma coleção de saída com cardinalidade
determinística, o núcleo reconstrói as unidades concluídas depois do retorno e persiste no job
`compatibility.mode = "aggregate_completion"`. Esse marcador registra explicitamente
`lateUpdates: false`, `realtimeUpdates: false` e `profileParallelism: false`, evitando tratar uma
correlação inferida após a conclusão como canal incremental disponível durante a execução. Capabilities
que já declaram `itemOrchestration` continuam no caminho incremental existente e não recebem esse
marcador. Mapeamentos ambíguos ou respostas incompletas não ganham correlação inventada. O gate local é
`npm run test:shared-browser-v87`, acompanhado de 8.1–8.6, `npm run test:plugin-jobs` e typecheck.
Adaptação incremental específica do Flow permanece no 8.8.

#### 8.8 — Flow em sessão contínua incremental

- máquina de estados explícita do Flow;
- escada de recuperação com refresh apenas nos estados seguros;
- uma execução processa toda a coleção concedida sem reconectar entre itens saudáveis;
- cada imagem/vídeo publica `itemId`, output e artifact assim que concluir;
- reconciliação depois de submissão;
- retomar somente itens pendentes/falhos usando o mesmo projeto quando seguro.

**Estado local em 2026-09-27:** implementação concluída. As capabilities
`generate-images-in-browser` e `generate-video-in-browser` do Flow declaram
`continuous_session` como estratégia preferida e recebem a coleção em uma única invocação.
O plugin reivindica IDs criados pelo núcleo com `claimItems`, mantém uma máquina de estados
`leased -> submitted -> awaiting_result -> completed/failed` e publica cada output e artifact
com `publishItemUpdate` assim que a mídia é materializada. A concessão agora devolve também o
estado durável anterior do item; reclaims preservam `submitted`/`awaiting_result` em vez de
reduzi-los novamente a `leased`, impedindo retry cego depois de crash.

Antes de cada efeito externo o Flow persiste no workspace privado o projeto ativo e o baseline
de mídia por `itemId`. Se a execução for retomada depois do submit, a nova sessão reabre o mesmo
projeto, compara o estado atual com esse baseline e aguarda/reconcilia o resultado sem clicar de
novo. O baseline é removido somente depois do commit durável do item. Falhas confirmadas pelo
provedor passam a `failed`; falhas anteriores ao efeito voltam a ser concedíveis pelo núcleo.
Refresh controlado pela Browser Bridge usa `reconciliationState=safe` somente em estados
seguros (`leased` ou `failed`); `submitted` e `awaiting_result` bloqueiam refresh e exigem
reconciliação. A sessão contínua de imagens usa uma submissão em voo por perfil para manter essa
reconciliação determinística, sem fechar/reabrir Chrome, CDP ou Bridge entre itens saudáveis.

O gate local `npm run test:shared-browser-v88` cobre estratégia negociada, preservação de
`awaiting_result` após reclaim, revisões monotônicas da máquina de estados, bloqueio de refresh
pós-submit, persistência privada do projeto/baseline e correlação pelos IDs concedidos pelo núcleo.
Também passaram os gates 8.4–8.7, `npm run test:plugin-jobs`, a suíte específica do Flow,
`npm run test:browser-plugins` (252 testes) e o typecheck do servidor. O cenário real do gate da
fase 8 com 20 prompts no Google Flow não foi executado nesta alteração local e continua obrigatório
antes de considerar o gate da fase 8 aprovado ou recomendar uma release.

#### 8.9 — Adaptação incremental dos demais plugins

- adaptar um plugin por pacote depois que o contrato comum estiver estável;
- escolher sessão contínua ou chamada por item conforme a natureza da integração;
- não copiar máquinas de estado específicas do Flow para outros provedores;
- exigir cenário real controlado antes de declarar suporte incremental.

**Pacote 8.9 — ChatGPT, estado local em 2026-09-27:** adaptação de código implementada para
`generate-text-in-browser`. A capability passa a declarar explicitamente `per_item` como única
estratégia incremental e preferida. Essa escolha preserva uma submissão por unidade, a correlação
`batch.itemId/index/total`, o cursor durável do núcleo e o fallback entre perfis, sem copiar para o
ChatGPT a máquina de estados específica do Flow nem prometer uma sessão contínua sem reconciliação
pós-submit própria do provedor. A capability de imagens mantém seu `itemOrchestration` anterior e
não recebeu estratégia nova neste pacote.

A validação local adiciona `npm run test:shared-browser-v89` (4/4) e também passou pela suíte
específica do ChatGPT (79/79), `plugin:kit check`, gates 8.4–8.8, persistência de jobs, typecheck,
fallback/item orchestration (27/27) e `npm run test:browser-plugins` (252/252). Durante a regressão
de fallback foi corrigida uma comparação de alias sensível a caixa que confundia `Backup` e
`backup` apesar de ambos resolverem para o mesmo `profileId`; o lease agora valida a identidade
física pelo `profileId`, preservando o vínculo explícito e a troca legítima de fallback.

O cenário real controlado do ChatGPT ainda não foi executado neste pacote. Portanto, a adaptação
local está implementada, mas o suporte incremental do ChatGPT não deve ser declarado validado em
ambiente real e o gate da fase 8 continua pendente dos cenários reais descritos neste roadmap.

**Gate da fase 8:** texto único, Flow com 20 prompts numa única sessão contínua, lista de records, arquivos, itens derivados e artifacts atualizam em tempo real e retomam após crash sem perda/duplicação.

### Fase 9 — política local `single/fallback/parallel`

#### 9.1 — Persistência local

- adicionar `profileExecution` fora da configuração funcional do plugin;
- normalizar configurações antigas principal/fallback;
- não exportar IDs locais.

**Pacote 9.1 — estado local em 2026-09-27:** implementado. `BlockPluginBinding` agora possui a
política local `profileExecution` (`single/fallback/parallel`, `profileIds` e `maxParallel`), separada
da configuração funcional entregue ao plugin. Ao salvar um Método, o núcleo materializa de forma
conservadora a política equivalente para configurações legadas principal/fallback somente quando
todos os aliases resolvem para vínculos globais; a ordem de fallback é preservada, IDs físicos
duplicados são eliminados e, se qualquer alias não resolver, o Método legado permanece inalterado.
Os aliases legados continuam na configuração durante este pacote para preservar o runtime atual até
a resolução por `profileExecution` do pacote 9.2.

As exportações v1/v2 continuam reconstruindo o binding portátil e descartam `profileExecution`, de
modo que `profileId` local não sai em pacote de Método. A validação focada é
`npm run test:shared-browser-v91` (17/17). Também passaram `npm run typecheck`, a regressão de
fallback/item orchestration (27/27), migrações/perfis legados (29/29) e Builder MCP (5/5). O gate
completo da fase 9 permanece pendente de 9.2 e 9.3.

#### 9.2 — Resolução na execução

- resolver vínculos/preparo/revogação antes de criar job;
- snapshot imutável da política usada;
- alias ativo injetado apenas na chamada daquele perfil.

**Pacote 9.2 — estado local em 2026-09-27:** implementado. A execução agora resolve cada
`profileId` da política local contra o vínculo global do plugin e exige readiness `ready` antes de
criar o job; vínculo ausente/revogado ou perfil não preparado falham fechados antes de qualquer
efeito do plugin. O job persiste uma cópia imutável de `profileExecution` com ordem, modo,
`maxParallel` quando aplicável e o par local `profileId + alias` resolvido. Quando essa política
existe, os aliases de perfil são removidos da configuração persistida do request e somente o alias
do perfil ativo é injetado na invocação efetivamente enviada ao handler, inclusive em resume,
cancelamento e ação isolada de item. O fallback continua usando sua ordem já persistida; políticas
`parallel` são resolvidas e congeladas neste pacote, mas a distribuição entre lanes permanece para
a fase 10.

A validação focada é `npm run test:shared-browser-v92` (24/24), cobrindo resolução, revogação,
readiness, snapshot, injeção por invocação, fallback e continuidade de conversa. Também passaram
`npm run typecheck`, `npm run test:shared-browser-v91` (17/17), `npm run test:plugin-jobs` e
`npm run test:plugin-fallback` (27/27). O gate completo da fase 9 permanece pendente de 9.3.

#### 9.3 — Builder, cópia e importação

- builder MCP e UI usam a mesma validação;
- cópia local remapeia somente quando explicitamente possível;
- importação exige associação local.

**Pacote 9.3 — estado local em 2026-09-27:** implementado. A validação de `profileExecution`
foi centralizada e agora é compartilhada pelo Builder MCP e pelos endpoints de salvamento usados
pela UI: políticas inválidas, perfis não vinculados e plugins sem `profileSetup` falham antes da
persistência. O contexto do Builder passou a expor somente os perfis globais efetivamente vinculados
ao plugin.

Na reutilização local de Métodos, `profileExecution` permanece somente em memória e só é copiado
quando todos os `profileIds` ainda podem ser confirmados como vínculos locais do mesmo plugin; se o
remapeamento não puder ser comprovado, a política e os aliases de perfil são removidos. Em
importações portáteis, `configurationKey`, `fallbackConfigurationKey` e `profileExecution` locais são
sempre descartados antes da persistência, impedindo associação automática por coincidência de alias
e exigindo uma nova escolha local no editor. A serialização portátil continua sem IDs de perfil.

A validação focada é `npm run test:shared-browser-v93` (22/22). Também passaram `npm run typecheck`,
`npm run test:shared-browser-v91` (18/18), `npm run test:shared-browser-v92` (24/24),
`npm run test:builder-mcp` (5/5) e `npm run test:method-transfer` (2/2). Com 9.1–9.3 concluídos, a
implementação local da fase 9 está fechada; publicação continua fora do escopo.

**Gate da fase 9:** Método antigo abre/salva sem mudar comportamento; fallback conserva ordem; snapshots antigos continuam legíveis.

### Fase 10 — scheduler multiperfil e recuperação por item

#### 10.1 — Pool de lanes

- uma lane por perfil com lease adquirido;
- limites: perfis selecionados, declaração da capability e configuração local;
- uma invocação contínua por lane;
- fila dinâmica ou partições persistidas de unidades pendentes.

**Pacote 10.1 — estado local em 2026-09-27:** implementada a materialização persistível do pool
multiperfil no snapshot do job. O núcleo só cria lanes quando a política local está em `parallel`, a
capability declara `profileParallelism.supported` e a estratégia incremental efetiva é
`continuous_session`. A quantidade efetiva respeita simultaneamente os perfis selecionados,
`profileExecution.maxParallel`, `profileParallelism.maxProfiles` e `execution.maxConcurrency`.

Cada lane recebe identidade estável, `profileId`/alias congelados e uma partição determinística das
unidades ainda pendentes, sem duplicação e preservando a ordem original dentro de cada partição. O
pool possui uma primitiva de execução que exige lease próprio por lane, abre exatamente uma
invocação contínua por lane adquirida e sempre libera o lease ao finalizar. O snapshot não persiste
token de lease nem expõe identidade física ao plugin. A integração desse fan-out com a concessão
atômica `pending -> leased` do job permanece no pacote 10.2, onde a distribuição exclusiva impede
duas lanes de consumirem a mesma unidade.

A validação focada é `npm run test:shared-browser-v101` (4/4), cobrindo limites combinados,
opt-in simultâneo, partição persistível/determinística e uma única invocação contínua por lane com
lease adquirido/liberado. Também passa pelo typecheck do servidor e pelos gates de sessão contínua
e resolução de perfis executados junto deste pacote.

#### 10.2 — Distribuição exclusiva

- transição atômica `pending -> leased` impede dois perfis no mesmo item;
- lane recebe vários itens ao longo da mesma invocação e só confirma avanço depois do commit do anterior;
- saída final mantém ordem original.

**Pacote 10.2 — estado local em 2026-09-27:** implementada a concessão exclusiva transacional das
unidades do pool. O `PluginJobStore` agora oferece uma mutação curta sob transação `IMMEDIATE`, sem
liberar o lease do worker, e o distribuidor de lanes usa essa primitiva para transformar somente uma
unidade elegível da partição da lane de `pending` para `leased`. Duas lanes não conseguem receber a
mesma unidade mesmo quando tentam avançar sobre o mesmo snapshot persistido.

A mesma `invocationId` contínua pode buscar sucessivos itens da lane, porém uma segunda concessão fica
bloqueada enquanto o item anterior ainda possui claim ativo. O próximo item só é liberado depois que
uma atualização terminal é persistida na mesma transação que remove o claim anterior. A consolidação
continua baseada na ordem original das unidades materializadas, portanto commits concorrentes ou fora
de ordem entre perfis não reordenam a entrega final.

A validação focada é `npm run test:shared-browser-v102` (3/3), cobrindo exclusividade entre lanes,
avanço somente após commit terminal e consolidação estável apesar de commits fora de ordem. A falha de
lane, devolução/reconciliação de itens e remoção dinâmica de perfil permanecem no pacote 10.3.

#### 10.3 — Falha de lane

- registrar tentativa/perfil/estado;
- retirar perfil defeituoso do pool quando aplicável;
- devolver apenas unidade comprovadamente não submetida;
- reconciliar unidade submetida antes de redistribuir.

**Pacote 10.3 — estado local em 2026-09-27:** implementado. A falha de uma lane agora é
persistida no próprio snapshot do pool com tentativa, invocationId, perfil opaco, estado, instante
e reasonCode sanitizado. A lane falha deixa imediatamente de receber novas concessões. Unidades
que permanecem comprovadamente sem efeito externo (pending/leased, sem output/receipt) são
devolvidas a pending, avançam a tentativa quando já haviam sido concedidas e são repartidas apenas
entre lanes ainda saudáveis.

Unidades que já chegaram a submitted, awaiting_result ou awaiting_human ficam presas à lane
falha em reconciliationItemIds, sem claim ativo e sem redistribuição automática. Uma operação
explícita de reconciliação só as devolve ao pool quando o chamador confirmou que o efeito externo
não ocorreu; nesse momento a tentativa anterior é encerrada e uma nova tentativa fica elegível.
Assim, timeout/desconexão depois de submit não produz retry cego em outro perfil.

A validação focada é npm run test:shared-browser-v103, cobrindo registro da falha, retirada da lane,
redistribuição exclusiva do que não foi submetido e bloqueio/reconciliação de efeito incerto. Os
pacotes 10.4 e 10.5 ainda são necessários para cancelamento/retomada e progresso agregado da fase.

#### 10.4 — Cancelamento e retomada

- cancelar todas as lanes e impedir novos leases;
- preservar concluídos e efeitos incertos;
- reinício reconstrói pool a partir do banco.

**Pacote 10.4 — estado local em 2026-09-27:** implementado. O cancelamento de uma execução agora
marca todas as lanes do pool persistido como `cancelled`, remove claims transitórios e impede novas
concessões mesmo enquanto o job ainda está em `cancel_requested`. Itens já `completed` permanecem
intactos; unidades em `submitted`, `awaiting_result` ou `awaiting_human` também permanecem no estado
durável existente e são registradas em `reconciliationItemIds`, evitando transformar cancelamento em
retry cego de um efeito externo potencial.

Na inicialização, `PluginJobStore.recoverInterrupted()` deixa de recuperar apenas o lease do worker e
também reconstrói o estado transitório do pool exclusivamente do snapshot persistido no SQLite. Claims
da sessão anterior são descartados; uma unidade interrompida em `planned/pending/leased`, sem output ou
receipt, volta a `pending` com nova tentativa, enquanto efeito incerto é preservado e coloca a lane em
`reconciliation_required`. Essa lane não recebe novo item até reconciliação explícita; ao confirmar que
o efeito não ocorreu, ela volta a `planned`. Lanes previamente falhas continuam falhas.

A validação focada é `npm run test:shared-browser-v104` (2/2), cobrindo cancelamento global do pool,
bloqueio de novas concessões, preservação de concluídos/efeitos incertos e reconstrução após reinício.
Também passaram `test:shared-browser-v101`, `v102`, `v103`, `test:plugin-jobs` e `npm run typecheck`.
O pacote 10.5 continua necessário para progresso agregado e para fechar o gate completo da fase 10.

#### 10.5 — Progresso

- total, concluídos, ativos, pendentes e falhos;
- diagnóstico por perfil sem expor conta;
- bloco conclui somente pelo estado das unidades.

**Pacote 10.5 — estado local em 2026-09-27:** implementado. O progresso multiperfil passa a ser
derivado exclusivamente das unidades obrigatórias persistidas pelo núcleo, com contagens de total,
concluídas, ativas, pendentes e falhas. O resumo por lane associa essas contagens somente ao
`profileId` opaco e ao estado da lane; aliases de perfil e qualquer identificação de conta ficam fora
do diagnóstico exportado. Itens derivados seguem a lane do item raiz que os originou.

Quando existem `workItems`, o término do job deixa de promover implicitamente o lote a 100%: o Bloco
só pode concluir quando todas as unidades obrigatórias estão em `completed`. Snapshots legados sem
unidades persistidas mantêm o fallback anterior. A validação focada é
`npm run test:shared-browser-v105` (3/3), complementada pelos testes 10.1–10.4, jobs e typecheck.
O gate integrado da fase 10 ainda depende de conectar o dispatcher multiperfil ao runtime principal:
as primitivas de pool, concessão, falha, cancelamento, retomada e progresso estão implementadas e
testadas isoladamente, mas `processPluginJob` ainda não executa as lanes em paralelo. Publicação
continua fora do escopo.

**Gate da fase 10:** 30 itens em 3 perfis usam três sessões contínuas, não 30 reconexões; falha de uma lane, cancelamento e reinício não duplicam nem omitem itens.

### Fase 11 — toggle e configuração do comportamento de execução

#### 11.1 — Controles do editor

- modos single, fallback e parallel;
- seleção/ordem de perfis;
- quantidade efetiva de workers;
- coleção distribuída e entrega agregada quando houver ambiguidade.

**Pacote 11.1 — estado local em 2026-09-27:** implementado. O editor de Método agora persiste a
política local `profileExecution` ao lado da configuração do Bloco e oferece os modos `single` e
`fallback` preservando o comportamento e os aliases legados. O modo `parallel` só aparece quando a
capability declara `execution.itemOrchestration.profileParallelism.supported=true`; ao ativá-lo, a
seleção ordenada usa IDs opacos dos perfis vinculados e mantém a mesma ordem ao alternar de volta para
fallback. Política e aliases são atualizados em uma única mutação do Bloco para evitar estados parciais.

No paralelo, o usuário define o teto local de workers e o editor mostra a quantidade efetiva limitada
simultaneamente pelos perfis selecionados, `profileExecution.maxParallel`, `profileParallelism.maxProfiles`
e `execution.maxConcurrency`. A interface também mostra a porta da coleção distribuída e a entrega
agregada declaradas pela orquestração; quando o contrato possui mais de uma associação possível, a
escolha continua sendo feita pelos vínculos explícitos de entrada/entrega já existentes no editor, sem
inferência por posição. Toda moldura nova possui traduções pt-BR, inglês e espanhol.

A validação focada é `npm run test:shared-browser-v111` (22/22 incluindo a regressão de i18n) e também
passa `npm run typecheck`. As restrições contextuais de materialização/correlação, mensagens para perfil
não preparado/ocupado/revogado e dependências entre itens permanecem no pacote 11.2; integração do
dispatcher multiperfil ao runtime principal continua sendo a limitação já registrada ao final da fase 10.

#### 11.2 — Validação contextual

- parallel somente com coleção materializada e correlação incremental compatível;
- mensagens para perfil não preparado, ocupado ou revogado;
- dependência entre itens permanece single/fallback.

**Pacote 11.2 — estado local em 2026-09-27:** implementado. O gate de lanes agora valida o contexto
real da tentativa antes de materializar qualquer pool: `parallel` exige unidades persistidas pelo
núcleo, estratégia efetiva `continuous_session`, correlação incremental compatível e ausência de
dependência pai-filho entre as unidades do lote. Snapshots de compatibilidade agregada continuam
legíveis, porém não recebem fan-out multiperfil; hierarquias dependentes permanecem nos modos
`single`/`fallback`.

O editor passou a consumir o inventário global de perfis vinculados, incluindo readiness específico
do plugin e um indicador booleano de ocupação derivado do lease global, sem expor token, proprietário
ou caminho físico. Perfis selecionados que foram desvinculados, ainda não foram preparados ou estão
ocupados recebem mensagens contextuais; a opção `parallel` só é oferecida quando a capability declara
uma sessão contínua incremental compatível e a interface informa que a execução ainda depende da
materialização de itens independentes pelo núcleo. Toda moldura nova possui pt-BR, inglês e espanhol.

A validação focada é `npm run test:shared-browser-v112`, cobrindo materialização, correlação legada,
dependência hierárquica, perfil revogado/não preparado, ocupação sanitizada e i18n. A integração do
dispatcher multiperfil ao runtime principal continua sendo a limitação registrada no gate da fase 10;
o pacote 11.3 permanece responsável pelo resumo antes de salvar e feedback de progresso na execução.

#### 11.3 — Execução e feedback

- resumo antes de salvar;
- progresso durante execução;
- pt-BR, inglês, espanhol e acessibilidade.

**Pacote 11.3 — estado local em 2026-09-27:** implementado. O editor agora mostra um resumo
acessível da política de perfis que será persistida, incluindo modo, quantidade de perfis, ordem
selecionada e workers efetivos no paralelo. Nomes definidos pelo usuário continuam sendo exibidos
como conteúdo local, sem passar pelo sistema de tradução.

Durante a execução, o BlockExecution recebe o progresso multiperfil derivado pelo núcleo a partir
das unidades duráveis já usadas no diagnóstico do pacote 10.5. A interface mostra contagens
agregadas e por lane de concluídos, ativos, pendentes, falhos e itens que exigem reconciliação,
identificando lanes apenas como Perfil 1, Perfil 2 etc.; IDs opacos, aliases e contas não são usados
como rótulos visíveis. O resumo usa aria-live, rótulos de progresso e textos em pt-BR, inglês e
espanhol.

A validação focada é npm run test:shared-browser-v113, complementada por
test:shared-browser-v111, test:shared-browser-v112 e npm run typecheck. A integração do
dispatcher multiperfil ao runtime principal continua sendo a limitação já registrada no gate da
fase 10; por isso o cenário real com três perfis ainda pertence à validação integrada posterior.

**Gate da fase 11:** alternar modos preserva configuração válida; capability legada não promete paralelismo; três perfis executam o cenário real.

### Fase 12 — janela de configuração do plugin

#### 12.1 — Extrair renderer

- componente puro/reutilizável para plugin, capability, conexão, perfil e schema;
- testes com fixtures sem depender do card expandido.

**Pacote 12.1 — estado local em 2026-09-27:** implementado. O renderer declarativo de configuração
foi extraído do `BlockEditor` para `src/components/plugin-configuration-renderer.tsx`, preservando a
composição existente de conexão, perfil, conversa, campos primários, modo de geração e campos
avançados. A classificação e visibilidade dos campos agora são calculadas por uma função pura em
`src/lib/plugin-configuration-renderer.ts`, permitindo validar manifesto, schema, configuração e
chaves de perfil sem montar nem expandir o card do Bloco.

A fixture `tests/fixtures/shared-browser-v121/renderer.json` cobre campos primários e avançados,
`visibleWhen`, chaves reservadas de perfil e sequência item a item. A validação focada é
`npm run test:shared-browser-v121`, complementada por `npm run typecheck`. Este pacote não introduz
rascunho, janela, autosave ou mudança de persistência; esses comportamentos continuam reservados aos
pacotes 12.2 a 12.4.

#### 12.2 — Estado de rascunho

- abrir com snapshot da configuração;
- editar sem autosave parcial;
- Cancelar descarta; Aplicar valida e grava atomicamente.

**Pacote 12.2 — estado local em 2026-09-27:** implementado. A configuração renderizada do plugin
agora trabalha sobre um snapshot local isolado do vínculo persistido, incluindo configuração do
schema, conexão, política de perfis e conversa. Alterações nesses controles não disparam o autosave
do Método; **Cancelar** restaura integralmente o snapshot salvo e **Aplicar** valida o schema antes de
enviar um único patch atômico do vínculo do plugin ao Bloco. A seleção inicial de plugin/capability e
os bindings do contrato continuam no fluxo existente e não foram redesenhados neste pacote.

A validação focada é `npm run test:shared-browser-v122`, cobrindo isolamento do snapshot, descarte,
validação antes do commit, clonagem do valor aplicado, patch único e traduções pt-BR, inglês e
espanhol. A substituição da área expansível pela janela, seu foco/teclado/scroll e o resumo compacto
continuam reservados ao pacote 12.3.

#### 12.3 — Janela e resumo

- foco, teclado, scroll, responsividade e retorno ao gatilho;
- resumo compacto no Bloco;
- plugin ausente/desativado continua legível.

**Pacote 12.3 — estado local em 2026-09-27:** implementado. A área expansível do executor foi
substituída por uma janela declarativa baseada no diálogo acessível já usado pelo aplicativo. O
gatilho no Bloco mostra um resumo compacto do plugin/capability, quantidade de campos salvos,
perfis selecionados e estado do contrato. A janela mantém foco contido, navegação por teclado,
fechamento por Escape e retorno ao gatilho pelo comportamento do componente de diálogo; o corpo
possui scroll próprio e limites responsivos de largura e altura. **Cancelar**, fechar e Escape
descartam o rascunho não aplicado, enquanto **Aplicar** preserva o patch atômico introduzido em
12.2 e fecha a janela.

O editor passou a manter no inventário também plugins instalados desativados. Vínculos históricos
ausentes ou indisponíveis continuam identificáveis pelo `pluginId + capabilityId`, exibem os valores
salvos em modo somente leitura e não expõem IDs de perfil, caminhos ou sessão. Os novos textos da
moldura possuem pt-BR, inglês e espanhol; nomes e valores do usuário/plugin permanecem intactos.
A validação focada é `npm run test:shared-browser-v123`, complementada por 12.1, 12.2,
três cenários Playwright afetados do editor, `npm run test:i18n`, `npm run typecheck` e
`npm run build`. O preview de desenvolvimento e qualquer
remoção de redundâncias permanecem fora do escopo e reservados ao pacote 12.4.

#### 12.4 — Fechamento da janela no editor de Métodos

- manter toda a interface funcional do plugin exclusivamente na janela sobreposta aberta pelo
  Bloco no editor de Métodos;
- usar exatamente o renderer declarativo de produção dentro dessa janela, sem UI arbitrária de
  plugin;
- não adicionar configuração funcional, preview ou renderer de Bloco à página `/plugins`, que
  continua responsável pelo catálogo, ativação, perfis e ciclo de vida dos pacotes;
- não iniciar nesta fase a remoção de redundâncias.

**Estado local em 2026-09-27:** concluído após correção explícita de escopo. O pacote não adiciona
nenhuma superfície à página `/plugins`. A configuração funcional permanece no editor de Métodos: o
gatilho compacto do Bloco abre a janela sobreposta introduzida no 12.3, que contém o renderer
declarativo real, conexão, perfis, conversa, contrato, parâmetros, Cancelar e Aplicar atômico. A
regressão `server/shared-browser-plugin-config-editor-v124.test.ts` impede que essa interface seja
movida para a Central de Plugins e reafirma que plugins não fornecem HTML, React ou scripts. A
validação focada é `npm run test:shared-browser-v124`, complementada por 12.1–12.3, i18n, typecheck,
build e os cenários Playwright existentes do editor. Nenhuma redundância foi removida.

**Gate da fase 12:** equivalência de dados com a área expansível, Cancelar sem mutação e Aplicar atômico. O roadmap termina aqui para a reorganização da interface.

### Fase 13 — validação integrada e prontidão para eventual release

Executar, com evidências:

1. atualização de instalação antiga preservando Canais, Métodos, Projetos, execuções, filas, plugins, perfis e pastas;
2. retomada de Projeto/job existente no mesmo perfil físico;
3. perfil criado no ChatGPT, vinculado ao Flow e preparado nas duas URLs;
4. fallback com perfis distintos;
5. Flow recebendo 20 prompts em uma única sessão, publicando cada asset sem reconectar entre itens;
6. lista real controlada em três perfis simultâneos, com uma sessão contínua por perfil;
7. narração dividida em clips derivados, falha/regeneração de um clip e nova agregação final;
8. internet oscilando, refresh seguro, reconciliação e troca de perfil;
9. cancelamento e retomada sem duplicar efeitos;
10. reinício do Electron e do Chrome durante execução parcial;
11. desinstalação sem perder sessão compartilhada;
12. janela de configuração: abrir, editar, cancelar, aplicar e reabrir;
13. pt-BR, inglês e espanhol;
14. `npm run check`, build, testes Electron e cenários reais aplicáveis.

**Gate da fase 13:** evidências apresentadas ao titular. Isso ainda não autoriza release.

## 9\. Matriz de regressão transversal

Em todas as fases relevantes, preservar:

1. núcleo funcional com zero plugins;
2. Métodos humanos e plugins sem `profileSetup` inalterados;
3. API v1 e manifestos antigos legíveis;
4. principal/fallback antigo, inclusive cursor persistido;
5. conversa reutilizada no mesmo plugin, conexão e perfil;
6. toda unidade intermediária materializada pelo núcleo, com sessão contínua incremental preferida e execução agregada legada preservada quando o handler ainda não publicar updates correlacionados;
7. jobs immediate/async, partials, artifacts, retries e cancelamento;
8. workspaces customizados e perfis legados;
9. Browser Bridge ausente, incompatível ou removida;
10. login expirado, CAPTCHA, rate limit, cota e bloqueio;
11. exportação/importação sem IDs, caminhos, cookies ou sessões;
12. remoção/desinstalação sem apagar dados compartilhados;
13. nomes criados pelo usuário sem tradução;
14. todos os textos da moldura em pt-BR, inglês e espanhol;
15. ausência de logs com cookies, tokens, caminhos sensíveis ou conteúdo integral de sessão.

## 10\. Desempenho e observabilidade

Antes da implementação, medir a linha de base de:

- abertura da Central de Plugins;
- inventário de perfis e usos;
- abertura do editor e da configuração do plugin;
- início de job com um perfil;
- item orchestration com 10 e 30 itens;
- uso de CPU, memória, processos do navegador e queries SQLite.

Durante o paralelo, registrar somente metadados seguros:

- `profileId` opaco;
- item e tentativa;
- lane e estado;
- tempo de espera por lease;
- duração e resultado;
- contagens agregadas.

Não registrar nome da conta, cookies, tokens, conteúdo privado da página ou caminho absoluto do perfil.

## 11\. Riscos conhecidos

| Risco                                                               | Mitigação planejada                                                                                                         |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Mover pastas grandes do Chrome durante atualização                  | Não mover por padrão; preservar localização legada por chave relativa.                                                      |
| Fundir contas erradas por nome igual                                | Nunca fundir automaticamente; vínculo explícito.                                                                            |
| Plugin acessar sessões de outros sites do mesmo perfil              | Consentimento explícito, sandbox restrita, origens da ponte e vínculo revogável.                                            |
| Dois processos abrirem a mesma pasta                                | Lease global persistente por `profileId`.                                                                                   |
| Repetir o Bloco ou a lista inteira em cada perfil                   | O núcleo materializa todas as unidades antes da execução e concede cada unidade a somente uma lane por tentativa.           |
| Tratar cada Bloco como se fosse um elemento da lista                | Manter identidades distintas para `BlockExecution`, unidade de trabalho, entrega, item de entrega e artifact.               |
| Abrir/fechar ou reconectar navegador entre itens saudáveis          | Uma invocação contínua por perfil processa vários itens e publica updates duráveis sem encerrar a sessão.                   |
| Plugin dividir trabalho internamente e esconder os filhos do núcleo | Registrar o plano de itens derivados e receber IDs do núcleo antes do primeiro efeito externo.                              |
| Duplicar cobrança após timeout                                      | Persistência por item e reconciliação de efeito externo incerto.                                                            |
| Extensão monitorar DOM continuamente e pesar no computador          | Eventos de lifecycle, snapshots sob demanda e observadores temporários com debounce/timeout; nenhum polling pesado sem job. |
| Atualizar página depois de uma submissão e repetir efeito           | Escada de recuperação sensível ao estado; depois de submit, reconciliar antes de reload/retry/troca.                        |
| Marcador de um provedor sobrescrever outro                          | Readiness separado por plugin/vínculo.                                                                                      |
| Método antigo perder aliases                                        | Resolvedor `pluginId + alias` e adaptação sem reescrever snapshot.                                                          |
| Desinstalação apagar sessão compartilhada                           | Desvincular plugin; perfil e pasta sobrevivem enquanto usados.                                                              |
| Janela nova perder alterações ou gravar parciais                    | Rascunho local e Apply atômico.                                                                                             |
| Interface crescer antes da revisão conceitual                       | Parar após extração para janela; redundâncias ficam fora do escopo.                                                         |

## 12\. Sequência recomendada e publicação

A ordem obrigatória é:

```text
documentação
  -> inventário, fixtures e linha de base
  -> infraestrutura de migração ensaiada
  -> identidade global e vínculos
  -> runtime/sandbox
  -> Browser Bridge confiável
  -> adaptação dos plugins
  -> experiência de compartilhamento
  -> materialização universal de unidades
  -> política local de perfis
  -> scheduler multiperfil
  -> toggle no editor
  -> janela de configuração
  -> validação integrada
```

Não implementar o toggle antes de existir materialização universal, persistência por unidade e lock por perfil. Não adaptar plugins ao perfil global antes de `getProfilePath` e a sandbox estarem validados. Não migrar a UI para perfis globais antes de o resolvedor legado estar validado. Não remover a tabela antiga nem compactar pastas no mesmo ciclo que introduz o novo modelo.

Ao final de cada fase, atualizar este documento com estado real, arquivos alterados, migração executada, testes e limitações restantes. Implementação local, validação e publicação permanecem separadas.

Somente depois da validação integral, o titular poderá avaliar uma nova versão. Incrementar versão, criar commit/tag de release, gerar instaladores ou publicar exige nova autorização explícita para o conjunto exato de mudanças, seguindo `AGENTS.md` e sem usar GitHub Actions.
