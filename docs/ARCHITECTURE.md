# 📄 Documento de Arquitetura e Visão de Produto: ContentFlow

## 1. Visão Geral do Produto

O **ContentFlow** é um **Gerenciador Estratégico de Métodos** para produção de conteúdo. Diferente das ferramentas tradicionais "caixa-preta" (geradores de 1 clique que ocultam o processo e geram conteúdo repetitivo e vulnerável à desmonetização no YouTube), o ContentFlow desacopla a **Estratégia do Método** da **Execução Funcional**.

A plataforma permite que criadores desenhem, personalizem e automatizem seus próprios fluxos de trabalho através de uma arquitetura modular baseada em **4 Blocos Essenciais de Ação**, **3 Operadores** e um **Ecossistema Aberto de Plugins**.

### 1.1. Invariante absoluta: núcleo e plugins são produtos separados

O ContentFlow precisa ser completo e útil com **zero plugins instalados**. Sem integrações, ele continua sendo o Gerenciador Estratégico de Métodos: organiza Canais e Projetos, armazena Métodos, prompts, estruturas, CTAs e Biblioteca Estratégica, transporta dados tipados e conduz blocos do operador `Humano`.

O núcleo pode conhecer somente o protocolo público de plugins, seus contratos tipados, ciclo de vida, permissões, sandbox, referências opacas de conexões e cofre genérico de secrets. Ele não pode conter IDs, endpoints, autenticação, listas de modelos, seletores de navegador, codecs ou regras de negócio de um fornecedor específico.

Consequentemente:

- APIs de OpenAI, Anthropic, YouTube ou qualquer outro fornecedor pertencem ao respectivo plugin;
- FFmpeg, Python, executáveis auxiliares, automação de navegador e tratamento específico de mídia pertencem ao plugin que os utiliza;
- um plugin mantido pelo autor do ContentFlow continua sendo software externo: possui versão, pacote, permissões, distribuição e instalação próprias;
- a distribuição do núcleo não inclui, instala, ativa nem concede confiança especial a nenhum plugin;
- todos os plugins são removíveis e passam pela mesma validação, consentimento e sandbox;
- um Método que referencia um plugin ausente permanece legível e organizável, preserva seu contrato e outputs históricos, mas sua execução automática fica bloqueada até uma associação local válida.

Manter pacotes de plugins no mesmo repositório de desenvolvimento, quando conveniente, não os transforma em parte do núcleo nem autoriza que sejam empacotados com sua release.

---

## 2. A Estrutura das 3 Interfaces da Aplicação (UX/UI)

A experiência do usuário no ContentFlow apoia-se em 3 camadas de interface claramente delimitadas:

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
   - **Funcionamento**: Instalação por pasta, vínculo de desenvolvimento, atualização, ativação, consentimento de permissões, inspeção de dependências e remoção de qualquer plugin pelo mesmo fluxo, sem distinção baseada no autor. A configuração de uso e a escolha de conexão acontecem no Bloco do Método; secrets, sessões, workspaces e preferências técnicas continuam protegidos pelo núcleo fora do arquivo do Método.

No nível global, a navegação principal possui três áreas:

- `/dashboard`: visão geral dos canais.
- `/methods`: Biblioteca de Métodos, derivada dos métodos salvos nos canais, com busca, reutilização, importação e compartilhamento.
- `/plugins`: Gerenciador de Plugins locais, responsável por descobrir e apresentar manifestos reais instalados no aplicativo.

O Gerenciador de Plugins organiza o catálogo em cards quadrados, compactos e pesquisáveis. Em telas grandes, a galeria apresenta quatro cards por linha; cada card exibe somente o ícone local validado e o nome do plugin, além de uma sinalização mínima de erro ou desativação. Versão, origem, permissões, capacidades e ações de ciclo de vida aparecem nos detalhes abertos pelo card.

