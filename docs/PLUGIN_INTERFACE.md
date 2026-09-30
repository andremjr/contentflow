# Interface do plugin

Este documento define o significado e a hierarquia de produto da **interface do plugin** no ContentFlow. Ele é a referência para discussões, design e implementação dessa superfície.

## Definição canônica

A **interface do plugin** é a segunda superfície de configuração aberta a partir de um Bloco no editor de Método. Ela fica ao lado da configuração do Bloco e mostra como a capability escolhida deverá executar aquela ação.

Ela pertence à Interface 2 — Métodos do Canal — e não é:

- o Gerenciador de Plugins (`/plugins`), que instala, atualiza, autoriza e remove pacotes;
- a página de detalhes de um plugin;
- a interface do site ou aplicativo que o plugin automatiza;
- uma quarta interface de domínio do ContentFlow.

Quando a interface do plugin é fechada, a configuração do Bloco volta a ser a única superfície em foco e fica centralizada.

## Pergunta que a interface deve responder

> Como este plugin deve realizar o trabalho deste Bloco?

Um usuário não precisa compreender o protocolo do ContentFlow para responder a essa pergunta. A primeira visão deve expor as decisões que mudam o resultado ou o comportamento da ferramenta escolhida. Se uma opção existe porque o serviço automatizado oferece vários modos de trabalho, ela é candidata à interface principal da capability.

Por exemplo, um plugin pode enviar texto, anexar arquivos, usar uma imagem de referência, criar uma imagem, produzir vídeo, escolher voz ou preservar contexto. Essas possibilidades não são “configurações avançadas” apenas porque são específicas do plugin: elas são o motivo de o usuário ter escolhido aquela capability.

## Hierarquia de informação

### 1. Configuração principal da capability

Deve aparecer primeiro. É declarada pelo plugin e apresentada pelo núcleo com componentes consistentes.

Inclui, quando aplicável:

- o que será feito com cada entrada;
- modo ou operação da ferramenta;
- modelo, voz ou mecanismo de geração;
- referências e anexos, inclusive entregas de Blocos anteriores;
- opções de consistência entre itens;
- quantidade, formato, proporção, duração e resolução;
- seleção, retenção ou transformação dos resultados;
- opções condicionais que só aparecem quando o modo escolhido as torna relevantes.

Os nomes e agrupamentos devem falar sobre o trabalho do usuário. O núcleo não deve promover campos por nomes mágicos como `model`, `voice_id` ou `productionMode`; o protocolo precisa permitir que o plugin declare apresentação, prioridade e dependências de forma explícita.

### 2. Recursos necessários para executar

Conexão, perfil de navegador, conta vinculada e permissões pertencem ao núcleo. Quando forem necessários, devem aparecer de forma compacta e contextual, sem competir com a configuração funcional. Um recurso ausente ou inválido pode ser elevado temporariamente porque bloqueia a execução.

### 3. Controles operacionais e detalhes avançados

Configurações do núcleo, diagnóstico e inspeção ficam recolhidos por padrão. Entre elas podem estar:

- bindings e portas de entrada ou saída;
- prévia técnica do valor enviado;
- parâmetros e placeholders do Método;
- payload resolvido e metadados de compatibilidade;
- concorrência, tentativas e políticas de retomada;
- informações de debug ou implementação.

Um controle operacional que afete diretamente a intenção do usuário pode ser apresentado junto da capability, mas sua origem continua identificável e sua semântica deve ser universal. “Avançado” é definido pela necessidade do usuário, não por quem implementou o campo.

## Divisão de responsabilidades

O **núcleo** controla:

- a janela lateral, navegação, acessibilidade e responsividade;
- os componentes disponíveis e a ordem das camadas;
- validação, persistência, contratos tipados e bindings;
- conexões, perfis, secrets, permissões e estados bloqueantes;
- tradução da moldura do produto em português, inglês e espanhol.

O **plugin** declara:

