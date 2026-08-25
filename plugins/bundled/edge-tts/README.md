# Microsoft Edge TTS

Plugin oficial Plugin API v1 para gerar narração MP3 no processo universal **Narração** usando o serviço online de leitura do Microsoft Edge.

O pacote inclui Python 3.12.10 para Windows x64 e `edge-tts` 7.2.8 com dependências fixadas. Nada é instalado em runtime e o computador não precisa ter Python. O texto é enviado para `speech.platform.bing.com`; não há API key nem consumo de créditos da ElevenLabs.

## Capability

- `text-to-speech`
- bloco `CRIAR`, operador `Código`, processo `narration`
- entrada `text`: `text` ou `textarea`, até 20.000 caracteres
- saída `audio`: MP3 (`audio/mpeg`)
- configurações: voz neural, velocidade, volume e tom

Voz padrão: `en-US-GuyNeural`. As vozes disponíveis podem mudar no serviço. O projeto `edge-tts` documenta `--list-voices`, geração por arquivo e os ajustes de prosódia em <https://github.com/rany2/edge-tts>.

## Segurança e dados

Permissões: `network`, `filesystem:write` e `process`. O plugin grava somente em `getOutputPath()`, chama o Python empacotado com argumentos estruturados e sem shell, aplica timeout e respeita o sinal de cancelamento. O texto da narração é transferido ao serviço online da Microsoft; nenhum secret é usado ou armazenado.

O serviço é online e não constitui uma API contratada pelo ContentFlow OS. Disponibilidade, vozes e condições de uso podem mudar. Não use para conteúdo cuja transferência ao serviço não seja permitida.

## Validação

```powershell
npm run plugin:kit -- check ./plugins/bundled/edge-tts
```

Versão do ContentFlow OS testada: 0.4.1. Consulte `THIRD_PARTY_NOTICES.md` para versões, licenças, fontes e hashes do runtime.
