# Free Stock Media Studio

Versão **0.3.1**, compatível com ContentFlow **1.1.1** ou mais recente.

Plugin unificado do ContentFlow para pesquisar e baixar mídia stock gratuita e acervos abertos. Ele mantém cada provedor identificável nos resultados, na atribuição e na licença, sem esconder diferenças de uso.

## Capacidades

- `search-stock-images` (`BUSCAR`): Pexels, Pixabay, Unsplash, Openverse, Wikimedia Commons e NASA.
- `search-stock-videos` (`BUSCAR`): Pexels, Pixabay, Coverr, Wikimedia Commons e NASA.
- `search-stock-by-briefs` (`BUSCAR`): recebe briefings temporais, avalia lotes máximos dos provedores e conclui cada trecho independentemente com a sugestão mais bem ranqueada ou com um resultado vazio válido. A porta legada `selected_assets` nomeia essa sugestão técnica; candidatos ainda precisam ser aceitos em `VALIDAR` antes da materialização.
- `download-selected-stock-assets` (`CRIAR`): materializa sequencialmente a lista mista aprovada em `VALIDAR`, sem baixar os demais candidatos avaliados.
- `download-stock-image` (`CRIAR`): materializa como artefato local a imagem aprovada em `VALIDAR`.
- `download-stock-video` (`CRIAR`): materializa como artefato local o vídeo aprovado em `VALIDAR`.

O fluxo obrigatório é `BUSCAR candidatos -> VALIDAR candidatos da execução -> CRIAR arquivos locais`. `ESCOLHER` não se aplica: esse bloco é reservado a itens preexistentes da Biblioteca Estratégica, enquanto os candidatos stock surgem durante a execução. Um bloco anterior pode `CRIAR` os briefings que alimentam a busca, mas isso não muda a classificação das três etapas stock.

As portas públicas existentes permanecem compatíveis. Nas buscas diretas, `results` contém os candidatos. Na busca por briefings, `selected_assets` é um nome legado para a sugestão ranqueada automaticamente e não representa aprovação editorial. O Método deve ligar esses records a um bloco `VALIDAR`; somente os records aprovados seguem para uma capability de download `CRIAR`.

Nas duas buscas diretas, o bloco mostra somente fonte, quantidade desejada, orientação e busca segura; a consulta continua chegando pela porta `query`. Os candidatos são exibidos como cards e preservam preview, fonte, autor, licença, dimensões e, quando aplicável, duração. A lista de fontes é atualizada pelo plugin a partir das credenciais presentes no cofre, sem devolver valores, nomes de secrets ou estado de credencial na configuração e nos outputs. Uma fonte salva que perdeu sua chave permanece identificável como opção indisponível pela interface do ContentFlow e falha fechada se a execução for iniciada sem corrigir a conexão.

## Contrato dos briefings

Cada item de `asset_briefs` deve ser um record plano. O núcleo executa os itens sequencialmente, persiste cada conclusão antes de avançar e acumula em `selected_assets` um candidato ou um resultado vazio por briefing para a etapa posterior de `VALIDAR`:

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
- Se ao menos uma fonte responder, mas nenhum candidato superar o piso depois dos fallbacks, o item conclui com `result_status: no_acceptable_candidate`, sem URL ou mídia fictícia. Se nenhuma consulta chegar a uma fonte utilizável por falha técnica, o item falha com o código técnico correspondente.
- `maximumCandidatesPerBrief` controla apenas o pool interno (12 por padrão). A saída continua sendo exatamente um record terminal por briefing; quando há candidato, aprovação ou rejeição pertence ao bloco `VALIDAR`.
- Cada item publica os estados incrementalmente com namespace próprio e progresso baseado em `batch.index/batch.total`. O diagnóstico guarda somente consultas normalizadas, fallbacks efetivamente tentados e códigos de warning redigidos; transcrição, secrets e respostas integrais não entram nele.

Nas buscas manuais, a quantidade desejada é limitada automaticamente ao teto oficial de cada provedor. Paginação e limites específicos não aparecem no formulário comum.

## Credenciais

- `PEXELS_API_KEY`
- `PIXABAY_API_KEY`
- `UNSPLASH_ACCESS_KEY`
- `COVERR_API_KEY`

A Secret Key do Unsplash não é necessária e não é solicitada pelo plugin. Cada conexão pode guardar somente os provedores desejados. Também é possível criar várias conexões, inclusive para cadastrar outra chave do mesmo provedor. As credenciais ficam no cofre do ContentFlow e nunca entram em outputs, records, cache ou logs do handler.

Openverse, Wikimedia Commons e NASA não exigem chave; para vídeo, Wikimedia Commons e NASA continuam disponíveis sem credencial. A ausência ou falha de uma chave não remove essas fontes nem impede uma busca agregada com os provedores independentes.

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
- Antes de cada conexão e redirect de mídia, o host é resolvido novamente e qualquer endereço local, privado, link-local, reservado ou multicast é recusado. São aceitos no máximo cinco redirects, sempre dentro da allowlist do mesmo provedor.
- O download é gravado apenas em output controlado, confere `Content-Length`, detecta o MIME pela assinatura, calcula SHA-256 e só então publica o artifact. Imagens têm teto configurável de 100 MiB e vídeos respeitam o teto comum de 512 MiB.
- Cada materialização concluída mantém recibo e cópia validada no workspace autorizado. Repetir a mesma chave lógica reutiliza os mesmos bytes e o mesmo artifact, sem nova transferência nem novo tracking do Unsplash; uma entrada, hash, MIME ou tamanho divergente invalida a reutilização.
- A retomada usa `filesystem:read` e `filesystem:write` somente no staging e workspace isolados pelo ContentFlow: a leitura é necessária para reconferir assinatura, tamanho e SHA-256 da cópia persistida antes de reutilizá-la.
- Candidatos sem identidade, página de origem, atribuição ou licença completas falham antes de abrir a rede. URLs remotas continuam sendo somente candidatos até uma capability `CRIAR` concluir a materialização local.
- Em lotes, cada item publica `running`, depois `completed` com o artifact já importável ou `failed` com código redigido. O arquivo final conserva também IDs do candidato, provedor, autor, página original, atribuição e licença. Itens concluídos permanecem sob a autoridade de retomada do núcleo.

## Desenvolvimento

```powershell
npm test --prefix ecosystem/plugins/reference/free-stock-media-studio
npm run plugin:kit -- check ecosystem/plugins/reference/free-stock-media-studio
npm run plugin:kit -- test-sandbox ecosystem/plugins/reference/free-stock-media-studio
npm run e2e:p24 --prefix ecosystem/plugins/reference/free-stock-media-studio
```

`diagnosticFixture` existe apenas para testes determinísticos locais e não consulta serviços externos.
Com as quatro variáveis de ambiente dos provedores desejados definidas, `npm run smoke:real --prefix ecosystem/plugins/reference/free-stock-media-studio` valida buscas e downloads reais sem imprimir credenciais ou URLs assinadas. `SMOKE_PROVIDERS` pode limitar a matriz; Openverse, Wikimedia Commons e NASA não exigem variável.

O comando `e2e:p24` sobe uma API isolada com dados temporários, vincula esta pasta ao vivo e executa o Método de `fixtures/p24-real-method.contentflow-method.json` em PT-BR, inglês e espanhol. O cenário usa Openverse para fazer `BUSCAR → VALIDAR → CRIAR` na rede real, confirma que o núcleo importou exatamente um artifact por execução e registra somente IDs, MIME, tamanho, SHA-256, licença e presença de atribuição. Nenhuma chave do cofre é lida ou impressa.