Cada manifesto pode declarar uma ou mais capacidades de entrega entre `text`, `image`, `audio`, `video` e `processing`; esses metadados, somados aos blocos e Processos Universais compatíveis, alimentam os filtros da galeria sem alterar o contrato universal de dados dos blocos. O manifesto também pode declarar `branding.iconPath`, um caminho relativo para PNG ou WebP empacotado, com até 512 KiB. O núcleo valida caminho, assinatura, MIME e tamanho, nunca busca favicon remoto e usa fallback local quando o campo ou asset estiver ausente ou inválido. O autor responde pelos direitos de uso do ícone. Como `branding` é opcional, manifestos API v1 existentes permanecem compatíveis.

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

- Quando o usuário adiciona um Bloco no Método (ex: `CRIAR`), ele seleciona o Operador (ex: `IA`), o **Plugin**, a capacidade e a conexão desejados.
- A interface do Bloco lê o manifesto e renderiza os campos que aquela capacidade precisa, como modelo, temperatura, formato, voz ou perfil.
- O Método local guarda `pluginId`, `pluginVersion`, `capabilityId`, configuração, bindings e uma referência opaca `connectionId` quando o executor exigir conta ou sessão.
- Uma conexão é um registro local, estável e nomeado, pertencente ao plugin e reutilizável por vários blocos. O Bloco determina em qual Canal, Processo e ação ela será usada; renomear a conexão não muda seu ID nem quebra o Método.
- O valor real de API keys, tokens, cookies e outros secrets nunca entra em `connectionId`, configuração, Método, exportação, SQLite, request, snapshot ou log. Ele permanece no cofre seguro e só é resolvido em memória para a invocação autorizada.
- Permissões, consentimento, origem, integridade, runtime, workspace e preferências técnicas da instalação continuam sob responsabilidade do núcleo. A interface pode conduzir sua preparação a partir do Bloco, mas esses dados não se tornam configuração portátil do Método.

Templates exportados não carregam o `connectionId` local. No lugar dele, preservam apenas o requisito de conexão — plugin, capacidade e secrets/perfil exigidos. Ao importar ou copiar para outro ambiente, o usuário associa cada requisito a uma conexão local existente ou cria uma nova antes de executar.

### B. Variáveis Dinâmicas do Projeto

Dentro dos campos do plugin no bloco, o usuário insere placeholders dinâmicos (ex: `{{video.topic}}`, `{{block_01.output}}`). Na execução do vídeo, o motor substitui as variáveis pelos valores reais.

### C. Contrato Universal de Dados do Bloco

Entradas e saídas pertencem ao bloco e não ao operador. Na definição do Método, cada bloco guarda:

- Nome e instruções da ação.
- Dados de entrada, definidos visualmente apenas por nome e formato.
- Dados de saída, definidos visualmente apenas por nome e formato.
- O operador responsável pela execução.

As chaves técnicas, a persistência e a conexão padrão com resultados anteriores são administradas internamente pelo núcleo. Para o usuário, os formatos universais são: texto curto, texto longo, número, sim ou não, lista de textos, lista de registros, seleção, seleção múltipla, data e hora, URL, arquivo, vários arquivos, imagem, áudio, vídeo, decisão e layout de thumbnail.

- `Lista de registros` representa uma coleção ordenada de objetos com esquema próprio, como cenas de roteiro, CTAs ou planos de edição. Cada campo interno tem chave, formato e obrigatoriedade.
- `Data e hora` é persistida e trocada com plugins em ISO 8601, incluindo o instante normalizado em UTC.
- `Layout de thumbnail` transporta a composição 16:9 do canvas — caixas, posições, dimensões, ordem e cores — sem converter o layout em imagem.

Cada entrada declarada é conectada automaticamente a uma saída compatível já produzida. O motor prioriza os blocos anteriores mais próximos, depois os outputs dos Processos Universais anteriores, considera a semelhança entre os nomes e não reutiliza a mesma saída em duas entradas do mesmo bloco. Conexões explícitas legadas continuam sendo respeitadas. Se uma entrada não puder ser resolvida, o bloco permanece pausado e informa claramente qual dado está ausente.

