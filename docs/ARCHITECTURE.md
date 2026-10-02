# 📄 Documento de Arquitetura e Visão de Produto: ContentFlow

Este documento é **normativo vigente**: descreve o produto e suas responsabilidades atuais. Direções históricas não comprovam implementação. Consulte [estado e limitações](CURRENT_STATE.md) e o [processo de desenvolvimento](DEVELOPMENT.md) para delimitar capacidades e evidências.

## 1. Visão Geral do Produto

O **ContentFlow** é um **Gerenciador Estratégico de Métodos** para produção de conteúdo. Diferente das ferramentas tradicionais "caixa-preta" (geradores de 1 clique que ocultam o processo e geram conteúdo repetitivo e vulnerável à desmonetização no YouTube), o ContentFlow desacopla a **Estratégia do Método** da **Execução Funcional**.

A plataforma permite que criadores desenhem, personalizem e automatizem seus próprios fluxos de trabalho através de uma arquitetura modular baseada em **8 Processos Universais**, **4 Blocos Essenciais de Ação**, **3 Operadores** e um **ecossistema de plugins independentes**.

### 1.1. Invariante absoluta: núcleo e plugins são produtos separados

O ContentFlow funciona com **zero plugins instalados**. Sem integrações, ele continua sendo o Gerenciador Estratégico de Métodos: organiza Canais e Projetos, armazena Métodos, prompts, estruturas, CTAs e Biblioteca Estratégica, transporta dados tipados e conduz blocos do operador `Humano`.

O núcleo pode conhecer somente o protocolo público de plugins, seus contratos tipados, ciclo de vida, permissões, sandbox, referências opacas de conexões e cofre genérico de secrets. Ele não pode conter IDs, endpoints, autenticação, listas de modelos, seletores de navegador, codecs ou regras de negócio de um fornecedor específico.

Consequentemente:

- APIs de OpenAI, Anthropic, YouTube ou qualquer outro fornecedor pertencem ao respectivo plugin;
- FFmpeg, Python, executáveis auxiliares, automação de navegador e tratamento específico de mídia pertencem ao plugin que os utiliza;
- um plugin mantido pelo autor do ContentFlow continua sendo software externo: possui versão, pacote, permissões, distribuição e instalação próprias;
- a distribuição do núcleo não inclui, instala, ativa nem concede confiança especial a nenhum plugin;
- todos os plugins são removíveis e passam pela mesma validação, consentimento e sandbox;
- um Método que referencia um plugin ausente permanece legível e organizável, preserva seu contrato e outputs históricos, mas sua execução automática fica bloqueada até uma associação local válida.

Manter pacotes de plugins no mesmo repositório de desenvolvimento, quando conveniente, não os transforma em parte do núcleo nem autoriza que sejam empacotados com sua release.

### 1.2. Princípio de composição: o núcleo fornece peças, não fluxos prontos

O ContentFlow não deve transformar maneiras específicas de produzir conteúdo em regras rígidas do código. O núcleo fornece primitivas universais e combináveis — Processos Universais, Blocos, Operadores, entradas e saídas tipadas, identidade de entregas, persistência, retomada, validação e orquestração — e o usuário monta o fluxo desejado por meio de Métodos e plugins.

Sempre que uma necessidade recorrente surgir, a primeira pergunta arquitetural deve ser qual é a menor capacidade genérica que falta ao núcleo. A solução deve permanecer independente de fornecedor, mídia, nicho, quantidade e técnica de produção. Regras como “gerar uma imagem para cada cena”, “pesquisar uma palavra-chave no Pexels”, “sintetizar cada trecho de áudio” ou “pedir 124 respostas a um modelo” pertencem à composição feita pelo Método e às capabilities dos plugins; o núcleo deve oferecer somente as peças necessárias para que todas essas composições sejam possíveis.

Esse princípio vale também para UX: uma função universal pode aparecer de forma simples na execução, sem introduzir um novo Processo Universal, tipo de Bloco, Operador ou fluxo especializado. O produto cresce preferencialmente pela ampliação de primitivas reutilizáveis, não pelo acúmulo de modos de trabalho codificados.

### 1.2.1. Fronteira eficiente entre estratégia e execução

Tudo que afeta significado, identidade, segurança e continuidade passa pelo núcleo, mas nem toda operação técnica vira um Bloco. O ContentFlow trabalha em três escalas complementares:

1. **Bloco do Método — transformação estratégica observável.** Existe quando o usuário precisa conectar, validar, substituir, reutilizar, preservar ou compreender uma entrega separadamente.
2. **Unidade operacional do Core — execução endereçável.** Itens, tentativas, deliveries, artifacts, fallback, distribuição multiperfil, leases, retomada e recovery dão robustez ao mesmo Bloco sem aumentar o Método.
3. **Subtarefa interna da capability — implementação da ferramenta.** Login, navegação, upload, polling, download, parsing, checkpoints e outras operações necessárias podem permanecer dentro do plugin e da Browser Bridge quando não produzem uma decisão ou entrega estratégica independente.

Separe Blocos quando o resultado intermediário tiver valor próprio: for consumido depois, exigir `VALIDAR`, puder trocar de operador/plugin sem refazer o anterior, possuir efeito ou confirmação independente, ou precisar sobreviver ao retry da etapa seguinte. Mantenha as operações juntas quando formarem uma única intenção e uma única entrega observável, e os intermediários forem descartáveis ou puramente técnicos.

Quantidade de itens, perfis, tentativas, páginas visitadas ou chamadas ao provedor não determina quantidade de Blocos. Um Bloco pode processar centenas de work units e usar fallback ou paralelismo entre perfis físicos distintos sob controle do Core. Da mesma forma, validação técnica de página, arquivo ou resposta pertence ao plugin e ao contrato; somente julgamento editorial ou decisão estratégica vira `VALIDAR`.

Uma capability combinada é válida quando entrega atomicamente o contrato estratégico do Bloco. Ela não pode esconder um Método inteiro, decisões editoriais distintas ou efeitos externos que precisem de consentimento separado. Por exemplo, gerar imagens e animá-las usa dois Blocos quando as imagens devem ser preservadas, revisadas ou reutilizadas; pode usar um único Bloco de vídeo quando as imagens forem intermediários internos descartáveis e somente o vídeo final tiver significado para o Método.

### 1.3. Leis do ContentFlow

Estas invariantes orientam mudanças no Método, no motor de execução, nos plugins e na interface:

1. **Os 8 Processos Universais são obrigatórios.** Cada Projeto percorre os oito; a ordem pode mudar, mas nenhum Processo desaparece da estratégia.
2. **A ordem dos Processos pertence à estratégia do Canal.** Ela é composta pelos Métodos associados aos oito Processos, pode variar entre Canais e é congelada no snapshot de cada Projeto iniciado.
3. **Todo passo estratégico pertence a um dos 4 Blocos Essenciais.** Um Método expressa suas ações com `BUSCAR`, `ESCOLHER`, `CRIAR` e `VALIDAR`.
4. **Todo Bloco possui exatamente um dos 3 Operadores.** `Humano`, `IA` ou `Código` executa a ação definida pelo Bloco.
5. **Entradas e saídas pertencem ao Bloco, nunca ao executor.** Trocar o executor não muda o contrato universal de dados da ação.
6. **Plugins implementam capacidades; nunca definem a estratégia.** O Método especifica a intenção, os contratos e a composição; o plugin executa uma capacidade compatível.
7. **Humano é sempre um executor nativo válido.** O núcleo continua funcional sem plugins instalados.
8. **Item é identidade operacional transversal.** Ele identifica trabalho e entregas em qualquer escala compatível; não é um novo Bloco nem um Processo Universal.
9. **O Método define a estratégia; o snapshot congela a estratégia utilizada pela execução.** Alterações posteriores no Canal ou no Método não reinterpretam silenciosamente um Projeto já iniciado. A ação humana explícita `Refazer este Bloco` pode adotar a revisão atual do Método a partir do alvo, preservando o prefixo concluído e registrando o snapshot anterior no histórico.
10. **Orquestradores agendam trabalho; não determinam estratégia.** Eles escolhem quando e qual Projeto avança; o próximo Processo elegível vem da ordem congelada e do estado desse Projeto.
11. **O núcleo conhece contratos universais, nunca regras específicas de ferramentas.** Integrações, fornecedores e técnicas particulares vivem nos plugins e na composição do Método.
12. **Uma nova necessidade só cria uma primitiva quando não puder ser expressa pela composição das existentes.** Antes de ampliar a gramática, testar a combinação de Processos, Blocos, Operadores, contratos e Itens.
13. **Perfis de navegador são recursos locais globais; vínculos são explícitos.** A pasta física e sua identidade pertencem ao ContentFlow local. Cada plugin recebe acesso somente por um vínculo autorizado pelo usuário, e o estado de preparação é registrado por vínculo, nunca inferido de nome, e-mail, cookie ou outra heurística.
14. **Toda unidade intermediária recebe identidade do núcleo.** `BlockExecution`, unidade de trabalho, entrega, item de entrega e artifact são níveis distintos de proveniência. Plugins podem correlacionar IDs concedidos, mas não decidem a identidade lógica nem se um item já foi concluído.
15. **Paralelismo de perfis distribui unidades; não replica a estratégia.** Uma mesma pasta física possui no máximo uma execução de navegador ativa. Várias lanes podem existir somente em perfis físicos distintos e recebem unidades exclusivas da mesma `BlockExecution`.

