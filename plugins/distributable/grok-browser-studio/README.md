# Grok Browser Studio

Plugin Browser Studio para gerar texto, pesquisar a web e criar imagens e vídeos reais no Grok, sem usar a API oficial.

## Capabilities

- `generate-text-in-browser`: geração de texto no chat normal do Grok.
- `search-web-in-browser`: pesquisa atual com preservação das fontes retornadas.
- `generate-image-in-browser`: texto para imagem e edição com referências.
- `generate-video-in-browser`: texto/imagem para vídeo no modo Video do Grok Imagine.

## Perfil e segurança

Cada `accountProfile` usa um perfil Chrome dedicado dentro do workspace persistente concedido pelo ContentFlow OS. Use **Salvar perfil** para fazer login de forma visível. O plugin não copia cookies, não alterna contas para contornar cotas e não tenta resolver CAPTCHA. O Chrome é fechado ao final por padrão (`keepBrowserOpen=false`).

Prompts e referências são enviados à xAI. Arquivos gerados são capturados da página, previews borrados e presets são rejeitados, e o resultado final é gravado somente na área de saída autorizada. Limites, assinatura e disponibilidade dependem da conta conectada.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check ./plugins/distributable/grok-browser-studio
npm run plugin:kit -- test-contract ./plugins/distributable/grok-browser-studio
npm run plugin:kit -- test-sandbox ./plugins/distributable/grok-browser-studio
```
