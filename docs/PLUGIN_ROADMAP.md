# Roadmap estratégico de plugins

Este documento registra a estratégia recomendada para iniciar o ecossistema de plugins do ContentFlow OS. Ele deve ser relido antes da implementação dos primeiros plugins e atualizado conforme as integrações forem validadas.

O protocolo normativo está em [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md) e o guia prático em [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md).

## 1. Princípio de desenvolvimento

O primeiro objetivo não é oferecer muitos fornecedores. É comprovar uma esteira vertical capaz de produzir um vídeo completo mantendo rastreabilidade entre os oito Processos Universais.

Um plugin deve oferecer capacidades atômicas para `BUSCAR`, `ESCOLHER`, `CRIAR` ou `VALIDAR`. Ele não deve esconder um método inteiro dentro de uma integração. Sequência, conexões, repetição e pausas humanas continuam pertencendo ao núcleo.

Plugins podem ter parâmetros locais como modelo, formato, proporção, resolução, voz ou qualidade. Esses parâmetros não devem se tornar configurações globais do Projeto. Quando obrigatórios, são validados no bloco antes da execução; quando opcionais, devem possuir padrões seguros e explícitos.

## 2. Primeira esteira vertical

Ordem recomendada de implementação:

1. **ContentFlow Reference Plugin**: executor determinístico, sem API externa, para testar o contrato completo.
2. **OpenAI Text & Vision**: capacidades estruturadas para tema, título, roteiro, planejamento visual e validação.
3. **Transcription & Alignment**: áudio ou vídeo para transcrição, SRT e cues temporizados.
4. **ElevenLabs Narration**: narração com alinhamento temporal.
5. **Pexels Media Search**: busca de fotos e vídeos de estoque.
6. **Image Generation**: geração de imagens para thumbnail e assets.
7. **ContentFlow Timeline Compiler**: transformação determinística do plano de mídia em timeline.
8. **Remotion Renderer**: composição e renderização programática.
9. **FFmpeg Toolkit**: inspeção, conversão, normalização, mixagem e acabamento.
10. **YouTube Publisher**: upload privado, thumbnail, legendas, metadados e verificação.

Essa seleção cobre uma produção completa com poucas dependências. Runway, HeyGen, outros LLMs e outros bancos de mídia entram depois que essa linha estiver confiável.

## 3. Catálogo mínimo por Processo Universal

### 3.1 Tema

| Plugin/capacidade       | Bloco     | Operador | Responsabilidade                                                        |
| ----------------------- | --------- | -------- | ----------------------------------------------------------------------- |
| YouTube Research        | `BUSCAR`  | Código   | Buscar vídeos, canais, títulos, datas e métricas relacionadas ao nicho. |
| Web Research            | `BUSCAR`  | IA       | Montar dossiê de fontes, fatos e evidências.                            |
| Trend & Keyword Scanner | `BUSCAR`  | Código   | Consultar tendências, palavras-chave e sinais de demanda.               |
| Theme Generator         | `CRIAR`   | IA       | Gerar temas estruturados a partir do canal e das referências.           |
| Theme Validator         | `VALIDAR` | IA       | Avaliar relevância, novidade, aderência e potencial editorial.          |

Prioridade inicial: YouTube Research, Theme Generator e Theme Validator.

### 3.2 Título

| Plugin/capacidade      | Bloco      | Operador | Responsabilidade                                                  |
| ---------------------- | ---------- | -------- | ----------------------------------------------------------------- |
| Title Reference Miner  | `BUSCAR`   | Código   | Encontrar títulos comparáveis e desempenho relativo.              |
| Title Pattern Selector | `ESCOLHER` | IA       | Selecionar uma estrutura da Biblioteca Estratégica.               |
| Title Generator        | `CRIAR`    | IA       | Produzir variações usando tema, estrutura e regras do canal.      |
| Title Linter           | `VALIDAR`  | Código   | Verificar tamanho, caracteres, repetição e regras objetivas.      |
| Title Judge            | `VALIDAR`  | IA       | Comparar clareza, curiosidade, promessa e fidelidade ao conteúdo. |

Validação objetiva e avaliação editorial devem permanecer separadas.

### 3.3 Thumbnail

