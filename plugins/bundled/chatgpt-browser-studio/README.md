# ChatGPT Browser Studio

Versão **0.1.17** para ContentFlow OS Plugin API v1.

Super plugin independente que usa a interface web do ChatGPT em um Google Chrome real com perfil persistente dedicado. Não usa a API oficial da OpenAI, não solicita chave de API e nunca exporta cookies, tokens ou storage da sessão.

## Capabilities

- `generate-text-in-browser` (`CRIAR`): títulos, textos de thumbnail, roteiros, prompts de assets e qualquer texto. Suporta uma resposta, roteiro legado em três partes, outline dinâmica de até 32 itens e partes personalizadas.
- `search-web-in-browser` (`BUSCAR`): ativa **Search the web**, captura o texto e as URLs citadas.
- `deep-research-in-browser` (`BUSCAR`): ativa **Deep research** quando o recurso existe na conta; se o plano não oferecer, retorna `PERMISSION_DENIED` sem improvisar uma pesquisa comum.
- `choose-library-item-in-browser` (`ESCOLHER`): devolve somente o ID exato de um item real da coleção estratégica.
- `validate-content-in-browser` (`VALIDAR`): aprovação/reprovação, escolha única ou múltipla; aceita também imagens e documentos.
- `analyze-images-in-browser` (`CRIAR`): visão computacional com uma ou várias imagens.
- `analyze-documents-in-browser` (`CRIAR`): resumo, extração, comparação e transformação de documentos.
- `generate-image-in-browser` (`CRIAR`): ativa **Create an image**, captura a imagem resultante e a importa como artifact local tipado `image`.

Todas as capabilities textuais podem operar nos oito Processos Universais. A geração de imagens é exposta somente em Thumbnail e Assets Visuais.

## Roteiros e conversas iterativas

Cada execução começa em um novo chat. Todas as etapas de uma execução permanecem na mesma conversa. No modo `outline_sequence`, uma outline com 8 itens produz 8 envios; uma outline com 12 itens produz 12 envios.

A saída obrigatória `result` une as respostas. A saída opcional `parts` preserva cada resposta individual, na ordem em que foi capturada.

Templates de outline aceitam `{{PROMPT_BASE}}`, `{{BLOCK}}`, `{{BLOCK_JSON}}`, `{{BLOCK_NUMBER}}`, `{{BLOCK_TOTAL}}`, `{{IS_FIRST}}` e `{{IS_LAST}}`.

## Contas por canal

Cada bloco possui `accountProfile`. Use aliases como `canal-a`, `canal-b` e `canal-c`. O plugin mantém cada alias em uma subpasta da pasta de trabalho autorizada do plugin:

```text
<workspace-do-plugin>/canal-a
<workspace-do-plugin>/canal-b
<workspace-do-plugin>/canal-c
```

Depois de informar um alias no construtor do Método, use **Salvar perfil**. O Chrome dedicado abre para o login, o plugin aguarda a área real do ChatGPT, grava a validação no próprio perfil e fecha o navegador. A execução normal recusa perfis ainda não preparados e não digita prompts em páginas de login, CAPTCHA ou reautenticação.

Por padrão, o perfil continua dedicado. Para reutilizar uma pasta Chrome escolhida conscientemente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`. Feche outras instâncias que estejam usando o mesmo perfil antes de preparar ou executar.

A espera de respostas combina `MutationObserver` com o polling anterior como watchdog e mantém o timeout máximo. O envio usa mouse/teclado via CDP, confirma o texto lido pelo editor e só recorre à digitação caractere a caractere quando a inserção rápida não é preservada integralmente.

## Anexos e artifacts

O plugin aceita somente `StoredFile` liberado pelo núcleo e resolve cada entrada por `services.resolveInputFile()`. Caminhos arbitrários e URLs remotas não substituem arquivos autorizados.

São aceitos até 20 anexos por conversa e até 512 MB por arquivo, sujeitos aos limites menores da conta e do contexto. Imagens: JPEG, PNG, GIF e WebP. Documentos: PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON, XLSX e PPTX.

Na geração de imagem, os bytes são recuperados pela própria sessão autenticada, gravados somente na pasta temporária retornada por `getOutputPath()` e promovidos pelo núcleo como artifact. Base64, caminhos locais e cookies não aparecem no output.

## Instalação

1. Abra **Plugins** no ContentFlow OS.
2. Escolha **Usar pasta ao vivo**.
3. Selecione esta pasta.
4. Revise `network`, `filesystem:read`, `filesystem:write` e `process`.
5. Vincule a capability desejada ao bloco correspondente.

O Chrome abre em `https://chatgpt.com/`. A permissão `process` inicia esse Chrome dedicado; `network` acessa o ChatGPT; `filesystem:read` alcança apenas arquivos liberados; `filesystem:write` produz artifacts e mantém o workspace autorizado.

## Dados, efeitos e custos

- Provedor: OpenAI / ChatGPT web.
- Dados transmitidos: prompts, contexto do bloco, continuações e anexos explicitamente conectados.
- Efeitos: criação de conversas e mensagens; pesquisa externa quando escolhida; geração de imagem quando escolhida.
- Custos e cotas: dependem do plano da conta ChatGPT.
- Logs: somente etapas, contagens, tamanhos e hashes curtos; nunca prompts, respostas, cookies ou tokens.

Projetos, compartilhamento, conectores, plugins de terceiros, voz, billing, mudança de plano, exclusão de chats e publicação externa não são automatizados. Esses recursos ampliariam permissões ou efeitos sem pertencer ao contrato editorial dos blocos.

## Validação

Na raiz do ContentFlow OS:

```powershell
npm run plugin:kit -- check ./plugins/bundled/chatgpt-browser-studio
node --test ./plugins/bundled/chatgpt-browser-studio/test.mjs
```

`diagnosticMockResponse` valida as capabilities textuais sem abrir o navegador. A geração de imagem exige teste real porque precisa produzir um artifact.

Em 20/08/2026, a interface real foi validada com: dois prompts consecutivos na mesma conversa, recuperação correta do contexto, pesquisa web com fonte clicável e criação de imagem. A imagem de teste foi identificada pelo elemento visual real em `chatgpt.com`, com 1254×1254 pixels; o handler usa esse mesmo caminho autenticado para importar os bytes como artifact.

## Revogação

Saia da conta na janela Chrome dedicada e, se desejar remover a sessão, exclua manualmente somente a pasta do alias dentro da pasta de trabalho conectada ao plugin. Remover o plugin não apaga outputs já promovidos pelo ContentFlow OS.

## Perfis de fallback

`fallbackAccountProfiles` aceita aliases adicionais, um por linha e em ordem. Cada alias deve ser salvo separadamente. O núcleo troca de perfil somente em falhas técnicas transitórias; CAPTCHA, autenticação, limite, cota e bloqueio pausam a execução.
