# Como o ContentFlow se comunica

## Guia visual e conceitual para usuários, alunos e criadores de Métodos e plugins

Este documento explica, em linguagem simples, como as partes do ContentFlow trabalham juntas durante uma execução.

Ele foi organizado para acompanhar o diagrama `estrutura-contentflow.png`, que apresenta os seguintes elementos:

```text
Núcleo do aplicativo → Métodos → Plugins → Extensão Browser Bridge → Perfis
                                   ↘ API
                                   ↘ Código
```

O diagrama é uma boa visão geral. Ao longo dos capítulos, vamos acrescentar alguns detalhes importantes:

- a maior parte das comunicações possui um caminho de ida e outro de volta;
- o Método não é um programa externo que fica rodando: ele é a receita que o núcleo lê;
- o plugin pode seguir três caminhos diferentes: API, código local ou navegador;
- o perfil é escolhido antes de o navegador abrir;
- a Browser Bridge não escolhe perfis e não decide a estratégia do trabalho;
- o núcleo do ContentFlow é a autoridade sobre o estado da execução.

---

# Capítulo 1 — A ideia central

O ContentFlow separa duas coisas que normalmente aparecem misturadas em outras ferramentas:

1. **a estratégia do trabalho**;
2. **a ferramenta usada para executar o trabalho**.

No ContentFlow, a estratégia é descrita pelo Método. A execução técnica pode ser realizada por uma pessoa, por uma inteligência artificial ou por código.

Em uma frase:

> O Método diz o que precisa ser feito; o núcleo organiza a execução; o plugin sabe como usar uma ferramenta externa.

Essa separação permite que o mesmo Método possa continuar existindo mesmo quando o usuário troca de ferramenta, plugin, conta ou provedor.

Por exemplo, um Bloco pode dizer:

> Criar cinco opções de título com base no tema do vídeo.

Esse Bloco poderia ser executado:

- manualmente por uma pessoa;
- por um plugin que chama uma API de inteligência artificial;
- por um plugin que usa um modelo local;
- por um plugin que automatiza uma interface no navegador.

O objetivo estratégico continua sendo o mesmo. O que muda é o executor.

---

# Capítulo 2 — Os cinco quadrados do diagrama

Para uma explicação inicial, podemos entender o diagrama como cinco quadrados principais.

## Quadrado 1 — Núcleo do aplicativo

É o ContentFlow propriamente dito.

O núcleo:

- organiza Canais e Projetos;
- armazena Métodos;
- inicia e acompanha execuções;
- resolve quais dados entram em cada Bloco;
- cria e acompanha jobs;
- registra tentativas, resultados e erros;
- guarda entregas e arquivos;
- controla permissões e conexões;
- controla quais plugins podem ser executados;
- controla quais perfis podem ser usados;
- mostra o progresso na interface;
- decide quando um Bloco terminou e quando o próximo pode começar.

O núcleo é a memória e a autoridade do processo.

Se o aplicativo for fechado e aberto novamente, é o núcleo que deve saber:

- o que já foi concluído;
- o que ainda está pendente;
- qual tentativa estava em andamento;
- quais resultados já foram preservados;
- se uma ação externa ficou com resultado incerto.

## Quadrado 2 — Métodos

Um Método é uma receita de trabalho.

Ele organiza uma sequência de Blocos dentro de um dos oito Processos Universais do ContentFlow.

Cada Bloco informa:

- qual ação será realizada;
- quem ou o que vai executá-la;
- quais dados precisa receber;
- quais resultados deve entregar;
- quais instruções devem ser seguidas;
- quais parâmetros podem ser configurados;
- qual plugin será usado, quando necessário.

O Método não acessa diretamente uma API, um arquivo ou uma página da internet. Ele descreve o trabalho para que o núcleo possa executá-lo.

Uma comparação simples:

```text
Método = receita
Bloco = etapa da receita
Execução = preparo real da receita
Resultado = entrega produzida naquela etapa
```