- as capabilities que oferece;
- as decisões funcionais de cada capability;
- campos, opções, defaults, limites, ajuda e condições de visibilidade;
- modelos, modos e possibilidades específicas do serviço;
- requisitos de conexão ou perfil e contratos de entrada e saída.

O plugin não injeta uma interface arbitrária. O núcleo interpreta um schema declarativo para que plugins diferentes mantenham uma experiência coerente sem esconder suas capacidades reais.

O preview usado durante o desenvolvimento do plugin deve renderizar esse mesmo schema com o mesmo renderer do editor de Método. Assim, o autor desenvolve e testa a interface funcional junto do plugin, e o que aprovar no preview é o que o usuário verá depois de selecionar aquela capability no Bloco.

## Granularidade da capability e do Bloco

A interface do plugin configura **uma capability ligada a um Bloco**; ela não decide quantos Blocos o Método deve possuir. Uma capability pode executar várias operações técnicas para produzir sua entrega, e essas operações não aparecem como Blocos apenas por existirem na ferramenta externa.

Use a fronteira observável:

- resultado que o usuário precisa conectar, validar, substituir, reutilizar ou preservar separadamente é candidato a outro Bloco;
- quantidade de itens, tentativas, perfis, uploads, páginas, polls ou downloads permanece dentro da execução do mesmo Bloco, administrada pelo Core e pela capability;
- preparação de perfil, autenticação, lease, fallback e paralelismo são recursos operacionais do núcleo, não etapas do Método;
- navegação, seletores e comandos da Browser Bridge são implementação do plugin, não opções estratégicas por si só;
- validação técnica de página, arquivo ou resposta permanece interna; decisão editorial pertence a `VALIDAR`.

Quando um modo combinado esconder um intermediário com valor próprio, a interface deve permitir capabilities/portas que mantenham esse valor explícito e deixar o Método compor os Blocos. Quando os intermediários forem descartáveis e somente a entrega final importar, a capability pode mantê-los internos. Essa regra evita tanto uma caixa-preta que apaga a estratégia quanto dezenas de Blocos que apenas reproduzem detalhes da ferramenta.

## Exemplo genérico: geração de assets visuais

Considere um Bloco humano anterior que produziu uma lista ordenada de prompts. O Bloco seguinte usa uma capability de geração visual e recebe esses itens.

A interface principal do plugin deve permitir ao usuário decidir, conforme o suporte real da capability:

1. se cada item produzirá imagem, vídeo ou outra operação suportada;
2. qual modelo será usado;
3. se haverá imagens, arquivos ou entregas anteriores como referência;
4. como preservar personagens ou outros elementos recorrentes;
5. quantas variações gerar e em qual proporção, duração ou resolução;
6. quais resultados conservar, selecionar ou encaminhar ao próximo Bloco.

Perfil, prévia de envio, bindings, retries e diagnóstico continuam disponíveis, mas não devem ocupar o lugar dessas decisões principais.

## Uso de interfaces externas como referência

Uma extensão, site ou aplicativo de automação pode ser analisado para descobrir o espaço funcional do serviço: tipos de geração, modelos, referências, uploads, seleção, filas, downloads e demais operações realmente suportadas.

Essa análise não torna sua interface um padrão visual do ContentFlow. O objetivo é inventariar capacidades e traduzi-las para o contrato declarativo do plugin, preservando a linguagem, a hierarquia e os componentes do ContentFlow.

## Critérios de revisão

Uma mudança nessa superfície deve ser rejeitada ou revista quando:

- a configuração principal do plugin estiver escondida como avançada;
- detalhes internos do núcleo dominarem a primeira visão;
- o núcleo codificar nomes, modelos ou regras de um fornecedor específico;
- um plugin precisar injetar UI própria para expressar uma capability comum;
- a origem de uma referência ou entrega anterior ficar ambígua;
- a interface sugerir que a mesma configuração vale para todas as capabilities;
- novos textos da moldura não existirem em português, inglês e espanhol.

Referências externas ajudam a descobrir **o que** o plugin consegue fazer. Este documento define **como** essas possibilidades entram no modelo mental do ContentFlow.