Evoluções dessas invariantes devem preservar a leitura e a continuidade segura dos snapshots e das filas existentes, com migração explícita quando necessária.

### 1.4. Mapa do núcleo

Para explicar ou evoluir o ContentFlow, o núcleo pode ser entendido em cinco responsabilidades, sem sobreposição:

1. **Organização** — Canais e Projetos organizam o trabalho; os oito Processos Universais definem quais resultados um vídeo precisa produzir.
2. **Estratégia** — cada Canal associa um Método a cada Processo e define sua ordem; cada Método combina Blocos, Operadores, contratos de entrada/saída, parâmetros e referências portáteis a capacidades.
3. **Execução** — o motor materializa a estratégia em snapshots persistentes, estados, tentativas, entregas, itens, pausa humana, retry e retomada.
4. **Orquestração** — filas decidem quando Projetos avançam, inclusive em múltiplos Canais, mas nunca alteram a estratégia congelada do Projeto.
5. **Extensão** — plugins independentes implementam capacidades externas ou técnicas pelo protocolo público; o núcleo controla permissões, sandbox, persistência e contratos, sem incorporar a regra de negócio do fornecedor.

Em termos simples: **Processos dizem o que precisa existir; Métodos dizem como chegar lá; Blocos dizem qual ação executar; Operadores dizem quem executa; plugins fornecem capacidades; o motor preserva estado e dados; o Orquestrador decide quando avançar.**

Essa separação governa as responsabilidades do produto. A evolução usa Métodos/plugins e cenários verticais reais, respeitando esse mapa.

### 1.5. Componentes existentes e caminho de execução

- `src/`: interface React, domínio e contratos compartilhados. `src/lib/execution-core/` contém criação e transições canônicas puras; a UI apresenta projeções e envia intenções.
- `server/`: API Express, comandos, aplicação das transições, jobs de plugin, scheduler, Orchestrator, SQLite e arquivos. `server/index.ts` ainda concentra parte dessa integração; o Core puro não implica isolamento integral de todos os caminhos.
- `desktop/`: shell Electron, runtime privado e atualização Windows.
- `ecosystem/`: pacotes independentes, Plugin Kit, SDK/Browser Bridge e ferramentas de desenvolvimento.

Um Projeto captura a estratégia do Canal; o início do Processo cria `ProcessExecution` a partir do snapshot. A camada de aplicação resolve bindings e valida valores. Blocos humanos aguardam intenção/entrega; Blocos automáticos geram trabalho identificado e um job persistido antes de delegar ao executor. O resultado cruza a normalização contratual, o Core aceita a transição e a aplicação persiste estado, projeção do Projeto e deliveries. O scheduler considera o próximo trabalho elegível; a interface lê o estado persistido.

O contrato de valores vive em [CONTENT_CONTRACT.md](CONTENT_CONTRACT.md), com validação material compartilhada em `src/lib/runtime-value-validation.ts`. A fronteira de plugin usa [Plugin API v2](ecosystem/protocol.md) e `server/plugin-response-normalization.ts`. O domínio permanece independente de seletores e regras de fornecedor.

O perfil físico preserva a sessão local; o binding concede acesso ao plugin; readiness confirma a preparação daquele par. Antes da execução de navegador, o lease exclusivo reserva o perfil e o BrowserSessionManager controla a instância Chrome. O plugin recebe a sessão efêmera, negocia a Bridge e opera a página autorizada. Cookies e credenciais não integram o Método portátil. Limites funcionais e de cobertura estão em [CURRENT_STATE.md](CURRENT_STATE.md).

---

## 2. Interfaces e superfícies de controle da aplicação (UX/UI)

A experiência do usuário no ContentFlow apoia-se em três interfaces de domínio claramente delimitadas. O Orquestrador é uma superfície transversal de controle e não uma quarta camada conceitual do Método:

