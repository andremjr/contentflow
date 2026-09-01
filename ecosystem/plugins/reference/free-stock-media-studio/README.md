# Free Stock Media Studio

Plugin unificado do ContentFlow para pesquisar e baixar mídia stock gratuita e acervos abertos. Ele mantém cada provedor identificável nos resultados, na atribuição e na licença, sem esconder diferenças de uso.

## Capacidades

- `search-stock-images` (`BUSCAR`): Pexels, Pixabay, Unsplash, Openverse, Wikimedia Commons e NASA.
- `search-stock-videos` (`BUSCAR`): Pexels, Pixabay, Coverr, Wikimedia Commons e NASA.
- `search-stock-by-briefs` (`BUSCAR`): recebe briefings temporais, avalia lotes máximos dos provedores e escolhe automaticamente um asset por trecho.
- `download-selected-stock-assets` (`CRIAR`): materializa sequencialmente a lista mista de vencedores, sem baixar os demais candidatos avaliados.
- `download-stock-image` (`CRIAR`): materializa a imagem escolhida como artefato local.
- `download-stock-video` (`CRIAR`): materializa o vídeo escolhido como artefato local.

O desenho recomendado para escala é `CRIAR briefings com IA -> BUSCAR e selecionar automaticamente -> CRIAR arquivos`. A busca usa os candidatos como universo de avaliação, mas devolve somente um vencedor por briefing; o download materializa somente esses vencedores.

## Contrato dos briefings

Cada item de `asset_briefs` deve ser um record plano. O núcleo executa os itens sequencialmente e acumula um item em `selected_assets` por briefing:

```json
{
  "brief_id": "scene-007",
  "start_seconds": 12.5,
  "end_seconds": 18,
  "transcript_excerpt": "A equipe atravessa a cidade ao amanhecer.",
  "primary_query": "team walking city sunrise",
  "fallback_query_1": "urban commuters dawn",
  "fallback_query_2": "people city morning",
  "media_preference": "video",
  "orientation": "landscape",
  "visual_intent": "plano aberto com movimento e energia",
  "negative_terms": "logo, watermark, illustration"
}
```

`primary_query` é obrigatório. Os demais campos têm defaults seguros. Para SRT, o bloco anterior deve converter cada legenda ou grupo semântico em um record e usar os tempos em segundos.

## Orquestração e qualidade

- `balanced_fallback` é o padrão: alterna o primeiro provedor conforme o índice do trecho, usa o maior lote aceito pela API e para assim que reúne candidatos suficientes. Isso distribui centenas de trechos entre as cotas disponíveis.
- `priority_fallback` mantém uma ordem fixa de provedores quando houver uma fonte preferencial.
- `all` consulta todos os provedores compatíveis e custa mais requisições; use quando diversidade de fonte for mais importante que cota.
- Termos de fallback só são consultados quando a busca anterior não produz o pool mínimo.
- O padrão exige largura mínima de 1280 px, vídeo com pelo menos 3 segundos, orientação compatível quando as dimensões são conhecidas e score mínimo 65/100.
- O score considera posição da consulta, orientação, resolução, preview/download e completude de proveniência. O ranking de relevância do próprio provedor continua sendo o principal sinal semântico.
- Licenças explicitamente não comerciais ou sem derivados são rejeitadas no perfil `commercial_safe`. Isso não substitui a validação humana de direitos, marcas e pessoas identificáveis.
- Se nenhum candidato superar o piso depois dos fallbacks e provedores habilitados, o item falha com `NOT_FOUND`; o plugin nunca preenche o trecho com mídia fraca ou fictícia.
- `maximumCandidatesPerBrief` controla apenas o pool interno (12 por padrão). A saída continua sendo exatamente um asset por briefing.

As buscas manuais também usam `provider_max` por padrão. `custom` permite reduzir a página sem jamais ultrapassar o teto oficial de cada provedor.

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
npm test --prefix ecosystem/plugins/reference/free-stock-media-studio
npm run plugin:kit -- check ecosystem/plugins/reference/free-stock-media-studio
npm run plugin:kit -- test-sandbox ecosystem/plugins/reference/free-stock-media-studio
```

`diagnosticFixture` existe apenas para testes determinísticos locais e não consulta serviços externos.
Com as três variáveis de ambiente definidas, `npm run smoke:real --prefix ecosystem/plugins/reference/free-stock-media-studio` valida buscas e downloads reais sem imprimir credenciais ou URLs assinadas.