Todos os quatro tipos de bloco podem declarar zero ou mais entradas de contexto vindas de blocos anteriores ou Processos Universais anteriores. O editor começa sem campos opcionais e oferece somente a ação discreta **Adicionar entrada**; assim, um bloco simples permanece visualmente leve, mas `BUSCAR`, `ESCOLHER`, `CRIAR` e `VALIDAR` podem consumir qualquer entrega anterior compatível quando o Método exigir. No `ESCOLHER`, essas entradas apenas orientam a decisão e não substituem a coleção vinculada. No `VALIDAR`, elas complementam e não substituem o bloco-alvo obrigatório da validação.

O operador `Humano` é o executor nativo desse mesmo contrato e não depende de plugin. Plugins de `IA` ou `Código` consomem as mesmas entradas e produzem as mesmas saídas; seus parâmetros particulares aparecem somente depois que o plugin é selecionado.

O Método armazena esse esquema, suas instruções, parâmetros, configuração do executor, bindings e a referência local de conexão quando aplicável. Os valores efetivamente preenchidos pertencem à execução do Projeto/Vídeo e nunca são gravados como parte do Método.

Plugins que declaram suporte à continuidade de conversa podem devolver ao núcleo uma referência opaca da conversa criada. Em outro bloco compatível, o usuário escolhe iniciar uma conversa nova ou continuar a conversa de um bloco anterior do mesmo Projeto, inclusive de um Processo Universal anterior. O núcleo só permite a reutilização com o mesmo plugin e a mesma conexão local, preserva a referência no snapshot da execução e nunca interpreta cookies, tokens ou o conteúdo interno da conversa. Plugins sem essa declaração continuam sempre iniciando uma execução independente.

Métodos compostos integralmente por blocos humanos podem ser executados de ponta a ponta. Blocos `IA` e `Código` são liberados quando possuem plugin, capacidade e, quando exigida, conexão local compatíveis. A configuração funcional permanece no Método; o secret permanece no cofre. Plugin, capacidade ou conexão ausentes, incompatíveis, desativados ou revogados mantêm o bloco explicitamente bloqueado.

### D. Compatibilidade de Métodos e conexões legadas

Na migração para múltiplas conexões, cada credencial global legada válida origina uma conexão local padrão com ID estável. O núcleo copia o secret para a nova entrada do cofre, valida a leitura e só então remove a entrada legada; uma falha mantém a origem intacta e apresenta recuperação, nunca apaga silenciosamente a credencial.

Blocos existentes sem `connectionId` podem usar transitoriamente a conexão padrão somente quando houver uma única conexão elegível para o plugin. Ambiguidade bloqueia a execução e solicita escolha explícita. Ao salvar novamente o Método, a referência é materializada. Snapshots antigos permanecem legíveis e não são reescritos; exportações antigas continuam importáveis, mas exigem associação local antes da execução quando o plugin precisar de conta.

---

## 7. O Motor de Execução (Execution Engine)

O orquestrador do sistema funciona em modelo de **Máquina de Estados Concorrente**:

1. Lê o JSON do Método do Canal para o processo atual.
2. Executa os blocos sequencialmente injetando as saídas do bloco anterior no bloco seguinte.
3. **Pausa e Retomada para Operador Humano**: Se um bloco for atribuído ao operador `Humano`, o motor pausa o estado da execução (`awaiting_human`), gera uma notificação e um cartão interativo no Projeto, e aguarda a entrega ou seleção do usuário para continuar a esteira.
4. **Execução por plugin**: Blocos `IA` e `Código` disparam automaticamente o plugin compatível configurado assim que suas entradas ficam disponíveis. O servidor resolve as entradas, executa plugins instalados ou vinculados em um processo separado, valida a resposta, registra entregas e artifacts no snapshot e ativa a próxima etapa sem exigir um botão por bloco.
5. **Bloqueio de executores ausentes**: Blocos sem plugin compatível permanecem em `blocked_executor`. Eles nunca são concluídos de forma fictícia.