## Quadrado 3 — Plugins

O plugin é um especialista técnico.

Ele recebe uma ordem organizada pelo núcleo e sabe como usar uma ferramenta específica para produzir o resultado esperado.

Um plugin pode:

- chamar uma API;
- executar um script;
- iniciar um programa local;
- converter arquivos;
- usar Python ou FFmpeg;
- conversar com um serviço externo;
- acompanhar um job demorado;
- automatizar uma interface no navegador.

O plugin não define a estratégia completa do vídeo. Ele oferece uma ou mais capacidades que podem ser usadas pelos Blocos.

Por exemplo:

```text
Método: produzir a thumbnail
Bloco: criar uma imagem
Plugin: gerar a imagem usando determinado serviço
```

## Quadrado 4 — Extensão Browser Bridge

A Browser Bridge é uma ponte entre o plugin e uma página aberta no navegador.

Ela serve apenas quando o plugin precisa operar uma interface web.

A extensão recebe comandos técnicos, como:

- localizar um campo;
- inserir texto;
- clicar em um botão permitido;
- enviar um arquivo;
- aguardar uma condição;
- verificar o estado da página;
- recarregar a página quando isso for seguro;
- devolver um recibo da operação.

A extensão não sabe o que é um Método de Thumbnail, Roteiro ou Narração. Ela também não decide qual prompt usar, qual conta escolher ou quando um item deve ser considerado concluído.

Essas decisões pertencem ao núcleo e ao plugin.

## Quadrado 5 — Perfis

Um perfil representa uma identidade local de navegador.

Na prática, ele corresponde a uma pasta física que pode conter:

- cookies;
- sessões autenticadas;
- storage dos sites;
- preferências do navegador;
- a instalação da extensão;
- outros dados necessários para manter o login.

O perfil não executa o trabalho sozinho. Ele guarda a identidade e a sessão que serão usadas por uma instância do Chrome.

Por isso, a definição mais precisa é:

```text
Perfil = identidade e sessão persistente
Instância do navegador = processo temporário que usa esse perfil
```

---

# Capítulo 3 — O que existe dentro do quadrado “Métodos”

O quadrado “Métodos” esconde uma estrutura importante.

O ContentFlow possui:

- 8 Processos Universais;
- 4 tipos de Bloco;
- 3 Operadores.

## Os oito Processos Universais

1. Tema.
2. Título.
3. Thumbnail.
4. Roteiro.
5. Narração e Áudio.
6. Assets Visuais.
7. Edição.
8. Publicação.

Cada Método pertence a um desses Processos.

## Os quatro tipos de Bloco

- **BUSCAR:** encontrar ou recuperar alguma coisa fora do ContentFlow.
- **ESCOLHER:** selecionar algo que já existe na Biblioteca Estratégica do Canal.
- **CRIAR:** produzir algo novo.
- **VALIDAR:** aprovar, reprovar ou selecionar algo produzido durante a execução.

## Os três Operadores

- **Humano:** a pessoa realiza ou decide a ação.
- **IA:** uma inteligência artificial realiza a ação por meio de um plugin.
- **Código:** um programa, API, script ou automação realiza a ação por meio de um plugin.

Um Bloco, portanto, pode ser lido como uma frase:

```text
[OPERADOR] vai [TIPO DE BLOCO] alguma coisa,
usando estas entradas,
seguindo estas instruções,
e entregando estas saídas.
```

Exemplo:

```text
IA vai CRIAR cinco títulos,
usando o tema do vídeo,
seguindo as regras editoriais do Canal,
e entregando uma lista de textos.
```

---

# Capítulo 4 — O Método não “roda” sozinho

No diagrama aparece uma seta:

```text
Núcleo → Métodos → Plugins
```

Essa seta é útil para ensinar a sequência lógica, mas o funcionamento real precisa de uma pequena explicação.

O Método é um documento que o núcleo lê. Ele não é um serviço independente conversando com o plugin.

Na execução real acontece isto:

