# Blocos, operadores e Biblioteca Estratégica

## Árvore de decisão

Classifique pela origem do item manipulado:

1. Captura dado, mídia ou referência externa? Use `BUSCAR`.
2. Produz ativo, dado, arquivo ou síntese nova? Use `CRIAR`.
3. Aplica algo pré-existente em coleção estratégica do mesmo canal? Use `ESCOLHER`.
4. Audita, aprova, reprova, seleciona ou faz curadoria de algo da execução atual? Use `VALIDAR`.

Se houver dúvida entre `ESCOLHER` e `VALIDAR`, use `VALIDAR`, salvo coleção estratégica explicitamente pré-existente.

| Bloco | Use quando | Não use para |
| --- | --- | --- |
| `BUSCAR` | Recuperar informação, fonte, mídia ou dado externo. | Sintetizar ou decidir. |
| `CRIAR` | Produzir texto, lista, arquivo, imagem, áudio, vídeo ou síntese nova. | Apenas consultar fonte. |
| `ESCOLHER` | Aplicar item já cadastrado na Biblioteca Estratégica. | Selecionar resultado desta execução. |
| `VALIDAR` | Aprovar, reprovar ou selecionar resultado pesquisado/gerado. | Buscar fonte ou criar ativo inicial. |

## Operadores

Use `IA` para geração ou análise por modelo; `Humano` para julgamento, escrita ou aprovação manual; `Código` para lógica determinística, APIs, FFmpeg, webhooks ou automações. Se o responsável não estiver claro, use `Humano` e declare a suposição.

## Padrões corretos

- Pesquisa IA + seleção humana: `BUSCAR/IA` → `VALIDAR/Humano`.
- Geração de 100 ideias + escolha de uma: `CRIAR/IA` → `VALIDAR/Humano` com `select_one`.
- Pesquisa de fontes + escrita de roteiro: `BUSCAR/IA` → `CRIAR/IA`.
- Aplicação de layout já salvo: `ESCOLHER/Humano` com coleção do canal.
- Aprovação de thumbnail recém-criada: `CRIAR/IA` → `VALIDAR/Humano` com `approval`.
- Renderização de vídeo: `CRIAR/Código` com output `video`.

## Biblioteca Estratégica

Proponha coleção somente quando ela já existir antes da execução, for usada em vários vídeos, for realmente consumida por um bloco e possuir formato definível. Exemplos: banco permanente de temas aprovados, estruturas de título, layouts de thumbnail, regras editoriais e modelos narrativos.

Para cada proposta, documente nome, finalidade, campos, tipos, obrigatoriedade e processos consumidores. Não inclua `collectionId` em JSON portátil; ele pertence ao canal de destino. Uma lista criada para decidir o vídeo atual não é coleção.
