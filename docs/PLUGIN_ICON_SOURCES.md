# Fontes dos ícones dos plugins empacotados

Os ícones abaixo são cópias locais em PNG dos favicons publicamente associados aos domínios oficiais dos provedores. Eles foram obtidos em 2026-08-27 por meio do serviço de favicons do Google apenas durante o desenvolvimento e são servidos localmente pelo ContentFlow. O aplicativo não consulta esse serviço nem os sites dos provedores para montar a galeria.

O uso do ícone identifica a integração correspondente e não implica patrocínio, parceria ou propriedade da marca. Antes de cada distribuição pública, mudanças relevantes nas diretrizes das marcas devem ser revisadas. Quando não há uma única marca representativa, o produto usa fallback neutro.

| Plugin                         | Domínio de origem   |
| ------------------------------ | ------------------- |
| Anthropic Claude               | `anthropic.com`     |
| AssemblyAI SRT Studio          | `assemblyai.com`    |
| ChatGPT Browser Studio         | `chatgpt.com`       |
| Claude Browser Studio          | `claude.ai`         |
| Codex Skill Runner             | `openai.com`        |
| Microsoft Edge TTS             | `microsoft.com`     |
| ElevenLabs Audio               | `elevenlabs.io`     |
| Vídeo por Sequência de Imagens | `ffmpeg.org`        |
| Gemini Browser Studio          | `gemini.google.com` |
| Google Flow Browser Images     | `labs.google`       |
| Grok Browser Studio            | `grok.com`          |
| Meta AI Browser Studio         | `meta.ai`           |
| OpenAI Models                  | `openai.com`        |

`Free Stock Media Studio` agrega vários catálogos e `Removedor de Silêncios` é uma ferramenta local; por isso, ambos usam o fallback visual do núcleo.

## Revisão de distribuição

Revisão feita em 2026-08-27 nas páginas oficiais disponíveis. Encontrar um favicon público não concede automaticamente licença para redistribuí-lo dentro do instalador.

| Provedor                                   | Resultado da revisão                                                                                                                            | Fonte oficial                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| OpenAI                                     | Uso relacionado aos serviços é condicionado às diretrizes, sem alteração, sem destaque superior à marca do aplicativo e sem sugerir endosso.    | <https://openai.com/brand/>                                             |
| Google                                     | O Brand Resource Center exige consultar a orientação e a necessidade de permissão para cada produto ou serviço.                                 | <https://about.google/brand-resource-center/>                           |
| Microsoft                                  | Logos e ícones de produto normalmente exigem autorização/licença expressa.                                                                      | <https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks> |
| Meta                                       | A página oficial informa que todo uso do logotipo Meta exige aprovação.                                                                         | <https://www.meta.com/brand/resources/meta/company-brand/>              |
| xAI/Grok                                   | A marca possui diretrizes próprias e exige atribuição em usos abrangidos; a adequação do favicon empacotado não ficou expressamente autorizada. | <https://x.ai/legal/brand-guidelines>                                   |
| Anthropic, AssemblyAI, ElevenLabs e FFmpeg | A revisão inicial não encontrou autorização oficial ampla e inequívoca para redistribuir o favicon como asset do aplicativo.                    | Revisão específica ou permissão ainda necessária.                       |

### Regra para a release

- Não considerar favicon público como asset automaticamente redistribuível.
- Manter nome textual factual do provedor e aviso de ausência de patrocínio.
- Antes da release pública, obter asset e permissão compatíveis ou substituir o PNG pelo fallback neutro do núcleo.
- O campo opcional `branding.iconPath` continua disponível para plugins cujos autores declarem possuir os direitos do próprio ícone.