Os métodos permanecem lineares: não existem ramificações, junções, paralelismo ou loops genéricos no canvas. Uma entrada pode apontar explicitamente para a saída de qualquer bloco anterior ou processo universal anterior, e um bloco pode declarar várias entradas.

Todo bloco `VALIDAR` referencia um bloco anterior específico e opera em um de três modos: aprovar ou reprovar, escolher uma opção, ou escolher várias opções. Uma reprovação pode pausar a execução ou solicitar uma nova tentativa do bloco validado. Nesse último caso, o motor invalida e executa novamente o trecho linear entre o bloco-alvo e a validação, preservando o feedback da reprovação como contexto da nova tentativa e respeitando o limite configurado. Uma escolha concluída torna-se uma saída tipada do próprio bloco `VALIDAR`, disponível para os blocos seguintes.

Cada nova tentativa incrementa a identidade de execução dos blocos já iniciados no trecho invalidado. Jobs, artifacts e entregas da tentativa anterior permanecem rastreáveis, mas não podem ser reutilizados como se pertencessem à nova tentativa.

Cada execução mantém um snapshot do Método utilizado, o estado individual dos blocos, rascunhos, entregas concluídas e referências a arquivos armazenados localmente. As saídas concluídas tornam-se contexto para os blocos seguintes.

A página do processo mantém um painel expansível de resultados concluídos. O tipo técnico do campo continua sendo a autoridade para validação e compatibilidade, enquanto `presentation` pode solicitar, de forma opcional, um renderer padronizado do núcleo. O registro central oferece modo automático, texto curto ou longo, lista ou etiquetas, tabela ou cartões, lista de arquivos, galeria de imagens, players de áudio e vídeo e decisão/aprovação. Assim, por exemplo, um mesmo valor `files` pode aparecer como lista de arquivos ou galeria sem alterar seu contrato técnico. Métodos e snapshots antigos, sem `presentation`, são normalizados para `auto`.

Renderers são componentes internos do ContentFlow. Plugins podem apenas indicar um identificador permitido e restrições declarativas de item ou MIME; nunca fornecem React, HTML, scripts ou outra interface arbitrária. Preferências incompatíveis ou desconhecidas são ignoradas pelo núcleo e recaem no modo automático.

### 7.1. Orquestrador de execução entre Projetos

Na visualização em lista do Canal, o Orquestrador de execução agenda vários Projetos sobre o mesmo motor linear. Ele não cria um novo Processo Universal, Bloco ou Operador e não altera o Método de cada Canal. Sua responsabilidade é somente criar a fila e iniciar a próxima combinação `Projeto / Processo Universal` quando a combinação atual terminar.

Na implementação anterior à V1 existem dois modos de ordenação:

1. **Ponta a ponta**: executa os 8 Processos Universais de um Projeto antes de iniciar o Projeto seguinte.
2. **Em lote por processo — transitório**: executa o mesmo Processo Universal em todos os Projetos, de forma sequencial, antes de avançar ao processo seguinte. Assim, um lote de 10 executa 10 Temas, depois 10 Títulos, 10 Thumbnails e assim por diante. Esse modo permanece disponível somente até o substituto da V1 atingir equivalência de parada, retomada e recuperação.

A fila do Orquestrador nunca inicia dois itens em paralelo. Estados `awaiting_human` e `awaiting_output` pausam a fila no item atual e continuam alimentando a Central Global de Pendências Humanas. Um executor ausente mantém a fila bloqueada. Uma falha pausa a fila com erro: depois que o usuário corrige ou repete a etapa no Projeto, pode retomar a mesma fila no cursor preservado, sem recriar Projetos nem repetir etapas concluídas. Enquanto não for retomada, a falha também não impede que uma nova fila seja criada.