| Plugin/capacidade            | Bloco      | Operador  | Responsabilidade                                                          |
| ---------------------------- | ---------- | --------- | ------------------------------------------------------------------------- |
| Thumbnail Reference Miner    | `BUSCAR`   | Código    | Buscar thumbnails concorrentes e referências.                             |
| Layout Selector              | `ESCOLHER` | IA        | Selecionar um `thumbnail_layout` da Biblioteca Estratégica.               |
| Thumbnail Planner            | `CRIAR`    | IA        | Definir headline, personagem, objetos, fundo, contraste e hierarquia.     |
| Image Generator & Compositor | `CRIAR`    | IA/Código | Gerar elementos e montar a composição programática.                       |
| Thumbnail Vision Validator   | `VALIDAR`  | IA        | Avaliar legibilidade, contraste, foco, poluição e coerência com o título. |

O planejamento deve produzir elementos estruturados e um layout, evitando obrigar o compositor a reinterpretar texto livre.

### 3.4 Roteiro

| Plugin/capacidade | Bloco     | Operador  | Responsabilidade                                                          |
| ----------------- | --------- | --------- | ------------------------------------------------------------------------- |
| Research Dossier  | `BUSCAR`  | IA        | Produzir fatos, argumentos, exemplos, objeções e fontes.                  |
| Script Architect  | `CRIAR`   | IA        | Construir seções, função narrativa e duração estimada.                    |
| Script Writer     | `CRIAR`   | IA        | Escrever o texto falado por seção.                                        |
| Script Segmenter  | `CRIAR`   | Código/IA | Transformar o roteiro final em segmentos identificados.                   |
| Script Validator  | `VALIDAR` | IA        | Verificar continuidade, repetição, promessa, ritmo e aderência às fontes. |

Contrato recomendado para `script_segments`:

| Campo                   | Tipo        | Regra                                      |
| ----------------------- | ----------- | ------------------------------------------ |
| `segment_id`            | texto       | ID estável e único na execução.            |
| `section_id`            | texto       | Referência à seção narrativa.              |
| `sequence`              | número      | Ordem crescente.                           |
| `spoken_text`           | texto longo | Texto efetivamente narrado.                |
| `visual_intent`         | texto longo | Intenção, não uma decisão final de asset.  |
| `estimated_duration_ms` | número      | Estimativa; nunca substitui o timing real. |
| `speaker`               | texto       | Opcional quando houver mais de uma voz.    |

O processo de Roteiro define o que será falado e a intenção visual. Ele não possui autoridade sobre o tempo final.

### 3.5 Narração e áudio

| Plugin/capacidade    | Bloco    | Operador  | Responsabilidade                                             |
| -------------------- | -------- | --------- | ------------------------------------------------------------ |
| ElevenLabs Narration | `CRIAR`  | IA        | Gerar voz e alinhamento temporal.                            |
| OpenAI Speech        | `CRIAR`  | IA        | Oferecer alternativa de TTS.                                 |
| Recording Ingest     | `BUSCAR` | Código    | Importar, converter e normalizar gravação humana.            |
| Speech Aligner       | `CRIAR`  | IA/Código | Transcrever áudio final e gerar cues.                        |
| Avatar Video         | `CRIAR`  | IA        | Produzir vídeo-base de avatar; HeyGen é candidato posterior. |

O timing oficial nasce do áudio final ou do vídeo falado. Se o provedor de TTS já devolver alinhamento, não é necessário transcrever novamente.

### 3.6 Assets visuais

| Plugin/capacidade       | Bloco    | Operador  | Responsabilidade                                        |
| ----------------------- | -------- | --------- | ------------------------------------------------------- |
| Transcript Cue Builder  | `CRIAR`  | Código/IA | Gerar SRT e cues temporizados.                          |
| Visual Coverage Planner | `CRIAR`  | IA        | Agrupar cues em momentos visuais e decidir a cobertura. |
| Stock Media Search      | `BUSCAR` | Código    | Buscar candidatos em Pexels ou outro catálogo.          |
| User Media Indexer      | `BUSCAR` | Código/IA | Inspecionar, descrever e indexar mídia do usuário.      |
| Image Generation        | `CRIAR`  | IA        | Gerar imagens para slots específicos.                   |
| Video Generation        | `CRIAR`  | IA        | Gerar clipes apenas quando o plano exigir.              |

Contrato recomendado para `timed_cues`:

| Campo        | Tipo        | Regra                                   |
| ------------ | ----------- | --------------------------------------- |
| `cue_id`     | texto       | ID estável e único.                     |
| `sequence`   | número      | Ordem crescente.                        |
| `start_ms`   | número      | Inteiro maior ou igual a zero.          |
| `end_ms`     | número      | Inteiro maior que `start_ms`.           |
| `text`       | texto longo | Texto falado nesse intervalo.           |
| `speaker`    | texto       | Opcional.                               |
| `segment_id` | texto       | Liga o cue ao roteiro, quando possível. |

