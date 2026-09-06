# Google Flow Browser Images — ContentFlow

Versão **1.3.1**.

Plugin avançado de geração de imagens e vídeos no Google Flow através do Chrome dedicado com perfil persistente. A versão 1.3.1 expande as capacidades para suportar o ecossistema completo de criação do Google Flow:

- **Geração de Imagens** com Nano Banana 2, Nano Banana Pro e proporções (16:9, 9:16, 1:1).
- **Animação de Imagens (Image-to-Video)** com Veo 3.1 (Quality, Fast, Lite) e Omni 1.1 Flash.
- **Geração Direta de Vídeo (Text-to-Video)** com Veo 3.1.
- **Continuidade de Projeto e Chat (`project_url`)** para encadeamento de múltiplos blocos no Método preservando personagens, galeria e histórico.
- **Intervenção humana segura**: login, reautenticação e CAPTCHA permanecem visíveis para conclusão manual, sem tentativa de contornar as proteções do provedor.

## Capacidades Disponíveis no Método

### 1. `generate-images-in-browser` (Geração de Imagens)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `thumbnail`, `assets`
- **Entradas:** `prompts` (obrigatório), `reference_images` (opcional), `project_url` (opcional).
- **Saídas:** `images` (imagem única ou galeria de imagens JPEG do Flow), `project_url` (URL do projeto ativo).
- **Modelos:** Automático do Flow, Nano Banana 2, Nano Banana Pro (com fallback inteligente).
- **Proporções:** Atual do Flow, Paisagem (16:9), Retrato (9:16), Quadrada (1:1).

### 2. `animate-image-in-browser` (Animar Imagem / Image-to-Video)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `assets`, `editing`
- **Entradas:** `images` (imagem base para animar), `prompts` (instrução opcional de movimento/câmera), `project_url` (opcional).
- **Saídas:** `video` (arquivo MP4 renderizado em alta definição), `project_url` (URL do projeto ativo).
- **Modelos de Vídeo:** Veo 3.1 - Quality, Veo 3.1 - Fast, Veo 3.1 - Lite, Omni 1.1 Flash.
- **Resoluções:** Padrão do Flow, 720p, 1080p.

### 3. `generate-video-in-browser` (Geração de Vídeo / Text-to-Video)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `assets`, `editing`
- **Entradas:** `prompts` (prompts de vídeo com descrição de cena e movimento), `project_url` (opcional).
- **Saídas:** `video` (arquivo MP4 renderizado), `project_url` (URL do projeto ativo).
- **Modelos de Vídeo:** Veo 3.1 - Quality, Veo 3.1 - Fast, Veo 3.1 - Lite, Omni 1.1 Flash.
- **Proporções e Resoluções:** 16:9, 9:16, 1:1 e resoluções até 1080p.

## Continuidade de Projeto e Chat (`project_url`)

Para fluxos complexos em que um bloco cria os personagens ou elementos visuais e blocos seguintes precisam utilizá-los como referência consistente ou animá-los:

1. O primeiro bloco executa a geração e entrega em `project_url` o link permanente da sala criada no Google Flow (ex: `https://flow.google.com/project/abc-123`).
2. Os blocos seguintes conectam essa `project_url` na sua porta de entrada `project_url`.
3. O plugin detecta a URL fixada, navega diretamente para o chat do projeto existente e reaproveita todo o histórico e elementos já enviados, sem criar novos projetos descartáveis nem perder as referências.

## Login, CAPTCHA e proteção da conta

A versão 1.3.1 mantém o fluxo observável e respeita os controles do Google:

1. **Janela acessível:** `startMinimized` é `true` por padrão, mas o Chrome dedicado nunca roda em modo headless e continua acessível pela barra de tarefas.
2. **Intervenção manual:** quando o Google solicitar login, reautenticação ou CAPTCHA, o plugin aguarda a conclusão pelo usuário na janela do Chrome.
3. **Intervalo entre prompts:** `delayBetweenPromptsMs` (padrão 6000 ms) reduz envios consecutivos acidentais.
4. **Interação pela interface:** modelo, formato e cliques são acionados nos controles visíveis por meio da ContentFlow Browser Bridge; o plugin não altera o corpo da requisição de geração.

## Instalação da Extensão Companheira

Cada perfil dedicado do Chrome precisa receber a extensão ContentFlow Browser Bridge uma única vez:

1. Mantenha a pasta `ecosystem/browser-bridge` do repositório em um local definitivo.
2. No bloco do Método, informe o nome do perfil (ex: `default` ou `canal_01`) e clique em **Adicionar conta**.
3. Na janela do Chrome que abrir, acesse `chrome://extensions`.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação** e selecione a pasta `ecosystem/browser-bridge`.
6. Volte à aba do Google Flow, conclua o login da sua conta Google e deixe carregar a interface inicial.

## Validação e Testes

Execute os testes de unidade e sandbox de contratos:

```bash
node test.mjs
npm run plugin:kit -- check ecosystem/plugins/reference/google-flow-browser-images
npm run plugin:kit -- test-contract ecosystem/plugins/reference/google-flow-browser-images
npm run plugin:kit -- test-sandbox ecosystem/plugins/reference/google-flow-browser-images
```