O usuário pode parar uma fila em execução, aguardando humano, bloqueada ou com erro. O Stop cancela também a execução atual, impede o início dos itens restantes e preserva os Projetos já criados. Enquanto uma fila estiver ativa, seus Projetos não podem ser excluídos; primeiro é necessário pará-la. A fila, seu cursor, modo e Projetos pertencentes são persistidos localmente para permitir retomada após reiniciar o aplicativo.

### 7.2. Lote inteligente da V1

O lote inteligente é uma função do Orquestrador para preparar vários Projetos; não é um Método, Processo Universal, Bloco ou Operador novo. Um Método continua descrevendo a execução de um vídeo individual.

O usuário informa quantidade e critérios, escolhe plugin, capacidade e conexão, e autoriza uma única invocação que deve retornar `list` ou `records` estruturados. Cada candidato exige `theme`; `angle`, `promise` e `notes` são opcionais. O núcleo valida o contrato, quantidade e duplicidade e apresenta uma revisão editável. Nenhum Projeto é criado antes da confirmação humana dessa lista.

Depois da confirmação, o núcleo materializa um Projeto por item, promove `theme` como output oficial com proveniência e continua os processos seguintes pelo motor linear existente, preferencialmente no modo ponta a ponta. O Orquestrador persiste candidatos, confirmação, IDs criados e cursor antes de avançar. Repetições após falha reutilizam esses IDs e nunca duplicam Projetos já materializados.

O plugin apenas produz a lista estruturada. Revisão, criação de Projetos, identidade, persistência, deduplicação, parada e retomada pertencem ao núcleo. O lote inteligente não é a mesma coisa que `execution.itemOrchestration`: esse contrato continua servindo para expandir uma lista dentro de um único Bloco/Projeto e persistir cada item sequencialmente.

---

## 8. Ecossistema e Compartilhamento

O ContentFlow apoia-se em dois tipos de compartilhamento comunitário:

1. **Templates de Métodos (Caixa-Aberta)**: Exportação e importação de sequências de blocos com prompts e regras prontas por arquivo. Referências de plugins e requisitos de conexão permanecem explícitos, mas IDs locais e secrets são removidos; instalação, consentimento e associação a uma conexão local são ações separadas do usuário.
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

A central é uma visão derivada do estado real das execuções; ela não mantém uma cópia independente das tarefas.

---

## 10. Biblioteca Estratégica do Canal

Cada Canal possui uma biblioteca de elementos pré-existentes, como estruturas de título, estilos de thumbnail, modelos narrativos e regras editoriais.

O bloco `ESCOLHER` é o único bloco cuja função é selecionar elementos preexistentes da Biblioteca Estratégica. Todo bloco `ESCOLHER` deve estar obrigatoriamente vinculado a uma coleção do mesmo canal. Selecionar, aprovar ou reprovar resultados produzidos durante a execução pertence ao bloco `VALIDAR`.

O operador do bloco `ESCOLHER` pode ser Humano, IA ou Código. Quando executado por plugin, o núcleo entrega somente os itens da coleção vinculada e só aceita como resultado o identificador de um item real dessa coleção; o plugin não pode criar uma opção nova nesse bloco.

O `ESCOLHER` pode receber entradas de contexto para orientar a decisão, inclusive o Histórico do Canal. Isso não transforma a coleção em uma entrada comum: o núcleo continua entregando a coleção vinculada separadamente e validando que o resultado é um item real. Blocos seguintes recebem apenas os campos do item escolhido.

A Biblioteca Estratégica é diferente da Biblioteca de Métodos: a primeira contém peças utilizadas dentro das ações; a segunda permite reutilizar sequências completas de ações entre canais.

Além dos campos simples, uma coleção pode usar o formato especializado `Layout de thumbnail`. Cada item desse tipo armazena uma composição 16:9 criada no canvas visual, com caixas posicionadas em coordenadas percentuais. O mesmo formato faz parte do contrato universal de blocos, portanto o layout escolhido pode atravessar conexões tipadas e orientar um plugin de montagem programática sem perder sua estrutura.

