# Regras inegociáveis dos blocos — ContentFlow

Classifique cada passo pela **origem do item que está sendo manipulado**, não pelo verbo casual usado na transcrição. A palavra “escolher” dita pelo autor não significa automaticamente o bloco `ESCOLHER`.

## Árvore de decisão obrigatória

1. O passo obtém dados, mídia ou referências em fonte externa? Use `BUSCAR`.
2. O passo produz, sintetiza ou gera um novo ativo/dado/arquivo a partir de entradas? Use `CRIAR`.
3. O passo seleciona ou aplica algo que já existia e estava cadastrado em uma **Coleção da Biblioteca Estratégica do canal**, antes de a execução começar? Use `ESCOLHER`.
4. O passo revisa, aprova, reprova, seleciona ou faz curadoria de algo pesquisado, gerado ou preenchido **nesta execução**? Use `VALIDAR`.

Se houver dúvida entre `ESCOLHER` e `VALIDAR`, use `VALIDAR`, a menos que uma coleção estratégica pré-existente seja explicitamente identificada.

## Definições e exemplos

| Bloco      | Use quando                                                                                    | Exemplos corretos                                                                                             | Nunca use para                                                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `BUSCAR`   | Capturar/recuperar dados, mídia ou referências fora da plataforma.                            | IA pesquisa 5 canais brasileiros; humano reúne notícias; código consulta uma API.                             | Sintetizar a análise ou decidir qual resultado aproveitar.                                                                           |
| `CRIAR`    | Produzir um ativo, dado, arquivo ou síntese novo.                                             | IA gera 100 ideias a partir da pesquisa; humano escreve o roteiro; código renderiza vídeo.                    | Apenas recuperar uma fonte externa ou aprovar o que foi produzido.                                                                   |
| `ESCOLHER` | Selecionar ou aplicar item pré-existente de coleção da Biblioteca Estratégica do mesmo canal. | Humano aplica uma estrutura de título cadastrada; humano escolhe um layout de thumbnail da coleção do canal.  | Escolher entre 100 temas que a IA acabou de gerar; aprovar uma thumbnail recém-criada; escolher entre referências recém-pesquisadas. |
| `VALIDAR`  | Auditar, aprovar, reprovar ou escolher resultados criados/pesquisados durante a execução.     | Humano escolhe 1 dos 100 temas gerados; humano aprova a persona; humano seleciona uma thumbnail recém-criada. | Buscar fontes externas ou criar o ativo inicial.                                                                                     |

## Regra obrigatória de justificativa para `ESCOLHER`

Só use `ESCOLHER` se a transcrição ou o usuário identificar uma coleção estratégica que exista antes do método rodar. Na prévia, registre obrigatoriamente:

1. **Coleção esperada:** nome claro, por exemplo `Estruturas de título`.
2. **Justificativa:** por que os itens já existem na Biblioteca Estratégica, e não foram criados/pesquisados nesta execução.
3. **Formato do item:** campos, tipos e obrigatoriedade; por exemplo `estrutura` (texto longo, obrigatório), `objetivo` (texto, obrigatório) e `exemplo` (texto longo, opcional).

Se qualquer ponto faltar, faça uma pergunta ou classifique como `VALIDAR` se a decisão for sobre resultado da execução. Um arquivo JSON portátil não pode conter `ESCOLHER`, porque não conhece o `collectionId` do canal de destino.

O `ESCOLHER` pode consultar `channel_history` para orientar a seleção com escolhas anteriores do próprio bloco, sem mudar sua classificação. A coleção continua sendo fornecida exclusivamente pelo vínculo do bloco; o histórico é contexto de decisões passadas, não acesso alternativo à Biblioteca. O `CRIAR` também pode consultar `channel_history`, mas recebe os resultados oficiais anteriores do mesmo Processo. `BUSCAR` e `VALIDAR` não usam Histórico do Canal. A regra editorial fica em `instructions` para Humano/IA ou na configuração do plugin de Código.

## Regras de `VALIDAR`

- O bloco sempre aponta para um bloco anterior e para a entrega que ele valida.
- Use `approval` para “aprovar/reprovar”.
- Use `select_one` para selecionar uma única opção de uma lista ou resultado recém-produzido.
- Use `select_many` para selecionar várias opções de uma lista ou resultado recém-produzido.
- A escolha feita pelo humano é uma nova saída do bloco `VALIDAR`; os blocos seguintes usam essa saída, não a lista bruta.

## Exemplo: tema do vídeo

| Ordem | Ação                                                        | Classificação correta               |
| ----- | ----------------------------------------------------------- | ----------------------------------- |
| 1     | Pesquisar canais brasileiros, vídeos recentes e comentários | `BUSCAR` · `IA`                     |
| 2     | Sintetizar assuntos polarizados a partir da pesquisa        | `CRIAR` · `IA`                      |
| 3     | Humano seleciona um assunto polarizado para explorar        | `VALIDAR` · `Humano` · `select_one` |
| 4     | IA cria 100 temas alinhados ao posicionamento escolhido     | `CRIAR` · `IA`                      |
| 5     | Humano escolhe o tema que será o vídeo                      | `VALIDAR` · `Humano` · `select_one` |

O passo 3 e o passo 5 não são `ESCOLHER`: os itens não estavam pré-cadastrados na Biblioteca Estratégica; eles foram produzidos durante a execução.
