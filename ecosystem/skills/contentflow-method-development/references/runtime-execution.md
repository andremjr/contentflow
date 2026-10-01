# Runtime, binding e deliveries

O Método v3 armazena bindings estruturais e `ValueShape`. O runtime resolve a origem, valida compatibilidade direcional de entrada e transporta o valor junto da identidade de delivery/item. A única contração permitida é `text/many/inline → text/one/inline|either`; ela agrega o valor consumido sem alterar a delivery `many` nem seus IDs.

Humano, IA e Código usam o mesmo contrato. O executor não altera família, cardinalidade ou representação. Uma delivery copia o shape da saída; `one` materializa um item e `many` materializa um item por elemento.

Item orchestration só expande uma porta cujo shape declara `cardinality: "many"`. O fato de um valor JavaScript ser array nunca cria cardinalidade nem autoriza loop.

Uma unidade de uma saída `many` pode produzir uma ou mais variantes atômicas compatíveis. Todas
continuam relacionadas à mesma unidade e ao mesmo item de origem. Ao retomar ou adotar uma revisão
do Método, preserve somente unidades pertencentes ao lote atual ou explicitamente retomadas pelo
job; mudança de porta, cardinalidade ou base de itemização invalida unidades operacionais antigas.
Artifacts e variantes incrementais não substituem o total do lote em `itemProgress`; o progresso é
sempre derivado das unidades obrigatórias da orquestração.

`VALIDAR` preserva approval, `select_one`, `select_many`, feedback e retry editorial. `ESCOLHER` permanece ligado à Biblioteca Estratégica. Nenhum deles cria família de conteúdo.

Outputs oficiais seguem a tabela de [`data-compatibility.md`](data-compatibility.md). Assets visuais usam portas separadas de imagens e vídeos.
