# Claude Browser Studio

Versão **1.0.3** para ContentFlow Plugin API v1.

Plugin independente para ContentFlow que converte a lógica operacional de `gerar_roteiros.py` e `extrair_cookies_chrome.py` em seis capabilities pela interface web do Claude: texto/roteiros, pesquisa, escolha, validação, visão e análise de documentos.

Ele não usa a API oficial da Anthropic. O plugin abre um Google Chrome real com perfil persistente dedicado, inicia uma conversa nova, faz um único envio e lê a resposta visível do Claude. Cookies e tokens permanecem sob controle do Chrome e nunca são exportados para TXT, manifesto, logs, outputs ou artifacts.

## Contrato simplificado

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. No Método, ele expõe apenas o perfil da conta. Configurações antigas de templates, modos, partes, retries e fallback continuam aceitas silenciosamente para não quebrar Métodos salvos, mas são ignoradas.

## Mudança de segurança na autenticação

O antigo extrator Selenium gravava cookies de sessão e o gerador chamava endpoints internos de `claude.ai`. O plugin substitui somente essa fronteira: usa a interface real e um perfil Chrome dedicado, no mesmo padrão operacional do plugin Google Flow Browser Images.

Não há rotação automática de contas. Limite de uso, cobrança, reautenticação, verificação e CAPTCHA pausam a operação para intervenção manual. O plugin não tenta contornar controles do provedor.

## Instalação

1. No ContentFlow, abra **Plugins**.
2. Escolha **Usar pasta ao vivo**.
3. Selecione a pasta que contém este `README.md` e `contentflow.plugin.json`.
4. No perfil Chrome dedicado, carregue manualmente `ecosystem/browser-bridge` em `chrome://extensions` e conclua o login.
5. Revise e conceda `network`, `filesystem:read`, `filesystem:write` e `process`. A leitura alcança somente arquivos liberados pelo núcleo.
6. Vincule a capability correspondente ao bloco `BUSCAR`, `ESCOLHER`, `CRIAR` ou `VALIDAR`.

Depois de informar o perfil no construtor do Método, use **Salvar perfil**. O Chrome dedicado abre em `https://claude.ai/new`, aguarda o login e fecha depois que a área real do chat for validada.

Por padrão, o perfil continua dedicado. Para reutilizar uma pasta Chrome escolhida conscientemente, configure `profilePath` ou `profilesBasePath` e ative `allowExistingChromeProfile`. Feche outras instâncias que estejam usando o mesmo perfil antes de preparar ou executar.

A espera de respostas combina `MutationObserver` com polling de segurança e timeout máximo. Em execução normal, preenchimento e cliques passam pela ContentFlow Browser Bridge v2, sem mouse, teclado ou foco de janela via CDP.

## Capabilities

### Buscar — `search-web-in-browser`

- Solicita a pesquisa diretamente no prompt, sem depender da opção visual **Web search** ou do menu de ferramentas.
- Recebe `query` e `context`.
- Devolve `result` em texto longo e `sources` como lista de URLs capturadas da resposta.
- A instrução explícita do prompt determina a pesquisa; mudanças no atalho visual não bloqueiam o envio.

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

## Execução

Cada bloco realiza um único envio. A instrução define a tarefa e o contexto das entradas é anexado automaticamente. A saída opcional `parts`, quando ainda conectada por um Método antigo, contém somente a resposta dessa chamada.

## Segurança e dados

- Provedor: Anthropic / Claude web.
- Dados enviados: instrução do bloco, contexto conectado e anexos autorizados.
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
npm run plugin:kit -- check ./ecosystem/plugins/reference/claude-browser-text
```

Teste unitário isolado:

```powershell
node --test ./ecosystem/plugins/reference/claude-browser-text/test.mjs
```

`diagnosticMockResponse` existe apenas para o teste local do contrato e não abre o navegador quando preenchido.

Em 20/08/2026, o fluxo real foi validado na interface web do Claude. A versão 1.0.0 passa a iniciar uma conversa nova e enviar somente a instrução resolvida com o contexto conectado.

## Limitações conhecidas

- A automação depende da interface web do Claude e pode exigir atualização se labels ou estrutura mudarem.
- O Chrome precisa estar instalado.
- Login, reautenticação, CAPTCHA e escolha de plano são sempre manuais.
- Uma execução cria uma conversa nova e faz um único envio.
- O plugin tenta iniciar cada execução pelo link visível **New** do Claude e usa `https://claude.ai/new` como fallback determinístico.
- Cada conversa aceita no máximo 20 anexos e 500 MB por arquivo; limites adicionais do plano/contexto continuam valendo.
- O plugin mapeia, mas não automatiza billing, mudança de plano, conectores, plugins de terceiros, compartilhamento, microfone ou captura da tela. Esses recursos ampliariam dados e permissões sem necessidade para os blocos do ContentFlow.
- A criação de arquivos pelo ambiente de código do Claude não é importada como artifact nesta versão; o foco do plugin é produzir texto e analisar entradas autorizadas.
- Os scripts Python originais não são alterados nem apagados.
