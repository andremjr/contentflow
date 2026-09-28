# Comunicação ContentFlow Simplificada

## Para que serve este documento

Este documento explica o ContentFlow para pessoas que não são programadoras. Ele usa os seis trechos do diagrama como capítulos e responde, em cada um deles, às mesmas perguntas:

- como a comunicação funciona hoje;
- o que deveria pertencer a essa camada;
- o que hoje está misturado, duplicado ou em transição;
- quando uma comunicação precisa ultrapassar o quadrado vizinho.

O ponto mais importante é que o diagrama representa uma **ordem de responsabilidades**, mas não uma corrente obrigatória de telefonemas entre quadrados.

```text
Método = receita guardada
Perfil = identidade e sessão guardadas

Núcleo, plugin, extensão e navegador = partes que realmente executam ações
```

Por isso, nem todo quadrado precisa “chamar” o seguinte. Às vezes o núcleo precisa falar diretamente com uma parte mais distante para manter segurança, histórico e controle.

## Leitura corrigida do diagrama

```text
                              ┌────────────→ API
                              │
NÚCLEO ←→ MÉTODO/BLOCO        ├←→ PLUGIN ─→ CÓDIGO LOCAL
   │                          │
   │                          └←→ BROWSER BRIDGE ←→ PÁGINA
   │
   └←→ PERFIS, VÍNCULOS E LEASES ─→ INSTÂNCIA DO CHROME
```

Há duas linhas diferentes nesse desenho:

- a **linha do trabalho**, que vai do Método até o meio que produzirá o resultado;
- a **linha de controle**, pela qual o núcleo administra execução, itens, permissões, perfis e tentativas.

Essa segunda linha explica alguns “saltos” que são necessários e corretos.

# Capítulo 1 — Núcleo ↔ Método

## O que essa camada significa

O Método é a receita. O núcleo é quem lê essa receita e transforma suas etapas em uma execução real.

O Método declara, por exemplo:

- quais Blocos existem e em que ordem;
- que tipo de trabalho cada Bloco representa;
- quais entradas e saídas são esperadas;
- quais instruções e parâmetros devem ser usados;
- qual plugin e qual função do plugin foram escolhidos;
- como um Bloco aproveita resultados anteriores.

## Como a comunicação funciona hoje

O fluxo correto é:

```text
Método descreve o trabalho
          ↓
Núcleo lê e congela uma cópia daquela receita
          ↓
Núcleo cria a execução real de cada Bloco
```

Essa cópia congelada — o snapshot — evita que uma alteração futura no Método mude silenciosamente uma execução que já começou.

O estado real, como “aguardando”, “executando”, “falhou” ou “concluído”, não é escrito dentro do Método. Ele fica nos registros de execução controlados pelo núcleo.

## O que deve permanecer nesta camada

Do lado do Método devem ficar somente decisões portáteis e reutilizáveis: estratégia, sequência, contratos, instruções e referências.

Do lado do núcleo devem ficar:

- estado da execução;
- tentativa atual;
- valores reais usados naquela execução;
- IDs internos;
- histórico e proveniência;
- resultados e entregas;
- decisões de avançar, pausar, repetir ou cancelar.

## O que não deve ficar aqui

O Método não deve guardar:

- cookies, logins ou tokens;
- caminhos físicos da máquina;
- perfil local do navegador;
- estado temporário de uma página;
- IDs de jobs que só existem naquela execução;
- comandos técnicos para a extensão.

## Existe algo fora do lugar hoje?

Nesta fronteira, o desenho atual está conceitualmente correto. O ContentFlow já separa o Método da execução por meio de snapshots e registros próprios de execução.

O cuidado é impedir que necessidades de um plugin ou de um site acabem sendo gravadas como detalhes permanentes do Método. O Método pode dizer **o que precisa ser produzido**, mas não deve carregar a sessão local usada para produzir.

## Comunicação que precisa ultrapassar o vizinho

O núcleo lê o Método, mas depois precisa falar diretamente com o plugin. Isso não significa que ele ignorou o Método: o pedido enviado ao plugin foi criado a partir do Bloco definido no Método.

## Regra simples