### 10.1. Histórico do Canal e memória entre projetos

O Histórico do Canal é uma visão derivada das entregas persistidas nos snapshots dos Projetos do mesmo Canal. Ele não possui tabela, ciclo de retenção ou interface de gerenciamento próprios, não duplica valores na Biblioteca Estratégica e não cria uma segunda fonte de verdade. A Biblioteca representa o repertório preexistente; o Histórico representa decisões e resultados efetivamente usados; as regras para a próxima decisão pertencem às instruções do bloco ou ao plugin executor.

Os blocos `ESCOLHER` e `CRIAR` podem ativar o Histórico do Canal. `BUSCAR` e `VALIDAR` não usam essa memória porque operam sobre o contexto da execução atual. Para o usuário, a função é binária — considerar ou não considerar o histórico — acrescida somente da quantidade de resultados recentes, entre 1 e 100. Não existem na interface campos de schema, elegibilidade, Processo, Bloco, Entrega ou proveniência para configurar.

No `ESCOLHER`, o núcleo consulta automaticamente as decisões concluídas deste mesmo bloco, no mesmo Processo, nos Projetos anteriores do Canal. No `CRIAR`, consulta os outputs oficiais concluídos deste mesmo Processo nos Projetos anteriores, independentemente de qual bloco ou operador os produziu. Em ambos os casos, exclui o Projeto atual e entrega ao operador a quantidade solicitada, ordenada do registro mais recente para o mais antigo. O formato técnico inclui valor, Projeto e instante apenas para preservar proveniência; ele não é editável. Histórico vazio é uma entrada válida e não bloqueia o primeiro Projeto.

Métodos anteriores que já possuam uma entrada `channel_history` continuam legíveis. A interface os apresenta pelo mesmo controle simplificado e preserva seus metadados internos enquanto o histórico permanecer ativo; ao desligar, remove a entrada de memória. Entradas normais entre blocos e Processos continuam independentes do Histórico do Canal.

Na versão inicial, o Histórico aceita entregas escalares: texto curto ou longo, número, booleano, seleção, data, URL, arquivo, imagem, áudio e vídeo. Listas, decisões de aprovação, records aninhados, múltiplos arquivos e layouts não entram diretamente nessa consulta; um bloco pode antes produzir um resumo escalar apropriado.

Toda conclusão de `ESCOLHER`, por Humano, IA ou Código, materializa `selectedItemId` como entrega universal. Assim, o mesmo bloco pode consultar suas escolhas anteriores e aplicar por instrução ou plugin regras como rodízio, cooldown, pesos ou não repetição. O núcleo não possui catálogo de regras editoriais: Humano e IA seguem `instructions`; plugins de Código declaram suas estratégias e configurações no próprio manifesto.

Entregas invalidadas por retry e execuções canceladas não participam do Histórico. Excluir um Projeto também elimina sua contribuição porque a memória é derivada dos snapshots. Plugins recebem somente históricos conectados explicitamente como inputs; não ganham acesso ao SQLite nem ao restante do Canal.

Quando a origem é outra decisão `ESCOLHER`, o valor histórico é o ID persistido do item estratégico. O executor de plugin recebe os mesmos IDs junto da coleção vinculada, e a interface humana marca nos itens quantas vezes eles aparecem na janela conectada. Essa marcação informa repetição sem impor uma regra: evitar, alternar, priorizar ou repetir continua sendo decisão das instruções ou do plugin.

---

## 11. Resultados Intermediários e Outputs Universais

Cada saída concluída de um bloco torna-se uma **entrega universal do Projeto**. A entrega pertence à execução, conserva processo, bloco, chave de saída, tentativa, tipo, ordem e estado, e recebe um ID técnico estável. Valores escalares geram um item; listas, registros e coleções de arquivos geram um item identificado para cada elemento. Assim, três opções de título possuem uma entrega e três IDs de item distintos.

