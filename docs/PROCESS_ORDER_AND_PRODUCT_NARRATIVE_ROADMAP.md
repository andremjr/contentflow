# Roadmap único — ordem dos Processos, compartilhamento, orquestração e narrativa

**Estado em 2026-09-19:** planejamento consolidado para revisão do titular. Este arquivo é a única especificação proposta para **essas mudanças**; `ARCHITECTURE.md` e `V1\\\\\\\_ROADMAP.md` continuam descrevendo o produto vigente e o plano geral até que cada fase seja implementada e validada. Este roadmap não afirma que os recursos propostos já funcionam nem autoriza versão, tag ou release.

**Fontes:** [conversa pública sobre a tese do ContentFlow e a ordem dos Processos](https://chatgpt.com/share/6aaefa15-9308-83e9-9413-24e897619608), relida em 2026-09-19; instruções posteriores do titular sobre compartilhamento; inspeção local de código, `docs/ARCHITECTURE.md`, `docs/ITEM\\\\\\\_EXECUTION\\\\\\\_AND\\\\\\\_HYBRID\\\\\\\_BATCH\\\\\\\_ROADMAP.md` e planos anteriores agora incorporados aqui. As falas do assistente na conversa são propostas, não evidência de que o código as implementa. Pesquisa de concorrentes e frases comerciais da conversa são hipóteses para testar, não alegações verificadas neste trabalho.

## 1\. Objetivo, limites e mapa mental

O pedido dos usuários é poder produzir Roteiro antes de Thumbnail, Título depois de Roteiro ou Thumbnail a partir de um frame da Edição. O titular manteve **todos os oito Processos obrigatórios** e rejeitou expressamente desativá-los. Eles são responsabilidades a resolver, não ferramentas ou atividades individuais. Uma atividade externa pode satisfazer mais de uma responsabilidade, com entregas rastreáveis em cada Processo. `Humano` significa que a automação do ContentFlow aguarda entrega ou confirmação do usuário, mesmo quando outra ferramenta produziu o resultado.

O Método deve definir a ordem linear e a composição interna; o executor resolve o próximo trabalho sem inventar estratégia; o orquestrador escolhe qual Projeto recebe recursos. Uma futura fila global coordena Canais de ordens diferentes. Compartilhar ou reutilizar um Método deve transportar dependências, coleções e ordem; compartilhar um Canal completo transporta todos os Métodos e coleções, com itens opcionais.

|Camada conceitual|Responsabilidade, sem criar um novo subsistema por si só|
|-|-|
|Ontologia|Oito Processos Universais: Tema, Título, Thumbnail, Roteiro, Narração e Áudio, Assets Visuais, Edição, Publicação.|
|Gramática|Quatro Blocos (`BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`), cada qual com um operador (`Humano`, `IA`, `Código`). Entradas e saídas pertencem ao Bloco.|
|Método|Composição dos Blocos por Processo e ordem dos oito Processos no Canal.|
|Estado|Projeto, estratégia congelada, execução de Processo e Bloco, tentativa, entrega, item e artifact.|
|Execução|Contratos, bindings, pausa, retomada, retry, plugins e persistência.|
|Orquestração|Agendamento de Projetos e unidades executáveis; não define a ordem editorial.|

**Invariantes:** exatamente oito Processos por sequência, sem duplicar, remover ou inventar um nono; ordem linear, sem grafo, branches ou loops genéricos; quatro Blocos e três Operadores; núcleo funcional sem plugins; plugins externos e intercambiáveis, sem regra de fornecedor no núcleo; identidade de Item transversal; Método como definição e execução como instância congelada; dados e arquivos antigos legíveis ou migração explícita recuperável. Uma nova necessidade procura primeiro a menor capacidade genérica reutilizável.

## 2\. Estado real do repositório e limites já observados

Esta é a auditoria **dirigida** realizada para este roadmap, não uma certificação de todos os caminhos de execução. A fase 0 fecha o inventário antes de mudanças estruturais. As alterações já existentes em `ecosystem/browser-bridge` e plugins no workspace pertencem a outro trabalho e não entram neste escopo.

|Área|Implementação atual|Trabalho necessário|
|-|-|-|
|Domínio|`src/lib/domain.ts` define `PROCESS\\\\\\\_ORDER` fixo e `Channel.methods` como mapa de `ProcessMethod`; `Project` guarda estados por Processo, `currentStage` e `runFrom`/`runThrough`.|Separar a enumeração do conjunto da sequência escolhida. Uma ordem única pertence à composição do Canal, não a oito cópias por `ProcessMethod`.|
|Persistência|`server/index.ts` armazena payloads JSON em SQLite para Canais, Projetos, `process\\\\\\\_executions`, filas, coleções e itens. Cada execução só copia o `ProcessMethod` **quando aquele Processo inicia**.|Projetos/fila precisam reter a estratégia que iniciou o trabalho. Não presumir que já existe snapshot do Método completo.|
|Editor e validação|`src/components/method-builder.tsx` oferece fontes anteriores por fatias da ordem fixa. `server/builder-methods.ts` valida `previous\\\\\\\_process` com índices fixos.|Fonte anterior significa anterior na ordem efetiva; validar mudanças na ordem e no Método inteiro.|
|Runtime|`src/lib/runtime-contract.ts` filtra e prioriza outputs com `PROCESS\\\\\\\_ORDER`; `src/components/process-runner.tsx`, `server/execution-commands.ts` e `server/index.ts` usam a ordem fixa para avanço/progresso.|Uma única regra de elegibilidade e próximo Processo serve aos fluxos manuais, contínuos e de fila, sem múltiplas interpretações.|
|Lote|`src/lib/execution-orchestrator.ts` planeja ponta a ponta ou lote versão 2 com `Tema → Título → Thumbnail` agregados antes de Roteiro. `server/index.ts` reconstrói `buildOrchestratorSteps` durante reconciliação. Filas versões 1 e 2 já existem.|Preservar planos legados; nova estratégia considera elegibilidade na ordem própria do Projeto. Evitar remontar todos os passos a cada avanço.|
|Portabilidade|`src/lib/method-file.ts` exporta um Método ou pacote v1 com requisitos, sem itens de coleção nem sequência. `copyImportedMethods` remapeia blocos, mas apaga `collectionId`; plugins perdem `connectionId`.|Pacote versionado com dependências, ordem, chaves portáteis de coleção e itens opcionais.|
|Aplicação|`src/routes/methods.tsx` importa/copia Métodos e apenas avisa sobre coleções/processos; `src/components/method-builder.tsx` tem outro caminho de importação/cópia. `server/index.ts` recebe Métodos e coleções por APIs separadas.|Um serviço de prévia/aplicação coerente para os dois pontos de entrada e uma transação para Canal, ordem, Métodos e Biblioteca.|
|ZIP e assets|`/api/method-packages/import` em `server/index.ts` escreve capas em uploads durante a abertura do ZIP, **antes** da escolha final de importar.|Staging e limpeza/compensação, inclusive no cancelamento e erro. Não deixar arquivos órfãos.|
|Interface/estado|`src/lib/store.ts` normaliza Métodos por Processo e reconcilia snapshots do estado com comparação JSON; as telas usam `PROCESS\\\\\\\_ORDER`.|Não acrescentar cálculo de grafo, fechamento de pacote ou clonagem de Métodos em cada render/refresh. Medir antes de otimizar o store existente.|
|Contrato de mídia|`src/lib/human-workflow.ts`, `server/builder-methods.ts` e `ARCHITECTURE.md` definem output oficial de Narração como `audio` e Assets como lista de mídias.|O mesmo MP4 pode ser arquivo de origem, mas atualmente não é automaticamente um output `audio`. Resolver sem coerção silenciosa nem FFmpeg embutido no núcleo.|

O roadmap geral `docs/V1\\\\\\\_ROADMAP.md` ainda descreve a fronteira fixa Tema/Título/Thumbnail → Roteiro. `docs/ITEM\\\\\\\_EXECUTION\\\\\\\_AND\\\\\\\_HYBRID\\\\\\\_BATCH\\\\\\\_ROADMAP.md` detalha Item e lote nativo em evolução. Este arquivo planeja **a mudança de ordem e seus efeitos**; não marca as fases gerais de lote ou plugins como concluídas e não altera retroativamente o significado de filas persistidas.

|Fase deste roadmap|Estado agora|Fundação que já existe|
|-|-|-|
|0. Mapa e medições|Auditoria dirigida acima; inventário completo e medições pendentes.|Testes, SQLite, snapshots por Processo e docs de arquitetura.|
|1. Ordem e dependências|Planejada.|Oito IDs estáveis e validações de fonte anterior em ordem fixa.|
|2. Estratégia congelada e avanço|Planejada.|Máquina de estados, entregas, retry e snapshot de cada Processo ao iniciar.|
|3. Editor/navegação|Planejada.|Editor visual e telas por Processo.|
|4. Compartilhamento|Planejada.|Pacotes v1, requisitos de dependência e cópia de Métodos com avisos.|
|5. Lote variável|Planejada.|Filas versões 1/2, adaptador e primitiva de Item em evolução.|
|6. Fila global|Planejada.|Fila por Canal e motor de execução existente.|
|7. Narrativa/visual|Planejada.|Gramática e cores dos Blocos já documentadas.|

## 3\. Contratos propostos para manter o aplicativo simples

### 3.1. Ordem e dependências

* Uma sequência contém uma permutação dos oito IDs já existentes. O campo de Canal que a representa é único; registros sem ele são interpretados com a ordem histórica. Não persistir índices derivados em cada Método.
* Ler/validar os oito IDs custa trabalho constante e pequeno. Um mapa de posição pode ser criado uma vez por validação/comando e reutilizado naquela operação; não precisa de cache global com invalidação complexa. A navegação lê a sequência já normalizada.
* Dependências estruturais incluem `previous\\\\\\\_process`, output oficial, referência a Bloco/entrega anterior, continuidade de conversa de plugin e outras referências entre Processos que o inventário encontrar. Ao salvar o Método ou mudar a ordem, conferir tipo, schema, proveniência e posição; bloquear ciclo, fonte posterior ou output ausente. Inputs automáticos nunca transformam uma dependência explícita inválida em outra fonte parecida.
* Não impor que Publicação ou Tema ocupem posições fixas por enumeração. O Método pode ter restrições explícitas de dados que impeçam uma ordem concreta. Ponta a ponta significa resolver os oito na sequência daquele Projeto, mesmo se Publicação não estiver por último.
* Alterar a sequência de Canal afeta somente novas instâncias de produção. A fronteira exata de congelamento é decidida na fase 0 e implementada na fase 2; o Método salvo no Canal não pode mudar silenciosamente o comportamento de um Projeto já iniciado.
* Comandos com intervalo `runFrom`/`runThrough` usam posições da sequência congelada; um limite final anterior ao inicial é inválido e deve ser explicado antes de executar.

### 3.2. Estratégia de Projeto e evolução do schema

O Projeto precisa de `effectiveProcessOrder` congelado, e cada Processo deve usar a versão correta do Método. **Escolha técnica a medir na fase 0:** (a) um snapshot completo por Projeto é simples, mas replica até oito Métodos por vídeo; (b) uma revisão imutável de estratégia por Canal, referenciada por vários Projetos, reduz duplicação e exige ciclo de vida explícito. Escolher a menor solução que preserve a imutabilidade com os volumes reais; fila de 50 Projetos não deve copiar a mesma definição grande 50 vezes sem necessidade. O snapshot de execução por Processo já existente continua rastreando tentativas e entregas; nenhuma migração reescreve execuções anteriores.

Versão nova de schema/estratégia e normalizador legado devem ser explícitos. Não chamar dados antigos de `schemaVersion: 1` se esse campo não existe; ausência de ordem significa ordem histórica. Preservar filas versão 1 e 2 com seu planejador original e cursor próprio. Uma nova estratégia de fila usa outra versão, sem reinterpretar `currentStep` legado.

### 3.3. Avanço e agendamento baratos

Uma função de domínio resolve o próximo Processo a partir da sequência congelada, dos oito estados e do limite da execução, sem consulta a plugins nem varredura de todos os Canais. O servidor é autoridade para comando/estado; UI apenas apresenta e envia intenções. Progresso deriva dos oito estados e é atualizado na transição, sem polling para recalculá-lo separadamente.

Uma fila nova grava versão do plano, ordem/revisão aplicável e cursor. Para ponta a ponta, o próximo passo pode ser obtido pelos índices de Projeto/Processo sem materializar uma matriz inteira. Para lote, guardar a etapa e o item atual/checkpoint; recuperar pelo cursor e pelo estado persistido. Só iniciar trabalho quando houver transição, retomada ou reconciliação necessária; não fazer scan global repetido em cada render. Mudança de Método do Canal não invalida uma fila iniciada.

O global usa o mesmo motor e as mesmas regras de execução de Projeto que o Canal. Faz seleção justa entre Projetos elegíveis, respeita recursos/perfis e limites existentes; não cria um segundo mecanismo de plugin, retry ou entrega. Planejamento e consulta devem ser proporcionais aos Projetos ativos, com índices SQLite/consultas focadas quando medições mostrarem necessidade; não varrer coleções estratégicas nem todas as execuções antigas para escolher uma próxima unidade.

### 3.4. Compartilhamento como cálculo sob demanda

Fechamento transitivo de dependências e inspeção de itens acontecem **na prévia de compartilhar/reutilizar/importar** e na validação final de aplicar, não na listagem da Biblioteca ou ao abrir um Projeto. Normalizar o pacote uma vez, remapear IDs em mapas locais à operação e escrever em lote. O manifesto leva chaves estáveis de pacote, não IDs locais; não associar coleções pelo nome. O ZIP com itens não é carregado em massa nas telas de Métodos; prévia mostra metadados/contagens, e arquivos são processados com limites e staging.

### 3.5. Verificação de desempenho

Na fase 0 registrar tempos e tamanho de payload da navegação Canal → Métodos → Projeto, salvar um Método, criar Projeto, iniciar/retomar lote de 10 e 50 Projetos e importar pacote controlado com coleções/itens. Registrar CPU, memória, quantidade de queries e gravações em ambiente reproduzível, sem dados pessoais. Repetir os mesmos cenários por fase. Uma regressão consistente de navegação, inicialização ou uso de memória deve ser investigada antes de avançar; definir limiares numéricos a partir da linha de base, do hardware e da variação medida, não inventá-los aqui. Otimizar o gargalo encontrado, sem reescrever indiscriminadamente o store ou introduzir cache persistente duplicado.

## 4\. Formato e comportamento do compartilhamento

### 4.1. O que acompanha cada escolha

|Escolha|Métodos e ordem|Biblioteca Estratégica|
|-|-|-|
|Método individual, estrutura (padrão)|Método principal, Métodos anteriores transitivos realmente necessários e disponíveis na origem, requisitos faltantes e restrições de ordem.|Coleções referenciadas pelo conjunto incluído, com schema e vínculos, vazias.|
|Método individual, com **Compartilhar itens** marcado|Mesmo conjunto.|Itens e assets permitidos das coleções referenciadas.|
|Todos os Métodos do Canal, estrutura|Todos os Métodos configurados, sequência completa dos oito Processos.|Todas as coleções do Canal, inclusive as não usadas, vazias.|
|Todos os Métodos, com itens|Mesmo conjunto.|Todos os itens e assets permitidos de todas as coleções.|

Se Thumbnail depende de Roteiro, incluir o Método de Roteiro quando a origem o possui, com suas dependências recursivas; exibir essa inclusão antes de exportar. Se só a referência existe, registrá-la com processo/bloco/output/tipo conhecidos. Um Método compatível no destino pode satisfazê-la; se não, a estrutura continua legível, mas a entrega fica pendente. Não inventar um Método, output ou conversão de operador. Reutilização local segue exatamente o mesmo planejador da importação portátil, sem ZIP obrigatório.

### 4.2. Contrato portátil e versão antiga

Evoluir `contentflow-method`/`contentflow-method-pack` por versão ou envelope comum com `manifest.json`; a fase 4 fixa o formato depois de testar round trip. O manifesto novo precisa de papel de cada Método (principal/dependência/conjunto), ordem ou restrições, chaves portáteis de coleções, campos, `itemsIncluded`, itens e assets opcionais, e requisitos de plugin/capability/conexão. Metadados de autoria/licença/proveniência são distintos do conteúdo do usuário.

JSON/ZIP v1 continuam importáveis. Sem sequência, usar ordem histórica; sem coleção completa, criar automaticamente somente o schema inequívoco que o arquivo realmente especifica. Um requisito v1 só por nome ou campos incompletos vira pendência visível, nunca associação por nome ao acaso. Sem itens significa estrutura vazia. A ausência de plugin conserva `operator`, `pluginId`, versão, capability e configuração portátil; o bloco fica legível e `blocked\\\\\\\_executor` até instalação/ativação/conexão válida. Nunca salvar `connectionId` externo como vínculo portátil nem instalar plugin automaticamente por causa de um pacote.

Não exportar secrets, tokens, cookies, perfis/sessões, IDs de conversa/job, caminhos absolutos, IDs de Canal do YouTube, Projetos, entregas, Histórico, filas ou workspace privado. Plugin binário só poderia integrar pacote numa evolução posterior com licença que permita redistribuição, integridade, consentimento e sandbox normais; a primeira entrega usa requisitos/referências. Itens podem conter textos/imagens/arquivos sensíveis ou protegidos: opção desmarcada por padrão, prévia concreta e validação dos assets que o autor pode compartilhar.

### 4.3. Aplicar sem perda ou surpresa

Em Canal novo, pacote completo conserva sua ordem; Método isolado parte da ordem histórica e move apenas o necessário. Em Canal existente, compor os Métodos selecionados com os existentes e apresentar substituições, coleções novas/reutilizadas, itens, plugins ausentes e **ordem resultante**. Preservar a ordem relativa dos Processos não envolvidos quando possível. O cálculo de uma ordem válida considera dependências do conjunto final, inclusive as já existentes. Ciclo, output inexistente, tipo incompatível e conflito sem solução bloqueiam a aplicação, com indicação precisa.

IDs locais de coleção, item, bloco, arquivo e Canal são remapeados por chaves portáteis; referências cruzadas entre Métodos também. Padrão seguro é criar coleção nova, mesmo se houver outra com o mesmo nome; reutilização exige equivalência de schema e escolha explícita. Estrutura vazia nunca apaga itens já existentes. Substituir Método existente ou mudar sua dependência requer seleção explícita na prévia. O servidor revalida a prévia no momento da confirmação com revisão do Canal; se ele mudou, recalcula e pede nova revisão, sem aplicar plano obsoleto.

Importar não deve escrever assets permanentes ao apenas abrir o ZIP. Validar limites, integridade, MIME, traversal, symlink e referências em staging; preparar IDs e plano; persistir Canal, Métodos, sequência, coleções e itens numa transação; promover arquivos por procedimento recuperável, com limpeza/compensação em erro ou cancelamento. Registro de aplicação idempotente evita duplicatas em retry de request. Uma única atualização de estado conclui a operação, em vez de refresh por coleção/item.

## 5\. Fases de execução e gates

Cada fase é um trabalho revisável em uma requisição própria, se necessário. Antes de avançar, registrar o resultado e verificar os casos da fase anterior. Falha identificada volta à fase dona do contrato; não se compensa uma regressão com exceções em outras camadas. Implementação local, validação e publicação são passos separados.

### Fase 0 — Mapa Mestre, linha de base e decisões de contrato

**Meta:** conhecer todos os lugares que assumem ordem fixa e o custo atual antes de mudar o schema.

**Entregas:**

1. Classificar cada uso de `PROCESS\\\\\\\_ORDER` como enumeração, exibição, default, binding ou avanço; mapear types, APIs, SQLite, UI, MCP builder, importação, execução, lote, itens, testes e recuperação. Indicar autoridade de cada dado e o que já é derivado.
2. Reunir fixtures **sintéticas** representativas: Método/ZIP v1, Canal com coleções, Projeto manual/em andamento, execução pausada, falha/retry, fila versões 1/2. Ler e executar em instalação isolada. Registrar estrutura do estado e caminhos de migração/rollback.
3. Medir a linha de base do §3.5; verificar se o volume de Método justifica snapshot completo por Projeto ou revisão imutável compartilhada. Definir escopo de congelamento quando um Projeto já existe mas ainda não começou e quando executa seu segundo Processo.
4. Resolver o caso MP4 de Narração/Assets: manter `audio` como output oficial até decidir um caminho tipado para receber o MP4 de origem e produzir/referenciar áudio de modo explícito. Nenhuma conversão implícita ou dependência de FFmpeg no núcleo.
Se o mesmo arquivo alimentar duas entregas, sua limpeza deve respeitar ambas as referências; excluir uma entrega não pode apagar a mídia ainda usada pela outra.
5. Fechar regras de merge e versão do pacote, limites de ZIP/itens, equivalência de schema, autoria/licença, nomes de APIs, critério de desempenho e tratamento de fonte anterior ausente.

**Gate:** Mapa Mestre com evidência por arquivo e fixtures, números de base, matriz de compatibilidade e decisões registradas. Ainda sem novo recurso de execução. Um resultado inesperado muda o desenho antes da fase 1.

### Fase 1 — Modelo de ordem e validação de dependências

**Pré-requisito:** fase 0 aprovada tecnicamente.

**Entregas:** um contrato para `effectiveProcessOrder` com oito IDs; normalização histórica apenas na leitura; persistência única no Canal; revisão de definição e validação do Método resultante ao salvar ordem/blocos. Resolver `previous\\\\\\\_process`, output oficial, conversa reutilizada e auto-binding segundo posição efetiva, preservando prioridade atual entre blocos. API e MCP builder usam o mesmo validador. Estados com referência antiga são legíveis; diagnóstico não altera dados sem consentimento.

**Eficiência:** varrer no máximo oito Processos e os Blocos do Método afetado ao editar; não varrer todos os Projetos nem recalcular no render. Sem segundo índice persistido de posição.

**Gate:** ordem histórica intacta sem campo; permutação inválida e dependência posterior/cíclica rejeitadas; Roteiro → Thumbnail válido quando há contrato compatível; salvar/reabrir preserva sequência. Testes de validação e migração não tocam dados reais.

**Registro de implementação local (2026-09-19):** `Channel.processOrder` opcional, com leitura histórica para registros sem o campo e uma única persistência no payload do Canal. `definitionRevision` protege o endpoint `PUT /api/channels/:id/process-order` contra uma definição obsoleta; a atualização geral do Canal preserva ambos os campos. Um validador compartilhado verifica ordem, saída oficial/bloco, tipo e conversa reutilizada sobre o conjunto final de Métodos. A gravação de Método individual/em lote, a criação de Canal e o MCP builder o utilizam; o editor de Método oferece fontes anteriores segundo a ordem efetiva. O endpoint rejeita alteração enquanto há execução ativa. Um Canal com sequência personalizada ainda não inicia execução nem orquestração: a fase 2 deverá congelar estratégia e substituir o avanço fixo antes de liberar esse fluxo. Os Projetos existentes não são migrados automaticamente.

**Decisões técnicas usadas nesta fase:** não criar índice persistido de posições; saída oficial continua o contrato de `createProcessOutputFields` (inclusive Narração `audio`); referências ausentes permanecem legíveis e são diagnosticadas ao salvar a definição. A medição de desempenho, o congelamento de Métodos e a decisão completa sobre mídia MP4 e pacotes da fase 0 continuam pendentes para a fase 2/4. Portanto, este registro não declara concluído o gate integral da fase 0 nem libera a fase 2 sem aquela auditoria.

### Fase 2 — Estratégia congelada e próximo Processo único

**Pré-requisito:** fase 1 e escolha de snapshot da fase 0.

**Entregas:** congelar ordem e versão dos Métodos para um Projeto iniciado; usar a mesma consulta `nextExecutableProcess` em execução isolada, contínua, ponta a ponta, conclusão, erro e retomada. Progresso e `runFrom`/`runThrough` seguem índices da sequência congelada; “ponta a ponta” termina depois dos oito, não ao encontrar `publishing`. Execuções antigas conservam snapshots e semântica original. Dados de fila legada permanecem separados.

**Eficiência:** próximo Processo é busca nos oito estados do Projeto; acesso a uma revisão imutável ou snapshot local, sem copiar a configuração inteira em toda transição. Nenhuma consulta global para cada avanço.

**Gate:** Projetos novos em duas ordens distintas completam oito Processos; alteração do Canal durante Projeto não muda suas etapas futuras; pausa humana, retry, output, cancelamento e reinício retomam corretamente; Projeto legado continua com ordem histórica. Validar o caso MP4 conforme contrato decidido na fase 0.

### Fase 3 — Editor, navegação e UX da ordem

**Pré-requisito:** fase 2.

**Entregas:** reordenação linear dos oito cards do Canal, por teclado e apontador; prévia de dependência violada antes de salvar; labels de Processo estáveis. Telas de Método, Projeto, navegação do Canal e progresso apresentam a sequência de sua fonte correta (Canal para novo trabalho; snapshot para Projeto em andamento). Não introduzir editor de grafo ou novo tipo de Bloco. Ajustar autosave para não sobrescrever uma alteração de ordem/Method feita por outra aba; usar revisão de Canal quando necessário.

**Eficiência:** render de oito cards e lookup de ordem já disponível, sem cálculo de fechamento ou normalização repetida de todos os Métodos. Medir latência de navegação e payload contra a base.

**Gate:** arrastar e teclado produzem mesma ordem; dependência impede movimento inválido com explicação; mudar Canal não reordena Projeto iniciado; os três idiomas pt-BR/en/es e teste de regressão de internacionalização cobrem cada texto novo/alterado; acessibilidade e navegação não regrediram.

**Antecipação local solicitada (2026-09-19):** a lista expansível “Métodos de Criação” na barra lateral permite reordenar os oito Processos pelo ícone de seis pontos, com teclado ou apontador. A interface valida dependências antes da gravação, usa revisão da definição do Canal, atualiza o estado uma vez e restaura a ordem ao falhar. A sequência persiste e volta ao reabrir; um teste de ponta a ponta em banco isolado cobriu arraste, persistência e rejeição de dependência posterior. A barra avisa que a execução em ordem personalizada depende da fase 2. As outras telas e o motor ainda aguardam as fases 2–3.

### Fase 4 — Compartilhar/reutilizar estrutura e itens opcionais

**Pré-requisito:** fases 1–3 estáveis; contrato do §4 definido.

**Entrega 4A — contrato e prévia:** versão portátil nova, parser v1, fechamento transitivo por referência estrutural, pacote de Canal completo, chaves portáteis e diagnóstico de plugins. Prévia de exportação/reutilização mostra o conjunto exato e `Compartilhar itens` desmarcado. Abrir arquivo não grava uploads permanentes.

**Entrega 4B — aplicação de estrutura:** único serviço de importação/reutilização para Biblioteca de Métodos e editor. Ordem resultante e conflitos do Canal novo/existente; coleções vazias com schemas e referências remapeadas; transação e revisão concorrente. Não apagar itens locais.

**Entrega 4C — itens e assets:** incluir itens somente se marcado, com validação de conteúdo/tamanho/proveniência, cópia de assets e rollback recuperável. Processar somente o pacote solicitado, em lotes limitados; não carregar todas as mídias na galeria.

**Entrega 4D — prontidão e experiência:** mostrar plugin/capability ausente mantendo operador, conexão local pendente, fonte anterior não incluída e ações de correção. Nenhuma substituição de plugin ou Método silenciosa. Textos pt-BR/en/es com regressão de internacionalização.

**Gate:** Thumbnail que usa Roteiro chega com Roteiro antes dela e com Método de origem quando disponível; `ESCOLHER` aponta para a coleção correta; estrutura vazia não copia itens, opção marcada copia itens e arquivos autorizados; pacote de Canal leva todas as coleções; plugin ausente mantém bloco e bloqueio; ZIP/JSON v1 ainda importam; erro/cancelamento/retry não deixa Canal nem arquivos parciais. Testar round trip entre instalações isoladas e executar um Projeto real controlado. Cada entrega 4A–4D deve passar seus testes antes da próxima.

### Fase 5 — Lote do Canal em ordens diferentes

**Pré-requisito:** fases 1–3 e proteção das filas legadas; pode avançar após fase 4 para manter uma sequência de validação simples.

**Entregas:** estratégia nova com ordem congelada por Projeto. Tema, Título e Thumbnail podem ser elegíveis à agregação, mas **posição não é elegibilidade**. Só agregar um conjunto quando todos os itens têm pré-requisitos concluídos e a etapa é a próxima para cada Projeto; quando uma dependência como Roteiro/Edição interrompe a região, continuar individualmente ou formar apenas grupos seguros conforme regra documentada, sem antecipar nada. Conservar IDs de itens, checkpoints e ordem lógica. Filas versões 1/2 continuam usando seus planejadores/cursors. Planejar a próxima unidade a partir de cursor persistido, sem refazer matriz de todos os passos em cada reconciliação.

**Gate:** lote de Projetos com ordem histórica e lote com Roteiro antes de Título/Thumbnail concluem cada output sem misturar IDs; Stop, intervenção humana, plugin ausente, erro, retry e reinício preservam cursor e resultados; fila versão 1/2 retomada após atualização não muda de significado. Medir CPU/queries/memória para 10 e 50 Projetos.

### Fase 6 — Orquestração global entre Canais

**Pré-requisito:** próximo Processo único e lote variável estáveis.

**Entregas:** fila global de Project Jobs, cada qual com `channelId`, `projectId`, referência imutável de estratégia/ordem, cursor e status. A fila decide qual Projeto avançar e chama o motor existente. Definir política simples de seleção e recursos, comportamento para `awaiting\\\\\\\_human`, falhas, Stop, retomada e conflitos com filas de Canal e execuções manuais. Não duplicar scheduler de plugins nem empacotar dezenas de snapshots idênticos.

**Gate:** dois vídeos em cada um de cinco Canais, com ordens distintas, completam de modo determinístico após pausa e reinício; recurso compartilhado não recebe execução concorrente indevida; falha de um Projeto mantém diagnóstico sem corromper os outros; nenhuma duplicação de efeito/entrega; consumo medido dentro dos limiares acordados na fase 0.

### Fase 7 — Linguagem visual e narrativa comercial

**Pré-requisito:** os exemplos de produto que a comunicação promete funcionam de ponta a ponta.

**Entregas:** testar a mensagem “Seu método. Seu fluxo. Suas ferramentas.” e demonstrar dois Métodos com ordens diferentes. Apresentar a gramática só depois do benefício: oito responsabilidades, quatro ações, três operadores e plugins. Prototipar hierarquia Processo → Bloco → Operador com as cores existentes, símbolos legíveis e acessibilidade; testar antes de alterar a interface geral. A metáfora de peças é conceitual; não foi aprovada uma aparência literal de brinquedo nem troca de marca/fonte.

**Gate:** a demonstração comprova a promessa; criadores entendem o fluxo sem estudar arquitetura; alterações visuais mantêm navegação, contraste, teclado e pt-BR/en/es com regressão. Não alegar unicidade mundial ou universalidade irrestrita sem pesquisa própria.

## 6\. Matriz de regressão transversal

Em cada fase técnica, executar testes focados da área alterada e, antes de considerar o conjunto validado, os checks completos do projeto e cenários end-to-end aplicáveis. Testes unitários, build e inspeção parcial não provam a correção de um fluxo real. Casos mínimos a preservar:

1. Canal legado sem ordem, Método/JSON/ZIP v1 e Projeto iniciado antes da mudança.
2. Execução manual, ponta a ponta e lote versões 1/2 com `Humano`, IA/Código, plugin ausente, output oficial, bindings tipados, histórico, validação, retry e recuperação de itens.
3. Roteiro → Thumbnail, Edição → Thumbnail e canal histórico; mudança de Método durante execução; dois Projetos do mesmo Canal com estratégias congeladas em revisões diferentes.
4. Estrutura compartilhada com coleção homônima no destino, schema incompatível, referência externa faltante, pacote corrompido, asset inválido, arquivo grande, cancelamento e repetição de request.
5. Navegação Canal/Método/Projeto/Biblioteca, refresh, autosave, múltiplas abas, perfis de plugin, reinício do Electron e desempenho comparado com base controlada.
6. Qualquer interface alterada possui pt-BR/en/es, preserva nomes e conteúdo do usuário sem tradução, acessibilidade e teste de internacionalização.

## 7\. Entrega fase por fase e publicação

Para cada requisição de implementação: confirmar o estado do workspace; fazer somente o corte da fase correspondente; registrar contrato, arquivos alterados, migração, evidências de teste e medições; verificar as invariantes das fases anteriores; atualizar este roadmap com status real. Revisar achados novos antes de ampliar escopo, sem acumular exceções para fazê-los caber. Uma fase incompleta permanece marcada como tal.

Depois que o titular aprovar o desenho e pedir implementação, a fase 0 é a primeira entrega. A ordem 1 → 2 → 3 → 4 → 5 → 6 → 7 explicita dependências; trabalhos independentes só podem avançar em paralelo se não alterarem contratos compartilhados. As decisões de snapshot, MP4, merge e formato portátil exigem resultado concreto da fase 0 antes de codificar o caminho escolhido.

Uma correção local ou documentação aprovada não autoriza release. Antes de versão, commit/tag de release ou publicação, cumprir as regras de `AGENTS.md`: validar o cenário real exato, mostrar evidências ao titular e obter autorização explícita para aquele conjunto de mudanças. Publicação e verificação pública são etapas separadas de implementação.
