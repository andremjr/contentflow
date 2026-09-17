# Roadmap — Itens Operacionais e Orquestrador em Lote Híbrido

Data-base: 2026-09-16

## 1. Objetivo

Evoluir o motor de execução sem ampliar a gramática do ContentFlow. Os oito Processos Universais, quatro Blocos Essenciais e três Operadores permanecem inalterados. A mudança introduz Item como primitiva operacional transversal e usa essa primitiva para transformar o modo em lote numa estratégia híbrida:

```text
Tema       → 1 etapa agregada → N itens de produção
Título     → 1 etapa agregada → N itens de produção
Thumbnail  → 1 etapa agregada → N itens de produção

Roteiro    → execução por Projeto
Voz        → execução por Projeto
Assets     → execução por Projeto
Edição     → execução por Projeto
Postagem   → execução por Projeto
```

O mesmo Item também serve dentro de um Bloco individual. Um Projeto pode ter, por exemplo, 40 cenas em Roteiro, 40 áudios em Voz ou 120 assets visuais sem o núcleo precisar conhecer o significado editorial de cada unidade.

## 2. Princípios

1. **A gramática continua pequena.** Editar, regenerar, aprovar, reordenar e executar selecionados são operações sobre itens; não são novos Blocos, Processos ou Operadores.
2. **Identidade precede posição.** Nenhuma associação entre Tema, Título e Thumbnail pode depender apenas de “item 8 da lista”. Cada unidade recebe um ID estável do núcleo.
3. **O núcleo governa; o plugin executa.** Estado, identidade, ordem, retry, seleção, retomada e persistência pertencem ao ContentFlow. O plugin recebe a coleção e escolhe como processá-la dentro das capacidades declaradas.
4. **Compatibilidade faz parte do desenho.** Plugins atuais continuam válidos. Quando uma capability ainda não suporta coleção nativa, o Orquestrador usa o motor linear existente como adaptador de compatibilidade.
5. **Nenhum resultado concluído é repetido silenciosamente.** Retry técnico, fallback de conta, reinício da aplicação e retry editorial precisam distinguir itens concluídos, pendentes e falhos.
6. **Snapshots continuam imutáveis quanto ao Método.** Alterações posteriores no Método não reinterpretam uma execução ou fila em andamento.
7. **Persistência vem antes do próximo efeito.** O resultado de um item precisa estar durável antes de o núcleo iniciar o próximo item ou considerar aquela unidade concluída.

## 3. Modelo universal de Item

### 3.1. Item dentro de um Bloco

O `BlockExecution` passa a poder expor `items[]`. Cada item contém:

- `id`: identidade gerada pelo núcleo e preservada nas retomadas compatíveis;
- `sourceItemId`: referência opcional ao item da entrega que originou a entrada;
- `order`: ordem editorial atual;
- `input`: entrada usada naquela unidade;
- `status`: `pending | in_progress | completed | failed | cancelled`;
- `attempt`: tentativa editorial atual do item;
- `output`: resultado atual;
- `error`: erro terminal da tentativa atual, quando houver;
- `attempts[]`: histórico preservado de inputs, outputs, estado e timestamps.

`itemProgress` continua existindo como visão resumida para badges e barras de progresso. Ele é derivado da coleção de itens, mantendo compatibilidade com jobs antigos baseados apenas em cursor.

### 3.2. Linhagem

Quando um Bloco consome uma `ProjectDelivery`, os `DeliveryItem.id` recebidos são registrados em `sourceItemId`. O novo item operacional possui sua própria identidade. Isso permite representar explicitamente uma sequência como roteiro → prompt visual → imagem → animação sem inserir semântica de cena ou mídia no núcleo.

Não é necessário introduzir agora uma árvore global recursiva. A linhagem entre entregas e itens fornece a composição necessária; `parentItemId` só deve existir no futuro se surgir um caso que não possa ser representado por referências entre entregas.

### 3.3. Operações universais

A API interna deve convergir para estas operações, todas controladas pelo núcleo:

