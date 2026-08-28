# Google Flow Browser Images — ContentFlow

Versão **1.2.1**.

Plugin de geração de imagens reais no Google Flow por meio do Chrome normal com um perfil dedicado. A versão 1.2 usa a única extensão companheira **ContentFlow Browser Bridge** para preencher o prompt e acionar a geração sem disputar teclado, mouse ou foco do sistema com o usuário.

A execução normal começa minimizada. A janela só é trazida para frente quando o usuário inicia explicitamente **Adicionar conta** para instalar a extensão, fazer login ou reautenticar. Se a extensão não estiver disponível, a execução termina com erro seguro; não existe fallback silencioso para eventos de teclado ou mouse.

## Instalação manual da extensão

Cada perfil dedicado do Chrome precisa receber a extensão uma vez:

1. Mantenha a pasta `extensions/contentflow-browser-bridge` do repositório em um local definitivo; não a mova depois da instalação.
2. No bloco do Método, informe o nome do perfil e clique em **Adicionar conta**.
3. Na janela dedicada que abrir, acesse `chrome://extensions`.
4. Ative **Modo do desenvolvedor**.
5. Clique em **Carregar sem compactação** e selecione a pasta `extensions/contentflow-browser-bridge`.
6. Volte à aba do Google Flow. O plugin recarrega a página quando necessário, verifica a extensão e aguarda o login.

Repita os passos para cada perfil/conta adicional. Não instale a extensão no perfil pessoal do Chrome se ele não será usado pelo plugin. Ao atualizar a ponte, abra `chrome://extensions` no perfil dedicado e clique em **Recarregar** no card da extensão. Os usuários fazem essa instalação manualmente; automações locais usadas pelo mantenedor não fazem parte do aplicativo.

### Sair ou remover uma conta

Abra a conta pelo botão **Adicionar conta**, faça logout no Google Flow e remova a extensão daquele perfil em `chrome://extensions`. Depois, retire o nome da conta do bloco. Isso não apaga imagens e outros outputs que o ContentFlow já persistiu. Cada perfil é isolado; sair de uma conta não altera os demais perfis.

O Chrome normal não mantém extensões ativas no headless da mesma forma que na janela comum. Por isso a V1 usa uma janela dedicada minimizada. Essa limitação não autoriza fallback para foco, teclado ou mouse.

Por padrão, cada execução cria um projeto novo no Flow. Assim, cada vídeo e cada nova tentativa após erro ficam isolados de projetos anteriores. Uma `flowUrl` explicitamente configurada continua funcionando como exceção fixada pelo usuário.

Exceção de CAPTCHA: quando o provedor exige verificação humana, a tentativa imediatamente seguinte retoma somente o projeto novo em que o CAPTCHA foi resolvido. Isso preserva o token de verificação sem misturar vídeos ou projetos anteriores.

## Garantia de resultado

O plugin nunca cria imagens substitutas. CAPTCHA, sessão expirada, cota geral, limite sem fallback válido, mudança incompatível da interface ou falha de download encerram o bloco com erro explícito. Artifacts só são entregues quando vieram do Google Flow.

## Contas e canais

`accountProfile` identifica um perfil persistente do Chrome:

- `default` usa a raiz da pasta de trabalho autorizada do plugin;
- qualquer outra chave válida usa `<workspace-do-plugin>/<accountProfile>`;
- configure a mesma chave nos blocos de um canal para reutilizar conta, projetos, personagens e referências;
- use chaves diferentes entre canais quando quiser bases separadas.

Depois de informar o perfil no construtor do Método, use **Adicionar conta**. O plugin abre uma janela para a instalação manual da extensão e o login, valida a conta quando a lista de projetos ou o editor aparece e fecha o navegador. A execução recusa perfis ainda não preparados. O plugin não copia cookies e não alterna contas automaticamente quando há limite ou cota.

## Modelos

- **Automático do Flow (recomendado):** preserva o modelo selecionado pela interface e os fallbacks liberados pelo próprio Google.
- **Nano Banana:** fixa o modelo regular.
- **Nano Banana Pro:** fixa o modelo Pro. Se `fallbackOnModelLimit=true` e o erro indicar limite específico desse modelo, o mesmo prompt é repetido uma vez com Nano Banana na mesma conta.

Fallback de modelo não é usado para CAPTCHA, bloqueio, cota geral, créditos ou limite de frequência.

## Imagens de referência

A porta opcional `reference_images` aceita `image`, `file` ou `files`. As referências são enviadas ao painel de criação antes dos prompts e podem orientar personagem, avatar, produto, cenário e estilo consistentes.

- máximo configurável: 0 a 10;
- cada arquivo precisa ser uma imagem de até 25 MB;
- arquivos são resolvidos pelo staging autorizado do ContentFlow;
- a conta e o projeto ativos continuam sendo a fonte de verdade para recursos persistentes do Flow.

## Fila e limites

O padrão é conservador: uma geração por vez e intervalo mínimo de 5 segundos. O Google pode reduzir a frequência disponível após muitas gerações; o plugin respeita o erro, não troca identidade e não gira contas.

`maxImagesPerPrompt` preserva de 1 a 4 variantes quando a resposta real contiver várias mídias. A saída mantém a ordem dos prompts e usa sufixos `v01`, `v02` etc.

## Configuração do bloco

- `accountProfile`
- `imageModel`
- `fallbackOnModelLimit`
- `aspectRatio`
- `maxPrompts`
- `delayBetweenPromptsMs`
- `maxConcurrentGenerations`
- `retryAttempts`
- `maxReferenceImages`
- `maxImagesPerPrompt`

## Settings globais

- `chromeExecutable`
- `profilePath` para o perfil `default`
- `profilesRootPath` para perfis adicionais
- `flowUrl`
- `autoCreateProject`
- `remoteDebuggingPort`
- `keepBrowserOpen`
- `startMinimized`
- `minimizeWhenReady`
- `interactiveWaitSeconds`
- `requestTimeoutSeconds`
- `promptSelector`
- `generateSelector`
- `diagnosticTrace`

## Segurança e intervenção humana

Use somente perfis dedicados. Login, reautenticação e CAPTCHA são concluídos pelo usuário na janela visível. O plugin não extrai sessão nem salva token reCAPTCHA. A ContentFlow Browser Bridge é instalada manualmente, habilita atualmente `https://labs.google/*` para este piloto e tem finalidade exclusiva de produtividade, estabilidade e isolamento da automação. Ela é comum a todos os plugins de navegador compatíveis e não pertence a este plugin.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check <pasta-do-plugin>
npm run plugin:kit -- test-contract <pasta-do-plugin>
npm run plugin:kit -- test-sandbox <pasta-do-plugin>
```

## Perfis e lote resiliente

`fallbackAccountProfiles` aceita aliases adicionais, um por linha e em ordem. O núcleo executa a lista de prompts um item por vez, persiste cada imagem com identidade e ordem antes de avançar e troca de perfil somente após falha técnica transitória. CAPTCHA, autenticação, limite, cota e bloqueio pausam a execução e nunca acionam rotação automática.