> O Método declara a estratégia. O núcleo cria e controla a execução dessa estratégia.

# Capítulo 2 — Método/Bloco ↔ Plugin

## A correção mais importante do diagrama

A seta entre Método e plugin é uma **relação lógica**, não uma chamada técnica direta.

O Método é um documento passivo. Ele não acorda, não executa código e não chama o plugin. Quem faz isso é o núcleo:

```text
Método define o Bloco
        ↓
Núcleo interpreta e prepara o Bloco
        ↓
Núcleo chama diretamente o plugin
```

Portanto, a comunicação direta `núcleo ↔ plugin` é necessária e correta.

## O que o Bloco fornece

O Bloco fornece a parte estratégica do pedido: intenção, entradas e saídas esperadas, instruções, parâmetros, plugin e função selecionados e referências a resultados anteriores.

## O que o núcleo acrescenta

Antes de chamar o plugin, o núcleo transforma a receita em uma ordem concreta. Ele acrescenta:

- valores reais das entradas;
- identificação da execução e da tentativa;
- arquivos autorizados;
- perfil autorizado, se houver navegador;
- contexto necessário para retomar ou cancelar;
- itens e resultados parciais já registrados;
- formato exato da resposta esperada.

## O que o plugin devolve

O plugin pode devolver sucesso, pendência ou erro; valores e arquivos; progresso e resultados parciais; códigos de diagnóstico; e referências opacas para conversas ou jobs externos.

O plugin informa o que aconteceu, mas é o núcleo que decide se o Bloco pode ser considerado concluído. Antes disso, o núcleo confere tipos, arquivos, itens obrigatórios, tentativa vigente e possíveis cancelamentos.

## O que deve permanecer nesta camada

O núcleo deve continuar dono de IDs, execuções, itens, entregas, tentativas, retries, cancelamentos, persistência, histórico e validação final.

O plugin deve ser dono da adaptação técnica para o serviço escolhido, da interpretação dos erros desse serviço e da transformação da resposta externa para o contrato do ContentFlow.

## O que está fora do lugar ou em transição

Há dois pontos principais.

Primeiro, boa parte da coordenação ainda está concentrada no servidor principal: preparação do pedido, jobs, retries, perfis, resultados parciais e entregas. Essas funções pertencem ao núcleo, mas o código pode ser dividido futuramente em serviços internos menores. A correção é **organizar o núcleo por dentro**, não transferir autoridade para Método ou plugin.

Segundo, o modelo futuro de itens já aparece em contratos, mas ainda não está completo em todo o runtime. Em alguns caminhos, a correlação incremental ainda depende de posições ou chaves devolvidas pelo plugin. O destino mais seguro é:

```text
Núcleo cria o item e concede seu ID antes do efeito externo
Plugin executa e repete o mesmo ID na resposta
Núcleo atualiza aquele item sem precisar adivinhar sua identidade
```

## Comunicação que precisa ultrapassar o vizinho

O núcleo precisa falar diretamente com o plugin e também com o gerenciador de perfis. O Método não pode servir como intermediário ativo, pois isso criaria duas autoridades para a mesma execução.

## Regra simples

> O Bloco define o contrato; o núcleo dá a ordem concreta; o plugin executa a capacidade escolhida.

# Capítulo 3 — Plugin ↔ API

## O que essa camada significa

Nesse caminho, o plugin adapta uma API externa ao formato esperado pelo ContentFlow.

## Como a comunicação funciona

```text
Núcleo envia um pedido controlado ao plugin
                    ↓
Plugin traduz o pedido para a API
                    ↓
API devolve resultado, progresso, job ou erro
                    ↓
Plugin traduz a resposta para o contrato do ContentFlow
                    ↓
Núcleo valida e persiste
```

O plugin conhece endpoint, autenticação, modelos, limites, formatos e mensagens de erro do fornecedor. O núcleo não precisa conhecer esses detalhes.

## O que deve permanecer nesta camada

Devem ficar no plugin as chamadas HTTPS, autenticação específica, acompanhamento de jobs externos, limites, códigos de erro e conversão dos formatos.

