# Escopo e decomposição de Métodos

O ContentFlow usa Métodos para executar a produção de um vídeo individual. Antes de criar blocos, classifique cada trecho em quatro categorias.

| Categoria | Entra no JSON? | Exemplos |
| --- | --- | --- |
| Estratégia do canal | Não | Nicho, público, posicionamento, monetização, mercado e audiência geral. |
| Biblioteca Estratégica | Não diretamente | Banco permanente de temas, estruturas, layouts e modelos reutilizáveis. |
| Execução do vídeo | Sim | Pesquisar tema atual, criar roteiro, gerar thumbnail e publicar. |
| Fora do aplicativo | Não | Depoimentos, promoção comercial e opinião sem ação operacional. |

Uma coleção estratégica só é válida se existir antes da execução, for reutilizada em vários vídeos, for consultada/aplicada por um bloco e tiver formato de itens definível. Descreva a proposta na prévia, mas não inclua `collectionId` em JSON portátil.

## Procedimento

1. Extraia objetivo, entrada, ação, responsável, decisão, critério e entrega.
2. Identifique o Processo Universal.
3. Remova contexto de canal e conteúdo fora do aplicativo.
4. Classifique execução em `BUSCAR`, `CRIAR`, `ESCOLHER` ou `VALIDAR`.
5. Divida fluxo completo em arquivos, um por processo.
6. Conecte processos por `previous_process` e outputs oficiais.

Uma lista criada para escolher o vídeo atual é `CRIAR` seguida de `VALIDAR`, nunca coleção/`ESCOLHER`. Se a transcrição de vídeo não estiver disponível, solicite-a; não invente etapas.
