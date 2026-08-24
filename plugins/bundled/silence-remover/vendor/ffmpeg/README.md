# FFmpeg oficial empacotado

O build desktop coloca o executável e os avisos de licença nestes caminhos privados do plugin:

```text
win32-x64/ffmpeg.exe
win32-x64/ffmpeg.exe.LICENSE
win32-x64/ffmpeg.exe.README
```

Os arquivos foram obtidos de `ffmpeg-static@5.3.0` e estão versionados diretamente nesta pasta. Para Windows x64, o pacote fornece FFmpeg 6.1.1 Essentials da gyan.dev. O build valida o SHA-256 esperado antes de montar o desktop.

Requisitos funcionais do build:

- demuxers/decoders para os formatos de entrada suportados;
- filtros `silencedetect`, `ametadata`, `trim`, `atrim`, `setpts`, `asetpts`, `tpad`, `concat`, `scale` e `anull`;
- encoder AAC;
- encoder `libx264` para a capability de vídeo;
- muxers MP4/M4A.

O executável é GPLv3, usa `libx264` e permanece separado do código proprietário, sendo invocado por linha de comando. A distribuição preserva a licença integral e o README do build, que aponta para o commit do código-fonte correspondente. Consulte também [`../../THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

O handler não possui fallback por `PATH` e usa somente o executável dentro desta pasta.