- editar input de um item elegível;
- regenerar um item;
- regenerar seleção;
- continuar pendentes;
- repetir falhos;
- aprovar/reprovar quando o Método exigir validação;
- adicionar/remover/reordenar quando o contrato permitir;
- comparar ou restaurar tentativa anterior;
- baixar/abrir artifact;
- executar pendentes ou selecionados.

Nem todo renderer mostra todas as ações. A disponibilidade deriva do estado do item, do tipo da entrega, do Bloco e das capacidades declaradas pelo plugin.

## 4. Dois níveis de item

O produto mantém separados dois níveis operacionais:

```text
Production Item
Projeto/Vídeo A
Projeto/Vídeo B
Projeto/Vídeo C

Execution Item
Cena 01 do Projeto A
Cena 02 do Projeto A
Áudio 01 do Projeto A
Imagem 01 do Projeto A
```

Nos três primeiros processos do lote, a unidade é o Production Item. Do Roteiro em diante, a unidade externa volta a ser o Projeto e cada Bloco pode possuir seus próprios Execution Items.

Durante a primeira migração, o `projectId` já materializado é a identidade estável do Production Item. A decisão histórica de só materializar Projetos depois de uma revisão de candidatos permanece aberta para uma etapa posterior; ela não precisa bloquear a arquitetura de coleção nem a identidade dos itens.

## 5. Planejamento do lote híbrido

### 5.1. Estratégia V2

O plano lógico de um lote com N Projetos passa a ser:

```text
Aggregate(theme, N)
Aggregate(title, N)
Aggregate(thumbnail, N)
Project(script, 1..N)
Project(narration, 1..N)
Project(assets, 1..N)
Project(editing, 1..N)
Project(publishing, 1..N)
```

A fila persiste `strategyVersion`. Filas antigas sem versão são interpretadas como V1 e continuam com a sequência histórica `Processo × Projeto`; nenhuma atualização pode reinterpretar um cursor já persistido.

### 5.2. Adaptador de compatibilidade

Na primeira etapa implementável, `Aggregate(process, N)` é uma unidade do Orquestrador, mas pode delegar internamente para N `ProcessExecution` existentes, uma de cada vez. Isso entrega imediatamente semântica de fase agregada, migração segura, mesma parada/retomada/validação e compatibilidade total com Métodos e plugins atuais.

Esse adaptador não entrega ainda o ganho máximo de chamadas. Ele existe para desacoplar a mudança de planejamento da mudança do protocolo de plugin.

### 5.3. Executor de coleção nativo

A etapa seguinte introduz uma capacidade declarativa de coleção no protocolo. O contrato conceitual é:

```text
CollectionExecutionRequest
  collectionId
  processType
  items[]
    itemId
    projectId / productionItemId
    order
    inputs
    inputDeliveries
    context

CollectionExecutionResponse
  items[]
    itemId
    status
    values
    artifacts
    conversation/checkpoint opcional
```

O `itemId` é obrigatório na resposta. Quantidade correta com IDs incorretos continua sendo erro. Duplicata, ID desconhecido ou item ausente não pode ser corrigido por posição silenciosamente.

O plugin declara como aceita coleção, sem fornecer interface. Exemplos de estratégias válidas: LLM em uma chamada estruturada; navegador em uma sessão com várias interações; TTS em chamadas atômicas com checkpoint; código local em chunks ou paralelismo respeitando `maxConcurrency`.

## 6. Fan-out e fan-in entre Tema, Título e Thumbnail

O núcleo cria uma coleção ordenada com identidade estável. Cada processo lê e atualiza somente a dimensão que lhe pertence:

```text
item A: theme → title → thumbnail
item B: theme → title → thumbnail
item C: theme → title → thumbnail
```

Antes de iniciar Título, todos os itens elegíveis de Tema precisam estar em estado aceito pelo lote ou explicitamente excluídos. O mesmo vale entre Título e Thumbnail. Falhas parciais não deslocam os demais IDs.

