# Free Stock Media Studio

Plugin unificado do ContentFlow para pesquisar e baixar mídia stock gratuita e acervos abertos. Ele mantém cada provedor identificável nos resultados, na atribuição e na licença, sem esconder diferenças de uso.

## Capacidades

- `search-stock-images` (`BUSCAR`): Pexels, Pixabay, Unsplash, Openverse, Wikimedia Commons e NASA.
- `search-stock-videos` (`BUSCAR`): Pexels, Pixabay, Coverr, Wikimedia Commons e NASA.
- `download-stock-image` (`CRIAR`): materializa a imagem escolhida como artefato local.
- `download-stock-video` (`CRIAR`): materializa o vídeo escolhido como artefato local.

O desenho recomendado de Método é `BUSCAR mídia -> ESCOLHER um record -> CRIAR arquivo`. A busca não baixa silenciosamente todos os resultados.

## Credenciais

- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `COVERR_API_KEY`

A Secret Key do Unsplash não é necessária e não é solicitada pelo plugin. As credenciais ficam no cofre do ContentFlow e nunca entram em outputs, records, cache ou logs do handler.

## Regras dos provedores

- Os resultados preservam provedor, autor, página original, texto de atribuição e licença.
- Respostas de busca do Pixabay são armazenadas no workspace por 24 horas; arquivos escolhidos são baixados localmente, evitando hotlink permanente.
- As prévias do Unsplash usam as URLs devolvidas pela API. Ao baixar uma escolha, o plugin chama uma única vez o `download_location` correspondente para cumprir o fluxo da API.
- O Openverse é consultado anonimamente. O arquivo materializado usa seu proxy oficial de thumbnail para não abrir egress arbitrário aos hosts de todos os acervos indexados; o record preserva a página original e a licença do item.
- O Wikimedia Commons é consultado anonimamente com User-Agent identificável e fornece licença/autor por item. A variável `WIKIMEDIA_COMMONS` não é necessária e não é armazenada como secret.
- O Coverr resolve a URL assinada somente no momento do download, evitando persistir tokens ligados à chave nos records do Método.
- A NASA usa a Image and Video Library oficial. Seus itens apontam para as NASA Images and Media Usage Guidelines; materiais de terceiros, pessoas identificáveis e marcas ainda exigem a verificação descrita na página de origem.
- O plugin não raspa Google Imagens ou páginas de resultados. Uma integração futura com Google deve usar API oficial e filtro de direitos, não automação da interface.
- Uma falha isolada gera um aviso e mantém os resultados dos outros provedores. Se todos falharem, o bloco falha com erro tipado.
- Downloads aceitam somente HTTPS e hosts oficiais previamente declarados no manifesto. Tipo, tamanho e assinatura do arquivo são conferidos.

## Desenvolvimento

```powershell
npm test --prefix plugins/bundled/free-stock-media-studio
npm run plugin:kit -- check plugins/bundled/free-stock-media-studio
npm run plugin:kit -- test-sandbox plugins/bundled/free-stock-media-studio
```

`diagnosticFixture` existe apenas para testes determinísticos locais e não consulta serviços externos.
Com as três variáveis de ambiente definidas, `npm run smoke:real --prefix plugins/bundled/free-stock-media-studio` valida buscas e downloads reais sem imprimir credenciais ou URLs assinadas.