```text
1. O núcleo lê o Método.
2. O núcleo encontra o próximo Bloco.
3. O núcleo resolve os dados daquele Bloco.
4. O núcleo identifica o plugin configurado.
5. O núcleo chama o plugin em nome daquele Bloco.
```

Portanto, existe uma comunicação que visualmente parece “pular” o quadrado dos Métodos:

```text
Núcleo ───────────────→ Plugin
        usando as regras do Bloco
```

Isso não significa que o Método foi ignorado. Significa que o Método foi lido e transformado pelo núcleo em uma ordem concreta para o plugin.

O caminho de volta também passa pelo núcleo:

```text
Plugin → Núcleo → estado do Bloco → Interface
```

O plugin não altera diretamente o card do Bloco na tela.

---

# Capítulo 5 — As três saídas possíveis de um plugin

O diagrama mostra corretamente que um plugin pode seguir caminhos diferentes.

## Caminho A — Plugin de API

Uma API é uma porta criada especificamente para que programas se comuniquem.

O fluxo simplificado é:

```text
Núcleo
  → lê o Método e o Bloco
  → chama o plugin
  → plugin envia dados para a API
  → API devolve uma resposta
  → plugin organiza a resposta
  → núcleo valida e salva
  → interface mostra o resultado
```

Exemplos:

- enviar texto para um modelo de IA;
- sintetizar voz por uma API de TTS;
- buscar imagens em um banco de mídia;
- publicar um vídeo por uma API oficial;
- consultar um serviço de análise.

Nesse caminho, normalmente não existem Browser Bridge, Chrome ou perfil de navegador.

## Caminho B — Plugin de código local

O plugin pode executar código na máquina do usuário.

O fluxo é:

```text
Núcleo
  → lê o Método e o Bloco
  → chama o plugin
  → plugin executa código autorizado
  → código lê, cria ou transforma dados
  → plugin devolve valores e arquivos
  → núcleo importa, valida e salva
  → interface mostra o resultado
```

Exemplos:

- converter áudio;
- juntar vídeos;
- criar legendas;
- redimensionar imagens;
- executar FFmpeg;
- executar um script Python empacotado;
- gerar um arquivo local.

Também não é necessário usar Browser Bridge ou perfil.

## Caminho C — Plugin de automação de navegador

Esse é o caminho mais complexo:

```text
Núcleo
  → lê o Método e o Bloco
  → escolhe e autoriza um perfil
  → núcleo abre ou reutiliza o Chrome com esse perfil
  → chama o plugin com a sessão efêmera já reservada
  → plugin conecta-se à Browser Bridge
  → extensão executa operações permitidas na página
  → página produz um estado ou resultado
  → extensão devolve recibos e eventos
  → plugin interpreta o resultado
  → núcleo valida e salva
  → interface mostra o resultado
```

Esse caminho é mais instável porque páginas mudam, sessões expiram, conexões caem e ações podem ficar com resultado incerto.

Por isso, ele precisa de mais mecanismos de segurança e recuperação.

---

# Capítulo 6 — Como o núcleo conversa com o plugin

Quando o núcleo chama um plugin, ele envia um pacote organizado de informações.

Em linguagem simples, esse pacote pode conter:

- qual execução está acontecendo;
- qual Bloco está sendo executado;
- qual capacidade foi escolhida;
- qual tentativa está em andamento;
- quais são os dados de entrada;
- de onde esses dados vieram;
- qual resultado o Bloco espera;
- quais instruções foram resolvidas;
- quais parâmetros o usuário configurou;
- se é uma execução nova ou uma retomada;
- se existe uma conversa anterior que pode ser continuada;
- se o trabalho representa um item dentro de uma coleção;
- informações restritas sobre o contexto do Projeto.

O plugin não recebe acesso livre ao banco de dados do ContentFlow.

Ele recebe apenas o que foi autorizado e necessário para executar aquela capacidade.

## O que não deve ser enviado nesse pacote