Fan-in consolida a etapa somente quando cada item está em estado terminal válido para continuar. O núcleo distingue concluído/aprovado, excluído deliberadamente, pendente, falho recuperável e bloqueado por ação humana. Uma resposta com N elementos não conclui a etapa até que os N IDs esperados sejam reconciliados.

## 7. Workspace operacional de itens

A Interface 1 continua sendo a página de execução do Projeto/Processo. Um resultado com coleção abre um workspace do Bloco, renderizado pelo núcleo, com:

- contador por estado;
- filtros Todos/Pendentes/Erro/Concluídos/Aprovados;
- seleção múltipla;
- ação por item;
- ações em lote sobre a seleção;
- edição de entrada quando permitida;
- visualização de output atual;
- histórico de tentativas;
- renderer conforme tipo (`text`, `records`, `files`, imagem, áudio, vídeo);
- preservação do número/ordem visual após regeneração.

Para Tema/Título/Thumbnail em lote, o mesmo modelo aparece no painel do Orquestrador como visão transversal dos Production Items.

## 8. Persistência e recuperação

Regras obrigatórias:

- job e snapshot são persistidos antes de iniciar o próximo item;
- retry técnico não cria nova tentativa editorial do item;
- retry editorial incrementa `item.attempt`;
- fallback de conta mantém o mesmo item e tentativa editorial;
- `remaining` reutiliza somente itens comprovadamente concluídos da mesma coleção;
- entrada diferente invalida a retomada do cursor;
- Stop preserva outputs duráveis e encerra trabalho não concluído de forma explícita;
- reinício da aplicação reconcilia jobs e filas pela estratégia persistida.

Jobs antigos sem `workItems` continuam legíveis pelo cursor `currentIndex` e `accumulatedItems`. Na primeira retomada compatível, o núcleo materializa os estados individuais a partir desse prefixo. Filas antigas sem `strategyVersion` usam planejamento V1 até terminar.

## 9. Fases de implementação

### Fase A — Fundação de Item — em andamento

- [x] manter `itemProgress` e retomada de pendentes;
- [x] introduzir identidade e snapshot operacional por item;
- [x] preservar `sourceItemId` quando a entrada possui identidade de entrega;
- [x] registrar status, tentativa, output, erro e histórico;
- [x] compatibilidade com jobs antigos baseados em cursor;
- [ ] cobrir cancelamento por item explicitamente;
- [ ] adicionar endpoint/command para retry seletivo por IDs.

Critério de saída: um Bloco itemizado pode ser interrompido, retomado e inspecionado sem perder a identidade das unidades já produzidas.

### Fase B — Workspace e governança individual

- [ ] listar `BlockExecution.items` no renderer operacional;
- [ ] editar input de item elegível;
- [ ] regenerar um item;
- [ ] regenerar seleção;
- [ ] repetir falhos;
- [ ] aprovar/reprovar individualmente quando aplicável;
- [ ] mostrar tentativas anteriores;
- [ ] testar seleção, reordenação e identidade.

Critério de saída: corrigir o item 17 não executa nem desloca os outros itens.

### Fase C — Planejador híbrido — primeira versão implementada

- [x] persistir `strategyVersion`;
- [x] representar Tema/Título/Thumbnail como etapas agregadas;
- [x] manter Roteiro–Postagem na ordenação por Projeto/processo;
- [x] preservar filas V1 já persistidas;
- [x] usar o motor atual como adaptador de compatibilidade;
- [ ] mostrar progresso por Production Item na etapa agregada;
- [ ] validar Stop/Resume após reinício no meio de cada uma das três fases.

Critério de saída: o Orquestrador possui semanticamente três fases agregadas sem quebrar plugins existentes nem filas antigas.

### Fase D — Contrato de coleção nativo

- [ ] definir `CollectionExecutionRequest/Response` de forma aditiva na Plugin API v1;
- [ ] exigir resposta keyed por `itemId`;
- [ ] validar duplicatas, ausências e IDs desconhecidos;
- [ ] persistir checkpoint por item;
- [ ] estender cancelamento/retry/fallback para coleção;
- [ ] documentar compatibilidade para plugins sem coleção.

