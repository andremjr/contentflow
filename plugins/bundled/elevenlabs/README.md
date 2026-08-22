# ElevenLabs Audio — plugin oficial

Integração oficial mantida pelo ContentFlow OS para a API HTTPS da ElevenLabs. O pacote usa somente APIs documentadas e não inclui SDK ou dependências de runtime.

## Capacidades

- `list-voices`: consulta vozes acessíveis à conta e devolve records com ID, nome e metadados.
- `text-to-speech`: transforma texto em narração MP3.
- `generate-sound-effect`: gera efeito sonoro MP3 de até 30 segundos.
- `transcribe-media`: transcreve áudio ou vídeo com Scribe e devolve texto, timestamps e locutores.
- `compose-music`: compõe música MP3 por prompt, com duração entre 3 segundos e 10 minutos.

Clonagem/criação de voz e dubbing não fazem parte da versão 1.0.0 porque criam recursos persistentes, envolvem direitos de voz ou jobs externos assíncronos que exigem controles adicionais.

## Credencial e dados

Configure `ELEVENLABS_API_KEY` na Central de Plugins. Texto, prompts e arquivos usados nas capacidades de IA são enviados à ElevenLabs. A chave é obtida exclusivamente pelo cofre do ContentFlow OS e nunca entra no Método, outputs, cache ou logs.

As gerações e transcrições são cobradas de acordo com o plano ElevenLabs. A mesma tentativa é idempotente: seu resultado fica no workspace autorizado e retries reutilizam o arquivo ou JSON sem repetir a chamada cobrada.

## Limites locais

- Entrada de transcrição: 100 MiB por padrão, configurável até 500 MiB.
- Saída: 100 MiB por padrão, configurável até 200 MiB.
- Timeout: 180 segundos por padrão, configurável até 10 minutos.
- Formato inicial de geração: MP3. Formatos premium não são selecionados por padrão.

## Validação

```powershell
npm test --prefix plugins/bundled/elevenlabs
npm run plugin:kit -- check plugins/bundled/elevenlabs
```

Com `ELEVENLABS_API_KEY` definida no ambiente, `npm run smoke:real --prefix plugins/bundled/elevenlabs` executa uma narração curta, usa esse áudio para validar a transcrição, gera um efeito curto e tenta uma composição instrumental de três segundos.

Documentação: https://elevenlabs.io/docs/api-reference/introduction/
