# Vídeo por Sequência de Imagens (FFmpeg)

Plugin independente Plugin API v1 para o processo universal **Edição**. Recebe imagens na ordem definida pelo Método e uma faixa de áudio; mede a duração real do áudio e gera um MP4 H.264 com áudio AAC. As imagens podem ocupar partes iguais ou seguir os intervalos de um arquivo SRT.

## Capability

- `compose-image-sequence-with-audio`
- bloco: `CRIAR`
- operador: `Código`
- entrada `images`: uma ou mais imagens JPEG, PNG ou WebP; a ordem é preservada
- entrada `audio`: AAC, FLAC, M4A/MP4, MP3, OGG/Opus, WAV ou WebM
- entrada opcional `subtitles`: um arquivo SRT; em `timingMode: "srt"`, a troca das imagens acompanha o final dos cues
- saída `video`: MP4 H.264 (`yuv420p`) com áudio AAC

O padrão é 1920×1080, 30 fps, enquadramento `cover`, CRF 20 e distribuição `equal`. Em `contain`, o plugin preserva toda a imagem e preenche o restante com a cor configurada. No modo `srt`, deve existir ao menos um cue por imagem; se houver mais cues que imagens, o plugin os agrupa preservando toda a linha do tempo.

## Execução e segurança

Todo o processamento ocorre localmente e sem rede. O plugin usa somente arquivos liberados por `resolveInputFile()`, grava em `getOutputPath()` e inicia o executável empacotado com argumentos estruturados, sem shell. A execução respeita timeout e o sinal de cancelamento do núcleo. Limites: 60 imagens, 4 GB por entrada, 6 horas de áudio e 8 GB de saída.

Permissões: `filesystem:read`, `filesystem:write` e `process`. Efeitos: artifact local e subprocesso. Custo externo: nenhum. Dados enviados a terceiros: nenhum.

## FFmpeg empacotado

O plugin contém o FFmpeg 6.1.1 estático para Windows x64. Consulte `THIRD_PARTY_NOTICES.md` e `vendor/ffmpeg/README.md` para licença, proveniência e hash.

## Validação

```powershell
npm run plugin:kit -- check ./ecosystem/plugins/reference/ffmpeg-image-sequence-video
```

Versão do ContentFlow testada: 0.4.1. Runtime: Node 26/ESM. Não há secrets, autenticação ou credenciais para revogar.