O SRT é um artefato derivado para interoperabilidade. `timed_cues` é a fonte estruturada usada pelo sistema.

Não se deve gerar um asset para cada linha do SRT. A divisão de legenda obedece à leitura e à respiração, enquanto a unidade visual pode cobrir vários cues.

Contrato recomendado para `visual_slots`:

| Campo                          | Tipo        | Regra                                                                                   |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------- |
| `slot_id`                      | texto       | ID estável e único.                                                                     |
| `start_ms` / `end_ms`          | número      | Intervalo de cobertura.                                                                 |
| `first_cue_id` / `last_cue_id` | texto       | Intervalo contíguo de cues coberto pelo slot.                                           |
| `visual_role`                  | seleção     | `a_roll`, `b_roll`, `image`, `generated_image`, `generated_video`, `graphic` ou `text`. |
| `description`                  | texto longo | Resultado visual desejado.                                                              |
| `search_query`                 | texto       | Consulta para catálogo, quando aplicável.                                               |
| `generation_prompt`            | texto longo | Prompt para geração, quando aplicável.                                                  |
| `priority`                     | número      | Prioridade de preenchimento.                                                            |
| `transition`                   | texto       | Sugestão, não comando arbitrário.                                                       |

Contrato recomendado para `resolved_assets`:

| Campo              | Tipo                 | Regra                                             |
| ------------------ | -------------------- | ------------------------------------------------- |
| `asset_id`         | texto                | ID estável.                                       |
| `slot_id`          | texto                | Slot atendido.                                    |
| `file`             | arquivo/imagem/vídeo | Referência gerenciada pelo núcleo.                |
| `source_type`      | seleção              | `stock`, `user`, `generated` ou `recorded`.       |
| `source_url`       | URL                  | Opcional.                                         |
| `license`          | texto                | Obrigatório para mídia externa quando disponível. |
| `duration_ms`      | número               | Obrigatório para vídeo e áudio.                   |
| `width` / `height` | número               | Dimensões detectadas.                             |
| `selected`         | sim ou não           | Indica a escolha final.                           |

Regras como intervalo mínimo entre B-rolls, percentual máximo de cobertura, proteção de CTA e prioridade de A-roll ficam na Biblioteca Estratégica ou nos parâmetros locais do Visual Coverage Planner.

### 3.7 Edição

| Plugin/capacidade | Bloco     | Operador  | Responsabilidade                                                 |
| ----------------- | --------- | --------- | ---------------------------------------------------------------- |
| Timeline Compiler | `CRIAR`   | Código    | Transformar decisões editoriais em timeline determinística.      |
| Remotion Renderer | `CRIAR`   | Código    | Compor e renderizar vídeo, textos, overlays e animações.         |
| Caption Renderer  | `CRIAR`   | Código    | Estilizar e posicionar legendas a partir dos cues.               |
| Audio Mixer       | `CRIAR`   | Código    | Mixar voz, música e efeitos com fades e ducking.                 |
| FFmpeg Finisher   | `CRIAR`   | Código    | Ajustar codec, container, resolução, frame rate e bitrate.       |
| Video QC          | `VALIDAR` | Código/IA | Detectar falhas técnicas e complementar com avaliação editorial. |

Contrato recomendado para `timeline_items`:

| Campo                            | Tipo           | Regra                                                           |
| -------------------------------- | -------------- | --------------------------------------------------------------- |
| `timeline_item_id`               | texto          | ID estável.                                                     |
| `track`                          | texto          | Trilha lógica, como `a_roll`, `b_roll`, `caption`, `music`.     |
| `asset_id`                       | texto          | Referência ao asset resolvido.                                  |
| `start_ms` / `end_ms`            | número         | Posição na composição.                                          |
| `source_in_ms` / `source_out_ms` | número         | Recorte dentro da mídia original.                               |
| `fit`                            | seleção        | `cover`, `contain`, `stretch` ou regra suportada pelo renderer. |
| `position`                       | texto/registro | Posição serializável e validável.                               |
| `volume`                         | número         | Ganho normalizado.                                              |
| `transition`                     | texto          | Transição suportada.                                            |
| `z_index`                        | número         | Ordem visual.                                                   |

