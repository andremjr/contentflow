# Claude Browser Studio

Versão **0.4.0** para ContentFlow Plugin API v1.

Plugin independente para ContentFlow que converte a lógica operacional de `gerar_roteiros.py` e `extrair_cookies_chrome.py` em seis capabilities pela interface web do Claude: texto/roteiros, pesquisa, escolha, validação, visão e análise de documentos.

Ele não usa a API oficial da Anthropic. O plugin abre um Google Chrome real com perfil persistente dedicado, mantém a conversa entre as partes da mesma geração e lê a resposta visível do Claude. Cookies e tokens permanecem sob controle do Chrome e nunca são exportados para TXT, manifesto, logs, outputs ou artifacts.

## O que foi preservado dos scripts

- template de prompt com substituição de `{{TEMA}}` e `{{NICHO}}`;
- placeholders adicionais do ContentFlow para canal, projeto, processo e instruções do bloco;
- geração simples para títulos, textos de thumbnail, prompts de assets e outros textos;
- roteiro legado dividido em três respostas na mesma conversa;
- roteiro orientado por uma porta `outline` (`records` ou `list`), com um bloco de estrutura por resposta;
- outlines de tamanho dinâmico: 8, 12 ou até 32 blocos por execução;
- templates separados e configuráveis para primeiro bloco, blocos intermediários e último bloco;
- partes personalizadas separadas por `---PARTE---`;
- continuidade dentro da mesma conversa;
- intervalo configurável entre partes;
- retries técnicos por parte;
- limpeza de artefatos, código, JSON e títulos Markdown baseada em `limpar_roteiro`;
- validação de tamanho mínimo.

## Mudança de segurança na autenticação

O antigo extrator Selenium gravava cookies de sessão e o gerador chamava endpoints internos de `claude.ai`. O plugin substitui somente essa fronteira: usa a interface real e um perfil Chrome dedicado, no mesmo padrão operacional do plugin Google Flow Browser Images.

Não há rotação automática de contas. Limite de uso, cobrança, reautenticação, verificação e CAPTCHA pausam a operação para intervenção manual. O plugin não tenta contornar controles do provedor.

## Instalação

1. No ContentFlow, abra **Plugins**.
2. Escolha **Usar pasta ao vivo**.
3. Selecione a pasta que contém este `README.md` e `contentflow.plugin.json`.
4. No perfil Chrome dedicado, carregue manualmente `extensions/contentflow-browser-bridge` em `chrome://extensions` e conclua o login.
5. Revise e conceda `network`, `filesystem:read`, `filesystem:write` e `process`. A leitura alcança somente arquivos liberados pelo núcleo.
6. Vincule a capability correspondente ao bloco `BUSCAR`, `ESCOLHER`, `CRIAR` ou `VALIDAR`.

Depois de informar o perfil no construtor do Método, use **Salvar perfil**. O Chrome dedicado abre em `https://claude.ai/new`, aguarda o login e fecha depois que a área real do chat for validada.

Por padrão, o perfil continua dedicado. Para reutilizar uma pasta Chrome escolhida conscientemente, configure `profilePath` ou `profilesBasePath` e ative `allowExistingChromeProfile`. Feche outras instâncias que estejam usando o mesmo perfil antes de preparar ou executar.

A espera de respostas combina `MutationObserver` com polling de segurança e timeout máximo. Em execução normal, preenchimento e cliques passam pela ContentFlow Browser Bridge v2, sem mouse, teclado ou foco de janela via CDP.

## Capabilities

### Buscar — `search-web-in-browser`

- Confirma visualmente a opção **Web search** no menu **Add files, connectors, and more**.
- Recebe `query` e `context`.
- Devolve `result` em texto longo e `sources` como lista de URLs capturadas da resposta.
- Se a conta não mostrar Web search, retorna erro explícito; não improvisa uma pesquisa sem a ferramenta.

### Escolher — `choose-library-item-in-browser`