Critério de saída: capability de teste processa N itens numa única execução persistente e o núcleo reconcilia cada resposta pelo ID.

### Fase E — Tema agregado nativo

- [ ] adaptar plugins de texto de referência;
- [ ] executar N temas numa coleção;
- [ ] permitir revisão/edição/regeneração por item;
- [ ] persistir cada Tema com proveniência;
- [ ] testar 1, 10, 50 e quantidade máxima suportada.

Critério de saída: 50 Temas não exigem 50 inicializações independentes quando o plugin suporta coleção.

### Fase F — Título agregado nativo

- [ ] montar inputs keyed por Production Item;
- [ ] garantir Tema → Título pelo ID;
- [ ] permitir retry de subconjunto sem alterar os demais;
- [ ] validar histórico do canal e bindings por item.

Critério de saída: um título regenerado mantém seu Tema e seu Production Item originais.

### Fase G — Thumbnail agregado nativo

- [ ] transportar contexto de Tema/Título por item;
- [ ] suportar outputs textuais e arquivos/imagens conforme Método;
- [ ] preservar artifacts e tentativas por item;
- [ ] concluir a fronteira de transição para Roteiro.

Critério de saída: ao terminar Thumbnail, cada Production Item possui identidade e três outputs coerentes, pronto para entrar no motor individual.

### Fase H — Transição para Roteiro–Postagem

- [ ] iniciar Roteiro por Projeto sem conversões manuais;
- [ ] verificar que outputs agregados aparecem como entregas normais do Projeto;
- [ ] manter lote por processo nos cinco processos restantes;
- [ ] permitir que cada Projeto use `execution.itemOrchestration` internamente.

Critério de saída: um lote atravessa Tema/Título/Thumbnail agregado e continua Roteiro–Postagem no motor atual sem perda de proveniência.

### Fase I — Hardening e desempenho

- [ ] crash/restart em cada fronteira de persistência;
- [ ] falha no item 1, no meio e no último;
- [ ] fallback de perfil no meio de coleção;
- [ ] cancelamento durante efeito externo;
- [ ] item faltante/duplicado/ID adulterado na resposta;
- [ ] edição + retry seletivo;
- [ ] 50 Production Items e lotes internos de 100+ itens;
- [ ] medir chamadas, tempo total, reinicializações de navegador e memória antes/depois;
- [ ] E2E nas três línguas para todos os novos controles visíveis.

## 10. Métricas de sucesso

- inicializações de plugin por processo;
- sessões/conversas externas abertas;
- tempo até primeiro item concluído;
- tempo total do lote;
- taxa de retry técnico e editorial;
- itens repetidos indevidamente: meta zero;
- divergências de `itemId` aceitas silenciosamente: meta zero;
- retomadas após crash sem duplicação: 100% nos cenários cobertos;
- memória por 50/100/300 itens.

## 11. Riscos e controles

| Risco | Controle |
| --- | --- |
| Confundir item de vídeo com item interno | Dois escopos claros: Production Item no Orquestrador e Execution Item no Bloco |
| Mapear resposta por posição | `itemId` obrigatório no protocolo nativo e validação estrita |
| Quebrar plugins atuais | adaptador de compatibilidade e contrato aditivo |
| Repetir efeitos após crash | checkpoint antes de avançar e reconciliação de job |
| Snapshot crescer demais | artifacts fora do payload e histórico limitado somente se houver necessidade medida |
| Misturar fornecedor no núcleo | capability declarativa; estratégia específica permanece no plugin |
| Batch virar segundo motor | reutilizar ProcessExecution, deliveries, jobs, retry, validação e renderers existentes |
| Atualização reinterpretar fila ativa | `strategyVersion` persistida |

## 12. Ordem recomendada

Fechar identidade e retry seletivo dos itens; depois o contrato de coleção; então migrar Tema, validar; migrar Título, validar; migrar Thumbnail, validar; por último otimizar a transição para os cinco processos restantes. Cada fase reutiliza a mesma primitiva e revela incompatibilidades antes de multiplicá-las por três processos e vários plugins.
