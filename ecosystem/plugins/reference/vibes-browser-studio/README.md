# Vibes Browser Studio

Plugin independente em prerelease para gerar imagens e vídeos por Frames ou Elementos em `https://vibes.ai` por uma sessão do próprio usuário. O pacote usa um perfil Chrome dedicado e a ContentFlow Browser Bridge 0.4.0 ou superior; não usa endpoint privado, não lê cookies e não contorna cota, fila, CAPTCHA, upgrade ou controles da conta.

## Capability disponível

`generate-images-in-browser` recebe um prompt por item e entrega exatamente quatro imagens materializadas em proporção 9:16, além da URL do projeto utilizado.

Entradas opcionais:

- uma referência de Personagem;
- uma referência de Cena;
- até seis referências de Estilo, agrupadas no mesmo componente;
- URL de um projeto existente.

Referências aceitam PNG, JPEG ou WebP de até 10 MiB cada. Personagem e Cena rejeitam mais de uma imagem antes de alterar a página. A execução é serial e pode criar um projeto novo ou reutilizar uma URL `https://vibes.ai/projects/<id>` validada.

Cada envio persiste um recibo antes do clique em **Gerar**. `resume` coleta somente cards posteriores ao snapshot, exige um único lote externo e mantém a ordem `content-1` a `content-4`. Reload ou timeout não reenviam o prompt. Resultados parciais são importados pelo ContentFlow assim que aparecem; URLs temporárias de `*.fbcdn.net` passam pelo downloader mediado, com HTTPS, allowlist, SSRF, redirects, MIME, bytes e SHA-256.

As ações declaradas são regenerar, substituir, selecionar e baixar. Seleção e download são locais ao núcleo; regeneração conclui na mesma `item_action`, preservando ID, posição e histórico da variante substituída.

`animate-frame-in-browser` recebe um ou vários quadros iniciais, quadros finais opcionais, prompts de movimento e referências compartilhadas de Estilo. O núcleo processa cada quadro inicial sequencialmente; quando quadros finais ou prompts são plurais, o plugin exige correspondência pelo ID de item da entrega e rejeita alinhamento baseado apenas na posição visual. Cada item produz quatro vídeos em `480p` ou `720p`, no modo Frames implícito.

O recibo de vídeo guarda capability, perfil, projeto, IDs/hash dos frames, resolução e snapshot da galeria antes do envio. Após reload, `resume` abre o mesmo projeto e apenas reconcilia o lote já submetido; não volta a carregar os frames nem clica em **Gerar** novamente. Vídeos aceitam MIME `video/mp4` ou `video/webm` e seguem a mesma política restrita de CDN e 60 MiB por variante.

`generate-video-with-elements-in-browser` recebe um ou vários prompts e referências opcionais com papéis não intercambiáveis: no máximo uma de Personagem, no máximo uma de Cena e até seis de Estilo. O modo Elementos é implícito; cada prompt produz quatro vídeos em `480p` ou `720p`.

Antes de abrir o navegador, o plugin valida tipo, MIME, tamanho e limites de cada papel. As imagens são carregadas em componentes separados de Personagem, Cena e Estilo, e o recibo persiste esses papéis junto aos hashes das referências. Retomada, cancelamento, regeneração isolada, seleção e download usam a mesma infraestrutura idempotente das demais capabilities.

## Preparação do perfil

Nos detalhes do plugin, use **Preparar perfil do Vibes**. O Chrome abre visivelmente para o usuário:

1. instale manualmente a pasta estável da Browser Bridge com **Carregar sem compactação**;
2. conclua login, onboarding, CAPTCHA ou reautenticação no Vibes;
3. aguarde a validação da origem, conta e versão da ponte;
4. o plugin fecha a instância que iniciou depois de salvar o marcador local do perfil.

A execução rotineira inicia minimizada por padrão. Perfis alternativos precisam ser preparados individualmente. O Método guarda somente aliases; cookies, storage, caminho de perfil e credenciais não são exportados.

## Permissões, dados e custos

- `network`: valida e materializa mídia somente de `vibes.ai` e `*.fbcdn.net`;
- `filesystem:read` e `filesystem:write`: resolve referências autorizadas, mantém recibos e usa staging controlado;
- `process`: inicia o Chrome dedicado. Esta é uma permissão avançada porque subprocessos não herdam toda a sandbox do Node;
- efeitos: escrita externa no projeto do Vibes, artifacts locais e subprocesso;
- provedor: Vibes web;
- custo: desconhecido; plano, créditos e limites da conta do usuário continuam valendo.

Prompts e referências são enviados ao Vibes para a geração solicitada. Consulte as políticas atuais do provedor antes de usar o plugin. O usuário responde por termos da conta, direitos das referências, conteúdo gerado e uso/publicação dos arquivos.

## Estados e limites

- login, CAPTCHA, cota, rate limit, upgrade e bloqueio permanecem no perfil atual enquanto houver intervenção possível;
- recusa, mídia ausente, lote ambíguo, DOM incompatível e origem inesperada falham fechados;
- cancelamento impede novas ações locais, libera a lease e preserva o recibo; um job já enviado pode continuar no Vibes;
- cada artifact aceita no máximo 60 MiB, até cinco redirects e MIME de imagem (`image/png`, `image/jpeg`, `image/webp`) ou vídeo (`video/mp4`, `video/webm`) compatível com a capability;
- logs contêm somente contagens, estado e IDs opacos mínimos; não incluem prompt, cookies, URLs assinadas ou conteúdo integral da página.

## Validação local

Na raiz do ContentFlow:

```powershell
npm test --prefix ecosystem/plugins/reference/vibes-browser-studio
npm run plugin:kit -- check ecosystem/plugins/reference/vibes-browser-studio
npm run plugin:kit -- test-contract ecosystem/plugins/reference/vibes-browser-studio
npm run plugin:kit -- test-sandbox ecosystem/plugins/reference/vibes-browser-studio
npm run test:browser-plugins
```

O fixture do Plugin Kit usa prompt vazio para exercitar a rejeição segura sem abrir navegador nem provocar custo. Os cenários reais B8 exigem um perfil dedicado autenticado e orçamento explícito.

Para repetir a validação real autorizada de P46, use `scripts/p46-live.mjs` com `CONTENTFLOW_VIBES_P46_LIVE=1`. O harness mantém relatórios redigidos no workspace privado do perfil e aceita cenários isolados para preparação, imagem, referências, Frames 480p/720p, Elementos 720p e regeneração. `scripts/p46-diagnose.mjs` registra somente estrutura da página e controles visíveis, sem cookies, tokens, prompts ou URLs assinadas.

A execução de P46 reutilizou um único projeto e confirmou quatro artifacts em cada geração, retomada sem reenvio e downloads reais da CDN permitida. A decisão registrada em `docs/ecosystem/asset-generation-evidence/P46.md` é não adicionar a capability composta: projeto, perfil e recibos já preservam a continuidade necessária entre as capabilities atômicas.

## Licença e estado

O código do pacote é MIT. O ícone foi fornecido e autorizado pelo mantenedor especificamente para este plugin; consulte `LICENSE`. A versão permanece `0.1.0-dev.0`, conforme a política do roadmap. Não publique esta prerelease como versão estável.