- cookies;
- senha;
- token exposto;
- caminho físico de outros perfis;
- acesso ao banco completo;
- projetos não relacionados;
- dados de outros plugins;
- uma lista de todas as contas da máquina.

Credenciais declaradas são entregues por um serviço separado e somente em memória.

---

# Capítulo 7 — Como o plugin responde ao núcleo

O plugin pode responder de três maneiras principais.

## Resposta 1 — Sucesso

O plugin informa que terminou e pode devolver:

- textos;
- números;
- listas;
- registros;
- decisões;
- imagens;
- áudios;
- vídeos;
- arquivos;
- URL;
- informações de uso;
- uma referência de conversa.

O núcleo valida tudo antes de considerar o Bloco concluído.

## Resposta 2 — Pendente

Alguns trabalhos demoram.

O plugin pode informar:

> O trabalho foi iniciado, mas ainda não terminou. Consulte novamente usando este identificador.

O núcleo salva esse job e volta a consultar o plugin depois.

## Resposta 3 — Erro

O plugin devolve:

- um código de erro;
- uma mensagem segura;
- se existe possibilidade de tentar novamente;
- quanto tempo aguardar;
- resultados parciais que já possam ser preservados.

O núcleo decide se deve:

- repetir;
- aguardar;
- trocar para outro perfil configurado;
- pedir intervenção humana;
- preservar uma entrega parcial;
- encerrar a tentativa como falha.

## Resultados durante a execução

O plugin também pode publicar resultados parciais antes de terminar.

Assim, o usuário pode ver:

- progresso;
- arquivos já concluídos;
- itens já gerados;
- mensagem da etapa atual;
- falha de um item específico.

O princípio é:

> O resultado só deve aparecer como confiável depois que o núcleo o persistir.

---

# Capítulo 8 — Como o plugin conversa com a Browser Bridge

O plugin possui uma pequena parte técnica chamada cliente da Browser Bridge.

Esse cliente:

1. encontra a extensão dentro do Chrome aberto;
2. verifica a identidade da extensão;
3. negocia a versão do protocolo;
4. verifica quais capacidades estão disponíveis;
5. cria uma sessão temporária;
6. envia comandos estruturados;
7. recebe recibos, eventos e snapshots;
8. encerra a sessão quando termina.

Antes do primeiro clique ou envio, cliente e extensão precisam concordar sobre a versão e as capacidades disponíveis.

Se não forem compatíveis, a operação deve parar antes de produzir qualquer efeito.

## Exemplos de comandos

```text
Inspecionar a página
Inserir texto
Clicar em um controle permitido
Pressionar Enter
Enviar arquivos
Aguardar uma condição
Solicitar um snapshot
Recarregar de forma controlada
Cancelar uma execução
```

Cada comando possui uma identidade própria. Se a resposta se perder, a mesma identidade ajuda a impedir que o efeito seja executado duas vezes.

---

# Capítulo 9 — Como a extensão conversa com a página

A extensão possui duas partes principais.

## Service worker

É o coordenador da extensão.

Ele:

- valida o plugin;
- valida a sessão;
- valida a origem da página;
- verifica se a ação é permitida;
- organiza uma fila por aba;
- evita comandos duplicados;
- registra ações em andamento;
- controla observers temporários;
- registra eventos de navegação e reload;
- controla a conexão técnica com a aba;
- devolve recibos ao plugin.

## Content script

É uma presença pequena dentro da página.

Na implementação atual, ele ajuda principalmente a:

- manter a extensão disponível durante um job ativo;
- informar que a página está sendo abandonada ou recarregada.

As regras específicas de cada fornecedor continuam no plugin.

Isso significa que a extensão não deveria conter uma regra como:

> Se for o Flow, crie quatro imagens para cada cena do roteiro.

Essa é uma decisão do Método e do plugin, não da ponte.

---

# Capítulo 10 — O perfil é escolhido antes da extensão

No diagrama original aparece:

```text
Extensão Browser Bridge → Perfis
```

