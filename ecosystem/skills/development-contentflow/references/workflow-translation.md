# Traduzir fluxos para o ContentFlow

Leia ao planejar um Método, adaptar uma automação externa ou escolher as etapas
de um teste vertical. Esta referência orienta o raciocínio; os contratos vivos e
as decisões explícitas do criador continuam sendo a autoridade.

## Reconstruir o trabalho, antes de escolher a ferramenta

Uma interface manual pode receber um material já preparado pelo usuário. Um
campo único de prompts pode esconder extração de personagens, definição de
aparência, associação por tags e seleção de referências. Inventarie também esse
trabalho anterior e as decisões posteriores ao clique; copiar apenas os controles
da extensão não reproduz o processo de produção.

Parta do resultado desejado e dos materiais disponíveis. Para cada transformação,
identifique o conteúdo recebido, o conteúdo produzido, quem decide e quem consome
o resultado. Ordene pelas dependências reais, antes de escolher plugins. Verifique
qual fonte contém a informação necessária: inferir personagens de prompts de
cenas já gerados pode perder informação disponível no roteiro original.

Quando a descrição estiver incompleta, proponha as etapas necessárias para
atingir o objetivo, explicando suas razões. Diferencie decisões já dadas,
consequências técnicas e hipóteses editoriais. Pergunte somente pelas escolhas
que realmente alteram intenção, custo ou controle e não estão resolvidas no
contexto. Não exija que o usuário conheça a arquitetura ou forneça IDs/schemas.

## Distribuir pelas autoridades corretas

| Parte do trabalho | Autoridade |
| --- | --- |
| Ordem das transformações, entregas conectadas e pontos de intervenção editorial | Método, usando Blocos e operadores existentes |
| Análise, criação e escolha editorial de associações | Operador da etapa: Humano, IA ou Código, conforme a intenção |
| Identidade, ordem, proveniência, deliveries, work units, perfis, leases e política universal de recovery | Core |
| Formato exigido pelo fornecedor, parsing, anexos, tags, referências, seletores e interpretação factual do resultado | Plugin |
| Transporte autorizado, lifecycle e primitivas universais de navegador | Browser Bridge |
| Exibição e coleta da interação previstas no contrato | UI/Presentation; configuração funcional declarada pelo plugin |

O Core também valida contratos e integridade; ele não escolhe quais personagens
aparecem numa cena, quais fontes sustentam uma seção ou onde inserir um CTA.
O plugin não decide a progressão do Projeto nem refaz por conta própria etapas
anteriores. Compatibilidade de tipo não prova compatibilidade de significado.

## Escolher fronteiras úteis, sem expor a mecânica

Considere um Bloco separado quando sua entrega puder ser inspecionada, editada,
validada, reutilizada, produzida por outro operador ou preservada enquanto a etapa
seguinte é refeita. Uma associação pode ser essa entrega: informações pesquisadas
por seção, personagens por cena ou CTAs por ponto do roteiro. Se a associação já
for produzida junto de outra entrega e não exigir controle independente, ela pode
permanecer nessa etapa. Justifique a escolha pelo uso, não pelo número de campos
da ferramenta externa.

Login, navegação, upload, envio, polling, parsing e download normalmente são
operações internas da mesma capability. Itens e tentativas não viram Blocos;
escala, distribuição e recuperação seguem os contratos do Core. Uma capability
combinada pode ser adequada quando só a entrega final importa; não a use para
esconder intermediários que o usuário quer controlar.

Mais Blocos não garantem confiabilidade. Cada fronteira exige conteúdo persistido,
binding correto, configuração compatível e comportamento definido diante de
falha. Exponha decisões compreensíveis, com nomes do trabalho do usuário, e deixe
a tradução técnica no plugin. Métodos prontos podem entregar essa composição sem
obrigar o usuário a construí-la ou aprender sua mecânica.

## Exemplos de tradução, não receitas universais

**Personagens consistentes:** roteiro → personagens extraídos do roteiro →
imagens de referência → prompts com nomes e IDs dos personagens → cenas →
seleção → animação. A IA ou o humano escolhe as associações; o plugin resolve os
IDs e traduz para referências/tags do fornecedor. Não vincule por posição ou nome
quando o contrato exige IDs. O nome pode dar legibilidade, sem substituir a
identidade canônica.

**Roteiro com pesquisa:** ideia → outline → pesquisa orientada pelas lacunas →
distribuição das informações e fontes nas seções → desenvolvimento → revisão.
Um plano de CTAs pode receber outline e objetivo editorial e alimentar a escrita
ou uma etapa posterior de inserção/revisão. Separe esse plano se precisar de
decisão independente. Pesquisa pode preceder outline quando os fatos precisam
definir a estrutura; derive a ordem do objetivo e das dependências.

**Títulos:** gerar candidatos → selecionar um → usar o texto escolhido nas
etapas seguintes. A decisão de validação permanece no mecanismo nativo; não
exponha um controle técnico como se fosse a entrega estratégica do título.

Nas entradas e entregas estratégicas use conteúdo conforme `CONTENT_CONTRACT`.
JSON pode carregar associações textuais quando os plugins aceitam e validam esse
formato; o Core não interpreta esse texto como relações universais. A skill não
autoriza novas famílias, primitivas ou interfaces de associação inexistentes.

## Preparar e observar o teste vertical

Antes de executar, produza uma descrição curta das etapas e dependências, com
entradas, entregas, operador/capability, decisão editorial e resultado visível
esperado. Confira portas, cardinalidade, representação e configurações reais.
Se uma ferramenta não expõe o intermediário necessário, registre a lacuna; não
invente suporte nem contorne silenciosamente a fronteira de autoridade.

Observe se cada entrega corresponde à origem correta, chega ao consumidor certo
e permite a intervenção prevista. Quando o cenário incluir falha/retomada,
verifique a preservação do trabalho concluído e a ausência de efeitos duplicados
conforme a política suportada. Validação local ou sandbox não comprova resultado
real no fornecedor. Siga `docs/DEVELOPMENT.md` e `docs/DEV_MONITOR.md` para evidências
e limites de cobertura; respeite a autorização e os custos do cenário.

Ao corrigir uma distribuição errada, preserve o fato observado e trate a causa
na autoridade correta. Não masque a falha com preparação manual fora do Método
que o usuário esperava automatizar.

## Limite do raciocínio do agente

No cenário visual de 02/10/2026, o criador precisou corrigir a ordem apesar das
responsabilidades já documentadas. Esta orientação reduz uma fonte de erro, mas
não demonstra que o agente pensará corretamente. Apresente dependências e
hipóteses de modo verificável; identifique propostas ainda não validadas. Não
prometa confiabilidade pela existência da skill, por mais Blocos ou por testes
isolados aprovados.

Fontes normativas: `docs/ARCHITECTURE.md`, `docs/CONTENT_CONTRACT.md`,
`docs/PLUGIN_INTERFACE.md` e `docs/DEVELOPMENT.md` da versão em trabalho.
