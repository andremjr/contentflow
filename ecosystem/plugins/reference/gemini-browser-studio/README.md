# Gemini Browser Studio

Versão **1.0.0** para ContentFlow Plugin API v1.

## Contrato simplificado

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. O bloco expõe apenas o perfil da conta, sempre abre uma conversa nova e realiza um único envio por execução. Configurações antigas permanecem aceitas apenas para não quebrar Métodos existentes e são ignoradas.

Super plugin independente que usa a interface web do Gemini em um Google Chrome real com perfil persistente dedicado. Não usa a API oficial do Gemini, não pede chave e não exporta cookies, tokens ou storage.

## Capabilities

- `generate-text-in-browser`: textos, títulos, thumb copy e prompts em uma única chamada.
- `search-web-in-browser`: pesquisa atual solicitada diretamente pelo prompt, sem depender de opção visual, com captura de links citados.
- `choose-library-item-in-browser`: somente IDs reais da Biblioteca Estratégica.
- `validate-content-in-browser`: aprovação, escolha única ou múltipla, inclusive para arquivos.
- `analyze-images-in-browser`: visão computacional com múltiplas imagens.
- `analyze-documents-in-browser`: resumo, extração e comparação de documentos.
- `generate-image-in-browser`: **Criar imagem** com importação como artifact `image`.
- `generate-music-in-browser`: **Criar música** com importação como artifact `audio`.

O plugin reconhece os modos atualmente expostos pelo Gemini: 3.5 Flash Lite, 3.6 Flash, 3.1 Pro e Raciocínio complexo. Se o modelo ou ferramenta não existir no plano, a execução retorna `PERMISSION_DENIED` e não troca silenciosamente de modo.

## Roteiros iterativos

Cada execução começa em uma nova conversa e faz um único envio. A saída opcional `parts`, quando conectada por um Método antigo, contém somente essa resposta.

Também existem `single`, `legacy_script_3_parts` e `custom_parts`, separados por `---PARTE---`.

## Perfis dedicados por canal

Todas as oito capabilities possuem `accountProfile`. Configure aliases estáveis no Método de cada canal:

```text
canal-a → <workspace-do-plugin>/canal-a
canal-b → <workspace-do-plugin>/canal-b
canal-c → <workspace-do-plugin>/canal-c
```

Cada alias recebe pasta Chrome, login, histórico e porta CDP próprios. Assim, a estratégia e o contexto de um canal não contaminam outro. Antes da primeira execução, use **Salvar perfil** no construtor do Método, conclua o login na janela visível e aguarde o navegador fechar. Perfis não preparados são recusados antes de qualquer prompt ser digitado.

Para reutilizar uma pasta Chrome escolhida explicitamente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`; o isolamento dedicado permanece como padrão. Feche qualquer Chrome que já esteja usando o perfil. A espera de respostas combina `MutationObserver`, polling de segurança e timeout máximo; em execução normal, preenchimento e cliques passam pela ContentFlow Browser Bridge v2, sem mouse, teclado, clipboard ou foco de janela via CDP.

Não existe rotação automática de contas. Cota, CAPTCHA, upgrade, reautenticação ou bloqueio pausam a operação para intervenção manual.

## Anexos e artifacts

Somente `StoredFile` liberado pelo núcleo é aceito, sempre por `resolveInputFile()`. O plugin rejeita caminhos arbitrários, traversal e formatos não permitidos.

Imagens: JPEG, PNG, GIF e WebP. Documentos: PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON, XLSX e PPTX. Limite do plugin: 20 arquivos e 512 MB por arquivo, sem substituir limites menores da conta.

Imagem e música geradas são recuperadas pela própria sessão autenticada, gravadas somente em `getOutputPath()` e devolvidas como artifacts. O Gemini entrega música em contêiner MP4; o plugin normaliza a faixa para `audio/mp4` com extensão `.m4a`. Base64 e caminhos locais nunca aparecem nos outputs.

## Instalação

1. Abra **Plugins** no ContentFlow.
2. Escolha **Usar pasta ao vivo**.
3. Selecione esta pasta.
4. No perfil Chrome dedicado, carregue manualmente `ecosystem/browser-bridge` em `chrome://extensions` e conclua o login.
5. Revise `network`, `filesystem:read`, `filesystem:write` e `process`.
6. Vincule a capability desejada ao bloco.

`network` acessa `gemini.google.com` e mídia Google; `process` inicia o Chrome dedicado; as permissões de arquivo operam somente nas raízes concedidas pelo núcleo.

## Dados, efeitos e custo

- Provedor: Google / Gemini web.
- Dados enviados: instrução do bloco, contexto e anexos conectados.
- Efeitos: criação de conversas, pesquisas e geração de mídia quando configurada.
- Custo/cota: dependem da conta e do plano Gemini.
- Logs: etapas, contagens, tamanhos e hashes curtos; nunca conteúdo, cookies ou tokens.

Drive, Canvas, Notebooks, Aprendizado Guiado, compartilhamento, billing, upgrade, exclusão e configurações de conta foram mapeados, mas não automatizados. São superfícies persistentes ou interativas fora do contrato atômico do bloco e ampliariam permissões sem necessidade.

## Validação

```powershell
npm run plugin:kit -- check ./ecosystem/plugins/reference/gemini-browser-studio
node --test ./ecosystem/plugins/reference/gemini-browser-studio/test.mjs
```

`diagnosticMockResponse` testa caminhos textuais sem navegador. Imagem e música exigem teste real para produzir artifacts.

Em 20/08/2026, a interface real foi validada com pesquisa com fonte clicável, imagem de 1024×559 e música instrumental de 1:01. Os seletores e formatos do handler foram ajustados aos elementos reais observados.

## Revogação

Saia da conta na janela Chrome dedicada. Para remover uma sessão, exclua manualmente apenas a pasta do alias correspondente dentro da pasta de trabalho conectada ao plugin. Outputs já promovidos permanecem no ContentFlow.