Para uma visão geral, essa seta ajuda a indicar que a extensão está instalada e funciona dentro dos perfis.

Mas a ordem técnica mais correta é:

```text
Núcleo escolhe o perfil autorizado
        ↓
Núcleo reserva o perfil físico e abre o Chrome
        ↓
Plugin recebe somente a sessão efêmera autorizada
        ↓
A extensão já instalada naquele perfil inicia
        ↓
Plugin conversa com a extensão
```

Portanto, a extensão não procura nem escolhe perfis.

Ela existe dentro da instância do navegador que já foi aberta com o perfil selecionado.

## Quatro conceitos que não devem ser confundidos

### Perfil

Identidade local e pasta física da sessão.

### Vínculo

Autorização explícita para determinado plugin utilizar o perfil.

### Readiness

Informação de que aquele plugin está preparado para funcionar naquele perfil.

Um perfil pode estar pronto para um plugin e não estar pronto para outro.

### Lease

Reserva temporária que impede duas execuções de abrirem simultaneamente a mesma pasta física.

---

# Capítulo 11 — Todas as comunicações do diagrama

## Comunicação 1 — Núcleo ↔ Método

### Ida

O núcleo lê:

- ordem dos Blocos;
- instruções;
- entradas;
- saídas;
- operadores;
- plugins configurados;
- parâmetros;
- regras de validação.

### Volta

O núcleo associa ao Método:

- estados de execução;
- resultados;
- entregas;
- tentativas;
- erros;
- progresso.

O Método original continua sendo a receita. Os valores concretos pertencem à execução.

## Comunicação 2 — Núcleo/Bloco ↔ Plugin

### Ida

- inputs resolvidos;
- instrução resolvida;
- parâmetros;
- configuração funcional;
- contrato da saída;
- contexto permitido;
- tentativa;
- ordem de cancelamento ou retomada.

### Volta

- sucesso, pendência ou erro;
- valores;
- artifacts;
- progresso;
- resultados parciais;
- logs seguros;
- uso;
- conversa opaca;
- diagnósticos redigidos.

## Comunicação 3 — Plugin ↔ API

### Ida

- requisição HTTPS;
- dados autorizados;
- credencial obtida do cofre;
- parâmetros do serviço.

### Volta

- resposta;
- job externo;
- erro;
- progresso;
- arquivos ou URLs.

O núcleo não precisa conhecer os detalhes da API.

## Comunicação 4 — Plugin ↔ Código local

### Ida

- argumentos estruturados;
- arquivos autorizados;
- configuração;
- ordem de execução.

### Volta

- arquivos produzidos;
- saída estruturada;
- progresso;
- código de erro.

O núcleo importa os arquivos finais para seu armazenamento gerenciado.

## Comunicação 5 — Plugin ↔ Browser Bridge

### Ida

- handshake;
- comandos identificados;
- origem esperada;
- ação permitida;
- prazo de validade;
- estado de reconciliação.

### Volta

- recibo;
- código de erro;
- sequência de eventos;
- snapshot estrutural;
- aviso de resultado incerto.

## Comunicação 6 — Browser Bridge ↔ Página

### Ida

- inspeção;
- escrita em campos;
- clique;
- tecla;
- upload;
- observação temporária;
- reload controlado.

### Volta

- estado do elemento;
- confirmação técnica;
- mudança de página;
- desaparecimento de aba;
- perda de conexão;
- condição alcançada.

## Comunicação 7 — Núcleo ↔ Perfis

Esta comunicação “pula” alguns quadrados do diagrama.

O núcleo controla diretamente:

- identidade global do perfil;
- vínculo com plugins;
- readiness por vínculo;
- localização física protegida;
- lease;
- revogação;
- perfil associado ao job.

O plugin recebe acesso apenas ao perfil escolhido para aquela invocação.

## Comunicação 8 — Plugin ↔ Instância do Chrome

O núcleo inicia ou reutiliza o navegador usando o perfil físico reservado e entrega ao plugin somente a sessão efêmera autorizada.

