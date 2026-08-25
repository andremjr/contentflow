# Meta AI Browser Studio

Plugin Browser Studio para gerar texto e imagens no Meta AI e solicitar vídeos curtos no Vibes, sem usar API oficial.

## Capabilities

- `generate-text-in-browser`: geração de texto no chat normal da Meta AI.
- `generate-image-in-browser`: geração e edição de imagens na área Media.
- `generate-video-in-browser`: geração/animacão de vídeo na área Vibes.

## Perfil e segurança

Cada `accountProfile` usa um perfil Chrome dedicado dentro do workspace persistente concedido pelo ContentFlow OS. Use **Salvar perfil** para fazer login de forma visível. Quando a Meta reconhece a conta, o plugin aciona sozinho os botões seguros de entrar/continuar e persiste os cookies temporários apenas nesse perfil. Senha, 2FA, CAPTCHA ou escolha de conta continuam exigindo ação humana. O Chrome é fechado ao final por padrão (`keepBrowserOpen=false`).

Prompts e referências são enviados à Meta. Arquivos gerados são capturados da página, baixados do CDN autorizado e gravados somente na área de saída autorizada. Se vídeo não estiver disponível para a conta, o plugin retorna `PERMISSION_DENIED` sem capturar vídeos do feed. Recursos podem variar conforme conta e país.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check ./plugins/bundled/meta-ai-browser-studio
npm run plugin:kit -- test-contract ./plugins/bundled/meta-ai-browser-studio
npm run plugin:kit -- test-sandbox ./plugins/bundled/meta-ai-browser-studio
```

## Perfis de fallback

`fallbackAccountProfiles` aceita aliases adicionais, um por linha e em ordem. Cada alias deve ser salvo separadamente. O núcleo troca de perfil somente em falhas técnicas transitórias; CAPTCHA, autenticação, limite, cota e bloqueio pausam a execução.