- Recebe do núcleo somente a coleção estratégica vinculada ao bloco.
- Envia os itens permitidos e o contexto ao Claude.
- Aceita somente o ID exato de um item real da coleção.
- Nunca cria uma opção nova dentro de `ESCOLHER`.

### Criar — `generate-text-in-browser`

- Entrada opcional `content`: briefing, tema, regras, referências e outros valores universais serializáveis.
- Entrada opcional `outline`: `records` ou `list`; cada item dispara uma mensagem e produz uma resposta na mesma conversa.
- Entrada opcional `attachments`: imagens ou documentos usados como referência na primeira mensagem.
- Saída `result`: `textarea` com o texto final unido e, por padrão, limpo.
- Saída opcional `parts`: lista que preserva cada resposta capturada separadamente na mesma conversa.

### Validar — `validate-content-in-browser`

- `approval`: devolve `decision` (`approved` ou `rejected`) e `feedback` opcional.
- `select_one`: devolve o valor original correspondente ao índice escolhido.
- `select_many`: devolve os valores originais correspondentes aos índices escolhidos.
- Reprovação editorial é sucesso tipado; o núcleo decide retry e `onReject`.
- Também aceita imagens e documentos. Em seleção, devolve exatamente o `StoredFile` original escolhido, nunca um caminho local inventado.

### Visão — `analyze-images-in-browser`

- Recebe uma ou várias imagens autorizadas (`JPEG`, `PNG`, `GIF` ou `WebP`).
- Envia os arquivos e um prompt configurável na mesma mensagem.
- Pode descrever cenas, conferir thumbnails, extrair elementos visuais ou comparar referências.
- A saída é texto longo para alimentar qualquer bloco posterior.

### Documentos — `analyze-documents-in-browser`

- Recebe até 20 documentos autorizados nos formatos aceitos pelo Claude: PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON e XLSX.
- Pode resumir, extrair, comparar e transformar conteúdo conforme o prompt do bloco.
- XLSX depende de execução de código/criação de arquivos estar disponível na conta Claude.

As seis capabilities podem ser usadas nos oito Processos Universais. O plugin não cria novos processos, blocos, loops ou regras de execução.

## Múltiplas contas e canais

Cada capability possui a configuração de bloco `accountProfile`. Use um alias simples e estável:

- Método do Canal A: `canal-a`;
- Método do Canal B: `canal-b`;
- Método do Canal C: `canal-c`.

O plugin deriva perfis separados em:

```text
<workspace-do-plugin>/canal-a
<workspace-do-plugin>/canal-b
<workspace-do-plugin>/canal-c
```

Antes da primeira execução com um alias, use **Salvar perfil** no bloco do Método e faça login manualmente na conta Claude daquele canal. Nas execuções seguintes, o Método escolhe a conta pelo alias configurado, sem ler ou exportar cookies. Um perfil não preparado é recusado antes de qualquer prompt ser preenchido.

O ContentFlow v0.3 ainda envia `settings: {}` para plugins comunitários, portanto a página de Plugins não mantém hoje uma lista dinâmica de contas. A escolha por `accountProfile` no bloco é a solução compatível com a API v1 atual e fica naturalmente no nível do Método/canal. `settingsSchema` permanece preparado para um futuro suporte do núcleo a settings persistentes.

## Modos de geração

- `single`: uma mensagem e uma resposta; indicado para título, thumb copy, descrição e prompt de asset.
- `legacy_script_3_parts`: preserva as três instruções do roteiro original.
- `outline_sequence`: conta os itens recebidos em `outline` e envia um bloco da estrutura por mensagem.
- `legacy_script_blocks`: alias de compatibilidade para métodos já montados com a lógica anterior.
- `custom_parts`: usa `customParts`, separando mensagens por uma linha `---PARTE---`.

Todos os modos aceitam `languageInstruction`, `plainTextOnly`, `cleanOutput`, `minCharacters`, `delayBetweenPartsMs` e `retryAttempts`.

No modo `outline_sequence`, configure:

- `outlineFirstPromptTemplate`: primeira mensagem da conversa;
- `outlineNextPromptTemplate`: repetida para cada bloco intermediário;
- `outlineLastPromptTemplate`: usada somente no último bloco para orientar a conclusão.

Esses templates aceitam `{{PROMPT_BASE}}`, `{{BLOCK}}`, `{{BLOCK_JSON}}`, `{{BLOCK_NUMBER}}`, `{{BLOCK_TOTAL}}`, `{{IS_FIRST}}` e `{{IS_LAST}}`. Assim, uma outline de 8 itens gera 8 envios e captura 8 respostas; uma outline de 12 itens faz o mesmo em 12 ciclos, sem mudar o plugin.

## Placeholders

- `{{CONTENT}}` e o legado `{{TEMA}}`;
- `{{CHANNEL_NAME}}`;
- `{{NICHE}}` e o legado `{{NICHO}}`;
- `{{PROJECT_TITLE}}`;
- `{{PROCESS}}`;
- `{{BLOCK_INSTRUCTIONS}}`;
- `{{INPUT:content}}`.

## Segurança e dados

- Provedor: Anthropic / Claude web.
- Dados enviados: prompt, contexto conectado ao bloco e mensagens de continuação.
- Quando uma capability recebe anexos, os arquivos autorizados são enviados ao Claude web. O plugin não aceita caminhos arbitrários nem URLs remotas como substituto de `StoredFile`.
- Efeitos externos: criação de conversa e mensagens na conta Claude conectada.
- Custo: depende do plano e dos limites da conta Claude.
- Pasta-base padrão: workspace interno e autorizado do plugin; uma pasta existente pode ser conectada na Central de Plugins.
- Porta CDP base: `9444`, limitada a `127.0.0.1`; cada alias recebe uma porta derivada estável para permitir perfis separados.
- Logs redigidos não incluem prompts, respostas, cookies ou tokens.

Use aliases dedicados. O plugin rejeita aliases com barras, `..` ou outros caracteres que permitiriam escapar da pasta-base.

## Validação

Na raiz do ContentFlow:

```powershell
npm run plugin:kit -- check ./plugins/bundled/claude-browser-text
```

Teste unitário isolado:

```powershell
node --test ./plugins/bundled/claude-browser-text/test.mjs
```

`diagnosticMockResponse` existe apenas para o teste local do contrato e não abre o navegador quando preenchido.

Em 20/08/2026, o fluxo real foi validado na interface web do Claude com dois prompts consecutivos na mesma conversa. A segunda resposta recuperou corretamente o dado enviado na primeira, e cada resposta permaneceu disponível separadamente para captura.

## Limitações conhecidas

- A automação depende da interface web do Claude e pode exigir atualização se labels ou estrutura mudarem.
- O Chrome precisa estar instalado.
- Login, reautenticação, CAPTCHA e escolha de plano são sempre manuais.
- Uma execução cria uma conversa nova; as partes daquela execução permanecem na mesma conversa.
- O plugin tenta iniciar cada execução pelo link visível **New** do Claude e usa `https://claude.ai/new` como fallback determinístico.
- Cada conversa aceita no máximo 20 anexos e 500 MB por arquivo; limites adicionais do plano/contexto continuam valendo.
- O plugin mapeia, mas não automatiza billing, mudança de plano, conectores, plugins de terceiros, compartilhamento, microfone ou captura da tela. Esses recursos ampliariam dados e permissões sem necessidade para os blocos do ContentFlow.
- A criação de arquivos pelo ambiente de código do Claude não é importada como artifact nesta versão; o foco do plugin é produzir texto e analisar entradas autorizadas.
- Os scripts Python originais não são alterados nem apagados.

## Perfis de fallback

`fallbackAccountProfiles` aceita aliases adicionais, um por linha e em ordem. Cada alias deve ser salvo separadamente. O núcleo troca de perfil somente em falhas técnicas transitórias; CAPTCHA, autenticação, limite, cota e bloqueio pausam a execução.