Ele também pode conectar-se à porta técnica do Chrome para encontrar a extensão e a página correta.

Isso não dá ao plugin autorização para enumerar ou abrir outros perfis.

---

# Capítulo 12 — Comunicações que não devem existir

Algumas separações são tão importantes quanto as comunicações permitidas.

## Método → extensão diretamente

Não deve acontecer.

O Método não envia comandos de navegador.

## Extensão → banco do ContentFlow

Não deve acontecer.

A extensão não decide o estado real dos jobs ou das entregas.

## Plugin → banco do ContentFlow

Não deve acontecer.

O plugin devolve resultados pelo contrato público.

## API externa → Bloco diretamente

Não deve acontecer.

A resposta passa pelo plugin e pelo núcleo antes de aparecer como entrega confiável.

## Página → instruções administrativas

Não deve acontecer.

Texto de uma página é dado não confiável. Ele não pode pedir secrets, ampliar permissões, mudar o domínio autorizado ou ordenar uma compra/publicação.

## Extensão → escolha de estratégia

Não deve acontecer.

A extensão não decide quantos itens criar, qual prompt utilizar ou qual Processo deve avançar.

## Plugin → criação de identidades do ContentFlow

Não deve acontecer.

O plugin pode repetir um ID concedido para correlação, mas as identidades de execução, unidade, entrega e item pertencem ao núcleo.

---

# Capítulo 13 — Três exemplos completos

## Exemplo 1 — Criar títulos usando uma API

```text
1. O usuário inicia o Projeto.
2. O núcleo lê o Método de Título.
3. O núcleo encontra um Bloco CRIAR executado por IA.
4. O núcleo resolve o tema que será usado como entrada.
5. O núcleo chama o plugin configurado.
6. O plugin envia o pedido para a API.
7. A API devolve cinco títulos.
8. O plugin devolve a lista ao núcleo.
9. O núcleo valida o tipo e salva a entrega.
10. A interface mostra os títulos.
11. O próximo Bloco pode validar ou selecionar um deles.
```

Não houve navegador, extensão ou perfil.

## Exemplo 2 — Converter áudio usando código local

```text
1. O Método contém um Bloco de Código.
2. O núcleo resolve o arquivo de áudio de entrada.
3. O núcleo entrega ao plugin uma referência autorizada.
4. O plugin executa sua ferramenta empacotada.
5. A ferramenta cria um novo arquivo.
6. O plugin declara o arquivo como artifact.
7. O núcleo valida, importa e registra o artifact.
8. O Bloco recebe a entrega de áudio concluída.
```

Também não houve Browser Bridge.

## Exemplo 3 — Gerar imagem usando uma interface web

```text
1. O núcleo lê o Bloco e resolve o prompt.
2. O núcleo identifica o plugin e o perfil autorizado.
3. O núcleo reserva o perfil para impedir uso concorrente.
4. O núcleo abre o Chrome usando a pasta daquele perfil.
5. O núcleo chama o plugin com a sessão efêmera reservada.
6. O plugin encontra a Browser Bridge instalada nessa sessão.
7. Cliente e extensão negociam protocolo e capacidades.
8. O plugin pede que a extensão encontre o editor.
9. A extensão insere o prompt.
10. A extensão executa o comando de geração permitido.
11. O plugin acompanha o estado do fornecedor.
12. O resultado é encontrado e baixado ou referenciado.
13. O plugin devolve o resultado ao núcleo.
14. O núcleo importa e persiste o arquivo.
15. A interface mostra a imagem no Bloco.
16. O núcleo libera o perfil ao encerrar o job.
```

Se a resposta desaparecer depois do clique de geração, o sistema não deve simplesmente clicar novamente. Primeiro precisa verificar se a geração já foi iniciada.

---

# Capítulo 14 — Quem é responsável por quê

Uma forma simples de memorizar:

