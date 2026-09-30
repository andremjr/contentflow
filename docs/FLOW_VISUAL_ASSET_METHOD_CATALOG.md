# Catálogo de Métodos de Assets Visuais com Google Flow

Status: planejamento funcional, sem implementação.

Este documento inventaria os **diferentes Métodos de geração de assets visuais** que podem ser criados no ContentFlow a partir das possibilidades encontradas na extensão **Estúdio de Canais Dark — Free**, com foco no Google Flow.

A fonte analisada foi `C:\Users\andre\Downloads\Estudio de Canais Dark - Free\extension`, especialmente `bundles\flow-bundle.js`. A extensão foi usada para descobrir possibilidades do Flow, não como modelo de interface ou arquitetura.

## O que está sendo contado

O objetivo não é criar um Método único que faça tudo. Cada Método representa uma rotina específica, configurada uma vez para um Canal e repetida em todos os Projetos daquele Canal.

Exemplos:

- um Canal pode usar sempre prompts sem referência;
- outro pode usar sempre uma imagem fixa de personagem;
- outro pode gerar primeiro uma ficha de personagens, aprová-la e só então gerar as cenas;
- outro pode gerar imagens e animar todas;
- outro pode animar apenas as cenas escolhidas pelo usuário.

Essas rotinas são Métodos diferentes porque possuem origens de dados, dependências ou decisões diferentes.

Modelo, proporção, duração, resolução, quantidade de variantes, projeto novo/existente, perfil de conta e política de retry **não criam uma nova família de Método**. São configurações persistidas dentro do Método ou controles do núcleo.

## Resultado do inventário

Foram identificadas **14 famílias canônicas de Métodos**:

- 6 para referências e imagens;
- 3 para geração direta ou animação de vídeo;
- 3 pipelines de imagem para vídeo;
- 2 pipelines avançados de produção.

O número de arquivos de Método concretos pode ser maior, porque cada família pode ter uma versão automática e outra curada por humanos. Também podem existir presets por proporção, modelo ou duração. Esses presets não representam um fluxo funcional novo.

## Visão geral

| ID | Método | Entrada principal | Entrega | Blocos recomendados |
| --- | --- | --- | --- | ---: |
| F01 | Criar pacote de referências | prompts de personagens/objetos/estilo | referências aprovadas | 3 |
| F02 | Texto para imagens em lote | lista de prompts | imagens | 2–3 |
| F03 | Texto + referências fornecidas para imagens | prompts + arquivos de referência | imagens consistentes | 2–3 |
| F04 | Gerar referências e depois cenas | prompts de referência + prompts de cena | imagens consistentes | 5 |
| F05 | Criar variações a partir de imagens-base | imagens + instruções | novas imagens | 2–3 |
| F06 | Gerar cenas com continuidade sequencial | plano de cenas com dependências | imagens encadeadas | 3, com ressalva |
| F07 | Texto para vídeos em lote | prompts de vídeo | vídeos | 2–3 |
| F08 | Texto + elementos de referência para vídeos | prompts + referências | vídeos consistentes | 2–3 |
| F09 | Animar imagens fornecidas | imagens + prompts de movimento | vídeos | 2–3 |
| F10 | Gerar imagens e animar todas | prompts de cena | imagens + vídeos | 3–5 |
| F11 | Gerar imagens e animar apenas as escolhidas | prompts de cena | imagens + vídeos selecionados | 4–6 |
| F12 | Referências → imagens consistentes → vídeos | referências + cenas | pacote visual completo | 7–8 |
| F13 | Continuidade sequencial de imagem e vídeo | cenas dependentes | sequência visual contínua | 5, com ressalva |
| F14 | Plano híbrido por cena | plano indicando imagem, vídeo ou ambos | pacote misto | 8 |

## Grupo A — Referências e imagens

### F01 — Criar pacote de referências

Objetivo: gerar e aprovar uma biblioteca visual temporária para o Projeto atual, como personagens, produtos, cenários ou direção de arte.

Fluxo:

1. `CRIAR · Humano/IA` — informar os nomes e prompts das referências.
2. `CRIAR · IA · Flow` — gerar uma ou mais candidatas por referência.
3. `VALIDAR · Humano` — escolher a referência oficial de cada grupo.

Entradas:

- lista de referências nomeadas;
- prompt de cada referência;
- arquivos já existentes, quando houver.

Saídas:

- imagens de referência selecionadas;
- associação entre cada arquivo e sua referência de origem;
- URL do projeto Flow, quando utilizada.

Uso típico: produzir uma ficha visual antes do Método principal de cenas, ou entregar apenas um pacote de personagens e estilo.

### F02 — Texto para imagens em lote

É o Método já exemplificado no Canal atual.

Fluxo mínimo:

1. `CRIAR · Humano` — fornecer uma lista ordenada de prompts.
2. `CRIAR · IA · Flow` — gerar as imagens.

Versão curada:

3. `VALIDAR · Humano` — escolher uma variante por prompt.

Configuração persistida no Método:

- modelo de imagem;
- proporção;
- quantidade de variantes;
- política de seleção automática ou humana;
- projeto novo ou continuidade em projeto existente.

### F03 — Texto + referências fornecidas para imagens

Objetivo: gerar todas as cenas usando imagens que já existem como referência de personagem, produto, cenário ou estilo.

Fluxo:

1. `CRIAR · Humano` — fornecer prompts e imagens de referência, ou receber esses dados de outra fonte do Projeto.
2. `CRIAR · IA · Flow` — enviar cada prompt com as referências configuradas.
3. `VALIDAR · Humano` — opcionalmente escolher uma candidata por cena.

A rotina do Canal define uma vez quais referências são aplicadas:

- a todas as cenas;
- apenas às cenas relacionadas;
- como personagem, objeto, cenário ou referência estética.

O plugin faz o upload técnico ao Flow. Upload não precisa ser um Bloco separado.

### F04 — Gerar referências e depois cenas

Objetivo: criar referências dentro da própria execução e usá-las para gerar cenas consistentes.

Fluxo:

1. `CRIAR · Humano/IA` — estruturar prompts de referências e prompts de cenas.
2. `CRIAR · IA · Flow` — gerar as candidatas de referência.
3. `VALIDAR · Humano` — escolher as referências oficiais.
4. `CRIAR · IA · Flow` — gerar as cenas usando as referências aprovadas.
5. `VALIDAR · Humano` — escolher as imagens oficiais das cenas.

Essa é a tradução ContentFlow da automação da extensão que cria personagens antes das cenas. A diferença é que as referências deixam de ser estado interno da extensão e passam a ser entregas persistidas entre os Blocos.

Uma versão automática pode eliminar os Blocos 3 e 5 escolhendo a primeira candidata, mas isso deve estar declarado no Método.

### F05 — Criar variações a partir de imagens-base

Objetivo: usar uma imagem existente como referência para gerar novas versões, mudanças de enquadramento, pose, cenário ou direção de arte.

Fluxo:

1. `CRIAR · Humano` — fornecer imagens-base e instruções de transformação.
2. `CRIAR · IA · Flow` — gerar as novas imagens.
3. `VALIDAR · Humano` — opcionalmente escolher a melhor variação.

Esse Método se diferencia do F03 porque a imagem-base é o objeto principal da transformação, e não apenas uma referência compartilhada por várias cenas.

### F06 — Gerar cenas com continuidade sequencial

Objetivo: fazer uma cena depender da imagem escolhida em uma cena anterior, reproduzindo o uso de referências como `[Cena N]` encontrado na extensão.

Fluxo conceitual:

1. `CRIAR · Humano/IA` — produzir o plano ordenado e declarar as dependências entre cenas.
2. `CRIAR · IA · Flow` — gerar cada cena somente quando a imagem de que ela depende estiver disponível.
3. `VALIDAR · Humano` — revisar as imagens finais.

Versão automática atual:

- o plugin gera uma ou mais candidatas;
- uma política predefinida escolhe a candidata que alimentará a próxima cena;
- a validação humana pode acontecer ao final.

Versão curada desejada:

- gerar candidatas da cena 1;
- pausar para escolha humana;
- usar a escolhida na cena 2;
- repetir até o final.

Essa versão curada exige que o núcleo suporte um checkpoint de validação por unidade durante um Bloco orquestrado. Sem isso, seria necessário criar manualmente um Bloco por cena, o que não é uma solução aceitável para listas variáveis.

## Grupo B — Vídeo direto e animação

### F07 — Texto para vídeos em lote

