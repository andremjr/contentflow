# Grok Browser Studio

Versão **1.0.1** para ContentFlow Plugin API v1.

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. O bloco expõe apenas o perfil da conta, abre uma conversa nova e realiza um único envio por execução. Configurações antigas permanecem aceitas apenas para compatibilidade e são ignoradas.

Plugin Browser Studio para gerar texto, pesquisar a web e criar imagens e vídeos reais no Grok, sem usar a API oficial.

## Capabilities

- `generate-text-in-browser`: geração de texto no chat normal do Grok.
- `search-web-in-browser`: pesquisa atual com preservação das fontes retornadas.
- `generate-image-in-browser`: texto para imagem e edição com referências.
- `generate-video-in-browser`: texto/imagem para vídeo no modo Video do Grok Imagine.

## Perfil e segurança

Cada `accountProfile` usa um perfil Chrome dedicado dentro do workspace persistente concedido pelo ContentFlow. Use **Salvar perfil** para fazer login de forma visível. O plugin não copia cookies, não alterna contas para contornar cotas e não tenta resolver CAPTCHA. O Chrome é fechado ao final por padrão (`keepBrowserOpen=false`).

Para reutilizar uma pasta Chrome escolhida explicitamente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`; o modo dedicado permanece como padrão. Feche qualquer Chrome que já esteja usando o perfil. Instale manualmente `ecosystem/browser-bridge` nesse perfil antes de usar **Salvar perfil**. Em execução normal, preenchimento e cliques passam pela ponte v2, sem mouse, teclado ou foco de janela via CDP.

Prompts e referências são enviados à xAI. Arquivos gerados são capturados da página, previews borrados e presets são rejeitados, e o resultado final é gravado somente na área de saída autorizada. Limites, assinatura e disponibilidade dependem da conta conectada.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check ./ecosystem/plugins/reference/grok-browser-studio
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/grok-browser-studio
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/grok-browser-studio
```
