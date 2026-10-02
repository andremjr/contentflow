# Google Flow Browser Images — ContentFlow

Versão **1.3.8**.

Plugin avançado de geração de imagens e vídeos no Google Flow através do Chrome dedicado com perfil persistente. O plugin delega ao ContentFlow a ordem, a identidade e a persistência dos itens da fila, preservando a sessão do navegador entre as invocações:

- **Geração de Imagens** com Nano Banana 2, Nano Banana Pro, modelos adicionais pelo rótulo visível do Flow e proporções (16:9, 4:3, 1:1, 3:4, 9:16).
- **Animação de Imagens (Image-to-Video)** com Veo 3.1 (Quality, Fast, Lite) e Omni 1.1 Flash.
- **Geração Direta de Vídeo (Text-to-Video)** com modelos selecionáveis, referências visuais, modo Frame/Elemento, duração, proporção e resolução.
- **Fila orquestrada pelo núcleo:** as capabilities de geração e animação recebem coleções no bloco, mas o ContentFlow invoca o plugin com um item por vez e persiste cada resultado antes de avançar.
- **Retomada sem duplicação:** IDs, cursor e itens concluídos pertencem ao ContentFlow; checkpoints locais permanecem apenas como apoio para reconciliação de efeitos externos incertos.
- **Navegador reutilizado:** o Chrome, o perfil e a aba do Flow permanecem abertos entre os itens; apenas a conexão técnica CDP/Browser Bridge é renovada quando necessário.
- **Continuidade de Projeto e Chat (`project_url`)** para encadeamento de múltiplos blocos no Método preservando personagens, galeria e histórico.
- **Produção visual em lote:** gera todas as imagens de uma lista ordenada de cenas e anima somente a quantidade escolhida, sem exigir que o Método crie um bloco por cena.
- **Intervenção humana segura**: login, reautenticação e CAPTCHA permanecem visíveis para conclusão manual, sem tentativa de contornar as proteções do provedor.

## Capacidades Disponíveis no Método

### 1. `produce-visual-assets-in-browser` (Produção visual em lote)

- **Operador:** IA | **Bloco:** CRIAR | **Processo:** `assets`
- **Entradas:** `prompts` (cenas, obrigatório), `character_prompts` (referências de personagem a gerar, opcional), `animation_prompts` (movimento/câmera, opcional), `reference_images` (personagem, produto, cenário e estilo, opcional) e `project_url` (opcional).
- **Modo de produção:** escolha diretamente entre somente imagens, texto para vídeo, imagens com algumas animações ou imagens com todas as animações. A tela mostra apenas os controles relevantes ao modo escolhido.
- **Fluxo de imagens:** o ContentFlow entrega cada prompt com `batch.itemId`, índice e total; o plugin produz a imagem e a animação selecionada daquele item antes de devolver o controle ao núcleo.
- **Orçamento de vídeo:** `maxVideosToAnimate` permite gerar, por exemplo, 300 imagens e animar apenas 3; `0` entrega somente imagens.
- **Seleção:** primeiras, últimas, distribuídas pela fila ou índices manuais (por exemplo, `1, 7, 10-14`).
- **Retenção:** salva todas as imagens, somente as animadas, ou apenas os vídeos na entrega final. As imagens continuam disponíveis ao plugin durante a animação mesmo quando não forem entregues à etapa de edição.
- **Consistência de personagens:** `character_prompts` gera referências antes das cenas. Defina quantas entram nas cenas e se elas também devem ser preservadas como entrega para outros blocos.

### 2. `generate-images-in-browser` (Geração de Imagens)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `thumbnail`, `assets`
- **Entradas:** `prompts` (obrigatório), `reference_images` (opcional), `project_url` (opcional).
- **Saídas:** `images` (imagem única ou galeria de imagens JPEG do Flow), `project_url` (URL do projeto ativo).
- **Modelos:** Automático do Flow, Nano Banana 2, Nano Banana Pro (com fallback inteligente).
- **Proporções:** Atual do Flow, 16:9, 4:3, 1:1, 3:4 e 9:16.

