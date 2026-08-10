# 📄 Documento de Arquitetura e Visão de Produto: ContentFlow OS

## 1. Visão Geral do Produto

O **ContentFlow OS** é um Sistema Operacional de Mídia e Orquestrador Visual de Métodos (_Visual Workflow Orchestrator_). Diferente das ferramentas tradicionais "caixa-preta" (geradores de 1 clique que ocultam o processo e geram conteúdo repetitivo e vulnerável à desmonetização no YouTube), o ContentFlow OS desacola a **Estratégia do Método** da **Execução Funcional**.

A plataforma permite que criadores desenhem, personalizem e automatizem seus próprios fluxos de trabalho através de uma arquitetura modular baseada em **4 Blocos Essenciais de Ação**, **3 Operadores** e um **Ecossistema Aberto de Plugins**.

---

## 2. A Estrutura das 3 Interfaces da Aplicação (UX/UI)

A experiência do usuário no ContentFlow OS apoia-se em 3 camadas de interface claramente delimitadas:

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
│ INTERFACE 3: Gerenciamento de Plugins (Nível Operacional / Conexões)   │
│ Galeria de plugins (IA, Código, Webhooks) e chaves de API globais.     │
└────────────────────────────────────────────────────────────────────────┘
```

1. **Interface 1: Projetos / Vídeos (Execução de Conteúdo)**
   - **Objetivo**: Interface limpa e direta para o dia a dia.
   - **Funcionamento**: O usuário digita as variáveis do vídeo (ex: tema, palavra-chave) e clica em "Iniciar Produção". O sistema executa o método do canal e apresenta as saídas prontas (título, thumb, roteiro), pausando apenas para ações do operador `Humano`.

2. **Interface 2: Métodos do Canal (Estratégia / Nível Workspace)**
   - **Objetivo**: Construtor visual de fluxos de trabalho.
   - **Funcionamento**: Localizado no nível de Canal/Workspace. O criador desenha a sequência atômica de blocos para cada um dos 8 Processos Universais de Conteúdo.

3. **Interface 3: Gerenciador de Plugins (Operação & Integrações)**
   - **Objetivo**: Gestão de ferramentas e conexões técnicas.
   - **Funcionamento**: Cadastro e gerenciamento de plugins (oficiais, de código aberto ou webhooks), centralização de chaves de API globais e credenciais.

No nível global, a navegação principal possui três áreas:

- `/dashboard`: visão geral dos canais.
- `/methods`: Biblioteca de Métodos, derivada dos métodos salvos nos canais, com busca, reutilização, importação e compartilhamento.
- `/plugins`: Gerenciador de Plugins locais, responsável por descobrir e apresentar manifestos reais instalados no aplicativo.

O Gerenciador de Plugins organiza o catálogo em cards compactos e pesquisáveis. Cada manifesto pode declarar uma ou mais capacidades de entrega entre `text`, `image`, `audio`, `video` e `processing`; esses metadados, somados aos blocos e Processos Universais compatíveis, alimentam os filtros da galeria sem alterar o contrato universal de dados dos blocos.

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

### A. Onde vivem os parâmetros?

Os parâmetros funcionais vivem **dentro dos Plugins**.

- Quando o usuário adiciona um Bloco no Método (ex: `CRIAR`), ele seleciona o Operador (ex: `IA`) e o **Plugin** desejado (ex: `OpenAI Models`).
- A interface do Bloco lê o manifesto do Plugin e renderiza automaticamente na tela os campos que AQUELE plugin precisa (ex: `System Prompt`, `Temperatura`, `Modelo`).

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

O operador `Humano` é o executor nativo desse mesmo contrato e não depende de plugin. Um futuro plugin de `IA` ou `Código` deverá consumir as mesmas entradas e produzir as mesmas saídas; seus parâmetros particulares aparecem somente depois que o plugin for selecionado.

O Método armazena apenas esse esquema. Os valores efetivamente preenchidos pertencem à execução do Projeto/Vídeo e nunca são gravados como parte do Método.

Métodos compostos integralmente por blocos humanos podem ser executados de ponta a ponta. Blocos `IA` e `Código` são liberados quando possuem um plugin oficial compatível configurado. A configuração funcional permanece no Método. Secrets como chaves de API nunca são serializados no Método ou no SQLite: credenciais conectadas na Central de Plugins são persistidas pelo cofre nativo do sistema operacional e entregues somente a invocações autorizadas por `getSecret()`, com preenchimento transitório na execução como alternativa. Sem plugin configurado, o bloco permanece explicitamente bloqueado.

---

## 7. O Motor de Execução (Execution Engine)

O orquestrador do sistema funciona em modelo de **Máquina de Estados Concorrente**:

1. Lê o JSON do Método do Canal para o processo atual.
2. Executa os blocos sequencialmente injetando as saídas do bloco anterior no bloco seguinte.
3. **Pausa e Retomada para Operador Humano**: Se um bloco for atribuído ao operador `Humano`, o motor pausa o estado da execução (`awaiting_human`), gera uma notificação e um cartão interativo no Projeto, e aguarda a entrega ou seleção do usuário para continuar a esteira.
4. **Execução por plugin**: Blocos `IA` e `Código` entram em `blocked_executor` até o usuário disparar o plugin compatível configurado. O servidor resolve as entradas, executa plugins oficiais incluídos em um processo separado, valida a resposta, persiste os valores no snapshot do bloco e ativa a próxima etapa.
5. **Bloqueio de executores ausentes**: Blocos sem plugin compatível permanecem em `blocked_executor`. Eles nunca são concluídos de forma fictícia.

Os métodos permanecem lineares: não existem ramificações, junções, paralelismo ou loops genéricos no canvas. Uma entrada pode apontar explicitamente para a saída de qualquer bloco anterior ou processo universal anterior, e um bloco pode declarar várias entradas.

Todo bloco `VALIDAR` referencia um bloco anterior específico e opera em um de três modos: aprovar ou reprovar, escolher uma opção, ou escolher várias opções. Uma reprovação pode pausar a execução ou solicitar uma nova tentativa do bloco validado. Nesse último caso, o motor invalida e executa novamente o trecho linear entre o bloco-alvo e a validação, preservando o feedback da reprovação como contexto da nova tentativa e respeitando o limite configurado. Uma escolha concluída torna-se uma saída tipada do próprio bloco `VALIDAR`, disponível para os blocos seguintes.

Cada execução mantém um snapshot do Método utilizado, o estado individual dos blocos, rascunhos, entregas concluídas e referências a arquivos armazenados localmente. As saídas concluídas tornam-se contexto para os blocos seguintes.

A página do processo mantém um painel expansível de resultados concluídos. Cada valor é apresentado conforme seu formato: textos e listas, registros em tabela, datas localizadas, links clicáveis, imagens, players de áudio e vídeo, arquivos, layouts 16:9, valores booleanos e decisões de aprovação ou reprovação.

---

## 8. Ecossistema e Compartilhamento

O ContentFlow OS apoia-se em dois tipos de compartilhamento comunitário:

1. **Templates de Métodos (Caixa-Aberta)**: Exportação e importação de sequências de blocos com prompts e regras prontas via código/link. Ao importar, o sistema detecta e instala os plugins necessários na conta do usuário de forma transparente.
2. **Plugins de Código Aberto & Webhooks**: Suporte a plugins comunitários hospedados no GitHub ou via conexões HTTP Webhook (n8n/Make/FastAPI).

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

A Biblioteca Estratégica é diferente da Biblioteca de Métodos: a primeira contém peças utilizadas dentro das ações; a segunda permite reutilizar sequências completas de ações entre canais.

Além dos campos simples, uma coleção pode usar o formato especializado `Layout de thumbnail`. Cada item desse tipo armazena uma composição 16:9 criada no canvas visual, com caixas posicionadas em coordenadas percentuais. O mesmo formato faz parte do contrato universal de blocos, portanto o layout escolhido pode atravessar conexões tipadas e orientar um plugin de montagem programática sem perder sua estrutura.

---

## 11. Resultados Intermediários e Outputs Universais

Cada bloco pode produzir resultados intermediários tipados. Eles pertencem exclusivamente à execução do Projeto, são persistidos no snapshot da execução e ficam disponíveis como contexto para blocos posteriores.

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

Os outputs concluídos dos processos anteriores são injetados automaticamente como contexto nos processos seguintes.

---

## 12. Protocolo de Plugins

O contrato técnico está documentado em [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md), o guia prático em [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md), os requisitos do executor em [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md), os requisitos futuros para automação autorizada de interfaces web em [`PLUGIN_BROWSER_AUTOMATION.md`](PLUGIN_BROWSER_AUTOMATION.md), a governança do catálogo em [`PLUGIN_ECOSYSTEM.md`](PLUGIN_ECOSYSTEM.md) e a ordem estratégica de implementação em [`PLUGIN_ROADMAP.md`](PLUGIN_ROADMAP.md). Plugins recebem contexto controlado do motor e nunca acessam diretamente o banco local. Plugins oficiais são confiáveis pelo núcleo; plugins locais e comunitários exigem consentimento local e executam na sandbox de permissões em processo separado.

A arquitetura não possui aprovação central: qualquer pessoa pode criar e compartilhar um plugin, inclusive por arquivo ou repositório, e qualquer usuário pode instalá-lo e autorizá-lo localmente. O núcleo aplica validações automáticas e pede consentimento para permissões; revisão humana do mantenedor existe apenas para selo `official`/`verified` ou publicação em catálogo opcional.

Uma capacidade de plugin pode ser internamente complexa e demorada. Ela pode pesquisar, chamar várias APIs, usar uma sessão conectada pelo usuário, gerar centenas de arquivos, manter checkpoints ou renderizar durante horas, desde que sua interface externa continue sendo a entrega daquele bloco. Pastas de trabalho escolhidas pelo usuário podem ser montadas como raízes autorizadas; artifacts preservam IDs, ordem e proveniência para que plugins posteriores encontrem cada arquivo sem depender de caminhos frágeis gravados no Método.

O plugin oficial `OpenAI Models` usa a Responses API e pode operar ações baseadas em linguagem nos quatro Blocos Essenciais e nos oito Processos Universais. Depois da conexão local, o servidor consulta `GET /v1/models` com a chave da sessão e o construtor substitui o catálogo de fallback pelos modelos de linguagem realmente disponíveis nessa conta. Os parâmetros declarados em `blockConfigSchema` aparecem imediatamente após a vinculação do plugin ao bloco. Modelos especializados de imagem, áudio, vídeo, transcrição ou embeddings continuam exigindo plugins próprios, pois usam contratos de mídia e APIs diferentes de um LLM com saída textual.

O plugin oficial `Anthropic Claude` mantém o mesmo contrato de linguagem pela Messages API. A chave é protegida pelo cofre nativo do sistema operacional, `GET /v1/models` fornece o catálogo disponível para a conta e blocos `BUSCAR` podem usar a ferramenta de pesquisa web declarada pela Anthropic. A integração é mantida pelo ContentFlow OS e não implica endosso do provedor.

---

## 13. Layouts Programáticos de Thumbnail

O núcleo preserva um canvas de composição visual para a futura Biblioteca de Layouts de Thumbnail. Cada layout descreve caixas, posições, dimensões, ordem de camadas e cores em coordenadas relativas a um quadro 16:9.

Esse canvas é infraestrutura intencional, mesmo enquanto ainda não estiver exposto na navegação principal. Plugins de operador `Código` poderão consumir esses layouts para posicionar textos, pessoas, objetos e demais elementos durante a montagem programática de thumbnails. Ele não deve ser tratado como código legado ou removido apenas por ainda não possuir uma tela pública.

---

## 14. Distribuição desktop V0

A distribuição Windows empacota a interface em Electron e inicia a API como processo filho com uma cópia privada do Node 26. Usuários finais não precisam instalar Node, npm ou abrir terminal. O processo Electron hospeda apenas a janela e os arquivos da interface; o runtime privado preserva para a API e para plugins comunitários o modelo de permissões documentado em [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).

O programa instalado é substituível e os dados persistentes permanecem em `%APPDATA%\ContentFlow OS\data`. Plugins instalados e vínculos de desenvolvimento também vivem nessa área. Exemplos editáveis são copiados na primeira abertura para `Documentos\ContentFlow OS\Plugins`. Essa separação permite recompilar e reinstalar o núcleo sem apagar projetos, credenciais ou plugins do usuário.