Objetivo: gerar vídeos diretamente a partir de prompts, sem imagem intermediária.

Fluxo:

1. `CRIAR · Humano` — fornecer a lista de prompts de vídeo.
2. `CRIAR · IA · Flow` — gerar os vídeos com Veo ou outro modelo disponível.
3. `VALIDAR · Humano` — opcionalmente escolher uma variante por prompt.

Configuração persistida:

- modelo;
- duração;
- proporção;
- resolução;
- voz ou áudio, quando suportados;
- quantidade de variantes.

### F08 — Texto + elementos de referência para vídeos

Objetivo: gerar vídeo por texto usando imagens como elementos de personagem, produto, cenário ou estilo.

Fluxo:

1. `CRIAR · Humano` — fornecer prompts e referências, ou receber referências já produzidas.
2. `CRIAR · IA · Flow` — gerar vídeos usando as referências como elementos.
3. `VALIDAR · Humano` — opcionalmente escolher uma versão por cena.

Esse Método é diferente do F09: aqui as imagens orientam o conteúdo do vídeo, mas não precisam ser o frame inicial exato.

### F09 — Animar imagens fornecidas

Objetivo: transformar imagens existentes em vídeos.

Fluxo:

1. `CRIAR · Humano` — fornecer imagens e prompts opcionais de movimento/câmera.
2. `CRIAR · IA · Flow` — animar cada imagem.
3. `VALIDAR · Humano` — opcionalmente escolher uma variante de vídeo.

Configurações fixadas no Método:

- usar a imagem como frame ou como elemento;
- duração e proporção;
- modelo e resolução;
- política para prompts ausentes;
- voz, quando a combinação for compatível.

## Grupo C — Pipelines de imagem para vídeo

### F10 — Gerar imagens e animar todas

Objetivo: criar uma imagem para cada prompt e transformar todas as imagens resultantes em vídeos.

Fluxo compacto:

1. `CRIAR · Humano` — fornecer prompts de imagem e, opcionalmente, movimento.
2. `CRIAR · IA · Flow` — gerar imagens.
3. `CRIAR · IA · Flow` — animar todas as imagens.

Versão curada:

4. `VALIDAR · Humano` entre os Blocos 2 e 3 para escolher a imagem de cada cena.
5. `VALIDAR · Humano` após os vídeos para escolher as versões finais.

Os prompts de movimento podem vir separados ou, se o Método assim definir, ser derivados do prompt visual.

### F11 — Gerar imagens e animar apenas as escolhidas

Objetivo: produzir imagens para todas as cenas, mas gastar geração de vídeo apenas em cenas selecionadas.

Fluxo:

1. `CRIAR · Humano` — fornecer prompts de imagem e de movimento.
2. `CRIAR · IA · Flow` — gerar as imagens.
3. `VALIDAR · Humano` — escolher uma imagem por cena.
4. `VALIDAR · Humano` — selecionar quais cenas serão animadas.
5. `CRIAR · IA · Flow` — animar somente as selecionadas.
6. `VALIDAR · Humano` — opcionalmente escolher uma versão de vídeo.

A extensão oferece critérios como primeiras, últimas, distribuídas ou índices manuais. No ContentFlow, um Método pode fixar uma dessas políticas e eliminar o Bloco 4, ou pode manter a decisão humana explícita.

### F12 — Referências → imagens consistentes → vídeos

Objetivo: executar o pipeline visual completo com consistência de personagens ou outros elementos recorrentes.

Fluxo:

1. `CRIAR · Humano/IA` — estruturar referências, cenas e movimentos.
2. `CRIAR · IA · Flow` — gerar referências.
3. `VALIDAR · Humano` — escolher referências.
4. `CRIAR · IA · Flow` — gerar imagens das cenas.
5. `VALIDAR · Humano` — escolher imagens.
6. `CRIAR · IA · Flow` — animar todas ou as cenas marcadas pelo Método.
7. `VALIDAR · Humano` — escolher vídeos.
8. `CRIAR · Código` — opcionalmente consolidar imagens, vídeos e referências na entrega final.

Este é um Método possível entre vários; não é “o Método completo do Flow” que os demais deveriam imitar.

## Grupo D — Pipelines avançados

### F13 — Continuidade sequencial de imagem e vídeo

