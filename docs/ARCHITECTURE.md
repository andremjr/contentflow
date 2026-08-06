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

- Quando o usuário adiciona um Bloco no Método (ex: `CRIAR`), ele seleciona o Operador (ex: `IA`) e o **Plugin** desejado (ex: `OpenAI GPT-4`).
- A interface do Bloco lê o manifesto do Plugin e renderiza automaticamente na tela os campos que AQUELE plugin precisa (ex: `System Prompt`, `Temperatura`, `Modelo`).

### B. Variáveis Dinâmicas do Projeto

Dentro dos campos do plugin no bloco, o usuário insere placeholders dinâmicos (ex: `{{video.topic}}`, `{{block_01.output}}`). Na execução do vídeo, o motor substitui as variáveis pelos valores reais.

### C. Contrato do Operador Humano

O operador `Humano` é um executor nativo e não depende de plugin. Na definição do Método, cada bloco humano guarda:

- Nome e instruções da ação.
- Entradas e contextos provenientes do projeto, da biblioteca do canal, de textos fixos ou de blocos anteriores.
- O esquema das entregas esperadas, incluindo tipo do campo, obrigatoriedade e orientações.

O Método armazena apenas esse esquema. Os valores efetivamente preenchidos pertencem à execução do Projeto/Vídeo e nunca são gravados como parte do Método.

Na primeira versão funcional, métodos compostos integralmente por blocos humanos podem ser executados de ponta a ponta. `IA` e `Código` permanecem disponíveis no modelo e na interface, mas dependem de plugins futuros e devem ficar explicitamente bloqueados enquanto não houver executor configurado.

---

## 7. O Motor de Execução (Execution Engine)

O orquestrador do sistema funciona em modelo de **Máquina de Estados Concorrente**:

1. Lê o JSON do Método do Canal para o processo atual.
2. Executa os blocos sequencialmente injetando as saídas do bloco anterior no bloco seguinte.
3. **Pausa e Retomada para Operador Humano**: Se um bloco for atribuído ao operador `Humano`, o motor pausa o estado da execução (`PENDING_HUMAN_INPUT`), gera uma notificação e um cartão interativo no Projeto, e aguarda o clique/seleção do usuário para continuar a esteira.

Cada execução mantém um snapshot do Método utilizado, o estado individual dos blocos, rascunhos, entregas concluídas e referências a arquivos armazenados localmente. As saídas concluídas tornam-se contexto para os blocos seguintes.

---

## 8. Ecossistema e Compartilhamento

O ContentFlow OS apoia-se em dois tipos de compartilhamento comunitário:

1. **Templates de Métodos (Caixa-Aberta)**: Exportação e importação de sequências de blocos com prompts e regras prontas via código/link. Ao importar, o sistema detecta e instala os plugins necessários na conta do usuário de forma transparente.
2. **Plugins de Código Aberto & Webhooks**: Suporte a plugins comunitários hospedados no GitHub ou via conexões HTTP Webhook (n8n/Make/FastAPI).

---

## 9. Central Global de Pendências Humanas

O aplicativo possui uma central global que lista todo bloco nos estados `awaiting_human` ou `in_progress`, independentemente do canal ou projeto.

- O contador global representa tarefas ainda pendentes, não apenas notificações não lidas.
- Abrir uma notificação marca o aviso como visualizado, mas não elimina a pendência.
- A pendência desaparece somente quando o bloco é concluído, cancelado ou sua execução é removida.
- Cada item informa canal, projeto, Processo Universal, bloco, entrega necessária e tempo de espera.
- O clique direciona para a aba do Processo Universal dentro do Projeto, que é o único local onde a entrega humana é realizada.

A central é uma visão derivada do estado real das execuções; ela não mantém uma cópia independente das tarefas.

---

## 10. Biblioteca Estratégica do Canal

Cada Canal possui uma biblioteca de elementos pré-existentes, como estruturas de título, estilos de thumbnail, modelos narrativos, regras editoriais e critérios de validação. Esses itens podem ser apresentados como contexto ou opções de escolha dentro de blocos humanos, especialmente no bloco `ESCOLHER`.

A Biblioteca Estratégica é diferente da Biblioteca de Métodos: a primeira contém peças utilizadas dentro das ações; a segunda permite reutilizar sequências completas de ações entre canais.
