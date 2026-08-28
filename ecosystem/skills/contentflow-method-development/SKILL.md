---
name: contentflow-method-development
description: Criação, revisão, validação e importação de Métodos para o ContentFlow, incluindo processos universais, blocos, operadores, prompts, parâmetros, contratos tipados, validações, retries, entregas e arquivos .contentflow-method.json.
---

# Desenvolvimento de Métodos no ContentFlow

Use esta skill para modelar processos executáveis de produção de vídeo no ContentFlow. O objetivo é produzir Métodos portáveis, explícitos, validáveis e compatíveis com o contrato do sistema; não criar plugins, clonar o produto, inventar APIs ou prometer automações que não estejam configuradas.

## Princípios obrigatórios

1. **Modele um vídeo individual.** Estratégia permanente de canal, nicho, público, posicionamento, monetização, mercado e audiência geral ficam fora do Método. Só proponha uma coleção da Biblioteca Estratégica quando ela já existir antes do vídeo, for reutilizada em vários vídeos, for consumida por um bloco e tiver schema definível.
2. **Use um processo por arquivo.** Todo arquivo importável contém exatamente um `processType`: `theme`, `title`, `thumbnail`, `script`, `narration`, `assets`, `editing` ou `publishing`.
3. **Classifique pela origem do item.** `BUSCAR` recupera dados externos; `CRIAR` produz algo novo; `ESCOLHER` aplica item pré-existente de coleção estratégica do mesmo canal; `VALIDAR` aprova, reprova ou seleciona resultado produzido durante a execução.
4. **Escolha o executor real.** Use `IA`, `Humano` ou `Código`. Se o relato não esclarecer, use `Humano` e registre a suposição; não esconda revisão humana em prompt de IA.
5. **Separe contrato de dados de apresentação.** `type` define o valor universal; `presentation` só define renderer. Não inclua HTML, scripts, React, secrets, `deliveryId` ou `itemId` no Método.
6. **Preserve decisões e proveniência.** Inputs devem apontar estruturalmente para Projeto, processo anterior, bloco anterior, Biblioteca ou contexto estático; o runtime resolve os IDs concretos.
7. **Não permita conflitos de contrato.** Antes de conectar qualquer output a input, valide `type`, schema (`recordFields`/`options`), cardinalidade, obrigatoriedade, MIME/apresentação e proveniência. Leia [data-compatibility.md](references/data-compatibility.md). Se a conexão não for compatível, altere o contrato, insira transformação explícita ou peça esclarecimento; nunca faça coerção silenciosa.

## Fluxo principal

Siga esta sequência em qualquer criação ou revisão:

1. **Identifique a fonte e o objetivo.** Determine se há briefing, relato, transcrição, tutorial, URL pública ou combinação. Se a transcrição de um vídeo não estiver disponível, peça o texto; não invente etapas.
2. **Extraia o processo.** Para cada etapa, registre objetivo, entrada, ação, responsável, decisão, critério de qualidade e entrega.
3. **Faça a triagem de escopo.** Separe contexto estratégico, proposta de Biblioteca Estratégica, execução do vídeo e conteúdo fora do aplicativo. Converta somente a execução em blocos.
4. **Escolha o processo universal.** Se o fluxo atravessar vários processos, divida-o em arquivos separados e conecte-os com `previous_process`.
5. **Mapeie blocos e operadores.** Use a árvore de decisão de [blocks-and-operators.md](references/blocks-and-operators.md). Em dúvida entre `ESCOLHER` e `VALIDAR`, use `VALIDAR`, salvo coleção estratégica explicitamente pré-existente.
6. **Defina o contrato de cada bloco.** Declare `inputs`, `outputs`, `parameters`, `instructions`, `order` e, quando aplicável, `validation`, `recordFields`, `presentation` e configuração de plugin.
7. **Projete prompts e configurações.** Separe instruções imperativas, parâmetros editáveis, configuração do executor, settings locais e secrets. Leia [prompt-design.md](references/prompt-design.md) quando houver IA, placeholders ou formato estruturado.
8. **Conecte as referências.** Use `previous_block` apenas no mesmo Método; use `previous_process` para processos anteriores; use `project` apenas para `title`/`deadline`; use `static` para contexto fixo.
9. **Modele validação.** Para aprovação, seleção ou reprovação de resultado gerado/pesquisado, use `VALIDAR` com `targetBlockId`, `targetOutputKey`, `mode`, `onReject` e `maxAttempts`.
10. **Mostre uma prévia antes do JSON**, salvo pedido explícito de JSON pronto. Inclua processo, resumo, blocos, exclusões estratégicas, coleções propostas, suposições e perguntas mínimas.
11. **Gere e valide o JSON.** Use [method-format.md](references/method-format.md), o template em `templates/method-skeleton.json` e a lista de validação em [validation.md](references/validation.md), incluindo obrigatoriamente a matriz de [data-compatibility.md](references/data-compatibility.md).
12. **Teste e importe.** Salve como `.contentflow-method.json`, importe no processo do Canal, configure coleções/plugins/secrets manualmente e execute um Projeto de teste antes da produção.

## Decisões rápidas