### 3. `animate-image-in-browser` (Animar Imagem / Image-to-Video)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `assets`, `editing`
- **Entradas:** `images` (uma imagem ou coleção selecionada para animar), `prompts` (instrução opcional de movimento/câmera), `project_url` (opcional).
- **Saídas:** `video` (arquivo MP4 renderizado em alta definição), `project_url` (URL do projeto ativo).
- **Orquestração:** quando recebe vários arquivos, o núcleo cria uma unidade por imagem, preserva identidade e ordem e consolida os vídeos sem arrays aninhados.
- **Modelos de Vídeo:** Veo 3.1 - Quality, Veo 3.1 - Fast, Veo 3.1 - Lite, Omni 1.1 Flash.
- **Configuração:** modelo predefinido ou rótulo de modelo novo, imagem como Frame/Elemento, duração de 4/6/8/10 s, proporção e resolução (padrão, 720p, 1080p).

### 4. `generate-video-in-browser` (Geração de Vídeo / Text-to-Video)

- **Operador:** IA | **Bloco:** CRIAR | **Processos:** `assets`, `editing`
- **Entradas:** `prompts` (prompts de vídeo com descrição de cena e movimento), `reference_images` (imagens/elementos opcionais), `project_url` (opcional).
- **Saídas:** `video` (arquivo MP4 renderizado), `project_url` (URL do projeto ativo).
- **Modelos de Vídeo:** Veo 3.1 - Quality, Veo 3.1 - Fast, Veo 3.1 - Lite, Omni 1.1 Flash.
- **Configuração:** modelo predefinido ou rótulo de modelo novo, referências como Frames/Elementos, duração de 4/6/8/10 s, proporções 16:9 e 9:16 e resoluções até 1080p.

## Interface declarativa

- A capability composta apresenta os campos nesta ordem: perfil e projeto, modo de produção, parâmetros de imagem, referências e consistência de personagem, parâmetros de vídeo, seleção parcial e retenção dos intermediários.
- A URL do projeto só aparece ao escolher **Usar projeto específico**. Parâmetros exclusivos de imagem ou vídeo aparecem somente nos modos compatíveis, e os índices de animação aparecem somente na seleção manual.
- Nome, descrição, perfil, capabilities, portas, campos e opções estáticas possuem textos em português do Brasil, inglês e espanhol. IDs, aliases, URLs, nomes de modelos e valores salvos não são traduzidos.
- Preferências locais de instalação e diagnóstico permanecem em `settingsSchema`. Os controles técnicos já persistidos no bloco continuam declarados para que Métodos existentes mantenham seus valores e sua semântica.
- Todas as capabilities declaram `promptPreview` sem incluir secrets ou dados reais no manifesto.
- Modelos são opções fixas do manifesto. Abrir ou verificar a configuração não consulta o Flow nem abre Chrome para carregar modelos. Mudanças na ferramenta exigem atualizar a lista no plugin. Os campos de rótulo manual existentes ficam em **Opções avançadas**, preservando configurações salvas.
- Imagens por prompt oferece 1, 2, 3 ou 4 variantes. Concorrência de imagens oferece 1, 2, 3, 4 ou 5 prompts em geração: o próximo envio não espera a imagem anterior terminar. A caixa de prompt e as referências são alteradas sob um lock curto até a captura do ID da requisição; a espera pelo resultado ocorre fora desse lock.
- Em geração concorrente, cada resposta é associada ao ID da requisição reservado pela unidade concedida pelo Core. Resultados fora de ordem são entregues na ordem original. A detecção genérica de imagens novas pelo DOM não participa desse modo; ausência de correlação ou efeito incerto exige reconciliação, sem atribuir mídia de outra unidade nem recarregar uma sessão com gerações em andamento.
- Os modelos de vídeo fixos incluem Veo 3.1 Quality, Fast, Lite, Lite [Lower Priority] e Omni Flash, conforme os rótulos do bundle de referência. IDs técnicos já persistidos continuam válidos.

## Itens, variantes e ações

- Cada prompt preserva a identidade de lote atribuída pelo ContentFlow; a saída neutra `assets` mantém a conclusão atômica mesmo nos modos que produzem somente imagens ou somente vídeos, enquanto cada mídia permanece também na sua porta específica.
- `generate-images-in-browser` aplica `regenerate`, `replace`, `select` e `download` somente em `images`. `animate-image-in-browser` e `generate-video-in-browser` aplicam as mesmas ações somente em `video`.
- `replace`, `select` e `download` são ações locais do ContentFlow. Somente `regenerate` chama novamente o plugin, validando a porta original antes de gerar.
- A capability composta não declara ações globais porque mistura imagens finais, referências de personagem, vídeos e intermediários opcionais. Isso impede que referências ou mídias omitidas recebam ações falsas; use as capabilities atômicas quando precisar manipular itens individualmente.
- Referências de personagem, imagens e animações usam namespaces de artifact distintos. Um timeout posterior ao envio é tratado como efeito externo incerto e não é reenviado automaticamente sem reconciliação.

