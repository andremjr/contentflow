# Meta AI Browser Studio

Versão **1.0.5** para ContentFlow Plugin API v1.

O plugin usa a instrução resolvida do bloco como único prompt editável. As entradas conectadas são acrescentadas automaticamente como contexto. O bloco expõe apenas o perfil da conta, abre uma conversa nova e realiza um único envio por execução. Configurações antigas permanecem aceitas apenas para compatibilidade e são ignoradas.

Plugin Browser Studio para gerar texto e imagens no Meta AI e preservar a capability legada de vídeo disponível na rota `www.meta.ai/vibes`, sem usar API oficial.

Este pacote automatiza somente `meta.ai` e `www.meta.ai`. O produto standalone em `https://vibes.ai` pertence ao plugin separado `local.contentflow.vibes-browser-studio`; este plugin Meta não navega para essa origem nem implementa as capabilities de Image, Frames ou Elements do Vibes standalone.

## Capabilities

- `generate-text-in-browser`: geração de texto no chat normal da Meta AI.
- `generate-image-in-browser`: geração e edição de imagens na área Media. Mantém a saída singular `image` para Métodos existentes e também entrega `images` com todas as variantes novas materializadas. A coleta exclui imagens já presentes na página e referências anexadas, aguarda a quantidade estabilizar e publica cada variante incrementalmente. A configuração aceita 16:9, 1:1 e 9:16.
- `animate-image-in-browser`: anima uma única imagem-base na rota `www.meta.ai/vibes`. Recebe `image` + prompt de movimento, gera uma ou duas variantes em série e entrega a primeira em `video` e a coleção em `videos`. Cada variante é materializada como artifact próprio e publicada incrementalmente.
- `generate-video-in-browser`: capability legada de geração/animação de vídeo da rota `www.meta.ai/vibes`; o ID, as portas `prompt`/`references` → `video`/`description` e a semântica existente permanecem congelados para compatibilidade com Métodos atuais.

## Perfil e segurança

Cada `accountProfile` usa um perfil Chrome dedicado dentro do workspace persistente concedido pelo ContentFlow. Use **Salvar perfil** para fazer login de forma visível. Quando a Meta reconhece a conta, o plugin aciona sozinho os botões seguros de entrar/continuar e persiste os cookies temporários apenas nesse perfil. Senha, 2FA, CAPTCHA ou escolha de conta continuam exigindo ação humana. O Chrome é fechado ao final por padrão (`keepBrowserOpen=false`).

Para reutilizar uma pasta Chrome escolhida explicitamente, configure `profilesBasePath`, selecione o alias correspondente e ative `allowExistingChromeProfile`; o modo dedicado permanece como padrão. Feche qualquer Chrome que já esteja usando o perfil. Instale manualmente `ecosystem/browser-bridge` nesse perfil antes de usar **Salvar perfil**. Em execução normal, preenchimento e cliques passam pela ponte v2, sem mouse, teclado ou foco de janela via CDP.

Prompts e referências são enviados à Meta. As rotas usadas por este pacote são `www.meta.ai/` para texto, `www.meta.ai/create` para imagem e `www.meta.ai/vibes` para animação e para o vídeo legado. A animação exige exatamente uma imagem-base; quando duas variantes são solicitadas, a imagem é anexada novamente antes de cada envio para que uma variante não dependa do estado residual da anterior. Arquivos gerados são capturados da página, baixados dos hosts Meta declarados (`facebook.com` e `*.fbcdn.net`) e gravados somente na área de saída autorizada. Se vídeo não estiver disponível para a conta, o plugin retorna `PERMISSION_DENIED` sem capturar vídeos do feed. Recursos podem variar conforme conta e país.

A moldura nova da geração de imagens e animação possui textos em português do Brasil, inglês e espanhol. O preview do prompt de imagem inclui a instrução resolvida, o contexto conectado e a proporção escolhida; o preview da animação também mostra a quantidade de variantes. As ações `regenerate`, `replace`, `select` e `download` continuam usando o protocolo de itens do ContentFlow; a regeneração atua somente sobre o item solicitado pelo núcleo. Geração visual não é reenviada automaticamente após timeout incerto, evitando duplicar um efeito externo que pode ter sido concluído pela Meta.

Listas de texto e de prompts de imagem usam a orquestração sequencial por item do núcleo. Cada item recebe sua identidade persistente, e a preferência técnica `queueDelayMs` adiciona um intervalo entre itens sem entrar no Método. Antes de qualquer clique que possa iniciar uma geração, o plugin grava um recibo mínimo no workspace; se a execução cair depois do envio, a tentativa seguinte reabre a página registrada e reconcilia o resultado a partir do baseline anterior, sem clicar em gerar novamente. Uma regeneração explícita recebe outra identidade de recibo.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check ./ecosystem/plugins/reference/meta-ai-browser-studio
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/meta-ai-browser-studio
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/meta-ai-browser-studio
```