```text
Método declara.
Núcleo organiza, decide e persiste.
Plugin interpreta e executa uma capacidade.
Browser Bridge transporta operações seguras.
Navegador hospeda a sessão e a página.
Interface apresenta o estado persistido.
```

## O Método é dono de

- intenção;
- sequência;
- instruções;
- contratos de entrada e saída;
- parâmetros estratégicos;
- escolha do operador e da capability.

## O núcleo é dono de

- estado;
- identidade;
- ordem;
- tentativas;
- entregas;
- itens;
- artifacts armazenados;
- jobs;
- permissões;
- profiles e vínculos;
- retries e retomadas;
- decisão de conclusão.

## O plugin é dono de

- regras do fornecedor;
- endpoints;
- modelos e opções específicas;
- seletores;
- interpretação da resposta externa;
- código técnico da capability;
- reconciliação com o serviço externo.

## A Browser Bridge é dona de

- transporte de comandos;
- validação da sessão da ponte;
- idempotência dos comandos;
- fila por aba;
- eventos de lifecycle;
- snapshots técnicos;
- observers temporários;
- operação genérica e limitada sobre a página.

## O perfil contém

- sessão autenticada;
- cookies;
- storage do navegador;
- extensão instalada;
- preferências daquela identidade local.

---

# Capítulo 15 — O que acontece quando alguma coisa falha

## A API está indisponível

O plugin informa erro ou espera. O núcleo decide retry, pausa ou falha.

## O script local falha

O plugin devolve um erro técnico. Arquivos incompletos não devem ser apresentados como entrega final.

## O login expirou

O plugin informa que o perfil precisa de autenticação. O sistema deve pedir intervenção em vez de fingir sucesso.

## A página mudou

O plugin deve falhar de forma segura se não conseguir confirmar os controles esperados.

## O navegador fechou

A Bridge registra o evento. O plugin e o núcleo avaliam se é possível retomar.

## A resposta sumiu depois de um clique

O efeito é considerado incerto. O sistema verifica o estado externo antes de repetir.

## Um item de uma lista falhou

Os itens já concluídos devem permanecer preservados. O sistema deve permitir continuar os pendentes ou refazer somente o item necessário quando o contrato permitir.

## Um perfil ficou indisponível

No modo de fallback, o núcleo pode avançar para o próximo perfil explicitamente configurado, preservando o histórico da tentativa.

---

# Capítulo 16 — Estado atual e direção de evolução

O projeto já possui uma base importante para:

- jobs persistentes;
- resultados parciais;
- execução sequencial por item;
- fallback entre perfis;
- isolamento de plugins;
- perfis globais no núcleo;
- vínculos e readiness;
- leases por perfil;
- Browser Bridge versionada;
- comandos idempotentes;
- eventos e snapshots;
- reload controlado;
- diagnóstico redigido.

Algumas partes ainda estão sendo conectadas progressivamente.

Entre as próximas etapas estão:

- adaptar todos os plugins de navegador ao perfil global;
- oferecer o compartilhamento de perfis na interface;
- materializar todas as unidades de trabalho de forma universal;
- permitir uma sessão contínua processando vários itens;
- distribuir itens exclusivos entre perfis diferentes;
- oferecer os modos `single`, `fallback` e `parallel`;
- reorganizar a janela de configuração dos plugins;
- validar tudo em cenários reais de ponta a ponta.

Isso significa que a arquitetura descrita neste documento representa ao mesmo tempo:

1. o funcionamento já existente;
2. as fronteiras que já foram definidas;
3. a direção para a qual as partes ainda em transição estão sendo alinhadas.

---

# Capítulo 17 — Como uma pessoa pode contribuir

## Criando um Método

Uma pessoa não precisa programar para criar um Método.

Ela precisa responder:

- qual resultado deseja produzir;
- quais passos utiliza hoje;
- qual é a entrada de cada passo;
- qual é a saída de cada passo;
- quem executa cada passo;
- onde existe uma decisão humana;
- quais partes podem ser automatizadas.

