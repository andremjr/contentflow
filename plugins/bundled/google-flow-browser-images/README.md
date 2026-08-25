# Google Flow Browser Images — ContentFlow OS

Versão **1.0.7**.

Plugin de geração de imagens reais no Google Flow por meio de um Chrome dedicado. A versão 1.0 oferece perfis de conta separados, seleção de modelo, fallback entre modelos da mesma conta, proporção configurável, imagens de referência e captura de múltiplas variantes.

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

Depois de informar o perfil no construtor do Método, use **Salvar perfil**. O plugin abre uma janela para login, valida a conta quando a lista de projetos ou o editor aparece e fecha o navegador. A execução recusa perfis ainda não preparados. O plugin não copia cookies e não alterna contas automaticamente quando há limite ou cota.

## Modelos

- **Automático do Flow (recomendado):** preserva o modelo selecionado pela interface e os fallbacks liberados pelo próprio Google.
- **Nano Banana:** fixa o modelo regular.
- **Nano Banana Pro:** fixa o modelo Pro. Se `fallbackOnModelLimit=true` e o erro indicar limite específico desse modelo, o mesmo prompt é repetido uma vez com Nano Banana na mesma conta.

Fallback de modelo não é usado para CAPTCHA, bloqueio, cota geral, créditos ou limite de frequência.

## Imagens de referência

A porta opcional `reference_images` aceita `image`, `file` ou `files`. As referências são enviadas ao painel de criação antes dos prompts e podem orientar personagem, avatar, produto, cenário e estilo consistentes.

- máximo configurável: 0 a 10;
- cada arquivo precisa ser uma imagem de até 25 MB;
- arquivos são resolvidos pelo staging autorizado do ContentFlow OS;
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
- `typingChunkSize`
- `typingDelayMs`
- `diagnosticTrace`

## Segurança e intervenção humana

Use somente perfis dedicados. Login, reautenticação e CAPTCHA são concluídos pelo usuário na janela visível. O plugin não extrai sessão, não salva token reCAPTCHA e não tenta contornar limites do provedor.

## Validação

```bash
node test.mjs
npm run plugin:kit -- check <pasta-do-plugin>
npm run plugin:kit -- test-contract <pasta-do-plugin>
npm run plugin:kit -- test-sandbox <pasta-do-plugin>
```

## Perfis e lote resiliente

`fallbackAccountProfiles` aceita aliases adicionais, um por linha e em ordem. O núcleo executa a lista de prompts um item por vez, persiste cada imagem com identidade e ordem antes de avançar e troca de perfil somente após falha técnica transitória. CAPTCHA, autenticação, limite, cota e bloqueio pausam a execução e nunca acionam rotação automática.
