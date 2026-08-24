# AssemblyAI SRT Studio

Plugin privado compatível com ContentFlow OS Plugin API v1. Ele converte a lógica de `legendas.py` para uma capability assíncrona de transcrição e geração de SRT, sem exigir Python ou instalar dependências em runtime.

## Comportamento preservado

- aceita MP4, MOV, MKV, AVI, WEBM, M4V, MP3 e WAV;
- usa detecção automática de idioma (`language_detection: true`);
- tenta todas as chaves em ordem circular quando a AssemblyAI devolve uma falha definitiva;
- após o sucesso, o próximo arquivo começa pela chave seguinte;
- no modo **Por frases**, fecha uma entrada em `.`, `!`, `?` (incluindo aspas/parênteses finais) ou na última palavra;
- usa o início da primeira palavra e o fim da última palavra de cada entrada;
- gera um `.srt` UTF-8 por mídia.

Como as chaves da AssemblyAI são vinculadas a projetos, o arquivo é reenviado ao trocar de chave. Essa exigência é importante: um `upload_url` criado em um projeto não pode ser usado por uma chave de outro projeto.

## Credenciais

Na página **Plugins**, configure `ASSEMBLYAI_API_KEYS`. Informe uma ou várias chaves separadas por vírgula, espaço, ponto e vírgula ou quebra de linha. O valor fica no cofre do ContentFlow OS e não entra no Método, logs, artifacts ou estado do job. Não altere nem reordene as chaves enquanto houver um job em andamento.

## Divisão do SRT

No ContentFlow OS, “entrada” significa um cue SRT numerado com timestamp; o texto de uma entrada fica em uma linha no arquivo.

- **Por frases (lógica original):** reprodução do script Python.
- **Máximo de palavras:** cria grupos contíguos com até o número configurado.
- **Máximo de segundos:** cria grupos contíguos dentro da duração configurada; uma única palavra que já seja mais longa é mantida inteira.
- **Frases + ambos os limites:** fecha na pontuação ou no primeiro limite alcançado.
- **Quantidade exata de entradas:** distribui as palavras de modo equilibrado pela linha do tempo. Se a transcrição tiver menos palavras que o alvo, o máximo possível é uma entrada por palavra.

## Dados, custo e limites

A mídia é enviada à AssemblyAI e pode gerar cobrança conforme a conta do usuário. O upload local oficial aceita até 2,2 GB; o plugin aplica o mesmo limite. Hosts usados: `api.assemblyai.com` ou `api.eu.assemblyai.com`. A retenção e o uso de dados seguem as políticas da AssemblyAI.

Uma falha de confirmação imediatamente após criar uma transcrição não é repetida automaticamente, pois isso poderia duplicar cobrança. Reexecute o bloco conscientemente nesse caso.

## Desenvolvimento e validação

```powershell
node --test plugins/bundled/assemblyai-srt/test.mjs
npm run plugin:kit -- check ./plugins/bundled/assemblyai-srt
npm run plugin:kit -- test-contract ./plugins/bundled/assemblyai-srt
npm run plugin:kit -- test-sandbox ./plugins/bundled/assemblyai-srt
```

Documentação oficial consultada em agosto de 2026:

- https://www.assemblyai.com/docs/api-reference/overview
- https://www.assemblyai.com/docs/coding-agent-prompts
- https://www.assemblyai.com/docs/faq/how-to-get-your-api-key
- https://www.assemblyai.com/docs/pre-recorded-audio/check-transcript-status
- https://www.assemblyai.com/docs/data-retention-and-model-training