| Necessidade | Decisão |
| --- | --- |
| Pesquisar notícias, canais, API, fontes ou mídia externa | `BUSCAR` |
| Gerar lista, texto, áudio, imagem, vídeo, arquivo ou síntese | `CRIAR` |
| Aplicar template/layout/estrutura já salvo na Biblioteca do Canal | `ESCOLHER` com `collectionId` no Canal; não gerar em JSON portátil |
| Aprovar, reprovar, escolher ou curar resultado desta execução | `VALIDAR` |
| Tema recém-gerado e escolha humana | `CRIAR` → `VALIDAR/select_one` |
| Banco permanente reutilizado em vários vídeos | Propor coleção; não misturar automaticamente no JSON portátil |
| Contexto de canal anterior aos vídeos | Excluir do Método e documentar na prévia |
| Output de processo anterior | `previous_process` + `sourceProcessType` + `sourceKey` |
| Output de bloco anterior do mesmo processo | `previous_block` + `blockId` + `sourceKey` |

## Contrato mínimo de bloco

Cada bloco usa IDs únicos, `order` sequencial começando em 0 e `parameters` mesmo quando vazia. Instruções devem ser imperativas, observáveis e curtas: ação, contexto, restrições, critério de qualidade e entrega. Cada bloco deve produzir uma saída útil, exceto a semântica especial de `ESCOLHER` configurada na coleção.

Os tipos universais são `text`, `textarea`, `number`, `select`, `boolean`, `multiselect`, `list`, `records`, `datetime`, `url`, `file`, `image`, `audio`, `video`, `files`, `approval` e `thumbnail_layout`. Parâmetros aceitam somente `text`, `number`, `select`, `boolean` e `textarea`; `options` só em `select` e no máximo 100 itens. Outputs e inputs `records` devem declarar `recordFields` com keys não vazias e únicas.

Para detalhes normativos de envelope, campos, fontes, outputs, records e apresentação, leia [method-format.md](references/method-format.md). Para regras de compatibilidade entre conexões, leia [data-compatibility.md](references/data-compatibility.md). Para ciclo de execução, estados, entregas e binding, leia [runtime-execution.md](references/runtime-execution.md).

## Configuração de IA, Código e Humano

Trate cinco camadas separadamente:

| Camada | Conteúdo |
| --- | --- |
| `instructions` | Ação desta etapa e critério de entrega. |
| `parameters` | Limites e escolhas do Método: quantidade, duração, preset, estilo. |
| Executor/plugin | Modelo, endpoint, codec, formato ou operação específica. |
| Settings | Preferências da instalação ou do canal. |
| Secrets | Credenciais em cofre; nunca serializar no Método. |

Use placeholders somente quando a fonte estiver declarada, por exemplo `{{project.title}}`, `{{video.topic}}` ou `{{block_01.output}}`. Para IA, peça saída compatível com o `type` do output e não misture seleção humana dentro da geração. Para Código, declare entrada, formato, artefato e erro esperado. Para Humano, declare o que revisar ou entregar e como o resultado será representado.

## Validação final

Antes de entregar um arquivo, confirme:

- envelope `format`, `version`, `name`, `exportedAt` e `method` válidos;
- exatamente um processo universal e entre 1 e 200 blocos;
- `id` único, `order` sem saltos, enums válidos e `parameters` em todos os blocos;
- cada `output.key` não vazia e única no bloco;
- cada referência aponta para bloco/processo anterior e output existente;
- cada conexão output→input passa na matriz de compatibilidade de tipo, schema, cardinalidade, obrigatoriedade, options/MIME e proveniência;
- nenhum `list`, `records`, `files`, `multiselect` ou mídia especializada é ligado a formato incompatível sem transformação explícita;
- `records` possui schema completo e keys únicas;
- `VALIDAR` não aponta para outro `VALIDAR` e usa mode coerente;
- `ESCOLHER` só aparece quando há coleção estratégica pré-existente e configurada no Canal;
- não há secrets, conteúdo protegido desnecessário, `deliveryId`, `itemId` ou valores transitórios;
- o output oficial do Processo é alcançável e será promovido ao fim.

Use [validation.md](references/validation.md) para auditoria detalhada e [templates/review-checklist.md](templates/review-checklist.md) para revisão por pares.

## Referências sob demanda

- **Contrato completo e schema:** [method-format.md](references/method-format.md).
- **Blocos, operadores e Biblioteca Estratégica:** [blocks-and-operators.md](references/blocks-and-operators.md).
- **Compatibilidade de inputs/outputs, schemas e cardinalidade:** [data-compatibility.md](references/data-compatibility.md).
- **Runtime, estados, binding, retries e entregas:** [runtime-execution.md](references/runtime-execution.md).
- **Prompts, placeholders, parâmetros e configuração de executor:** [prompt-design.md](references/prompt-design.md).
- **Escopo de tradução e divisão em processos:** [translation-scope.md](references/translation-scope.md).
- **Exemplos Tema e Roteiro:** [examples.md](references/examples.md).
- **Validação e importação:** [validation.md](references/validation.md).
- **Esqueleto JSON:** `templates/method-skeleton.json`.
- **Checklist para agentes:** `templates/review-checklist.md`.

## Limites

Não transforme a estrutura do ContentFlow em clone, white-label, rebranding ou produto concorrente. Não declare integrações, chamadas de API, execução de IA ou automações que não estejam configuradas. Não inclua credenciais nem trate uma reprovação editorial como falha técnica. Preserve a intenção do processo fornecido pelo usuário.