Devem continuar no núcleo a autorização do plugin, entrega controlada de secrets, tentativa, cancelamento, validação e persistência.

## O que está fora do lugar hoje

Não foi identificada uma inversão arquitetural importante nessa conexão. É uma das partes mais simples e mais próximas da organização desejada.

O cuidado permanente é não deixar uma API externa escrever diretamente no estado interno do ContentFlow nem atualizar a interface sem passar pela validação do núcleo.

## Comunicação que precisa ultrapassar o vizinho

A API pode fornecer uma URL ou um identificador de job, mas o resultado deve voltar pelo plugin. A API não conversa diretamente com Método, banco ou interface do ContentFlow.

## Regra simples

> A API fala a língua do fornecedor; o plugin traduz; o núcleo decide o que será aceito.

# Capítulo 4 — Plugin ↔ Código local

## O que essa camada significa

Nesse caminho, o plugin executa uma ferramenta na máquina do usuário, como um script, conversor, FFmpeg ou outro programa empacotado.

## Como a comunicação funciona

O plugin entrega ao código local parâmetros estruturados, arquivos autorizados, pastas temporárias e um sinal de cancelamento. O código devolve status, progresso, arquivos gerados ou erro técnico.

Depois, o plugin converte esse resultado para o contrato do Bloco e o devolve ao núcleo.

## O que deve permanecer nesta camada

O plugin deve conhecer como iniciar a ferramenta, quais argumentos são válidos, como interpretar a saída, como interromper a execução e quais arquivos representam o resultado.

O núcleo deve controlar permissões, sandbox, arquivos autorizados, importação dos artifacts finais, identidade, histórico e persistência das entregas.

## O que está fora do lugar hoje

Não foi identificada uma inversão estrutural importante nessa conexão. O risco aparece quando um script tenta agir como se fosse parte do núcleo.

Código local não deve consultar diretamente o banco, escrever no armazenamento definitivo sem importação controlada, inventar IDs, ler pastas não concedidas nem instalar dependências durante a execução sem um mecanismo autorizado.

## Comunicação que precisa ultrapassar o vizinho

O código local não deve ultrapassar o plugin para falar com o núcleo. Se precisar informar progresso ou produzir um arquivo, faz isso pelo processo do plugin, que traduz e devolve a informação.

## Regra simples

> O código faz o processamento; o plugin o adapta; o núcleo controla permissões e guarda o resultado.

# Capítulo 5 — Plugin ↔ Browser Bridge

## O que essa camada significa

Esta é a fronteira mais delicada. O plugin conhece o site que será automatizado; a Browser Bridge fornece um caminho controlado para agir no navegador.

A Bridge não deveria entender a finalidade editorial do Método nem as regras de negócio de cada site.

## Como a comunicação funciona nos dois sentidos

Antes do primeiro efeito, plugin e Bridge negociam versão e capacidades. O plugin identifica a sessão autorizada e informa de quais operações precisa.

Depois, cada comando deve conter identidade do plugin e da execução, ID estável, ação, dados validados, origem esperada, prazo e contexto de reconciliação.

A Bridge pode devolver aceitação ou rejeição, recibo, código de erro, indicação de replay, eventos em sequência, snapshot estrutural ou aviso de resultado incerto após desconexão.

```text
Plugin ── comando e intenção técnica ──→ Bridge
Plugin ←── recibo, evento e estado ───── Bridge
```

## O que pertence ao plugin

O plugin deve conhecer o fornecedor: URL, seletores, estados da página, campos, botões, sinais de geração, bloqueio, cota ou erro, associação do resultado e reconciliação de efeitos incertos.

## O que pertence à Bridge

A Bridge deve oferecer primitivas genéricas e protegidas:

- validar plugin, sessão, origem e ação;
- inserir texto, clicar, pressionar tecla e enviar arquivo;
- observar uma condição por tempo limitado;
- controlar reload e lifecycle;
- produzir recibos, eventos e snapshots;
- impedir repetição cega de um comando.

A Bridge pode afirmar “o clique aconteceu”. Ela não deveria concluir “a entrega do Bloco está pronta”. Essa decisão exige interpretação do plugin e confirmação do núcleo.

