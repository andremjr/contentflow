# ChatGPT Browser Studio

Versão **1.0.14** para ContentFlow Plugin API v1.

## Contrato simplificado

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. O bloco expõe apenas o perfil da conta e realiza um único envio por execução. Uma execução comum começa em conversa nova; continuidade e refinamento só reutilizam uma referência opaca autorizada do mesmo plugin, conexão e perfil. Configurações antigas de template, modo, partes, retry e fallback podem permanecer em Métodos salvos para compatibilidade, mas são ignoradas.

Super plugin independente que usa a interface web do ChatGPT em um Google Chrome real com perfil persistente dedicado. Não usa a API oficial da OpenAI, não solicita chave de API e nunca exporta cookies, tokens ou storage da sessão.

## Capabilities

- `generate-text-in-browser` (`CRIAR`): títulos, textos de thumbnail, prompts de assets e qualquer texto em uma única chamada.
- `search-web-in-browser` (`BUSCAR`): solicita a pesquisa diretamente no prompt e captura o texto e as URLs citadas, sem depender de um atalho visual **Search the web**.
- `deep-research-in-browser` (`BUSCAR`): ativa **Deep research** quando o recurso existe na conta; se o plano não oferecer, retorna `PERMISSION_DENIED` sem improvisar uma pesquisa comum.
- `choose-library-item-in-browser` (`ESCOLHER`): devolve somente o ID exato de um item real da coleção estratégica.
- `validate-content-in-browser` (`VALIDAR`): aprovação/reprovação, escolha única ou múltipla; aceita também imagens e documentos.
- `analyze-images-in-browser` (`CRIAR`): visão computacional com uma ou várias imagens.
- `analyze-documents-in-browser` (`CRIAR`): resumo, extração, comparação e transformação de documentos.
- `generate-image-in-browser` (`CRIAR`): ativa **Create an image** e importa progressivamente todas as imagens novas válidas da resposta. A porta `image` preserva a primeira para contratos unitários; a porta `images`, do tipo `files`, entrega a coleção completa. Quando `prompt` recebe uma lista, o núcleo processa um prompt por vez, persiste cada grupo antes do seguinte e achata as variantes na porta plural sem perder a associação ao item do lote. Cada variante oferece `regenerate`, `replace`, `select` e `download`: somente `regenerate` chama novamente o plugin; as demais ações permanecem locais no ContentFlow.

Todas as capabilities textuais podem operar nos oito Processos Universais. A geração de imagens é exposta somente em Thumbnail e Assets Visuais.

## Conversas e respostas

O manifesto anuncia `supportsConversationContinuation`. O handler valida referências `https://chatgpt.com/c/...` recebidas em pedidos explícitos de continuidade: quando a conversa ainda está disponível e pertence à mesma conexão e perfil, envia somente a mensagem de continuação e não reanexa arquivos; quando ela não pode ser reutilizada, abre uma conversa nova, recompõe o contexto de fallback e reanexa apenas os arquivos autorizados fornecidos pelo núcleo.

Na geração inicial de imagens em lote, cada `batch.itemId` abre obrigatoriamente uma conversa nova. Os prompts não compartilham contexto nem comandos. Cada variante guarda apenas uma correlação opaca com a conversa que a produziu. Ao regenerar, essa conversa é reutilizada somente se conexão e perfil ainda coincidirem; caso contrário, uma conversa nova recebe a imagem reprovada como anexo. O artifact inclui o item do lote e a tentativa em sua identidade, e o núcleo usa essas identidades para preservar a posição, o histórico, a proveniência, a retomada e a troca de perfil sem reenviar prompts concluídos. O teto permanece `maxConcurrency: 1`; um cancelamento é observado antes de iniciar o item seguinte.

A saída obrigatória `result` une as respostas. A saída opcional `parts` preserva cada resposta individual, na ordem em que foi capturada.

## Contas por canal

Cada bloco possui `accountProfile`. Use aliases como `canal-a`, `canal-b` e `canal-c`. O plugin mantém cada alias em uma subpasta da pasta de trabalho autorizada do plugin:

```text
<workspace-do-plugin>/canal-a
<workspace-do-plugin>/canal-b
<workspace-do-plugin>/canal-c
```

Depois de informar um alias no construtor do Método, use **Salvar perfil**. O Chrome dedicado abre para o login, o plugin aguarda a área real do ChatGPT, grava a validação no próprio perfil e fecha o navegador. A execução normal recusa perfis ainda não preparados e não digita prompts em páginas de login, CAPTCHA ou reautenticação.

