# Runtime, binding e deliveries

O Método v3 armazena bindings estruturais e `ValueShape`. O runtime resolve a origem, valida compatibilidade exata de shape e transporta o valor junto da identidade de delivery/item.

Humano, IA e Código usam o mesmo contrato. O executor não altera família, cardinalidade ou representação. Uma delivery copia o shape da saída; `one` materializa um item e `many` materializa um item por elemento.

Item orchestration só expande uma porta cujo shape declara `cardinality: "many"`. O fato de um valor JavaScript ser array nunca cria cardinalidade nem autoriza loop.

`VALIDAR` preserva approval, `select_one`, `select_many`, feedback e retry editorial. `ESCOLHER` permanece ligado à Biblioteca Estratégica. Nenhum deles cria família de conteúdo.

Outputs oficiais seguem a tabela de [`data-compatibility.md`](data-compatibility.md). Assets visuais usam portas separadas de imagens e vídeos.
