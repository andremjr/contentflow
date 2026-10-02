# Da descrição do usuário ao Método

Leia antes de desenhar ou revisar a composição de um Método, especialmente
quando o pedido reproduzir uma ferramenta manual ou omitir etapas. Use os
contratos atuais; esta referência não define uma nova arquitetura.

## Completar o processo sem decidir produto silenciosamente

O usuário descreve a experiência desejada, não precisa entregar uma especificação
arquitetural. Descubra o resultado final, os materiais disponíveis, as decisões
que ele quer controlar e o preparo manual que fazia fora da ferramenta.

Reconstrua entradas e resultados intermediários. Para cada etapa, verifique de
onde vem a informação necessária e quem usará a entrega. Uma associação pode
precisar ser produzida antes da geração: personagens por cena, pesquisa por seção,
narração por trecho ou CTA por ponto do roteiro.

Preencha lacunas determinadas pelo objetivo e pelos contratos. Declare hipóteses
editoriais e peça decisão apenas quando opções diferentes mudarem o resultado,
custo ou intervenção e o contexto não resolver a escolha. Não peça novamente
decisões já autorizadas nem invente capacidades para fechar a proposta.

## Derivar a composição

1. Ordene pelas dependências semânticas, antes de selecionar plugins.
2. Separe etapas com entrega ou decisão que o usuário precisa revisar, reutilizar
   ou preservar independentemente. Uma associação pode ocupar sua própria etapa
   ou acompanhar outra entrega, conforme o controle desejado.
3. Mantenha login, upload, parsing, polling e download dentro da capability;
   itens, perfis, tentativas e recuperação universal pertencem ao Core.
4. Use apenas os Blocos/operadores atuais. Selecionar resultados desta execução
   usa `VALIDAR`; `ESCOLHER` requer Biblioteca Estratégica pré-existente.
5. Confira o significado das portas, além de shape, cardinalidade, representação
   e binding. Configure cada capability para a ação daquela etapa.

Não copie a quantidade de telas de uma extensão nem agrupe ações só porque ela
possui um botão que faz tudo. Tampouco transforme todos os cliques em Blocos.
A composição deve tornar o trabalho compreensível e permitir as intervenções
pedidas. Métodos prontos podem conter essa estratégia sem exigir construção pelo
usuário. A interface não deve exigir compreensão de IDs, schemas ou leases.

## Exemplos orientadores

- Visual: roteiro → personagens → referências → prompts com associações → cenas
  → seleção → animação. Os personagens vêm do roteiro, antes dos prompts.
- Roteiro pesquisado: outline → pesquisa → distribuição de informações/fontes
  por seção → desenvolvimento → revisão. Inverta pesquisa/outline se os fatos
  precisarem determinar a estrutura. Planeje/inclua CTAs na etapa apropriada e
  separe essa decisão quando o usuário quiser controlá-la.
- Título: candidatos → seleção → texto escolhido. A entrega estratégica é o
  conteúdo selecionado; os controles nativos da decisão continuam internos.

São exemplos de dependência, não sequências obrigatórias. Conteúdo textual JSON
é uma opção para associações quando aceito pelo produtor e consumidor. O produtor
fornece os IDs canônicos ao modelo e valida o texto; o consumidor traduz esses
IDs para a ferramenta. O Core administra identidade e proveniência sem decidir
as associações ou analisar esse JSON. Preserve contratos internos existentes.

## Resultado da análise e validação

Apresente uma prévia curta: etapa, conteúdo recebido, entrega, decisão e consumidor.
Explique as fronteiras relevantes e as hipóteses pendentes em linguagem do usuário.
Se não houver plugin com as portas necessárias, a parte afetada permanece proposta
com limitação explícita; não anuncie um Método executável.

Valide o envelope, bindings e capacidades reais. No teste vertical, observe as
entregas intermediárias e a conexão entre elas, além do resultado final. Teste
intervenção e recuperação quando fizerem parte do cenário autorizado e suportado.
Mais etapas, parser aprovado ou skill atualizada não provam confiabilidade no
fornecedor. Siga os limites de validação do guardrail e da documentação viva.