## O que está fora do lugar ou precisa ser reorganizado

### Cliente da Bridge duplicado

Partes do cliente aparecem repetidas em plugins, e o Flow possui uma implementação incorporada ao handler. Isso aumenta o risco de cada plugin negociar, reconectar ou reconciliar de um jeito diferente.

O destino recomendado é um SDK versionado compartilhado para transporte, handshake, comandos, eventos e reconciliação. Seletores e regras do fornecedor continuam em cada plugin.

### Conhecimento de plugins específicos dentro da extensão

A extensão mantém listas de IDs, origens e ações permitidas. A restrição é importante para a segurança, mas uma lista fixa obriga atualizar a extensão sempre que surge um novo plugin legítimo.

No futuro, será preciso um registro versionado, auditável e autorizado pelo usuário. Ele não deve aceitar automaticamente qualquer domínio declarado por qualquer pacote.

### Ações específicas demais

Algumas ações carregam nomes ou comportamentos ligados a fornecedores. Se isso crescer, a extensão poderá virar um catálogo de regras de sites.

O objetivo deve ser manter na Bridge apenas primitivas seguras e reutilizáveis. Regras como “quando este site terminou de gerar” pertencem ao plugin.

## O que já está no caminho correto

O protocolo atual já possui negociação, comandos idempotentes, lifecycle, eventos, snapshots sob demanda, observers limitados, reload controlado e tratamento de efeitos incertos. A reorganização futura deve preservar essas proteções.

## Comunicação que precisa ultrapassar o vizinho

O núcleo pode cancelar a execução e revogar a autorização do plugin, mas não deve enviar cliques diretamente à extensão. O comando técnico continua passando pelo plugin, porque é ele que entende o site e sabe interpretar o resultado.

## Regra simples

> O plugin entende o site. A Bridge transporta ações genéricas com segurança. Nenhum dos dois decide sozinho que o Bloco terminou.

# Capítulo 6 — Browser Bridge ↔ Navegador e Perfil

## A correção necessária no diagrama

O perfil não é um programa e não conversa com a extensão. Ele é uma identidade local e uma pasta de sessão usada pelo Chrome.

Portanto, esta imagem linear é enganosa:

```text
Extensão → perfil
```

A representação mais correta é:

```text
Núcleo escolhe, vincula e reserva o perfil
                    ↓
Núcleo reserva o perfil físico escolhido
                    ↓
Núcleo abre ou reutiliza a instância do Chrome
                    ↓
Chrome lê e grava a pasta física do perfil
                    ↓
Plugin recebe somente a sessão efêmera autorizada
                    ↓
Extensão conversa com a página aberta
```

## As comunicações reais desta camada

### 1\. Núcleo ↔ registro de perfis

O núcleo controla identidade global, nome, pasta física, vínculos explícitos, readiness, revogação, lease e associação entre perfil, job e execução.

Essa comunicação direta “pula quadrados”, mas é obrigatória. Se o plugin fosse dono desses dados, dois plugins poderiam disputar a mesma sessão, compartilhar contas sem consentimento ou criar identidades incompatíveis.

### 2\. Núcleo/runtime ↔ instância do Chrome

O núcleo mantém a pasta física, adquire o lease global e abre ou reutiliza o Chrome. O plugin recebe apenas a sessão efêmera autorizada para aquele vínculo e não controla o processo físico.

Um perfil físico pode ter apenas uma execução de navegador ativa por vez. O lease global impede que dois plugins ou jobs alterem a mesma sessão simultaneamente.

### 3\. Extensão ↔ página do navegador

Essa é a conversa realmente bidirecional:

- a extensão inspeciona, escreve, clica, envia arquivo, observa e recarrega quando permitido;
- a página e o navegador informam navegação, mudança de estado, resultado técnico, fechamento da aba, perda do debugger ou desconexão.

### 4\. Chrome ↔ pasta do perfil

O Chrome lê e grava cookies, sessões, storage e preferências. Esses dados não devem ser copiados para Método, snapshot portátil, diagnóstico ou resposta de plugin.

## Readiness: pronto para qual plugin?

