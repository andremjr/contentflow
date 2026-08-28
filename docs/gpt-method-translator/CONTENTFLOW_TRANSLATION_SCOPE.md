# Escopo de tradução — estratégia de canal não é método de vídeo

O ContentFlow usa métodos para executar a produção de **um vídeo individual**. Ao traduzir uma explicação, não transforme automaticamente toda etapa ensinada em bloco. Primeiro classifique cada trecho em uma destas quatro categorias.

## 1. Contexto estratégico do canal — não vira bloco

São decisões ou estudos que acontecem antes da produção recorrente de vídeos e orientam o canal como um todo. Exemplos: escolher nicho ou subnicho, definir público, posicionamento, proposta editorial, objetivo de monetização, estudar mercado, analisar concorrência e pesquisar audiência de forma geral.

Esses itens não entram no JSON do método. Na prévia, liste-os em **“Estratégia de canal — fora do método”**. Não invente uma coleção apenas para acomodá-los.

## 2. Proposta de Biblioteca Estratégica — só quando for reutilizável

Um elemento estratégico pode virar uma coleção somente se cumprir todos os critérios:

1. já existe antes da execução do vídeo;
2. será reutilizado em vários vídeos;
3. um bloco de execução realmente precisará consultar ou aplicar seus itens;
4. é possível definir o formato de cada item.

Exemplos possíveis: banco permanente de temas já aprovados, estruturas de título, layouts de thumbnail, regras editoriais ou modelos narrativos. Na prévia, descreva coleção, finalidade, campos/tipos e quais processos poderão usá-la. Não a inclua no JSON portátil, pois o `collectionId` pertence ao canal.

Uma lista de 100 temas pode ser coleção apenas se o autor declarar que ela foi pré-definida para abastecer vídeos futuros. Nesse caso, explique a coleção esperada, por exemplo `Banco de temas aprovados`, e o formato de cada item: `tema` (texto, obrigatório), `ângulo` (texto longo, obrigatório), `público` (texto, opcional), `status` (seleção, obrigatório). Se a lista foi criada para decidir o vídeo atual, ela é saída de `CRIAR` seguida de `VALIDAR`.

## 3. Execução de vídeo — vira bloco

Só esta categoria vai para o método importável. São ações necessárias para produzir o vídeo atual, dentro de um dos 8 processos: tema, título, thumbnail, roteiro, narração, assets, edição e publicação.

Exemplo: pesquisar evidências para o tema deste vídeo (`BUSCAR`), criar 100 opções para este vídeo (`CRIAR`), selecionar uma opção recém-criada (`VALIDAR`), escrever o roteiro final (`CRIAR`).

## 4. Fora do aplicativo — registre, mas não converta

Depoimentos, promoção de curso, chamadas comerciais, opiniões sem ação operacional, histórias pessoais e instruções que não se conectam a uma execução ou a uma coleção reutilizável não viram blocos nem coleções.

## Sequência obrigatória de triagem

Para cada etapa mencionada, pergunte internamente:

1. Isso é uma decisão de canal anterior aos vídeos? → contexto estratégico, fora do método.
2. É algo pré-existente, reutilizável e necessário a vários vídeos? → proposta de Biblioteca Estratégica.
3. É uma ação para produzir este vídeo? → bloco do método; então aplique `CONTENTFLOW_BLOCK_RULES.md`.
4. Não se encaixa? → fora do aplicativo.

Não crie blocos para os itens 1, 2 ou 4.