O Visual Coverage Planner decide onde entra B-roll. O Timeline Compiler converte a decisão em dados técnicos. O renderer executa essa timeline sem reinterpretar a estratégia.

Milissegundos inteiros são a unidade de troca entre plugins. Frames são calculados apenas pelo renderer usando seu `fps` local.

### 3.8 Publicação

| Plugin/capacidade     | Bloco     | Operador | Responsabilidade                                                |
| --------------------- | --------- | -------- | --------------------------------------------------------------- |
| Metadata Packager     | `CRIAR`   | IA       | Gerar descrição, capítulos, tags e comentário fixado.           |
| YouTube Upload        | `CRIAR`   | Código   | Enviar o vídeo inicialmente como privado ou não listado.        |
| Thumbnail Publisher   | `CRIAR`   | Código   | Definir a thumbnail final.                                      |
| Captions & Chapters   | `CRIAR`   | Código   | Publicar legendas e metadados temporais.                        |
| Publication Validator | `VALIDAR` | Código   | Confirmar processamento, privacidade, thumbnail, legenda e URL. |

A primeira versão deve publicar como privada e permitir validação humana antes de qualquer mudança para público.

## 4. Pipeline dos três processos críticos

```text
script_segments
  -> narração ou gravação
  -> timed_cues + SRT
  -> visual_slots
  -> resolved_assets
  -> timeline_items
  -> vídeo renderizado
  -> relatório de qualidade
```

Divisão de autoridade:

- **Roteiro:** conteúdo falado e intenção visual.
- **Narração:** tempo real do conteúdo falado.
- **Assets:** decisão de cobertura e seleção de mídia.
- **Edição:** compilação, renderização e acabamento técnico.

No caso de uma pessoa gravada ou avatar, o vídeo falado é a trilha-base `a_roll`. B-rolls são overlays temporizados e não exigem substituir o vídeo-base inteiro.

O teste arquitetural principal deve conseguir rastrear:

```text
segment_id -> cue_id -> slot_id -> asset_id -> timeline_item_id
```

Se essa cadeia permanecer íntegra, reprovações, substituições de assets e novas renderizações podem ocorrer sem reconstruir toda a produção.

## 5. Ondas de implementação

### Onda 0 — executor e conformidade

- ContentFlow Reference Plugin.
- Validação de manifesto e schemas.
- Execução isolada, timeout e cancelamento.
- Jobs assíncronos e retomada.
- Staging e ingestão de artefatos.
- Logs, progresso, uso e erros redigidos.

Critério de saída: todos os formatos e estados do protocolo passam por testes determinísticos.

### Onda 1 — texto e sincronização

- OpenAI Text & Vision.
- Transcription & Alignment.
- ElevenLabs Narration.
- Script Segmenter.
- Visual Coverage Planner.

Critério de saída: roteiro gera áudio e uma cadeia completa de IDs e tempos.

### Onda 2 — vídeo completo

- Pexels Media Search.
- Image Generation.
- Timeline Compiler.
- Remotion Renderer.
- FFmpeg Toolkit.
- Video QC.

Critério de saída: gerar um vídeo completo horizontal ou vertical conforme parâmetros do método/plugin.

### Onda 3 — distribuição

- YouTube Publisher.
- Metadata Packager.
- Thumbnail e captions.
- Verificação pós-upload.

Critério de saída: upload privado verificado de ponta a ponta.

### Onda 4 — expansão

- Runway ou outro gerador de vídeo.
- HeyGen ou outro gerador de avatar.
- Outros LLMs, TTS, catálogos e renderizadores.
- Plugins comunitários e webhooks.

## 6. Referências técnicas avaliadas

- [OpenAI: transcrição de áudio e timestamps](https://platform.openai.com/docs/api-reference/audio/voice-consent-list?lang=curl)
- [OpenAI: imagens e visão](https://platform.openai.com/docs/guides/images)
- [ElevenLabs: fala com timestamps](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps?explorer=true)
- [Pexels API](https://www.pexels.com/api/documentation/?language=javascript)
- [Runway API](https://docs.dev.runwayml.com/api/)
- [HeyGen: geração de avatar](https://docs.heygen.com/docs/create-video-archived)
- [Remotion: Sequence](https://www.remotion.dev/docs/sequence)
- [FFmpeg: filtros](https://ffmpeg.org/ffmpeg-filters.html)
- [YouTube Data API: vídeos](https://developers.google.com/youtube/v3/docs/videos)
- [YouTube Data API: thumbnails](https://developers.google.com/youtube/v3/docs/thumbnails/set)
