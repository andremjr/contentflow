# Blocos, operadores e Biblioteca Estratégica

## Árvore de decisão

Classifique pela origem do item manipulado:

1. Captura dado, mídia ou referência externa? Use `BUSCAR`.
2. Produz ativo, dado, arquivo ou síntese nova? Use `CRIAR`.
3. Aplica algo pré-existente em coleção estratégica do mesmo canal? Use `ESCOLHER`.
4. Audita, aprova, reprova, seleciona ou faz curadoria de algo da execução atual? Use `VALIDAR`.

Se houver dúvida entre `ESCOLHER` e `VALIDAR`, use `VALIDAR`, salvo coleção estratégica explicitamente pré-existente.

| Bloco      | Use quando                                                            | Não use para                         |
| ---------- | --------------------------------------------------------------------- | ------------------------------------ |
| `BUSCAR`   | Recuperar informação, fonte, mídia ou dado externo.                   | Sintetizar ou decidir.               |
| `CRIAR`    | Produzir texto, lista, arquivo, imagem, áudio, vídeo ou síntese nova. | Apenas consultar fonte.              |
| `ESCOLHER` | Aplicar item já cadastrado na Biblioteca Estratégica.                 | Selecionar resultado desta execução. |
| `VALIDAR`  | Aprovar, reprovar ou selecionar resultado pesquisado/gerado.          | Buscar fonte ou criar ativo inicial. |

## Operadores

Use `IA` para geração ou análise por modelo; `Humano` para julgamento, escrita ou aprovação manual; `Código` para lógica determinística, APIs, FFmpeg, webhooks ou automações. Se o responsável não estiver claro, use `Humano` e declare a suposição.

## Padrões corretos

- Pesquisa IA + seleção humana: `BUSCAR/IA` → `VALIDAR/Humano`.
- Geração de 100 ideias + escolha de uma: `CRIAR/IA` → `VALIDAR/Humano` com `select_one`.
- Pesquisa de fontes + escrita de roteiro: `BUSCAR/IA` → `CRIAR/IA`.
- Aplicação de layout já salvo: `ESCOLHER/Humano` com coleção do canal.
- Aprovação de thumbnail recém-criada: `CRIAR/IA` → `VALIDAR/Humano` com `approval`.
- Renderização de vídeo: `CRIAR/Código` com output `video`.
- Geração de imagens seguida de animação: `CRIAR/IA` com `image/many/artifact` → opcional `VALIDAR` → `CRIAR/IA` com `video/many/artifact`.

## Granularidade estratégica

Não copie automaticamente para um Bloco o agrupamento oferecido pela interface de um plugin. Separe duas operações quando o resultado intermediário tiver valor estratégico: puder ser validado, reutilizado, encaminhado a outro Bloco, produzido por outro executor ou preservado enquanto a etapa seguinte é refeita. Mudança de família ou significado — por exemplo, imagem para vídeo — é um forte sinal de fronteira entre Blocos.

Agrupe somente detalhes internos inseparáveis da mesma ação, sem entrega intermediária útil nem decisão própria. O objetivo não é criar o maior número de Blocos, mas tornar explícitas as decisões, entregas e fronteiras de retry que dão ao ContentFlow sua vantagem estrutural.

## Biblioteca Estratégica

Proponha coleção somente quando ela já existir antes da execução, for usada em vários vídeos, for realmente consumida por um bloco e possuir formato definível. Exemplos: banco permanente de temas aprovados, estruturas de título, layouts de thumbnail, regras editoriais e modelos narrativos.

Para cada proposta, documente nome, finalidade, campos, tipos, obrigatoriedade e processos consumidores. Um bloco `ESCOLHER` pode permanecer no JSON portátil como requisito estrutural, mas `collectionId` nunca é exportado porque pertence ao canal de destino; reassocie a coleção depois de importar. Uma lista criada para decidir o vídeo atual não é coleção.
