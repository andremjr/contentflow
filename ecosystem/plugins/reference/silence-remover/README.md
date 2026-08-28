# Removedor de Silêncios

Plugin independente mantido para o ContentFlow. Ele recebe um áudio ou vídeo, detecta intervalos silenciosos na primeira faixa de áudio e gera uma nova mídia com esses intervalos removidos.

No vídeo, imagem e áudio são recortados nos mesmos pontos. O plugin não usa `silenceremove` isoladamente e preserva o deslocamento temporal original entre as primeiras faixas de áudio e vídeo.

## Capacidades

| Capability             | Processo                 | Entrada | Saída                             |
| ---------------------- | ------------------------ | ------- | --------------------------------- |
| `remove-silence-audio` | Narração e Áudio; Edição | `audio` | `audio` (`.m4a` quando há cortes) |
| `remove-silence-video` | Edição                   | `video` | `video` (`.mp4` quando há cortes) |

As duas capacidades usam o bloco `CRIAR` e o operador `Código` porque produzem um novo artifact de mídia.

## Parâmetros exibidos no bloco

| Parâmetro                   | Padrão |         Faixa | Efeito                                                                                        |
| --------------------------- | -----: | ------------: | --------------------------------------------------------------------------------------------- |
| Silêncio mínimo para cortar | 500 ms | 100–60.000 ms | Preserva pausas menores que o valor escolhido.                                                |
| Limiar de silêncio          | -40 dB |   -96 a -1 dB | Som abaixo do limiar é tratado como silêncio. Um valor mais próximo de zero é mais agressivo. |
| Margem preservada           | 100 ms |    0–2.000 ms | Mantém áudio em cada transição para reduzir cortes secos.                                     |

Os parâmetros são declarados em `blockConfigSchema` e aparecem automaticamente quando o usuário vincula uma das capacidades ao bloco no ContentFlow.

## Disponibilidade

O plugin é instalado separadamente e não exige atualizar ou reinstalar o ContentFlow:

1. Remova uma instalação anterior com o mesmo ID, se existir.
2. Abra **Plugins → Instalar plugin → Instalar uma cópia**.
3. Selecione a pasta que contém este `README.md` e `contentflow.plugin.json`.
4. Revise as permissões, ative o plugin e clique em **Atualizar**.

O executável, sua licença GPLv3 e a descrição do build ficam versionados diretamente dentro da pasta do plugin. A mesma pasta funciona no desenvolvimento, nos testes e no aplicativo instalado.

## Runtime FFmpeg

O handler procura primeiro um executável empacotado em:

```text
vendor/ffmpeg/<plataforma>-<arquitetura>/ffmpeg[.exe]
```

Exemplo no Windows x64:

```text
vendor/ffmpeg/win32-x64/ffmpeg.exe
```

O handler nunca procura `ffmpeg` no `PATH`. O plugin contém o FFmpeg 6.1.1 estático, a licença GPLv3 e a referência ao código-fonte correspondente. Veja [`vendor/ffmpeg/README.md`](vendor/ffmpeg/README.md) e [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

## Permissões, dados e custos

- `filesystem:read`: abre apenas o `StoredFile` liberado pelo núcleo.
- `filesystem:write`: cria o resultado na pasta temporária retornada por `getOutputPath()`.
- `process`: inicia somente o FFmpeg empacotado, sem shell e com argumentos estruturados.
- Efeitos declarados: `local_artifact` e `subprocess`.
- Rede: não utilizada.
- Secrets: nenhum.
- Terceiros que recebem dados: nenhum; a mídia permanece local.
- Custo do plugin: gratuito, sem cobrança por uso.

## Comportamento e limites conhecidos

- Formatos de áudio aceitos: AAC, FLAC, MP3, M4A/MP4, Ogg/Opus, WAV e WebM. Formatos de vídeo aceitos: AVI, MP4/MOV, WebM e Matroska. O handler força o demuxer correspondente ao MIME e permite apenas os protocolos locais `file` e `pipe`; playlists e referências externas não são autodetectadas.
- O ContentFlow v0.2 concede no máximo 120 segundos a cada invocação do plugin; o handler reserva 110 segundos para detectar e renderizar. Arquivos que excedam esse tempo retornam `TIMEOUT` não repetível e precisam ser divididos ou processados em uma futura capability assíncrona reiniciável.
- Seis horas são apenas o teto de validação defensiva da entrada, não uma promessa de processamento. O limite prático é a mídia que concluir dentro dos 110 segundos. O artifact final pode ter no máximo 4 GB.
- No máximo 400 segmentos falados são concatenados por execução. Se o limite for atingido, aumente a duração mínima do silêncio.
- Somente o primeiro stream de áudio é analisado. A capability de vídeo usa o primeiro stream de vídeo.
- Quando existem cortes, áudio é normalizado para AAC em M4A; vídeo para H.264/AAC em MP4. Metadados, capítulos, legendas e streams secundários não são preservados.
- Quando nenhum intervalo atende aos parâmetros, o arquivo original é copiado sem recodificação e mantém seu MIME.
- Se toda a mídia for classificada como silêncio, a execução termina com `INVALID_INPUT` em vez de produzir um arquivo vazio.
- `supportsCancellation` é `false` porque o executor imediato da v0.2 ainda não encaminha cancelamento recuperável ao subprocesso. O handler fecha o FFmpeg quando recebe um `AbortSignal` em testes/adapters que o forneçam.

## Validação

Na raiz do ContentFlow:

```powershell
npm run plugin:kit -- validate ./ecosystem/plugins/reference/silence-remover
npm run plugin:kit -- test-contract ./ecosystem/plugins/reference/silence-remover
npm run plugin:kit -- test-sandbox ./ecosystem/plugins/reference/silence-remover
npm run plugin:kit -- report ./ecosystem/plugins/reference/silence-remover
npm run plugin:kit -- check ./ecosystem/plugins/reference/silence-remover
```

O teste de contrato gera mídias sintéticas localmente, inclusive um vídeo cujas faixas começam em instantes diferentes para verificar sincronização. A fixture `fixtures/input.txt` contém áudio WAV apesar da extensão usada pelo sandbox do Plugin Kit.

## Licenças, suporte e segurança

O código do plugin segue a licença proprietária source-available incluída em [`LICENSE`](LICENSE). O executável FFmpeg é um programa separado, distribuído sob GPLv3 ou posterior, com licença, configuração do build, origem e acesso ao código-fonte preservados na distribuição.

Para suporte, use o repositório do ContentFlow. Vulnerabilidades devem seguir o canal privado indicado no arquivo `SECURITY.md` do projeto.