Depois, esses passos são organizados usando os Processos, Blocos e Operadores existentes.

## Criando um plugin

Um desenvolvedor pode criar um plugin independente para oferecer uma capacidade técnica.

Ele precisa declarar:

- o que o plugin faz;
- quais Blocos e Processos aceita;
- quais entradas recebe;
- quais saídas produz;
- quais permissões utiliza;
- quais serviços externos acessa;
- quais custos ou efeitos podem existir;
- como trata erro, cancelamento e retomada.

O plugin não precisa recriar o ContentFlow. Ele apenas se conecta ao protocolo público.

## Migrando um processo existente

Uma pessoa pode observar sua rotina atual e separar:

```text
Estratégia repetível → Método
Ação individual → Bloco
Trabalho humano → Operador Humano
Serviço externo → Plugin de API
Manipulação técnica → Plugin de Código
Interface sem API adequada → Plugin de navegador
```

Essa separação transforma um processo informal em um fluxo claro, compartilhável e progressivamente automatizável.

---

# Capítulo 18 — Resumo para apresentar em aula

Uma explicação curta pode seguir este roteiro:

> O ContentFlow separa a estratégia das ferramentas. O Método descreve o processo usando Blocos. O núcleo lê esses Blocos, organiza os dados e controla a execução. Quando precisa de uma ferramenta externa, chama um plugin. O plugin pode usar uma API, executar código local ou automatizar uma página. Na automação de navegador, a Browser Bridge transporta comandos seguros para uma instância do Chrome aberta com um perfil autorizado. O resultado volta pelo plugin, é validado e salvo pelo núcleo e só então aparece na interface. Assim, o Método continua sendo do usuário, enquanto as ferramentas podem ser trocadas ou ampliadas por plugins.

Em seis frases:

1. O Método descreve.
2. O núcleo organiza.
3. O plugin executa.
4. A Browser Bridge transporta.
5. O navegador mantém a sessão e opera a página.
6. O núcleo salva e mostra o resultado.

---

# Glossário simples

## Artifact

Arquivo produzido ou importado durante a execução, como imagem, áudio, vídeo ou documento.

## Bloco

Uma ação individual dentro de um Método.

## Browser Bridge

Protocolo e extensão que permitem ao plugin executar operações limitadas em uma página do navegador.

## Capability

Uma capacidade específica oferecida por um plugin.

## Entrega

Resultado tipado produzido por uma saída de Bloco.

## Item

Uma unidade identificável dentro de um trabalho ou entrega, como uma cena, um prompt, uma imagem ou um trecho de áudio.

## Job

Registro persistente de um trabalho técnico em andamento.

## Lease

Reserva temporária de um perfil para impedir uso simultâneo inseguro.

## Método

Receita estratégica que organiza Blocos dentro de um Processo Universal.

## Núcleo

Parte central do ContentFlow responsável por organização, execução, persistência e segurança.

## Perfil

Identidade local de navegador e pasta física que preserva uma sessão.

## Plugin

Pacote independente que implementa uma capacidade técnica compatível com o ContentFlow.

## Readiness

Estado que informa se determinado plugin está preparado para funcionar em determinado perfil.

## Retry

Nova tentativa controlada de um trabalho que falhou ou foi reprovado.

## Snapshot

Registro congelado da estratégia e do estado usados em uma execução.

---

# Nota sobre licenciamento e participação

O código do ContentFlow é disponibilizado sob uma licença proprietária **source-available**, e não sob uma licença open source. A licença permite análise, operação autorizada, desenvolvimento de plugins independentes e preparação de contribuições para o produto oficial, mas não autoriza clones, rebranding, white-label ou produtos concorrentes derivados do núcleo.

Isso não impede a participação da comunidade. Alunos e usuários podem contribuir principalmente por meio de:

- Métodos compartilháveis;
- plugins independentes;
- testes;
- documentação;
- relatos de uso;
- propostas e contribuições destinadas ao projeto oficial.