```
┌────────────────────────────────────────────────────────────────────────┐
│ INTERFACE 1: Execução do Vídeo / Projeto (Nível Usuário / 1-Clique)    │
│ Interface simples para gerar o vídeo, ver progresso e aprovar estapas. │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ INTERFACE 2: Métodos do Canal (Nível Workspace / Estratégia)           │
│ Construtor de fluxos usando os 4 Blocos + Operadores por processo.     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ INTERFACE 3: Gerenciamento de Plugins (Nível Operacional / Pacotes)    │
│ Instalação, atualização, ativação, permissões e remoção de plugins.    │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Interface 1: Projetos / Vídeos (Execução de Conteúdo)**
   - **Objetivo**: Interface limpa e direta para o dia a dia.
   - **Funcionamento**: O usuário digita as variáveis do vídeo (ex: tema, palavra-chave) e clica em "Iniciar Produção". O sistema executa o método do canal e apresenta as saídas prontas (título, thumb, roteiro), pausando apenas para ações do operador `Humano`.

2. **Interface 2: Métodos do Canal (Estratégia / Nível Workspace)**
   - **Objetivo**: Construtor visual de fluxos de trabalho.
   - **Funcionamento**: Localizado no nível de Canal/Workspace. O criador desenha a sequência atômica de blocos para cada um dos 8 Processos Universais de Conteúdo.

3. **Interface 3: Gerenciador de Plugins (Operação & Pacotes)**
   - **Objetivo**: Gestão do ciclo de vida das ferramentas instaladas.
   - **Funcionamento**: Instalação por pasta, vínculo de desenvolvimento, atualização, ativação, consentimento de permissões, inspeção de dependências e remoção de qualquer plugin pelo mesmo fluxo, sem distinção baseada no autor. Contas, perfis globais de navegador, vínculos explícitos de plugin, readiness por vínculo, secrets, sessões, workspaces e preferências técnicas são gerenciados nessa interface e continuam protegidos pelo núcleo fora do arquivo portátil do Método. O Bloco apenas escolhe, entre os perfis já vinculados ao plugin, a política local usada naquela ação.

### 2.1. Vocabulário canônico: Interface do plugin

**Interface do plugin** é a segunda superfície de configuração aberta a partir de um Bloco no editor de Método. Ela aparece ao lado da configuração do Bloco e pertence à **Interface 2: Métodos do Canal**. Fechá-la devolve o foco e a centralização ao Bloco.

O termo não designa o Gerenciador de Plugins (`/plugins`), a página de detalhes de instalação, nem a interface original do serviço automatizado. Também não cria uma quarta interface de domínio.

Sua função principal é responder, em linguagem de usuário: **como a capability selecionada deve executar este Bloco?** Portanto, a primeira camada apresenta as possibilidades funcionais declaradas pelo plugin, como modo de geração, modelo, referências, anexos, voz, formato, quantidade, proporção, duração, resolução e critérios de seleção, conforme a capability realmente suportar. Informações sobre bindings, portas, payload, prévia técnica do prompt, compatibilidade, retries, concorrência e outros mecanismos do núcleo ficam em uma camada secundária ou avançada, salvo quando uma pendência exigir ação imediata.

O núcleo é responsável pela moldura, hierarquia, componentes acessíveis, validação e persistência. O plugin descreve declarativamente a semântica, os campos, as opções e as condições de visibilidade de sua capability; ele não injeta React, HTML ou uma tela própria. A especificação detalhada desta superfície está em [`docs/PLUGIN_INTERFACE.md`](PLUGIN_INTERFACE.md).

No nível global, a navegação principal possui quatro áreas, nesta ordem:

- `/dashboard`: visão geral dos canais.
- `/orchestrator`: criação e acompanhamento de produção para um ou vários Canais. O mesmo formulário atende tanto uma fila de um único Canal quanto uma produção multi-Canal.
- `/methods`: Biblioteca de Métodos, derivada dos métodos salvos nos canais, com cards alternáveis por Método ou Canal, busca, capas opcionais, reutilização, importação e compartilhamento.
- `/plugins`: Gerenciador de Plugins locais, responsável por descobrir e apresentar manifestos reais instalados no aplicativo.

A lista e a grade de Projetos permanecem no Canal. A criação de novas filas não é duplicada nessa visão: ela acontece no Orquestrador global, selecionando um ou mais Canais.

O Gerenciador de Plugins organiza o catálogo em cards quadrados, compactos e pesquisáveis. Em telas grandes, a galeria apresenta quatro cards por linha; cada card exibe somente o ícone local validado e o nome do plugin, além de uma sinalização mínima de erro ou desativação. Versão, origem, permissões, capacidades e ações de ciclo de vida aparecem nos detalhes abertos pelo card.

Cada capability declara o `ValueShape` de cada porta. A galeria deriva as famílias oferecidas das `outputPorts`, sem um resumo paralelo como `deliveryTypes`. O manifesto também pode declarar `branding.iconPath`, um caminho relativo para PNG ou WebP empacotado, com até 512 KiB. O núcleo valida caminho, assinatura, MIME e tamanho, nunca busca favicon remoto e usa fallback local quando o campo ou asset estiver ausente ou inválido. O autor responde pelos direitos de uso do ícone.

---

## 3. Os 8 Processos Universais de Conteúdo

Toda criação na plataforma atende estritamente a um dos 8 processos atemporais do YouTube:

1. `Tema`
2. `Título`
3. `Thumbnail`
4. `Roteiro`
5. `Narração e Áudio`
6. `Assets Visuais`
7. `Edição`
8. `Publicação`

---

## 4. As 4 Primitivas de Ação (Os 4 Blocos Essenciais)

Qualquer passo de qualquer método dentro de um processo deve ser classificado em um dos 4 blocos atômicos:

1. 🔵 **BUSCAR**: Captura, recuperação ou extração de dados, mídias ou referências localizadas **FORA** da plataforma (fontes externas).
2. 🟣 **ESCOLHER**: Seleção ou aplicação de regras, parâmetros, diretrizes ou elementos **PRÉ-EXISTENTES e cadastrados no ambiente do Canal**.
3. 🟢 **CRIAR**: Produção, síntese ou geração de um **NOVO ativo, dado ou arquivo** (texto, áudio, imagem, vídeo, código, post).
4. 🟡 **VALIDAR**: Auditoria, teste de qualidade, verificação de regras ou escolha de ativos **criados DURANTE a execução do fluxo**.

---

## 5. Os 3 Operadores (Quem Executa o Bloco)

Cada Bloco de Ação em um Método é atribuído a um Operador:

- 🤖 **IA**: Modelos generativos e probabilísticos (LLMs, TTS, geradores de imagem/vídeo).
- 👤 **Humano**: Intuição, decisão manual, revisão crítica, aprovação com pausa-e-retomada.
- 💻 **Código**: Scripts determinísticos, chamadas de API, FFmpeg, webhooks e automação técnica.

---

## 6. Arquitetura de Parâmetros e Plugins

### A. Onde vivem configuração, conexões e secrets?

A experiência de configuração funcional vive **dentro do Bloco do Método**.

- Quando o usuário adiciona um Bloco no Método (ex: `CRIAR`), ele seleciona o Operador (ex: `IA`), o **Plugin**, a capacidade e, quando necessário, uma conexão local ou um perfil global de navegador já vinculado explicitamente àquele plugin.
- A interface do Bloco lê o manifesto e renderiza os campos funcionais que aquela capacidade precisa, como modelo, temperatura, formato ou voz. Perfis não são criados por texto livre no Bloco: a configuração local escolhe perfis já vinculados e sua política de execução.
- O Método local guarda `pluginId`, `pluginVersion`, `capabilityId`, configuração funcional, bindings e uma referência opaca `connectionId` quando o executor exigir uma conexão. A política de perfil é estado local do ambiente e não integra o pacote portátil do Método.
- Um **perfil de navegador** é uma identidade global local com uma única pasta física de sessão. Ele pode ser reutilizado por vários plugins, mas cada reutilização exige um **vínculo de plugin** explícito. Criar um perfil nos detalhes de um plugin vincula somente aquele plugin; outros plugins apenas o enxergam como candidato compatível até nova ação do usuário.
- O **readiness** pertence ao par plugin + perfil. Preparar ChatGPT, Flow, Gemini ou qualquer outro provedor valida apenas aquele vínculo e não torna os demais prontos. URL, autenticação, seletores, estados de página e validação continuam responsabilidade do plugin.
- A seleção local do Bloco é uma política do núcleo com dois modos conceituais: `fallback` ordenado e `parallel`. O fallback ordenado é sempre o padrão, inclusive quando existe apenas um perfil selecionado; nesse caso, a lista simplesmente não possui um próximo perfil. O modo paralelo distribui unidades exclusivas entre dois ou mais perfis compatíveis. A política referencia IDs locais de perfis vinculados, limita concorrência aos perfis escolhidos e nunca é exportada com cookies, caminhos, aliases de storage ou IDs locais. O núcleo injeta ao plugin somente a referência compatível necessária para a invocação ativa. `single` não é um modo atual e não deve ser emitido por Método v3.
- Cada perfil físico possui um lock/lease global. Jobs, plugins ou lanes diferentes não podem abrir simultaneamente a mesma pasta do navegador; paralelismo real exige perfis físicos distintos.
- O valor real de API keys, tokens, cookies e outros secrets nunca entra em `connectionId`, configuração, Método, exportação, SQLite, request, snapshot ou log. Ele permanece no cofre seguro e só é resolvido em memória para a invocação autorizada.
- Permissões, consentimento, origem, integridade, runtime, workspace, criação e preparação de perfis e preferências técnicas da instalação continuam sob responsabilidade do núcleo no Gerenciador de Plugins. Esses dados não se tornam configuração portátil do Método.

Templates exportados não carregam o `connectionId` local. No lugar dele, preservam apenas o requisito de conexão — plugin, capacidade e secrets/perfil exigidos. Ao importar ou copiar para outro ambiente, o usuário associa cada requisito a uma conexão local existente ou cria uma nova antes de executar.

### B. Variáveis Dinâmicas do Projeto

Dentro dos campos do plugin no bloco, o usuário insere placeholders dinâmicos (ex: `{{video.topic}}`, `{{block_01.output}}`). Na execução do vídeo, o motor substitui as variáveis pelos valores reais.

### C. Contrato Universal de Dados do Bloco

O editor estratégico apresenta somente entradas e entregas de texto, imagem, áudio ou
vídeo, sem exigir a escolha entre conteúdo, controle e registros. Decisões e estruturas
internas permanecem preservadas e tipadas; não há conversão ou exclusão automática de
campos existentes. Relações devem ganhar interações próprias quando forem definidas,
sem devolver ao usuário um editor técnico de schemas. O contrato de runtime e as portas
de plugins continuam regidos por `CONTENT_CONTRACT.md`.

Entradas e saídas pertencem ao bloco e não ao operador. Na definição do Método, cada bloco guarda:

- Nome e instruções da ação.
- Dados de entrada, definidos visualmente apenas por nome e formato.
- Dados de saída, definidos visualmente apenas por nome e formato.
- O operador responsável pela execução.

As chaves técnicas, a persistência e a conexão com resultados anteriores são administradas internamente pelo núcleo. O contrato normativo está em [`docs/CONTENT_CONTRACT.md`](CONTENT_CONTRACT.md). Conteúdo possui somente quatro famílias: `text`, `image`, `audio` e `video`. `one`/`many` e `inline`/`artifact`/`either` são dimensões explícitas do mesmo `ContentShape`; arquivo, lista, textarea, records e renderer não são famílias nem tipos de conteúdo.

Número, booleano, seleção, data/hora, URL, approval, IDs e layout de thumbnail usam contratos de controle. Registros usam contrato estrutural com campos tipados. Apresentação escolhe somente o renderer e não altera a semântica. Métodos usam `contractVersion: 3`, plugins usam `apiVersion: "2"` e contratos anteriores não são adaptados pelo caminho canônico.

Cada entrada declarada possui um binding explícito para uma saída compatível já produzida ou para um valor fornecido na execução. O editor pode sugerir uma origem usando shape, proximidade e nome, mas a sugestão precisa ser materializada como binding antes da execução. Contratos anteriores são inválidos; qualquer atualização produz um novo Método v3 fora do runtime canônico, sem adapter ou interpretação automática do formato anterior.

Uma entrada também pode ter origem **Fornecido na execução**. Nesse caso, o Método guarda somente o contrato portátil — nome, `ValueShape`, apresentação e porta semântica — enquanto o valor real pertence ao `BlockExecution`. O núcleo pausa o bloco automático, renderiza o campo derivado do mesmo shape usado pela porta, armazena artifacts como referências gerenciadas, valida família, cardinalidade, representação e formato e só então inicia o plugin. O plugin nunca injeta componentes de interface.

Todos os quatro tipos de bloco podem declarar zero ou mais entradas de contexto vindas de blocos anteriores ou Processos Universais anteriores. O editor começa sem campos opcionais e oferece somente a ação discreta **Adicionar entrada**; assim, um bloco simples permanece visualmente leve, mas `BUSCAR`, `ESCOLHER`, `CRIAR` e `VALIDAR` podem consumir qualquer entrega anterior compatível quando o Método exigir. No `ESCOLHER`, essas entradas apenas orientam a decisão e não substituem a coleção vinculada. No `VALIDAR`, elas complementam e não substituem o bloco-alvo obrigatório da validação.

O operador `Humano` é o executor nativo desse mesmo contrato e não depende de plugin. Plugins de `IA` ou `Código` consomem as mesmas entradas e produzem as mesmas saídas; seus parâmetros particulares aparecem somente depois que o plugin é selecionado.

O Método armazena esse esquema, suas instruções, parâmetros, configuração do executor, bindings e a referência local de conexão quando aplicável. Os valores efetivamente preenchidos pertencem à execução do Projeto/Vídeo e nunca são gravados como parte do Método.

Plugins que declaram suporte à continuidade de conversa podem devolver ao núcleo uma referência opaca da conversa criada. Em outro bloco compatível, o usuário escolhe iniciar uma conversa nova ou continuar a conversa de um bloco anterior do mesmo Projeto, inclusive de um Processo Universal anterior. O núcleo só permite a reutilização com o mesmo plugin e a mesma conexão local, preserva a referência no snapshot da execução e nunca interpreta cookies, tokens ou o conteúdo interno da conversa. Plugins sem essa declaração continuam sempre iniciando uma execução independente.

Métodos compostos integralmente por blocos humanos podem ser executados de ponta a ponta. Blocos `IA` e `Código` são liberados quando possuem plugin, capacidade e, quando exigida, conexão local compatíveis. A configuração funcional permanece no Método; o secret permanece no cofre. Plugin, capacidade ou conexão ausentes, incompatíveis, desativados ou revogados mantêm o bloco explicitamente bloqueado.

### D. Conexões locais e migração de armazenamento

Na migração do armazenamento de credenciais, cada credencial global válida origina uma conexão local com ID estável. O núcleo copia o secret para a nova entrada do cofre, valida a leitura e só então remove a origem; uma falha mantém a origem intacta e apresenta recuperação, nunca apaga silenciosamente a credencial. Essa migração preserva dados locais e não adapta contratos de Método ou plugin.

Todo Bloco de Método v3 que exige conta deve possuir um `connectionId` local válido; ausência, revogação ou ambiguidade bloqueia a execução e exige associação explícita. Snapshots operacionais persistidos preservam seu significado e passam apenas por migrações recuperáveis de storage. A importação portátil aceita exclusivamente envelopes v3 e nunca usa uma conexão instalada como justificativa para reinterpretar um arquivo anterior.

---

## 7. O Motor de Execução (Execution Engine)

O motor de execução funciona como uma **máquina de estados persistente**:

1. Lê o Método congelado no snapshot do Projeto para o Processo atual, preservando a estratégia usada quando a execução começou.
2. Executa os blocos sequencialmente injetando as saídas do bloco anterior no bloco seguinte.
3. **Pausa e Retomada para Operador Humano**: Se um bloco for atribuído ao operador `Humano`, o motor pausa o estado da execução (`awaiting_human`), gera uma notificação e um cartão interativo no Projeto, e aguarda a entrega ou seleção do usuário para continuar a esteira.
4. **Execução por plugin**: Blocos `IA` e `Código` disparam automaticamente o plugin compatível configurado assim que suas entradas ficam disponíveis. Entradas marcadas como fornecidas na execução produzem antes uma pausa explícita para coleta pela interface do núcleo. O servidor resolve as entradas, executa plugins instalados ou vinculados em um processo separado, valida a resposta, registra entregas e artifacts no snapshot e ativa a próxima etapa.
5. **Bloqueio de executores ausentes**: Blocos sem plugin compatível permanecem em `blocked_executor`. Eles nunca são concluídos de forma fictícia.

Os métodos permanecem lineares: não existem ramificações, junções, paralelismo ou loops genéricos no canvas. Uma entrada pode apontar explicitamente para a saída de qualquer bloco anterior ou processo universal anterior, e um bloco pode declarar várias entradas.

Todo bloco `VALIDAR` referencia um bloco anterior específico e opera em um de três modos: aprovar ou reprovar, escolher uma opção, ou escolher várias opções. Uma reprovação pode pausar a execução ou solicitar uma nova tentativa do bloco validado. Nesse último caso, o motor invalida e executa novamente o trecho linear entre o bloco-alvo e a validação, preservando o feedback da reprovação como contexto da nova tentativa e respeitando o limite configurado. Uma escolha concluída torna-se uma saída tipada do próprio bloco `VALIDAR`, disponível para os blocos seguintes.

Se a tentativa reprovada produziu imagens e o executor precisar abrir outra conversa para refazer o bloco, o núcleo preserva as referências autorizadas e o plugin anexa essas imagens à nova conversa. Quando a conversa anterior puder ser reutilizada, a mídia não é reenviada.

Cada nova tentativa incrementa a identidade de execução dos blocos já iniciados no trecho invalidado. Jobs, artifacts e entregas da tentativa anterior permanecem rastreáveis, mas não podem ser reutilizados como se pertencessem à nova tentativa.

Cada execução mantém um snapshot do Método utilizado, o estado individual dos blocos, rascunhos, entregas concluídas e referências a arquivos armazenados localmente. As saídas concluídas tornam-se contexto para os blocos seguintes.

### 7.1. Hierarquia universal de identidade e proveniência

O motor separa cinco níveis que não podem ser confundidos, independentemente de o executor ser `Humano`, `IA` ou `Código`:

1. **`BlockExecution`** — instância persistente da ação estratégica de um Bloco dentro da execução de um Projeto. Ela contém estado, tentativas, entradas resolvidas e as unidades necessárias para produzir suas saídas.
2. **Unidade de trabalho** — menor parcela endereçável que precisa ser executada. Toda `BlockExecution` possui ao menos uma unidade escalar; coleções produzem uma unidade por elemento e itens derivados recebem identidade antes de qualquer efeito externo.
3. **Entrega** — materialização tipada de uma porta de saída do Bloco. Ela possui identidade própria, cardinalidade, tentativa e estado e permanece ligada à `BlockExecution` que a produziu.
4. **Item de entrega** — elemento endereçável de uma entrega. Uma entrega escalar possui exatamente um item; uma entrega em lista possui um item por elemento, preservando ordem e, quando houver, a referência à unidade ou ao item de origem.
5. **Artifact** — arquivo ou mídia armazenada que concretiza ou acompanha um resultado. O artifact fica ligado à entrega e, quando aplicável, ao item que o produziu; seu caminho não substitui a identidade universal do item.

Essas identidades pertencem ao núcleo. O plugin recebe IDs já concedidos para correlação, pode publicar progresso ou resultados associados a eles e pode solicitar o registro de itens derivados, mas o núcleo cria os IDs filhos antes da execução externa. Retry, fallback, retomada, consolidação e prevenção de duplicação usam essa identidade persistida em vez de posição textual ou memória do handler.

Os outputs oficiais dos Processos usam as mesmas entregas e itens. Promover uma saída compatível a output de Processo preserva os IDs e a proveniência existentes em vez de criar uma cópia paralela.

Exemplos universais:

- **Escalar:** um Bloco `CRIAR` produz um único texto de título. A `BlockExecution` possui uma unidade escalar; a porta `title` materializa uma entrega `one` com um item de entrega textual. Nenhum conceito de fornecedor é necessário.
- **Lista de cenas:** uma entrega anterior contém N registros de cena. O Bloco seguinte recebe N itens identificados pelo núcleo e materializa N unidades de trabalho relacionadas aos respectivos `sourceItemId`. Execução, retry ou distribuição podem ocorrer por unidade sem perder a ordem nem repetir as cenas já concluídas.
- **Coleções de mídia:** um Bloco usa portas separadas para `image/many`, `audio/many` e `video/many`. Cada porta materializa uma delivery com N itens; cada artifact importado fica ligado ao item correspondente. Reordenar ou regenerar um item não muda a identidade dos irmãos concluídos.

A página do processo mantém um painel expansível de resultados concluídos. O `ValueShape` é a autoridade de validação e compatibilidade, enquanto `presentation` pode solicitar um renderer padronizado do núcleo. O mesmo shape governa formulário humano, resposta de plugin, delivery e viewer; renderer nunca define família, cardinalidade ou representação.

Renderers são componentes internos do ContentFlow. Plugins podem apenas indicar um identificador permitido; MIME e extensão permanecem em `ContentShape.formats`. Plugins nunca fornecem React, HTML, scripts ou outra interface arbitrária. Preferências incompatíveis ou desconhecidas são ignoradas pelo núcleo e recaem no modo automático.

### 7.2. Itens operacionais universais

Quando uma capability declara `execution.itemOrchestration`, uma entrada em lista passa a ser um lote ordenado administrado pelo núcleo. O significado dos itens é irrelevante para o motor: podem ser prompts de texto, descrições de imagens, trechos de áudio, palavras-chave de pesquisa, registros de cenas, arquivos ou qualquer outro valor aceito pelo contrato universal. O núcleo não precisa conhecer Pexels, Pixabay, um modelo de IA ou a finalidade editorial do lote.

Para cada item, o núcleo só considera o trabalho resolvido depois que a chamada correspondente produz uma resposta válida e sua entrega parcial é persistida. Antes de avançar, ele mantém a identidade do lote, a ordem, o cursor e os resultados já materializados. Uma falha, troca de perfil, reinicialização ou nova tentativa não pode transformar itens ainda não resolvidos em concluídos nem repetir silenciosamente itens já persistidos.

O item é uma primitiva operacional transversal, não uma nova peça da gramática. Cada unidade persistente possui identidade do núcleo, referência opcional ao item da entrega de origem, ordem, entrada, estado, tentativa lógica atual, saída, erro e histórico de tentativas. O `BlockExecution` expõe essa coleção para a interface e o job persistente continua sendo a autoridade durante uma execução ativa. O resumo `itemProgress` permanece disponível para telas que precisam somente de total, concluídos, pendentes e posição atual.

Quando um job combina lote orquestrado e eventos incrementais de artifacts ou variantes, o progresso pertence às unidades obrigatórias do lote. Eventos incrementais enriquecem essas unidades, mas não substituem o denominador, não criam conclusão independente e não podem fazer a interface mostrar `1/1` para um lote de quatro itens.

A identidade do item não depende da posição textual devolvida por um modelo. Retomadas da mesma coleção preservam os IDs já atribuídos; quando a entrada veio de uma entrega anterior, `sourceItemId` mantém a linhagem. Uma nova tentativa editorial de um item incrementa sua tentativa sem apagar o histórico anterior. Essa identidade é a base para edição, regeneração, seleção múltipla, comparação de tentativas e continuidade parcial sem deslocar os demais itens.

Quando uma tentativa termina com parte do lote concluída, a interface oferece operações genéricas de recuperação no nível do Bloco:

1. **Continuar pendentes**: cria uma nova tentativa, confirma que a entrada é a mesma — preferencialmente pelos IDs universais da entrega —, reaproveita as entregas e artifacts concluídos e retoma no primeiro item ainda não resolvido. Se a identidade da entrada mudou, o núcleo não mistura lotes e recomeça a execução completa.
2. **Usar a entrega atual**: quando um Bloco falhou ou foi cancelado, mas já possui valores persistidos que satisfazem seu contrato de saída, o usuário pode consolidar esses valores como a entrega concluída do Bloco. Se for o último Bloco, o Processo pode ser finalizado diretamente; se houver Blocos posteriores, a execução continua a partir do próximo. Essa operação não chama novamente o plugin.
3. **Refazer este Bloco**: cria uma nova tentativa somente para o primeiro Bloco não concluído, preservando integralmente os Blocos anteriores já concluídos. A tentativa pode descartar a entrega parcial do Bloco atual ou, quando houver orquestração item a item compatível, retomar somente os itens pendentes. Reiniciar o Processo inteiro permanece uma ação separada e explícita.

Ao acionar manualmente `Refazer este Bloco`, o Core compara o snapshot da execução com a revisão atual do Método. Blocos anteriores já concluídos permanecem congelados. O alvo e todo o sufixo são substituídos pelas definições atuais correspondentes por ID estável, estados e deliveries do sufixo são invalidados e o snapshot anterior entra no histórico da execução. Se o novo alvo depender de uma entrada que o prefixo preservado não produziu, a execução falha normalmente por contrato; o Core não inventa dados nem refaz silenciosamente etapas anteriores. Retries técnicos automáticos e retries editoriais continuam usando o snapshot vigente da tentativa e não adotam revisões por conta própria.

Unidades operacionais só atravessam tentativas quando continuam pertencendo ao lote atual ou foram adotadas explicitamente pelo job retomado. Uma mudança de porta, cardinalidade ou base de itemização não pode conservar unidades obsoletas nem usá-las para calcular o progresso da nova tentativa. Quando uma única unidade produz múltiplas variantes válidas, todas permanecem ligadas à mesma unidade e ao mesmo item de origem, com identidades próprias na delivery.

O plugin continua responsável apenas por executar a capability sobre o item recebido e devolver seu resultado. A reconciliação entre recebido, concluído e pendente, a persistência, a decisão de retomar e a prevenção de duplicação pertencem ao núcleo. Essa capacidade não cria loops no canvas nem um novo tipo de validação editorial: é infraestrutura de execução reutilizável por qualquer Bloco e qualquer tipo de entrega compatível.

### 7.3. Orquestrador de execução entre Projetos

Na página global `/orchestrator`, o usuário seleciona **um ou vários Canais**, informa quantos Projetos deseja criar por Canal e escolhe a política de execução. Uma solicitação multi-Canal recebe identidade global própria e cria uma fila persistente por Canal. Isso reutiliza o mesmo motor robusto de filas sem criar um segundo tipo de Projeto ou uma estratégia especial para produções globais.

Cada fila continua pertencendo a um Canal e agenda seus Projetos segundo a ordem congelada em cada snapshot. Dentro de uma fila, apenas um item avança por vez; filas de Canais diferentes podem progredir de forma independente. O agrupamento global serve para criação e acompanhamento coordenados, não para misturar estratégias, dados ou cursores entre Canais.

O Orquestrador não cria um novo Processo Universal, Bloco ou Operador e não altera a estratégia de cada Projeto. Sua responsabilidade é escolher o próximo trabalho elegível e iniciar nele o próximo Processo previsto pela estratégia congelada.

As filas anteriores à ordem configurável podem conservar dois modos históricos de agendamento:

1. **Ponta a ponta**: executa os 8 Processos Universais de um Projeto antes de iniciar o Projeto seguinte.
2. **Lote híbrido**: trata `Tema`, `Título` e `Thumbnail` como três etapas agregadas, cada uma contendo N itens de produção com identidade estável. Depois dessa fronteira, `Roteiro`, `Voz`, `Assets`, `Edição` e `Postagem` continuam usando o motor linear por Projeto e a ordenação do lote por processo.

No lote híbrido histórico, o ponto de transição é `Roteiro`. Até `Thumbnail`, o ganho principal vem de reunir trabalhos pequenos de vários vídeos numa coleção administrável. A partir de `Roteiro`, cada vídeo continua como uma execução de Projeto independente, inclusive quando um Bloco do próprio Projeto expande N itens internos. Esse agrupamento só é aplicável a Projetos cuja ordem congelada contém essa sequência; novas políticas de lote não podem impor `Tema → Título → Thumbnail` a um Projeto com outra ordem.

Filas antigas persistidas com o planejamento sequencial anterior conservam sua política original até terminarem. Toda nova fila persiste a versão da política de agendamento e respeita a estratégia congelada de cada Projeto, de forma que uma atualização do aplicativo nunca reinterprete o significado de um cursor já iniciado.

A fila do Orquestrador nunca inicia dois itens em paralelo. Estados `awaiting_human` e `awaiting_output` pausam a fila no item atual e continuam alimentando a Central Global de Pendências Humanas. Um executor ausente mantém a fila bloqueada. Uma falha pausa a fila com erro: depois que o usuário corrige ou repete a etapa no Projeto, pode retomar a mesma fila no cursor preservado, sem recriar Projetos nem repetir etapas concluídas. Enquanto não for retomada, a falha também não impede que uma nova fila seja criada.

Essa serialização pertence à fila e às dependências que ela representa; não é um bloqueio global. Filas de outros Canais e qualquer trabalho que o Core considere realmente independente continuam elegíveis quando houver recurso e segurança. Portanto, um vídeo estacionado pode pausar sua fila atual sem necessariamente impedir o progresso dos demais.

O usuário pode parar uma fila em execução, aguardando humano, bloqueada ou com erro. O Stop cancela também a execução atual, impede o início dos itens restantes e preserva os Projetos já criados. Enquanto uma fila estiver ativa, seus Projetos não podem ser excluídos; primeiro é necessário pará-la. A fila, seu cursor, modo e Projetos pertencentes são persistidos localmente para permitir retomada após reiniciar o aplicativo.

### 7.4. Execução agregada no lote híbrido histórico

O lote híbrido histórico é uma política de agendamento do Orquestrador; não é um Método, Processo Universal, Bloco ou Operador novo. Um Método continua descrevendo a execução de um Projeto individual.

O runtime conserva etapas agregadas das filas antigas. Em `reconcileExecutionOrchestrator()`, uma etapa desse tipo percorre seus `projectIds`, inicia ou recupera a execução do Processo de cada Projeto pelo motor existente e avança o cursor somente quando todos terminaram. Espera, bloqueio, cancelamento ou falha do item atual são apresentados na fila sem recriar os Projetos concluídos. Esse caminho não comprova um protocolo nativo universal de coleção delegado ao plugin.

Novas filas usam `strategyVersion = 5` e o caminho de slots elegíveis. A versão e a estratégia persistidas distinguem os dois caminhos, preservando o significado das filas históricas. Tratamento de storage operacional antigo não adapta Métodos v1/v2 nem Plugin API v1.

`execution.itemOrchestration` atua em outra escala: distribui as unidades de uma capability dentro de um Bloco/Projeto. Não se confunde com o agrupamento de Projetos da fila nem transfere ao plugin identidade, estratégia ou política universal de retomada.

---

## 8. Ecossistema e Compartilhamento

O ContentFlow apoia-se em dois tipos de compartilhamento comunitário:

1. **Templates de Métodos (Caixa-Aberta)**: Exportação e importação de sequências de blocos com prompts e regras prontas, individualmente ou como pacote dos Métodos configurados em um Canal. Todo arquivo usa envelope v3 e `ProcessMethod.contractVersion: 3`; formatos anteriores são inválidos e não são adaptados. Cada Método do manifesto pertence a exatamente um Processo Universal. Referências de processos anteriores, plugins, conexões e coleções estratégicas permanecem explícitas como requisitos; coleções informam nome e `ValueShape` esperado quando disponíveis. IDs locais e secrets são removidos, e instalação, consentimento, criação de coleções e associação a vínculos locais são ações separadas do usuário.

Métodos e Canais podem possuir uma capa própria para a Biblioteca de Métodos. Na ausência dela, a interface usa o símbolo local do ContentFlow. A capa do Canal nessa biblioteca é independente do avatar ou banner sincronizado do YouTube. Pacotes de Canal carregam a capa do conjunto e as capas de seus Métodos dentro de `assets/`, sem exportar outras propriedades ou conteúdos do Canal.

A importação apresenta uma prévia antes de gravar: Métodos incluídos, conflitos com processos já configurados, dependências de processos anteriores, plugins/capacidades, necessidade de conexão e coleções estratégicas com seus campos. O usuário escolhe os processos que deseja substituir. A aplicação de vários Métodos a um Canal é atômica; não pode deixar uma importação parcial após falha.

2. **Plugins Independentes**: Pastas instaláveis ou vinculadas podem adaptar APIs HTTPS, scripts, executáveis, filas externas, n8n/Make/FastAPI públicos e automações de navegador sem acrescentar um novo tipo de integração ao núcleo.

A Biblioteca de Métodos global não cria uma segunda cópia independente no banco. Ela agrega os métodos existentes nos canais. Uma cópia só é criada quando o usuário escolhe usar um método em outro canal ou importa um arquivo compartilhado.

---

## 9. Central Global de Pendências Humanas

O aplicativo possui uma central global que lista todo bloco no estado `awaiting_human` e toda entrega de output universal pendente, independentemente do canal ou projeto.

- O contador global representa tarefas ainda pendentes, não apenas notificações não lidas.
- Abrir uma notificação marca o aviso como visualizado, mas não elimina a pendência.
- A pendência desaparece somente quando o bloco é concluído, cancelado ou sua execução é removida.
- Cada item informa canal, projeto, Processo Universal, bloco, entrega necessária e tempo de espera.
- O clique direciona para a aba do Processo Universal dentro do Projeto, que é o único local onde a entrega humana é realizada.
- No desktop, o total de pendências também aparece como badge no ícone da barra de tarefas. Som e notificação nativa do sistema são preferências globais independentes, desativadas por padrão; ao clicar na notificação, o usuário é levado diretamente ao Processo correspondente.

A central é uma visão derivada do estado real das execuções; ela não mantém uma cópia independente das tarefas.

---

## 10. Biblioteca Estratégica do Canal

Cada Canal possui uma biblioteca de elementos pré-existentes, como estruturas de título, estilos de thumbnail, modelos narrativos e regras editoriais.

O bloco `ESCOLHER` é o único bloco cuja função é selecionar elementos preexistentes da Biblioteca Estratégica. Todo bloco `ESCOLHER` deve estar obrigatoriamente vinculado a uma coleção do mesmo canal. Selecionar, aprovar ou reprovar resultados produzidos durante a execução pertence ao bloco `VALIDAR`.

O operador do bloco `ESCOLHER` pode ser Humano, IA ou Código. Quando executado por plugin, o núcleo entrega somente os itens da coleção vinculada e só aceita como resultado o identificador de um item real dessa coleção; o plugin não pode criar uma opção nova nesse bloco.

O `ESCOLHER` pode receber entradas de contexto para orientar a decisão, inclusive o Histórico do Canal. Isso não transforma a coleção em uma entrada comum: o núcleo continua entregando a coleção vinculada separadamente e validando que o resultado é um item real. Blocos seguintes recebem apenas os campos do item escolhido.

Ao criar uma coleção, o usuário escolhe `fixed` (fixa) ou `consumable` (consumível). Coleções existentes sem `usage` continuam fixas, sem reescrita dos dados. Itens fixos permanecem após o uso. Um item consumível começa salvo; a conclusão real do `ESCOLHER`, por Humano, IA ou Código, reserva o item exclusivamente para aquele Bloco/execução. Apenas a conclusão do **Processo**, incluindo seu output oficial e validações, consome o item. A exclusão do registro da coleção ocorre na mesma transação SQLite que persiste a conclusão do Processo.

A reserva é derivada do snapshot persistido da escolha, não de um estado concorrente da interface ou do plugin. Espera por output, falha, cancelamento e restart do aplicativo preservam a reserva. Excluir/reiniciar a execução libera uma escolha ainda não consumida; invalidar e refazer a própria escolha também libera sua reserva anterior. Retentar um Bloco posterior preserva a escolha do prefixo. Itens reservados não aparecem como candidatos de outra escolha e não podem ser editados/excluídos; a coleção com reservas não pode ser editada/excluída. O núcleo revalida a exclusividade quando aceita o resultado do plugin, pois candidatos podem ter sido reservados por outra execução durante a chamada.

Cada escolha nova congela no `BlockExecution.collectionSelection` a política de uso, os campos e valores do item. `selectedItemId` continua sendo a entrega universal da decisão, sem alterar `ValueShape` ou portas. Após o consumo, histórico, visualização, artifacts e resolução das entradas seguintes continuam usando o snapshot; consumir remove somente o registro da biblioteca, nunca arquivos referenciados pela execução. Snapshots anteriores permanecem intactos e conservam sua resolução original.

A importação em lote permite editar itens em uma tabela e preencher colunas separadamente. Valores textuais são divididos em linhas e arquivos selecionados preenchem a coluna na ordem apresentada, a partir da primeira linha; as imagens são exibidas para orientar o preenchimento dos demais campos. O usuário revisa todas as linhas antes de salvar. Os campos conservam seus `ValueShape` canônicos. O endpoint valida o lote completo e grava todos os itens em uma única transação; linha inválida impede qualquer inserção. Um ID de importação mantém a operação idempotente, inclusive após consumo posterior dos itens. A ordem de inserção é preservada na projeção da biblioteca. O lote admite até 1.000 linhas por importação.

A Biblioteca Estratégica é diferente da Biblioteca de Métodos: a primeira contém peças utilizadas dentro das ações; a segunda permite reutilizar sequências completas de ações entre canais.

Além dos campos simples, uma coleção pode usar o formato especializado `Layout de thumbnail`. Cada item desse tipo armazena uma composição 16:9 criada no canvas visual, com caixas posicionadas em coordenadas percentuais. O mesmo formato faz parte do contrato universal de blocos, portanto o layout escolhido pode atravessar conexões tipadas e orientar um plugin de montagem programática sem perder sua estrutura.

### 10.1. Histórico do Canal e memória entre projetos

O Histórico do Canal é uma visão derivada das entregas persistidas nos snapshots dos Projetos do mesmo Canal. Ele não possui tabela, ciclo de retenção ou interface de gerenciamento próprios, não duplica valores na Biblioteca Estratégica e não cria uma segunda fonte de verdade. A Biblioteca representa o repertório preexistente; o Histórico representa decisões e resultados efetivamente usados; as regras para a próxima decisão pertencem às instruções do bloco ou ao plugin executor.

Os blocos `ESCOLHER` e `CRIAR` podem ativar o Histórico do Canal. `BUSCAR` e `VALIDAR` não usam essa memória porque operam sobre o contexto da execução atual. Para o usuário, a função é binária — considerar ou não considerar o histórico — acrescida somente da quantidade de resultados recentes, entre 1 e 100. Não existem na interface campos de schema, elegibilidade, Processo, Bloco, Entrega ou proveniência para configurar.

No `ESCOLHER`, o núcleo consulta automaticamente as decisões concluídas deste mesmo bloco, no mesmo Processo, nos Projetos anteriores do Canal. No `CRIAR`, consulta os outputs oficiais concluídos deste mesmo Processo nos Projetos anteriores, independentemente de qual bloco ou operador os produziu. Em ambos os casos, exclui o Projeto atual e entrega ao operador a quantidade solicitada, ordenada do registro mais recente para o mais antigo. O formato técnico inclui valor, Projeto e instante apenas para preservar proveniência; ele não é editável. Histórico vazio é uma entrada válida e não bloqueia o primeiro Projeto.

Métodos v3 que já possuam uma entrada canônica `channel_history` continuam legíveis. A interface os apresenta pelo mesmo controle simplificado e preserva seus metadados internos enquanto o histórico permanecer ativo; ao desligar, remove a entrada de memória. Entradas normais entre blocos e Processos continuam independentes do Histórico do Canal.

O Histórico aceita shapes escalares compatíveis. Shapes `many`, decisões de approval, registros e layouts não entram diretamente nessa consulta; um Bloco pode antes produzir um resumo `text/one` apropriado.

Toda conclusão de `ESCOLHER`, por Humano, IA ou Código, materializa `selectedItemId` como entrega universal. Assim, o mesmo bloco pode consultar suas escolhas anteriores e aplicar por instrução ou plugin regras como rodízio, cooldown, pesos ou não repetição. O núcleo não possui catálogo de regras editoriais: Humano e IA seguem `instructions`; plugins de Código declaram suas estratégias e configurações no próprio manifesto.

Entregas invalidadas por retry e execuções canceladas não participam do Histórico. Excluir um Projeto também elimina sua contribuição porque a memória é derivada dos snapshots. Plugins recebem somente históricos conectados explicitamente como inputs; não ganham acesso ao SQLite nem ao restante do Canal.

Quando a origem é outra decisão `ESCOLHER`, o valor histórico é o ID persistido do item estratégico. O executor de plugin recebe os mesmos IDs junto da coleção vinculada, e a interface humana marca nos itens quantas vezes eles aparecem na janela conectada. Essa marcação informa repetição sem impor uma regra: evitar, alternar, priorizar ou repetir continua sendo decisão das instruções ou do plugin.

---

## 11. Resultados Intermediários e Outputs Universais

Cada saída concluída de um bloco torna-se uma **entrega universal do Projeto**. A entrega pertence à execução, conserva processo, bloco, chave de saída, tentativa, `ValueShape`, ordem e estado, e recebe um ID técnico estável. Shapes `one` geram um item; shapes `many` geram um item identificado para cada elemento. Assim, três opções de título em `text/many` possuem uma entrega e três IDs de item distintos.

O Método não grava IDs de execução. No construtor, o usuário escolhe estruturalmente `Processo / Bloco / Entrega`; o motor resolve essa referência para a entrega e os itens reais quando o Projeto é executado. Plugins recebem os valores tipados junto com os IDs de proveniência, podendo sincronizar SRT, cenas, áudio, assets e cortes sem depender de posição visual ou nome de arquivo.

As entregas são persistidas no snapshot da execução, sem criar uma segunda base de dados paralela. Uma nova tentativa invalida as entregas afetadas e cria IDs correspondentes à nova tentativa, preservando o histórico. A interface de execução apresenta os resultados concluídos dentro de cada etapa e não duplica essas entregas em um painel consolidado do Projeto. Relações especializadas, como um asset selecionado para uma cena, são referências genéricas entre IDs e permanecem configuradas pelo Método ou plugin, nunca codificadas como uma regra fixa do núcleo.

Nos novos Métodos, associações editoriais podem viajar como conteúdo textual no formato declarado pelo plugin: o produtor fornece IDs canônicos ao modelo e valida seu texto; o consumidor resolve as referências pela proveniência e traduz o uso para a ferramenta. O Core conserva IDs, ordem e artifacts sem interpretar o JSON ou escolher personagens. Contratos internos de Métodos existentes podem declarar campos de relação por IDs de itens de uma entrada. Um Bloco de IA produz a associação semântica; o Core limita os valores aos IDs concedidos, persiste a relação e transporta a linhagem; o plugin posterior converte essa relação para a operação de seu fornecedor. Esses schemas são preservados, mas não são configurados no editor estratégico nem criados como campos estratégicos pelo MCP. Assim, o Core não precisa saber o que é personagem, legenda, corte ou imagem de referência, e ferramentas diferentes podem implementar a mesma relação universal de maneiras diferentes.

Separadamente, cada Processo Universal possui um output oficial, independente do método e do executor utilizado:

1. `Tema`: `text/one/inline`.
2. `Título`: `text/one/inline`.
3. `Thumbnail`: `image/one/artifact`.
4. `Roteiro`: `text/one/inline`.
5. `Narração e Áudio`: `audio/one/artifact`.
6. `Assets Visuais`: portas separadas `images: image/many/artifact` e `videos: video/many/artifact`.
7. `Edição`: `video/one/artifact`.
8. `Publicação`: controle `url/one` ou registro estruturado da publicação.

Quando um bloco `CRIAR` entrega o campo universal esperado, o motor promove esse valor automaticamente a output do processo após o término e a eventual validação. Se nenhum bloco entregar um valor compatível, o processo pausa para que o operador humano registre o resultado final.

Os outputs concluídos dos processos anteriores e as demais entregas compatíveis ficam disponíveis como contexto nos processos seguintes. O output oficial de cada processo também é registrado como entrega universal, com a mesma identidade e rastreabilidade.

Quando o Processo `Thumbnail` é concluído com uma ou mais imagens, a primeira imagem disponível no output oficial passa a representar visualmente o Projeto no card do Canal. Essa capa é derivada do snapshot da execução e não cria uma cópia paralela no registro do Projeto.

---

## 12. Protocolo de Plugins

O contrato técnico está documentado em [`protocol.md`](ecosystem/protocol.md), o guia prático em [`development.md`](ecosystem/development.md), os requisitos do executor em [`security.md`](ecosystem/security.md), os requisitos para plugins que automatizam interfaces web em [`browser-automation.md`](ecosystem/browser-automation.md) e a governança do catálogo em [`distribution.md`](ecosystem/distribution.md). Plugins recebem contexto controlado do motor e nunca acessam diretamente o banco local. Todos são externos, exigem consentimento local e executam na mesma sandbox de permissões em processo separado, inclusive os publicados pelo autor do ContentFlow.

A arquitetura não possui aprovação central: qualquer pessoa pode criar e compartilhar um plugin, inclusive por arquivo ou repositório, e qualquer usuário pode instalá-lo e autorizá-lo localmente. O núcleo aplica validações automáticas e pede consentimento para permissões; revisão humana do mantenedor existe apenas para selo `verified` ou publicação em catálogo opcional.

Uma capacidade de plugin pode ser internamente complexa e demorada. Ela pode pesquisar, chamar várias APIs, usar uma sessão conectada pelo usuário, gerar centenas de arquivos, manter checkpoints ou renderizar durante horas, desde que sua interface externa continue sendo a entrega daquele bloco. Pastas de trabalho escolhidas pelo usuário podem ser montadas como raízes autorizadas; artifacts preservam IDs, ordem e proveniência para que plugins posteriores encontrem cada arquivo sem depender de caminhos frágeis gravados no Método.

Automações de navegador podem cadastrar vários perfis de conta explicitamente preparados. Os plugins que operam interfaces web podem usar uma única extensão companheira Manifest V3, distribuída fora do núcleo e compatível com o protocolo público da ponte. Transporte, autenticação de comandos, isolamento de aba e operações DOM limitadas podem ser compartilhados; seletores, estados, regras e validação de cada provedor permanecem no respectivo plugin externo. O núcleo não inclui extensão, navegador, seletores ou adapters de provedor.

Na V1, a extensão companheira é instalada manualmente em cada perfil dedicado por **Carregar sem compactação**. O aplicativo disponibiliza os arquivos públicos da ponte em uma pasta estável de dados, separada do checkout e preservada entre atualizações, para que renomear ou mover o código-fonte não quebre os perfis. A preparação pode informar prontidão assim que login e ponte forem validados, mas nunca fecha automaticamente a instância interativa. Em cadastro, preparação ou reparo de perfil, o usuário instala ou atualiza a extensão, conclui o login e decide quando fechar o navegador; sucesso, incompatibilidade da ponte e falha de autenticação permanecem visíveis sem retirar essa superfície de correção. Ferramentas pessoais que o mantenedor use para preparar vários perfis da própria máquina são paralelas ao aplicativo, não são chamadas pelo núcleo ou pelos plugins.

A execução rotineira ocorre minimizada ou em background por comandos estruturados entre o handler, o service worker e o content script. Ela não depende de foco do Windows, teclado ou mouse do sistema e não deve trazer a janela para frente. Login, reautenticação e diagnóstico podem abrir uma superfície visível somente mediante ação explícita do usuário. Headless não é uma garantia universal da implementação atual; depende de compatibilidade e validação do cenário.

A Browser Bridge é um protocolo compartilhado e versionado. Cliente e extensão negociam versão e capabilities antes do primeiro efeito; comandos possuem identidade idempotente e validade limitada; eventos de lifecycle usam sequência monotônica; snapshots são solicitados sob demanda; observadores de condição são temporários e sujeitos a timeout, debounce e backpressure. Reconnect, timeout ou perda do worker/debugger depois de uma ação potencialmente mutável exigem reconciliação antes de replay. Recarga é uma primitiva allowlisted e controlada, nunca fallback universal, e permanece bloqueada enquanto houver efeito externo incerto. Diagnósticos da ponte registram somente metadados redigidos e não transportam conteúdo privado, cookies, tokens, storage de sessão ou caminhos físicos.

A recuperação possui três camadas explícitas. Navegador e Browser Bridge reportam fatos técnicos universais de transporte, sem interpretar a página. O plugin conhece DOM, respostas e linguagem do fornecedor e traduz estados como “atividade incomum”, “suspicious activity” ou “anti-bot detected” para o código universal `PROVIDER_SECURITY_CHALLENGE`; particularidades equivalentes nunca chegam ao Core como texto a ser adivinhado. O Core recebe somente códigos e fatos normalizados e escolhe a ação, sem conhecer fornecedor, seletor ou mensagem.

A política do núcleo aplica uma escada determinística: cancelamento explícito; reconciliação quando o efeito externo é possível ou desconhecido; intervenção para instalação/protocolo incompatível, autenticação, desafio de segurança do provedor ou outra condição humana; recarga controlada no mesmo perfil somente quando uma operação anterior à submissão perdeu a página; fallback apenas para falha realmente associada à conta/perfil; retry técnico com limite e backoff; e, por fim, falha terminal. Texto de mensagem nunca é interpretado para tomar essa decisão. Novos comportamentos observados em testes reais devem ampliar esse vocabulário de fatos e decisões na fronteira canônica, acompanhado de teste contratual, em vez de gerar fallback específico por fornecedor.

O núcleo mantém a ordem, o cursor e as entregas e decide recuperação por essa política única. Ele só avança para outro perfil explicitamente preparado quando a falha é segura para redistribuição, associada ao perfil e não há efeito externo incerto; indisponibilidade transitória de página, Bridge ausente/desatualizada, timeout genérico ou output inválido não autorizam trocar silenciosamente de conta. Autenticação, CAPTCHA, permissão, cota, upgrade ou bloqueio sem alternativa segura viram intervenção, e qualquer efeito potencialmente submetido exige reconciliação antes de retry ou fallback. Cancelamento nunca avança o cursor, a lista configurada nunca é ultrapassada e o histórico das tentativas é preservado. Capacidades que declaram uma entrada em lote podem solicitar orquestração sequencial ou multiperfil por unidades persistidas pelo núcleo, que nunca repete silenciosamente itens concluídos ou efeitos incertos. A extensão existe para produtividade, isolamento, determinismo e observabilidade da automação.

Qualquer integração com modelos de linguagem, catálogos de modelos, pesquisa web ou mídia especializada é responsabilidade do respectivo plugin externo. O núcleo apenas apresenta `blockConfigSchema`, capacidades e contratos declarados pelo pacote; ele não conhece fornecedor, endpoint, modelo ou ferramenta específica.

---

## 13. Layouts Programáticos de Thumbnail

O núcleo oferece um canvas de composição visual na Biblioteca Estratégica para layouts de thumbnail. Cada layout descreve caixas, posições, dimensões, ordem de camadas e cores em coordenadas relativas a um quadro 16:9.

Plugins de operador `Código` podem consumir esses layouts pelo contrato `thumbnail_layout` para posicionar textos, pessoas, objetos e demais elementos durante a montagem programática. O canvas e o formato fazem parte da infraestrutura pública do Método e da Biblioteca, não são código legado.

---

## 14. Distribuição desktop

A distribuição Windows empacota a interface em Electron e inicia a API como processo filho com uma cópia privada do Node 26. Usuários finais não precisam instalar Node, npm ou abrir terminal. O processo Electron hospeda apenas a janela e os arquivos da interface; o runtime privado preserva para a API e para plugins comunitários o modelo de permissões documentado em [`security.md`](ecosystem/security.md).

O programa instalado é substituível e os dados persistentes permanecem em `%APPDATA%\ContentFlow\data`. Plugins instalados e vínculos de desenvolvimento também vivem nessa área, mas são obtidos separadamente. O núcleo não inclui nem copia plugins ou exemplos na primeira abertura. Essa separação permite recompilar e reinstalar o núcleo sem apagar projetos, credenciais ou plugins externos instalados pelo usuário.

O instalador NSIS consulta o canal estável público por um updater executado somente no processo principal do Electron. A interface recebe por preload isolado apenas estado, verificação, download, instalação e abertura da release oficial. O download é iniciado pelo usuário, mostra progresso e só reinicia depois de confirmação. Preview web não executa updater; a versão portátil abre a release mais recente em vez de prometer substituição automática.

Cada release atualizável publica instalador e `latest.yml` no mesmo build para preservar integridade. Falha de rede, metadata ausente, checksum ou assinatura mantém a versão atual. Logs locais do updater são redigidos. Assinatura Authenticode é a política recomendada para releases públicas da V1; o mecanismo pode ser validado tecnicamente antes da disponibilidade do certificado.