O Método não grava IDs de execução. No construtor, o usuário escolhe estruturalmente `Processo / Bloco / Entrega`; o motor resolve essa referência para a entrega e os itens reais quando o Projeto é executado. Plugins recebem os valores tipados junto com os IDs de proveniência, podendo sincronizar SRT, cenas, áudio, assets e cortes sem depender de posição visual ou nome de arquivo.

As entregas são persistidas no snapshot da execução, sem criar uma segunda base de dados paralela. Uma nova tentativa invalida as entregas afetadas e cria IDs correspondentes à nova tentativa, preservando o histórico. O painel **Produtos do projeto** mostra entregas e subentregas ativas de todos os Processos Universais. Relações especializadas, como um asset selecionado para uma cena, são referências genéricas entre IDs e permanecem configuradas pelo Método ou plugin, nunca codificadas como uma regra fixa do núcleo.

Separadamente, cada Processo Universal possui um output oficial, independente do método e do executor utilizado:

1. `Tema`: texto.
2. `Título`: texto.
3. `Thumbnail`: imagem.
4. `Roteiro`: texto.
5. `Narração e Áudio`: áudio.
6. `Assets Visuais`: lista de imagens e vídeos.
7. `Edição`: vídeo.
8. `Publicação`: URL ou registro da publicação.

Quando um bloco `CRIAR` entrega o campo universal esperado, o motor promove esse valor automaticamente a output do processo após o término e a eventual validação. Se nenhum bloco entregar um valor compatível, o processo pausa para que o operador humano registre o resultado final.

Os outputs concluídos dos processos anteriores e as demais entregas compatíveis ficam disponíveis como contexto nos processos seguintes. O output oficial de cada processo também é registrado como entrega universal, com a mesma identidade e rastreabilidade.

---

## 12. Protocolo de Plugins

O contrato técnico está documentado em [`protocol.md`](../ecosystem/docs/protocol.md), o guia prático em [`development.md`](../ecosystem/docs/development.md), os requisitos do executor em [`security.md`](../ecosystem/docs/security.md), os requisitos para plugins que automatizam interfaces web em [`browser-automation.md`](../ecosystem/docs/browser-automation.md), a governança do catálogo em [`distribution.md`](../ecosystem/docs/distribution.md) e a ordem estratégica de implementação em [`roadmap.md`](../ecosystem/docs/roadmap.md). Plugins recebem contexto controlado do motor e nunca acessam diretamente o banco local. Todos são externos, exigem consentimento local e executam na mesma sandbox de permissões em processo separado, inclusive os publicados pelo autor do ContentFlow.

A arquitetura não possui aprovação central: qualquer pessoa pode criar e compartilhar um plugin, inclusive por arquivo ou repositório, e qualquer usuário pode instalá-lo e autorizá-lo localmente. O núcleo aplica validações automáticas e pede consentimento para permissões; revisão humana do mantenedor existe apenas para selo `verified` ou publicação em catálogo opcional.

Uma capacidade de plugin pode ser internamente complexa e demorada. Ela pode pesquisar, chamar várias APIs, usar uma sessão conectada pelo usuário, gerar centenas de arquivos, manter checkpoints ou renderizar durante horas, desde que sua interface externa continue sendo a entrega daquele bloco. Pastas de trabalho escolhidas pelo usuário podem ser montadas como raízes autorizadas; artifacts preservam IDs, ordem e proveniência para que plugins posteriores encontrem cada arquivo sem depender de caminhos frágeis gravados no Método.

Automações de navegador podem cadastrar vários perfis de conta explicitamente preparados. Os plugins que operam interfaces web podem usar uma única extensão companheira Manifest V3, distribuída fora do núcleo e compatível com o protocolo público da ponte. Transporte, autenticação de comandos, isolamento de aba e operações DOM limitadas podem ser compartilhados; seletores, estados, regras e validação de cada provedor permanecem no respectivo plugin externo. O núcleo não inclui extensão, navegador, seletores ou adapters de provedor.