## Validação real P14

O smoke ao vivo é opt-in e exige um perfil dedicado já preparado:

```powershell
$env:CONTENTFLOW_FLOW_P14_LIVE='1'
$env:CONTENTFLOW_FLOW_P14_PROFILE='flow-e2e'
node ecosystem/plugins/reference/google-flow-browser-images/scripts/p14-live.mjs 'Cinematic city at dawn'
```

- `CONTENTFLOW_FLOW_P14_CAPABILITY` seleciona `generate-images-in-browser`, `animate-image-in-browser`, `generate-video-in-browser` ou `produce-visual-assets-in-browser`.
- `CONTENTFLOW_FLOW_P14_REFERENCE` fornece uma imagem local para geração referenciada ou animação.
- `CONTENTFLOW_FLOW_P14_VARIANTS` e `CONTENTFLOW_FLOW_P14_CONCURRENCY` exercitam variantes e concorrência.
- A capability composta aceita pelos envs do harness: `CONTENTFLOW_FLOW_P14_PRODUCTION_MODE`, `CONTENTFLOW_FLOW_P14_MAX_VIDEOS`, `CONTENTFLOW_FLOW_P14_ANIMATION_SELECTION`, `CONTENTFLOW_FLOW_P14_ANIMATION_INDEXES` e `CONTENTFLOW_FLOW_P14_IMAGE_RETENTION`.
- Para testar retomada, repita `CONTENTFLOW_FLOW_P14_EXECUTION_ID` e `CONTENTFLOW_FLOW_P14_RUN_ROOT`. Artifacts concluídos são reutilizados e não são reenviados.
- `p14-contentflow-live.mjs` executa o mesmo cenário através das APIs locais do ContentFlow e permite configurar `CONTENTFLOW_FLOW_P14_FALLBACK_PROFILE`.

O fallback entre perfis nunca herda projeto ou estado de upload da conta anterior. Dentro da mesma conta, as fases de imagem e vídeo da capability composta continuam no projeto criado pela primeira fase. O relatório reproduzível e os hashes estão em `docs/ecosystem/asset-generation-evidence/P14.md`.

## Continuidade de Projeto e Chat (`project_url`)

Para fluxos complexos em que um bloco cria os personagens ou elementos visuais e blocos seguintes precisam utilizá-los como referência consistente ou animá-los:

1. O primeiro bloco executa a geração e entrega em `project_url` o link permanente da sala criada no Google Flow (ex: `https://flow.google.com/project/abc-123`).
2. Os blocos seguintes conectam essa `project_url` na sua porta de entrada `project_url`.
3. O plugin detecta a URL fixada, navega diretamente para o chat do projeto existente e reaproveita todo o histórico e elementos já enviados, sem criar novos projetos descartáveis nem perder as referências.

## Login, CAPTCHA e proteção da conta

A versão 1.3.5 mantém o fluxo observável e respeita os controles do Google:

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

## Prompts de texto com referências por cena

Em `generate-images-in-browser`, `promptFormat=json` interpreta cada item de texto como `{"prompt":"...","referenceItemIds":["ID_DO_PERSONAGEM"]}`. Para gerar referências, use textos `{"name":"...","prompt":"..."}` e `referenceMode=shared`. Para cenas, selecione `referenceMode=per_prompt` e forneça as imagens em `reference_images`. O plugin resolve os IDs de imagem ou os IDs dos itens de personagem presentes na linhagem `derived_from`; nunca associa por posição, nome ou arquivo. IDs sem imagem e excesso de referências interrompem a geração. `[]` significa cena sem referências. O modo padrão continua texto direto.

Fluxo recomendado: roteiro → personagens extraídos do roteiro → imagens de referência → prompts das cenas com IDs → cenas consistentes → seleção humana → animação. O ChatGPT Browser Studio pode produzir esses textos usando `textItemFormat=json`, `textItemFields` (campos `string` ou `string[]`) e `textItemReferenceInputs` (campo → porta de entrada que fornece IDs). O JSON permanece conteúdo de texto, sem contrato de registros do Core.

O bundle fornecido foi consultado como referência técnica de seleção de imagens, modelos, proporção, variantes, animação e uso de frames/elementos. Esta implementação adiciona o caminho de referências por IDs ao fluxo automatizado; não afirma implementar todas as funções da extensão nem comprova execução real no serviço.