Por padrão, o perfil continua dedicado. Para reutilizar uma pasta Chrome escolhida conscientemente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`. Feche outras instâncias que estejam usando o mesmo perfil antes de preparar ou executar.

A espera de respostas combina `MutationObserver`, sinais fortes de conclusão da interface e polling de segurança. Quando a resposta já terminou, o plugin confirma o texto e o captura imediatamente; o fallback conservador continua protegendo contra fragmentos incompletos. Em execução normal, preenchimento e cliques passam pela ContentFlow Browser Bridge v2, sem mouse, teclado ou foco de janela via CDP.

## Anexos e artifacts

O plugin aceita somente `StoredFile` liberado pelo núcleo e resolve cada entrada por `services.resolveInputFile()`. Caminhos arbitrários e URLs remotas não substituem arquivos autorizados.

São aceitos até 20 anexos por conversa e até 512 MB por arquivo, sujeitos aos limites menores da conta e do contexto. Imagens: JPEG, PNG, GIF e WebP. Documentos: PDF, DOCX, CSV, TXT, HTML, ODT, RTF, EPUB, JSON, XLSX e PPTX.

Na geração de imagem, os bytes de cada imagem nova são recuperados pela própria sessão autenticada, conferidos pela assinatura PNG/JPEG/WebP e pelo MIME declarado, gravados somente na pasta temporária retornada por `getOutputPath()` e promovidos pelo núcleo como artifacts. Referências, previews do compositor, avatares, imagens antigas e arquivos incompletos não entram na coleção. Em uma nova tentativa após reprovação, a imagem anterior é anexada somente se uma nova conversa precisar ser aberta. Base64, caminhos locais e cookies não aparecem no output.

## Interface declarativa de imagens

A capability de imagem declara `promptPreview` com a instrução resolvida e o contexto das entradas. Nome, descrição, perfil, portas e configurações dessa capability possuem moldura em português do Brasil, inglês e espanhol; prompts, nomes e conteúdo criados pelo usuário não são traduzidos.

Durante a captura, `services.publishPartial()` recebe uma coleção acumulada e um `itemUpdate` por variante (`image:0`, `image:1`, ...). O ContentFlow atribui os IDs universais; o plugin preserva somente a correlação local, a conversa opaca autorizada e o prompt que originou o grupo. A resposta final repete a mesma coleção materializada, mantendo `image === images[0]`. Em `item_action/regenerate`, a resposta contém uma única imagem nova na porta `images`; bytes idênticos à tentativa anterior são rejeitados como ausência de mudança real.

## Instalação

1. Abra **Plugins** no ContentFlow.
2. Escolha **Usar pasta ao vivo**.
3. Selecione esta pasta.
4. No perfil Chrome dedicado, carregue manualmente `ecosystem/browser-bridge` em `chrome://extensions` e conclua o login.
5. Revise `network`, `filesystem:read`, `filesystem:write` e `process`.
6. Vincule a capability desejada ao bloco correspondente.

O Chrome abre em `https://chatgpt.com/`. A permissão `process` inicia esse Chrome dedicado; `network` acessa o ChatGPT; `filesystem:read` alcança apenas arquivos liberados; `filesystem:write` produz artifacts e mantém o workspace autorizado.

## Dados, efeitos e custos

- Provedor: OpenAI / ChatGPT web.
- Dados transmitidos: instrução do bloco, contexto e anexos explicitamente conectados.
- Efeitos: criação de conversas e mensagens; pesquisa externa quando escolhida; geração de imagem quando escolhida.
- Custos e cotas: dependem do plano da conta ChatGPT.
- Logs: somente etapas, contagens, tamanhos e hashes curtos; nunca prompts, respostas, cookies ou tokens.

Projetos, compartilhamento, conectores, plugins de terceiros, voz, billing, mudança de plano, exclusão de chats e publicação externa não são automatizados. Esses recursos ampliariam permissões ou efeitos sem pertencer ao contrato editorial dos blocos.

## Validação

Na raiz do ContentFlow:

```powershell
npm run plugin:kit -- check ./ecosystem/plugins/reference/chatgpt-browser-studio
node --test ./ecosystem/plugins/reference/chatgpt-browser-studio/test.mjs
```

`diagnosticMockResponse` valida as capabilities textuais sem abrir o navegador. A geração de imagem exige teste real porque precisa produzir um artifact.

O baseline P30 das sete capabilities não visuais vive em `fixtures/p30-non-visual-capabilities.json`. O teste de caracterização congela prompt, anexos autorizados, conversa nova/continuidade, fontes, decisões, `parts` e outputs. Execute o teste repetidamente antes e depois de qualquer mudança compartilhada com geração de imagens.

A fixture `fixtures/p31-image-dom.json` registra um DOM simulado antes/depois e os IDs aceitos e rejeitados pela captura. Os testes P31 também verificam localização trilíngue, `promptPreview`, compatibilidade singular/plural, incrementalidade por variante e rejeição de bytes ou MIME inválidos.

A fixture `fixtures/p32-sequential-image-prompts.json` registra três prompts, dois perfis e as variantes esperadas por item. Os testes P32 verificam o contrato `prompt → images`, serialização, isolamento de conversa, namespace por `batch.itemId`, cancelamento entre itens e preservação do baseline P30. A persistência, retomada, achatamento e troca de perfil são exercitados pela suíte `npm run test:plugin-fallback` do núcleo.

A fixture `fixtures/p33-image-regeneration.json` registra o histórico de uma variante regenerada, o feedback, a tentativa anterior e um item vizinho. Os testes P33 verificam as quatro ações e suas traduções, a porta `images`, continuidade restrita à mesma conexão/perfil, fallback com anexo somente em conversa nova, tentativa incremental e rejeição de mídia sem mudança real.

Em 20/08/2026, a interface real foi validada com pesquisa web com fonte clicável e criação de imagem. A imagem de teste foi identificada pelo elemento visual real em `chatgpt.com`, com 1254×1254 pixels; o handler usa esse mesmo caminho autenticado para importar os bytes como artifact.

Em 24/09/2026, a geração de imagem foi revalidada no compositor atual. O envio aceita o controle exposto somente por `aria-label`, usa Enter estruturado pela Browser Bridge e mantém o clique como fallback. A captura reconhece a galeria `generated-image-gallery`/`generated-image-preview`, inclusive o alt localizado `Imagem 1 gerada`, sem aceitar anexos do usuário. O PNG real reaberto da conversa tinha 1254×1254 pixels e 2.268.674 bytes.

## Revogação

Saia da conta na janela Chrome dedicada e, se desejar remover a sessão, exclua manualmente somente a pasta do alias dentro da pasta de trabalho conectada ao plugin. Remover o plugin não apaga outputs já promovidos pelo ContentFlow.