Readiness não pertence ao perfil inteiro. Um perfil pode estar preparado para um serviço, mas não para outro.

```text
Readiness correto = plugin + perfil
```

O perfil físico continua sendo a mesma identidade, mas cada vínculo possui sua própria preparação, autenticação, URL e validação.

## O que está fora do lugar ou em transição

### Workspace privado e perfil físico ainda convivem

Historicamente, partes dos plugins usaram a mesma pasta para checkpoints privados e para a sessão do Chrome. A implementação atual separa essas responsabilidades: perfil físico e lifecycle pertencem ao núcleo, enquanto checkpoints privados continuam no workspace do plugin.

```text
getWorkspacePath = estado privado e checkpoints do plugin
getProfilePath   = pasta física da sessão concedida pelo núcleo
```

### Perfis ainda carregam marcas do modelo antigo

O modelo anterior tratava o perfil como pertencente ao plugin. A arquitetura atual o transforma em identidade global do ContentFlow, reutilizável somente por vínculos explícitos. A compatibilidade com instalações antigas faz os dois modelos ainda aparecerem em alguns caminhos.

### Readiness físico legado

Alguns fluxos ainda usam marcadores na pasta do navegador como sinal de preparação. Eles podem auxiliar uma migração, mas não devem ser a única fonte de verdade. O núcleo deve registrar readiness para cada par `plugin + perfil`.

### O diagrama coloca o perfil no lugar errado

Mostrar a extensão apontando para o perfil sugere que ela escolhe ou administra a identidade. O correto é desenhar uma linha do núcleo para perfis e outra do perfil para a instância do Chrome que carrega extensão e página.

## O que não pode ficar restrito aos quadrados vizinhos

Esta é a principal exceção à ideia de que cada camada deveria falar apenas com a próxima:

```text
Núcleo ↔ perfis, vínculos, readiness e leases
```

Essa linha direta é tecnicamente necessária. Ela garante uma única autoridade para segurança, concorrência e identidade local.

O plugin participa do uso do perfil, mas não pode criar silenciosamente outra identidade, inferir vínculos por e-mail ou cookies, nem decidir sozinho que uma sessão pode ser compartilhada.

## Diagnóstico final da arquitetura atual

A sua visão de separar as responsabilidades em camadas está correta e torna o projeto mais compreensível. O único ajuste é não exigir que toda comunicação passe fisicamente pelo quadrado anterior.

| Parte analisada         | Situação atual                                    | Direção recomendada                                                           |
| ----------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Núcleo ↔ Método         | Bem separado                                      | Preservar Método como receita passiva.                                        |
| Núcleo/Bloco ↔ plugin   | Correto no conceito                               | Manter chamada direta e modularizar o núcleo internamente.                    |
| Plugin ↔ API            | Bem posicionado                                   | Preservar adaptação no plugin.                                                |
| Plugin ↔ código local   | Bem posicionado                                   | Preservar sandbox e importação no núcleo.                                     |
| Plugin ↔ Bridge         | Robusto, com duplicações e vazamentos específicos | Criar SDK compartilhado e manter regras de fornecedor nos plugins.            |
| Bridge/navegador/perfil | Em transição                                      | Separar definitivamente workspace, perfil físico, vínculo, readiness e lease. |

## Ordem recomendada para a reorganização futura

1. concluir a separação entre workspace privado e perfil físico;
2. concluir perfis, vínculos, readiness e leases nos handlers;
3. completar a identidade durável dos itens antes de efeitos externos;
4. criar um SDK compartilhado para o cliente da Browser Bridge;
5. retirar gradualmente regras específicas de fornecedores da extensão;
6. dividir a coordenação do servidor principal em serviços internos, sem retirar a autoridade do núcleo.

## Regra final para alunos e criadores de plugins

```text
O Método declara.
O núcleo controla.
O plugin traduz e interpreta.
A Bridge transporta com segurança.
O navegador executa.
O núcleo confirma e guarda o resultado.
```

Essa é a leitura mais simples do ContentFlow sem esconder as duas exceções necessárias: o núcleo chama diretamente o plugin e o núcleo administra diretamente os perfis.
