# Meta AI Browser Studio

Versão **1.0.2** para ContentFlow Plugin API v1.

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. O bloco expõe apenas o perfil da conta, abre uma conversa nova e realiza um único envio por execução. Configurações antigas permanecem aceitas apenas para compatibilidade e são ignoradas.

Plugin Browser Studio para gerar texto e imagens no Meta AI e solicitar vídeos curtos no Vibes, sem usar API oficial.

## Capabilities

- `generate-text-in-browser`: geração de texto no chat normal da Meta AI.
- `generate-image-in-browser`: geração e edição de imagens na área Media.
- `generate-video-in-browser`: geração/animacão de vídeo na área Vibes.

## Perfil e segurança

Cada `accountProfile` usa um perfil Chrome dedicado dentro do workspace persistente concedido pelo ContentFlow. Use **Salvar perfil** para fazer login de forma visível. Quando a Meta reconhece a conta, o plugin aciona sozinho os botões seguros de entrar/continuar e persiste os cookies temporários apenas nesse perfil. Senha, 2FA, CAPTCHA ou escolha de conta continuam exigindo ação humana. O Chrome é fechado ao final por padrão (`keepBrowserOpen=false`).

Para reutilizar uma pasta Chrome escolhida explicitamente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`; o modo dedicado permanece como padrão. Feche qualquer Chrome que já esteja usando o perfil. Instale manualmente `ecosystem/browser-bridge` nesse perfil antes de usar **Salvar perfil**. Em execução normal, preenchimento e cliques passam pela ponte v2, sem mouse, teclado ou foco de janela via CDP.

Prompts e referências são enviados à Meta. Arquivos gerados são capturados da página, baixados do CDN autorizado e gravados somente na área de saída autorizada. Se vídeo não estiver disponível para a conta, o plugin retorna `PERMISSION_DENIED` sem capturar vídeos do feed. Recursos podem variar conforme conta e país.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check ./ecosystem/plugins/reference/meta-ai-browser-studio
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/meta-ai-browser-studio
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/meta-ai-browser-studio
```