Na V1, a extensão companheira é instalada manualmente em cada perfil dedicado por **Carregar sem compactação**. Ferramentas pessoais que o mantenedor use para preparar vários perfis da própria máquina são paralelas ao aplicativo, não são distribuídas aos usuários e nunca são chamadas pelo núcleo ou pelos plugins.

A execução rotineira ocorre minimizada ou em background por comandos estruturados entre o handler, o service worker e o content script. Ela não depende de foco do Windows, teclado ou mouse do sistema e não deve trazer a janela para frente. Login, reautenticação e diagnóstico podem abrir uma superfície visível somente mediante ação explícita do usuário. Headless é uma evolução do mesmo contrato quando tecnicamente compatível.

O núcleo mantém a ordem, o cursor e as entregas e pode avançar automaticamente para o próximo perfil explicitamente preparado quando uma tentativa terminar com qualquer falha reportada pelo plugin, inclusive autenticação, rate limit, cota, permissão ou validação de output. O fallback nunca ignora um cancelamento solicitado pelo usuário, nunca ultrapassa a lista ordenada de perfis configurados e preserva o histórico das tentativas. Estados que o plugin reportar como espera por intervenção humana continuam pausados, em vez de serem tratados como erro para troca de perfil. Capacidades que declaram uma entrada em lote podem solicitar orquestração sequencial item a item pelo núcleo, que persiste cada texto ou mídia antes de avançar e nunca repete itens concluídos ao trocar de perfil. A extensão existe para produtividade, isolamento, determinismo e observabilidade da automação.

Qualquer integração com modelos de linguagem, catálogos de modelos, pesquisa web ou mídia especializada é responsabilidade do respectivo plugin externo. O núcleo apenas apresenta `blockConfigSchema`, capacidades e contratos declarados pelo pacote; ele não conhece fornecedor, endpoint, modelo ou ferramenta específica.

---

## 13. Layouts Programáticos de Thumbnail

O núcleo oferece um canvas de composição visual na Biblioteca Estratégica para layouts de thumbnail. Cada layout descreve caixas, posições, dimensões, ordem de camadas e cores em coordenadas relativas a um quadro 16:9.

Plugins de operador `Código` podem consumir esses layouts pelo contrato `thumbnail_layout` para posicionar textos, pessoas, objetos e demais elementos durante a montagem programática. O canvas e o formato fazem parte da infraestrutura pública do Método e da Biblioteca, não são código legado.

---

## 14. Distribuição desktop V0

A distribuição Windows empacota a interface em Electron e inicia a API como processo filho com uma cópia privada do Node 26. Usuários finais não precisam instalar Node, npm ou abrir terminal. O processo Electron hospeda apenas a janela e os arquivos da interface; o runtime privado preserva para a API e para plugins comunitários o modelo de permissões documentado em [`security.md`](../ecosystem/docs/security.md).

O programa instalado é substituível e os dados persistentes permanecem em `%APPDATA%\ContentFlow\data`. Plugins instalados e vínculos de desenvolvimento também vivem nessa área, mas são obtidos separadamente. O núcleo não inclui nem copia plugins ou exemplos na primeira abertura. Essa separação permite recompilar e reinstalar o núcleo sem apagar projetos, credenciais ou plugins externos instalados pelo usuário.

O instalador NSIS consulta o canal estável público por um updater executado somente no processo principal do Electron. A interface recebe por preload isolado apenas estado, verificação, download, instalação e abertura da release oficial. O download é iniciado pelo usuário, mostra progresso e só reinicia depois de confirmação. Preview web não executa updater; a versão portátil abre a release mais recente em vez de prometer substituição automática.

Cada release atualizável publica instalador e `latest.yml` no mesmo build para preservar integridade. Falha de rede, metadata ausente, checksum ou assinatura mantém a versão atual. Logs locais do updater são redigidos. Assinatura Authenticode é a política recomendada para releases públicas da V1; o mecanismo pode ser validado tecnicamente antes da disponibilidade do certificado.