Objetivo: produzir uma sequência em que uma cena depende visualmente da anterior e, depois de aprovada, também é animada.

Fluxo conceitual:

1. `CRIAR · Humano/IA` — estruturar cenas, dependências e prompts de movimento.
2. `CRIAR · IA · Flow` — gerar imagens respeitando a cadeia de dependências.
3. `VALIDAR · Humano` — selecionar as imagens que estabelecem a continuidade.
4. `CRIAR · IA · Flow` — animar as imagens selecionadas.
5. `VALIDAR · Humano` — revisar os vídeos.

Assim como o F06, a versão realmente curada precisa de validação intercalada por unidade. Enquanto isso não existir no núcleo, o Método só pode usar seleção automática durante a cadeia ou exigir um número fixo de Blocos de cena.

### F14 — Plano híbrido por cena

Objetivo: aceitar um plano em que algumas cenas precisam apenas de imagem, outras usam texto direto para vídeo e outras precisam de imagem seguida de animação.

Fluxo recomendado:

1. `CRIAR · Humano/IA` — produzir registros de cena com `output_mode`.
2. `CRIAR · Código` — separar cenas em `image_only`, `text_to_video` e `image_to_video`.
3. `CRIAR · IA · Flow` — gerar imagens para os dois grupos que precisam de imagem.
4. `VALIDAR · Humano` — escolher imagens, quando necessário.
5. `CRIAR · IA · Flow` — gerar diretamente os vídeos do grupo `text_to_video`.
6. `CRIAR · IA · Flow` — animar as imagens do grupo `image_to_video`.
7. `VALIDAR · Humano` — revisar os vídeos dos dois grupos.
8. `CRIAR · Código` — reunir os resultados novamente na ordem original das cenas.

Esse Método traduz as marcações de imagem, vídeo ou ambos encontradas na extensão para dados estruturados. O plugin não deve depender de códigos textuais como `(i)`, `(v)` ou `(iv)`.

## Variações que não aumentam as 14 famílias

Cada família pode originar arquivos de Método distintos para um Canal, mas continua representando o mesmo desenho de dados.

### Automático versus curado

- automático: uma candidata ou seleção da primeira candidata;
- curado: várias candidatas seguidas de `VALIDAR`;
- híbrido: seleção humana apenas para referências ou cenas importantes.

### Projeto do Flow

- sempre criar projeto novo;
- continuar em uma URL fornecida;
- reutilizar o projeto resolvido por Bloco anterior.

Isso deve ser configuração persistida da capability e saída `project_url`, não um Bloco obrigatório em todos os Métodos.

### Configurações de mídia

- modelo;
- proporção;
- duração;
- resolução;
- frame versus elemento;
- voz/áudio;
- quantidade de variantes.

Essas escolhas pertencem à interface do plugin e ficam salvas no Bloco do Método.

### Política de execução

- todas as imagens antes dos vídeos;
- processamento contínuo;
- concorrência permitida;
- intervalo entre envios;
- retry e rate limit;
- um perfil com fallback ordenado ou distribuição paralela.

Essas políticas pertencem ao núcleo e ao executor. Só criam outro Método quando alteram as etapas editoriais ou as origens dos dados.

## Recursos da extensão que não são Métodos

| Recurso | Tradução correta |
| --- | --- |
| Galeria, busca e lightbox | visualização das entregas |
| Pausar, retomar e cancelar | controles universais da execução |
| Fila e concorrência | orquestração do núcleo |
| Download de selecionados | materialização/promoção de artifacts |
| Renomear mídia dentro do Flow | detalhe operacional do plugin |
| Regenerar uma candidata | ação universal sobre item |
| Escolher uma candidata | `VALIDAR` ou ação de seleção |
| Criar projeto/renomear projeto | configuração e contexto da capability |
| Upload técnico ao Flow | consequência de uma porta de conteúdo com representação `artifact` |
| Retentativas e rate limit | política do executor |

Upscale só vira um Bloco adicional quando realmente cria um novo artifact derivado. Escolher uma resolução nativa antes da geração continua sendo configuração do Bloco que gera a mídia.

## Contratos compartilhados entre os Métodos

### Cenas

Os Métodos que trabalham com um plano estruturado devem usar registros como:

| Campo | Tipo | Função |
| --- | --- | --- |
| `scene_key` | texto | chave editorial estável |
| `order` | número | posição da cena |
| `image_prompt` | `text/one/inline` opcional | instrução de imagem; apresentação pode usar campo multilinha |
| `video_prompt` | `text/one/inline` opcional | movimento e câmera; apresentação pode usar campo multilinha |
| `output_mode` | `selection/one` | imagem, vídeo ou ambos |

### Referências

Referências nomeadas devem ter registros próprios e relações explícitas:

- `reference_specs`: nome, prompt e papel;
- `scene_reference_links`: qual referência pertence a qual cena;
- `scene_dependencies`: qual cena depende da imagem selecionada em outra.

Tokens como `[Personagem]` e `[Cena 4]` podem existir na interface de entrada por conveniência, mas o primeiro Bloco deve convertê-los nessas relações antes da geração.

### Candidatas

Cada imagem ou vídeo gerado precisa ser um item/artifact persistido pelo núcleo com:

- identidade concedida pelo ContentFlow;
- relação com a cena ou referência de origem;
- índice da variante;
- tentativa e estado;
- arquivo materializado;
- proveniência e ID externo do Flow;
- estado de seleção.

## Capabilities necessárias do plugin Flow

As 14 famílias não exigem 14 capabilities. O Método combina um conjunto menor de operações reutilizáveis.

Capabilities principais:

1. gerar imagens;
2. gerar imagens de referência;
3. gerar vídeo por texto;
4. animar imagem;
5. consultar modelos e combinações disponíveis;
6. opcionalmente gerar upscale/derivados.

O manifesto atual já possui:

- `generate-images-in-browser`;
- `animate-image-in-browser`;
- `generate-video-in-browser`;
- `produce-visual-assets-in-browser`.

As três primeiras são as bases corretas. `produce-visual-assets-in-browser` pode continuar como atalho compatível, mas não deve concentrar a definição dos Métodos. Geração de referências precisa ser declarada de forma explícita ou como modo claramente tipado da capability de imagem.

## Lacunas do núcleo reveladas pelo catálogo

Para representar todas as famílias sem devolver lógica editorial ao plugin, o núcleo ainda precisa garantir:

1. seleção agrupada de uma candidata por item de origem;
2. filtragem de itens selecionados para o Bloco seguinte;
3. checkpoint humano intercalado durante item orchestration;
4. dependências entre unidades, como cena 5 aguardando a seleção da cena 2;
5. divisão e reunião de grupos preservando ordem e identidade;
6. contexto de projeto Flow por lane/perfil em execução paralela;
7. propagação incremental de artifacts para Blocos dependentes.

As lacunas 3 e 4 afetam diretamente os Métodos F06 e F13. Até serem resolvidas, esses dois fluxos só funcionam plenamente com seleção automática durante a cadeia.

## Prioridade recomendada para transformar o catálogo em Métodos reais

### Primeira etapa — já compatível com a arquitetura atual

- F02 — texto para imagens;
- F03 — texto + referências fornecidas;
- F07 — texto para vídeos;
- F09 — animar imagens fornecidas;
- F10 — gerar imagens e animar todas.

### Segunda etapa — exige seleção e correlação mais fortes

- F01 — pacote de referências;
- F04 — gerar referências e cenas;
- F05 — variações de imagens-base;
- F08 — texto + referências para vídeo;
- F11 — animar apenas as escolhidas;
- F12 — pipeline completo com referências.

### Terceira etapa — exige evolução do runtime

- F06 — continuidade sequencial de imagens;
- F13 — continuidade sequencial de imagem e vídeo;
- F14 — plano híbrido com divisão e reunião por cena.

## Conclusão

O Flow não corresponde a um Método único. A extensão revela um conjunto de operações que, combinadas dentro da arquitetura do ContentFlow, formam **14 famílias úteis de Métodos de Assets Visuais**.

A vantagem do ContentFlow é justamente transformar cada combinação escolhida pelo criador do Canal em uma rotina persistente. O usuário operacional não precisa reconfigurar toda a extensão a cada vídeo: ele escolhe ou executa o Método daquele Canal, fornece apenas as entradas variáveis e acompanha as validações previstas.

Este documento não altera plugin, interface, schema, runtime ou arquivo importável de Método. Ele define o catálogo que deve orientar essas implementações futuras.
