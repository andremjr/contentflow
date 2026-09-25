# Roadmap de implementação — portfólio de plugins de assets visuais

Status: rascunho para revisão

Data de referência: 24 de setembro de 2026

Escopo: Google Flow, Meta AI, Vibes, Free Stock Media e ChatGPT

## 1. Objetivo

Construir um portfólio coerente de cinco plugins para o Processo Universal `Assets Visuais`, aproveitando a interface declarativa, as entregas incrementais e as ações por item já implementadas no ContentFlow.

O resultado esperado não é reproduzir dentro de cada plugin o painel completo de outra ferramenta. O objetivo é reproduzir o mesmo uso prático com as primitivas nativas do ContentFlow:

- o Método define a estratégia e a sequência;
- o Bloco define entradas e saídas;
- o plugin implementa a capability do provedor;
- o núcleo controla itens, persistência, artifacts, seleção, substituição, retry e retomada;
- a Browser Bridge fornece apenas transporte autenticado e operações de navegador limitadas.

Ao final desta iniciativa, os usuários deverão poder combinar cinco fontes de assets:

1. **Google Flow** — geração de imagens e vídeos, referências visuais e produção em lote.
2. **Meta AI** — geração de texto de apoio, imagens, edição visual e animação de imagens em `meta.ai`.
3. **Vibes** — geração de imagens e vídeos em `vibes.ai`, incluindo Frames, Elementos e referências tipadas.
4. **Free Stock Media** — pesquisa, seleção e materialização de imagens e vídeos de bancos externos com licença e proveniência.
5. **ChatGPT** — geração e refinamento de imagens com referências, preservando integralmente as capabilities de texto, pesquisa, escolha, validação e análise já existentes.

Gemini Browser Studio permanece fora deste roadmap. Embora possa gerar imagens, não será trabalhado nesta iniciativa por não atender ao mesmo objetivo de produção escalável.

## 2. Decisões arquiteturais já tomadas

### 2.1. Meta AI e Vibes serão plugins separados

Vibes pertence ao ecossistema Meta AI, mas a implementação operacional atual usa uma superfície web própria em `vibes.ai`. A extensão de referência demonstra diferenças suficientes para justificar pacotes separados:

- origem, DOM e navegação diferentes;
- projetos e estados próprios;
- regras diferentes para imagem, vídeo e referências;
- controles que exigem entrada confiável;
- quatro opções por geração no Vibes;
- formatos, resoluções e modos específicos;
- recuperação e retomada próprias.

O plugin Meta AI continuará limitado às capacidades executadas em `meta.ai`. O novo plugin Vibes será responsável por `vibes.ai`.

### 2.2. O Flow atual é uma base protegida

As técnicas já estabilizadas no plugin Google Flow não serão substituídas, simplificadas ou refatoradas como consequência deste roadmap. São áreas protegidas:

- associação determinística entre pedido e mídia;
- reserva de resultados em gerações concorrentes;
- prevenção de troca de imagens entre cenas;
- filas, retomada e recuperação após reload;
- referências, menções, uploads e promoção de mídias;
- tratamento de URLs assinadas expiradas;
- fallback de download pela interface;
- renomeação e confirmação de persistência;
- temporizações, backoff e mitigação de bloqueios;
- seletores e técnicas de envio já validadas no site real.

No Flow, a extensão anexada será usada principalmente como referência de experiência e capacidades. Mudanças na automação existente só poderão ocorrer diante de um defeito reproduzido no fluxo real e com teste de regressão específico.

### 2.3. A extensão anexada é referência técnica confiável

Os bundles de Flow, Meta e Vibes da extensão `Estúdio de Canais Dark - Free` serão tratados como referência funcional comprovada para:

- fluxos de geração;
- capacidades e limitações dos provedores;
- seletores e estados observáveis;
- variantes, formatos e resoluções;
- referências e papéis;
- filas, retries e recuperação;
- downloads e arquivos intermediários;
- comportamento em background.

O código da extensão orienta a implementação dos plugins, mas a estratégia editorial, a persistência e a interface continuam pertencendo ao ContentFlow.

Snapshot da referência analisada nesta revisão:

| Arquivo | Tamanho | SHA-256 |
| --- | ---: | --- |
| `extension/manifest.json` | 2.291 bytes | `5552B20FC10842ADFEABF0F01ACC225C2088F26174DB0126550EDCA64B7902D4` |
| `extension/bundles/flow-bundle.js` | 846.132 bytes | `6392B238AB0ABAB42AB268160B41B32E0995FF68EF1BAE8735098B0E4411AD75` |
| `extension/bundles/meta-bundle.js` | 311.913 bytes | `4C7065056BBB29676743F9621A62698D862263FA495A6940B52EC249B3902F36` |
| `extension/bundles/vibes-bundle.js` | 332.795 bytes | `F418586C28489B1AF2EC57FCD0B8962325E92EBA4DE70C0952CAC48EFE9D1A8E` |

Esses hashes servem apenas para garantir que agentes diferentes estejam analisando a mesma referência. Antes de transportar qualquer implementação, deve-se registrar a licença e a proveniência aplicáveis. Confiabilidade funcional não equivale automaticamente a permissão para copiar código minificado; quando a autorização de reutilização não estiver documentada, transportar comportamento e conhecimento técnico, não trechos literais.

### 2.4. Implementação, validação e publicação permanecem separadas

Este roadmap não autoriza:

- criar release;
- incrementar versão;
- criar commit de release;
- criar tag;
- publicar artifacts;
- publicar no catálogo;
- alterar o site público.

Cada plugin só poderá ser considerado pronto depois de validação automatizada e validação de ponta a ponta no provedor real. Qualquer publicação exigirá autorização explícita posterior para o conjunto exato de mudanças validado.

### 2.5. A geração de texto do ChatGPT é uma base protegida

O escopo do ChatGPT nesta iniciativa é geração de imagens. Não serão redesenhadas nem simplificadas as capabilities atuais de:

- geração de texto;
- pesquisa web;
- pesquisa aprofundada;
- escolha de item da Biblioteca Estratégica;
- validação de conteúdo;
- análise de imagens;
- análise de documentos.

Funções compartilhadas só poderão ser alteradas quando indispensáveis à geração de imagem e depois de testes de caracterização provarem que texto, pesquisa, escolha, validação e análise permanecem idênticos. A geração de texto atual é requisito de regressão, não área de refatoração.

## 3. Baseline atual

| Plugin | Versão atual | Estado | Capabilities principais |
| --- | ---: | --- | --- |
| Google Flow Browser Images | `1.3.7` | Compatível com Plugin API v1 | produção visual completa, gerar imagens, animar imagens, gerar vídeo por texto |
| Meta AI Browser Studio | `1.0.5` | Compatível com Plugin API v1 | gerar texto, gerar imagem, gerar vídeo na experiência incorporada do Meta |
| Vibes Browser Studio | inexistente | A criar | imagens, vídeo por Frames, vídeo por Elementos e produção visual por projeto |
| Free Stock Media Studio | `0.3.1` | Compatível com Plugin API v1 | busca de imagens, busca de vídeos, busca por briefings e download de assets |
| ChatGPT Browser Studio | `1.0.14` | Compatível com Plugin API v1 | texto, pesquisa, escolha, validação, análise e geração de múltiplas imagens |

O Free Stock Media já integra:

- Pexels;
- Pixabay;
- Unsplash;
- Coverr;
- Openverse;
- Wikimedia Commons;
- NASA Images.

Ele não gera mídia sintética, mas faz parte do mesmo portfólio porque resolve slots visuais com assets externos e materializa os arquivos usados pelo vídeo.

## 4. Experiência-alvo comum

Os cinco plugins devem usar os mesmos contratos sempre que a semântica for equivalente.

| Necessidade do usuário | Contrato do ContentFlow |
| --- | --- |
| Processar uma cena por vez | `execution.itemOrchestration` |
| Exibir um resultado assim que ficar pronto | `services.publishPartial({ itemUpdates })` |
| Preservar qual prompt originou a mídia | `itemUpdates[].input` |
| Escolher uma variante | `itemActions: select` |
| Gerar novamente um item | `itemActions: regenerate` |
| Substituir por arquivo do usuário | `itemActions: replace` |
| Baixar um artifact materializado | `itemActions: download` |
| Fornecer imagem ou vídeo no início da execução | porta com binding `runtime` |
| Usar conta autenticada | perfil preparado pelo Gerenciador de Plugins |
| Descobrir modelos reais da conta | `configurationOptions` |
| Mostrar imagens | `presentation.renderer: image-gallery` |
| Mostrar vídeos | `presentation.renderer: video-player` |
| Comparar candidatos estruturados | `presentation.renderer: cards` ou `table` |
| Preservar arquivos intermediários | artifacts e entregas universais |
| Retomar produção longa | snapshot, item state e workspace autorizado |
| Mostrar exatamente o texto enviado ao provedor | `promptPreview` com placeholders públicos |

### 4.1. Princípios de interface declarativa

- Cada capability mostra apenas parâmetros que alteram o resultado daquela capability.
- Configurações técnicas reutilizáveis ficam no Gerenciador de Plugins.
- Campos dependentes usam `visibleWhen`.
- Valores fixos do provedor aparecem como informação, não como controles falsos.
- Catálogos que variam por conta ou pelo site usam `configurationOptions`.
- Entradas de mídia usam as portas universais e o upload nativo do ContentFlow.
- Nenhum plugin injeta React, HTML ou um canvas próprio no ContentFlow.
- A construção de pipelines continua no construtor de Métodos.

### 4.2. Localização

Toda interface nova ou alterada deverá possuir PT-BR, inglês e espanhol. Antes de implementar os manifestos finais, será necessário definir uma solução portátil para labels e descrições fornecidas por plugins.

Direção recomendada:

1. acrescentar ao protocolo um mapa opcional de localização do manifesto;
2. manter PT-BR como texto-base para compatibilidade;
3. permitir traduções por locale para plugin, capability, portas, opções e propriedades do schema;
4. aplicar fallback `locale exato → idioma-base → texto-base`;
5. adicionar validação e teste de regressão sem colocar traduções específicas de provedores no núcleo.

Essa é uma necessidade universal do ecossistema e não deve ser resolvida com nomes de Flow, Meta, Vibes ou Free Stock codificados no aplicativo.

### 4.3. Protocolo de execução para agentes com pouco contexto

Cada agente deve executar **um único pacote de trabalho** da seção 11 por vez. Não é permitido pular um pacote, misturar dois provedores ou aproveitar a tarefa para refatorar código adjacente.

Antes de editar qualquer arquivo, o agente deve:

1. ler `LICENSE`, `AI_USAGE_POLICY.md` e `docs/ARCHITECTURE.md` integralmente;
2. ler `docs/ecosystem/protocol.md`, `docs/ecosystem/security.md` e, para navegador, `docs/ecosystem/browser-automation.md`;
3. ler este roadmap e o relatório de evidência do pacote anterior;
4. executar `git status --short` e registrar os arquivos que já estavam modificados;
5. inspecionar manifesto, handler, testes e README do plugin-alvo;
6. executar os testes-baseline indicados no pacote **antes** da mudança;
7. interromper se o baseline falhar de forma reproduzível ou se um arquivo-alvo tiver alterações não compreendidas.

Regras de escopo:

- alterações de plugin ficam em `ecosystem/plugins/reference/<plugin>/`;
- alterações da ponte ficam em `ecosystem/browser-bridge/` e nos testes diretos correspondentes;
- alterações do protocolo genérico exigem pacote próprio e podem tocar schema, tipos, validação, documentação, UI declarativa e testes do núcleo;
- código específico de Flow, Meta, Vibes, ChatGPT ou Free Stock nunca entra no núcleo ou na Browser Bridge;
- o núcleo não deve receber nomes de modelo, seletores, URLs de CDN ou regras editoriais de fornecedor;
- não alterar arquivos fora da lista autorizada do pacote sem parar e atualizar o plano;
- não criar commit, tag, versão estável, release ou publicação.

Formato obrigatório de cada pacote:

| Campo | Finalidade |
| --- | --- |
| Dependências | Pacotes que precisam estar concluídos |
| Objetivo observável | Resultado que o usuário ou teste poderá observar |
| Leitura mínima | Arquivos que o agente precisa compreender antes de editar |
| Arquivos permitidos | Limite inicial do diff |
| Passos | Ordem exata de implementação |
| Testes | Comandos mínimos e cenários reais |
| Evidências | O que registrar para o próximo agente |
| Critério de saída | Condições cumulativas para concluir |
| Critério de parada | Situações em que não se deve improvisar |

Ao terminar um pacote, produzir um relatório em `docs/ecosystem/asset-generation-evidence/<ID-do-pacote>.md` com:

- commit/branch ou, sem commit, hash de `git diff` e lista de arquivos alterados;
- baseline executado e resultado;
- decisões tomadas e alternativas rejeitadas;
- comandos de teste e resultado exato;
- cenários E2E executados, conta/perfil mascarado e horário;
- screenshots ou logs redigidos quando relevantes;
- limitações restantes;
- confirmação de que não houve release nem publicação;
- instrução objetiva para o próximo pacote.

O relatório não pode conter cookies, tokens, prompts privados completos, caminhos de perfil, headers ou conteúdo pessoal da conta.

### 4.4. Escada de validação obrigatória

Use esta ordem. Uma camada não substitui a anterior.

1. **Caracterização:** provar o comportamento atual antes de alterar.
2. **Unitário do plugin:** `node --test <plugin>/test.mjs`.
3. **Kit do plugin:** `check`, `test-contract` e `test-sandbox`.
4. **Testes focados do núcleo:** somente os contratos tocados.
5. **Regressão do conjunto de plugins de navegador:** `npm run test:browser-plugins` quando houver código compartilhado ou ponte.
6. **Typecheck e lint:** obrigatórios quando TypeScript, schema, UI ou servidor forem alterados.
7. **E2E local no aplicativo:** pasta ao vivo, Método mínimo, execução, retry, cancelamento e retomada.
8. **E2E real do provedor:** cenário exato listado na trilha.
9. **Suíte completa:** `npm run check` ao final de uma fase transversal ou antes de pedir autorização de publicação.

Se um teste falhar antes da alteração, registrar como baseline quebrado. Não mudar a expectativa para fazer o teste passar sem demonstrar que o contrato desejado mudou.

### 4.5. Lacunas técnicas identificadas nesta revisão

As lacunas abaixo são bloqueadores de implementação, não sugestões opcionais.

| ID | Lacuna | Risco | Pacote que fecha |
| --- | --- | --- | --- |
| `G01` | Não existe contrato portátil documentado para traduzir labels e descrições de manifestos | UI nova viola PT-BR/EN/ES ou acopla provedores ao núcleo | `P02` |
| `G02` | A combinação entre item do lote e múltiplas variantes ainda não possui prova de identidade ponta a ponta | regenerar uma variante pode trocar mídia de outro prompt | `P01` |
| `G03` | Nem toda capability definiu qual `outputPort` recebe cada ação e qual ação chama o plugin | ações aparecem mas atuam sobre valor errado | `P01`, depois pacote de cada plugin |
| `G04` | Vibes não tem decisão entre execução imediata e ciclo `start/resume/cancel` | timeout pode duplicar geração paga | `P40` |
| `G05` | O formato de recibo externo e reconciliação após timeout/reload não está padronizado por driver | retries duplicam custo e resultados | `P03`, depois pacote de cada plugin |
| `G06` | A Browser Bridge 0.3.6 não declara `vibes.ai` nem policy do novo plugin | Vibes não pode operar com isolamento | `P42` |
| `G07` | A lease de execução longa não possui necessidade e ciclo de vida comprovados | worker ou tela pode dormir; lease pode ficar presa | `P40` e, somente se aprovada, `P42` |
| `G08` | O worktree contém mudanças em andamento no núcleo, Flow e Meta | agente pode sobrescrever trabalho estabilizado | `P00` |
| `G09` | A referência externa precisa de inventário, hash e decisão de licença/proveniência | agentes podem analisar versões diferentes ou copiar código sem autorização registrada | `P00` |
| `G10` | Erros de login, CAPTCHA, cota, upgrade, bloqueio, recusa e ausência de mídia não têm matriz uniforme | fallback pode avançar quando deveria pausar ou repetir | `P03` |
| `G11` | Hosts de CDN, redirects e limites de mídia do Vibes e Meta não estão inventariados | download falha ou amplia egress/SSRF | `P40`, `P50` |
| `G12` | Não há contas, perfis, projetos descartáveis e orçamento de geração definidos | E2E não é reproduzível | `P00` |
| `G13` | Opções dinâmicas não definem comportamento de cache vazio, opção removida e erro por perfil | Método pode salvar configuração obsoleta | `P03` |
| `G14` | Free Stock descrevia seleção por `ESCOLHER`, contrariando a arquitetura | uso incorreto da Biblioteca Estratégica | corrigido neste documento; validado em `P20` |
| `G15` | ChatGPT não possui baseline congelado das sete capabilities não visuais | melhoria de imagem pode quebrar texto silenciosamente | `P30` |
| `G16` | O Vibes começava diretamente em `1.0.0` sem versão de desenvolvimento | versão estável poderia existir antes do E2E | `P41` |
| `G17` | Não há orçamento explícito de logs, redaction e diagnóstico por item | dados privados podem aparecer em evidências | `P03` |
| `G18` | `promptPreview` não estava incluído na revisão das capabilities que escrevem prompts | usuário não vê com precisão o que será enviado | pacote de cada plugin |
| `G19` | Não há definição de compatibilidade para adicionar portas plurais mantendo portas singulares | Métodos existentes podem perder binding | `P01`, `P51`, `P31` |
| `G20` | A esteira integrada não define fixture canônica com IDs esperados | teste final pode avaliar apenas presença de arquivos, não associação correta | `P60` |

### 4.6. Decisões que um agente não pode tomar sozinho

Parar e pedir decisão do mantenedor quando ocorrer qualquer uma destas situações:

- necessidade de alterar uma técnica protegida do Flow;
- necessidade de remover ou renomear capability, porta ou configuração existente;
- impossibilidade de manter simultaneamente saída singular e plural;
- necessidade de nova permissão, host, efeito externo ou transferência de dados não prevista;
- dúvida sobre licença para reutilizar código da extensão;
- necessidade de CAPTCHA, compra, upgrade, publicação ou ação irreversível;
- proposta de colocar seletor, modelo ou regra de provedor no núcleo ou na ponte;
- necessidade de paralelismo maior que o comportamento já comprovado;
- mudança de escopo entre Meta e Vibes;
- qualquer incremento de versão estável, commit de release, tag ou publicação.

## 5. Trilha A — Google Flow Browser Images

### A0. Congelar a base estabilizada

Objetivo: impedir regressões nas técnicas atuais.

Tarefas:

- registrar os cenários cobertos pelos testes existentes;
- identificar funções críticas de fila, associação, download e recuperação;
- adicionar testes de caracterização antes de qualquer alteração adjacente;
- manter um diff auditável que separe manifesto/interface de automação;
- tratar a primeira falha intermitente observada no `plugin:kit check` como fragilidade de teste até que exista reprodução do defeito no provedor.

Critério de saída:

- o plugin continua passando no teste direto e no `plugin:kit check`;
- o teste de 300 comandos da ponte continua passando;
- nenhuma técnica protegida sofre alteração sem caso de teste específico.

### A1. Revisar a declaração das capabilities

Manter as capabilities atuais:

1. `produce-visual-assets-in-browser`;
2. `generate-images-in-browser`;
3. `animate-image-in-browser`;
4. `generate-video-in-browser`.

Tarefas:

- revisar nomes, descrições, portas e tipos;
- manter a capability composta para produção visual complexa;
- usar capabilities atômicas para Métodos que precisam controlar cada etapa;
- esconder campos incompatíveis por `visibleWhen`;
- remover da configuração do Bloco qualquer preferência puramente técnica;
- manter projeto novo, projeto atual e URL específica como opções funcionais;
- documentar claramente quando referências, imagens intermediárias e vídeos serão preservados.

### A2. Opções dinâmicas

Objetivo: refletir o catálogo real do Flow sem congelar listas que mudam.

Tarefas:

- implementar `configure/options` para modelos de imagem;
- implementar `configure/options` para modelos de vídeo;
- fazer cache por perfil e por tipo de geração;
- oferecer atualização explícita;
- manter fallback seguro quando a leitura do catálogo não estiver disponível;
- não alterar a técnica interna já usada pelo driver para ler modelos.

### A3. Interface de produção visual completa

A capability composta deverá seguir esta progressão:

1. perfil e projeto;
2. o que produzir;
3. parâmetros de imagem;
4. referências e consistência de personagem, quando ativadas;
5. parâmetros de vídeo, somente quando houver vídeo;
6. regra de seleção das imagens a animar, somente no modo parcial;
7. política de retenção dos intermediários.

Modos preservados:

- somente imagens;
- texto direto para vídeo;
- imagens e animar algumas;
- imagens e animar todas.

### A4. Itens e resultados intermediários

Tarefas:

- confirmar que cada prompt e variante possui chave incremental própria;
- manter namespaces separados para imagens, referências de personagem e vídeos;
- preservar a entrada editorial original em cada item;
- garantir que regenerar substitui apenas o item solicitado;
- garantir que selecionar não altera as demais variantes;
- garantir que arquivos intermediários omitidos da entrega final não sejam confundidos com falha.

### A5. Validação real do Flow

Cenários obrigatórios:

- um prompt para imagem;
- vários prompts sequenciais;
- várias variantes por prompt;
- geração concorrente no limite declarado;
- referências enviadas pelo usuário;
- referências geradas pelo próprio Flow;
- imagem para vídeo em Frames;
- imagem para vídeo em Elementos;
- texto direto para vídeo;
- seleção parcial de imagens para animação;
- URL assinada expirada;
- fallback de download pela interface;
- reload no meio da fila;
- cancelamento;
- limite de conta;
- falha de uma cena sem associação ao item vizinho.

Critério de conclusão:

- nenhuma mídia trocada;
- nenhum item concluído repetido após retomada;
- todos os artifacts materializados e exibidos na porta correta;
- interface do Bloco legível em PT-BR, inglês e espanhol.

## 6. Trilha B — Vibes Browser Studio

### B0. Criar o pacote independente

Identidade proposta:

- ID: `local.contentflow.vibes-browser-studio`;
- versão inicial de desenvolvimento: `1.0.0` somente quando a implementação estiver validada;
- runtime: Node 26/ESM;
- operador: `IA`;
- permissões mínimas: rede, leitura e escrita de arquivos e processo;
- concorrência externa: uma operação por vez;
- perfil Chrome dedicado;
- provedores declarados: Meta Vibes e CDN de mídia utilizado pela conta.

Arquivos mínimos:

- `contentflow.plugin.json`;
- `handler.mjs`;
- `browser-bridge-client.mjs`;
- `README.md`;
- `LICENSE`;
- `test.mjs`;
- `fixtures/execution.json`;
- ícone local com licença válida.

### B1. Evoluir a Browser Bridge

Tarefas:

- adicionar `https://vibes.ai/*` e subdomínios necessários ao manifesto;
- adicionar policy exclusiva para o ID do plugin Vibes;
- permitir somente ações genéricas necessárias;
- validar origem, aba, perfil, execução e URL esperada;
- testar `Input.insertText` e cliques por coordenadas calculadas a partir de alvo validado;
- nunca expor comando CDP arbitrário ao plugin;
- estudar uma lease genérica de tela acordada para jobs ativos;
- manter seletores e regras de Vibes fora da extensão.

Critério de saída:

- a ponte aceita Vibes somente para o plugin autorizado;
- rejeita origem, plugin, aba ou execução divergentes;
- não traz a janela para frente durante execução normal;
- libera a sessão do debugger e a lease ao concluir, cancelar ou fechar a aba.

### B2. Portar o driver comprovado da extensão

Módulos funcionais a transportar para o plugin, preservando comportamento:

- seletores centralizados;
- preparação e validação do projeto;
- geração de imagem;
- geração de vídeo;
- Frames e Elementos;
- quadro inicial e quadro final;
- componentes de Personagem, Estilo e Cena;
- coleta das quatro variantes;
- resolução 480p e 720p;
- detecção de erro, limite, bloqueio e indisponibilidade;
- recuperação após reload sem reenviar o pedido;
- download de mídia do CDN;
- cancelamento e fechamento seguro.

O painel, o canvas e o armazenamento local da extensão não serão portados. O handler usará o request do ContentFlow como fonte de verdade.

### B3. Capability `generate-images-in-browser`

Entradas propostas:

- `prompts`: texto, texto longo ou lista;
- `character_reference`: imagem opcional, no máximo uma por geração;
- `scene_reference`: imagem opcional, no máximo uma por geração;
- `style_references`: várias imagens opcionais;
- `project_url`: URL opcional.

Saídas propostas:

- `images`: coleção de imagens;
- `project_url`: URL do projeto utilizado.

Configuração funcional:

- perfil;
- modo do projeto: automático, novo ou existente;
- URL do projeto quando o modo exigir.

Comportamentos fixos apresentados como informação:

- proporção de imagem `9:16`;
- quatro opções por envio;
- execução serial.

Ações por item:

- regenerar;
- substituir;
- selecionar;
- baixar.

### B4. Capability `animate-frame-in-browser`

Entradas propostas:

- `initial_frames`: uma ou várias imagens;
- `final_frames`: imagens finais opcionais, alinhadas por identidade;
- `prompts`: prompts de movimento;
- `style_references`: referências opcionais;
- `project_url`: URL opcional.

Saídas propostas:

- `videos`: quatro variantes por item de entrada;
- `project_url`.

Configuração funcional:

- perfil e projeto;
- resolução 480p ou 720p.

O modo Frames é implícito nessa capability, portanto não aparece como campo redundante.

### B5. Capability `generate-video-with-elements-in-browser`

Entradas propostas:

- `prompts`;
- `character_reference`: no máximo uma;
- `scene_reference`: no máximo uma;
- `style_references`: várias;
- `project_url`.

Saídas propostas:

- `videos`;
- `project_url`.

Configuração funcional:

- perfil e projeto;
- resolução 480p ou 720p.

O modo Elementos é implícito nessa capability.

### B6. Capability composta — decisão posterior

Uma capability `produce-visual-assets-in-browser` só deverá ser adicionada ao Vibes depois que as três capabilities atômicas estiverem validadas.

Ela será justificada apenas se houver benefício real em manter várias cenas, referências e geração imagem → vídeo dentro da mesma sessão/projeto. Não deve duplicar um fluxo que o Método já consiga compor com clareza.

### B7. Persistência e retomada

Requisitos:

- identificar cada envio por execution, block, attempt e item;
- persistir recibo antes de considerar o pedido submetido;
- após reload, voltar a coletar o lote já enviado;
- nunca clicar em Gerar novamente apenas porque a página recarregou;
- materializar cada uma das quatro variantes separadamente;
- manter associação entre prompt, referências, frame e resultado;
- cancelar itens ainda não enviados sem apagar resultados concluídos;
- pausar em CAPTCHA, reautenticação, bloqueio ou upgrade.

### B8. Validação real do Vibes

Cenários obrigatórios:

- criar e abrir projeto;
- reutilizar projeto por URL;
- imagem sem referência;
- imagem com Personagem;
- imagem com Cena;
- imagem com múltiplos Estilos;
- rejeição de duas referências de Personagem;
- vídeo Frames com quadro inicial;
- vídeo Frames com quadro inicial e final;
- vídeo Elementos com componentes;
- 480p e 720p;
- coleta das quatro variantes;
- seleção e regeneração de uma variante;
- reload após envio e antes da coleta;
- cancelamento antes do envio;
- download de CDN;
- cota, limite, login, CAPTCHA e indisponibilidade.

## 7. Trilha C — Meta AI Browser Studio

### C0. Corrigir a fronteira conceitual

Tarefas:

- revisar nome e descrição do plugin;
- descrever somente operações em `meta.ai`;
- retirar a impressão de que o pacote implementa todo o produto Vibes;
- documentar a diferença entre vídeo incorporado ao Meta AI e o novo plugin `vibes.ai`.

### C1. Preservar compatibilidade

A capability existente `generate-video-in-browser` não será removida em uma atualização compatível.

Plano:

- mantê-la como alias de compatibilidade para Métodos existentes;
- ajustar sua descrição para a experiência incorporada do Meta AI;
- adicionar capabilities mais semânticas sem renomear portas antigas;
- considerar remoção ou migração apenas em uma futura versão major e após existir ferramenta de migração de Método.

### C2. Melhorar geração de imagens

Estado atual: o handler encontra imagens geradas, mas a entrega principal materializa somente uma.

Tarefas:

- capturar todas as imagens novas da resposta;
- aguardar estabilização da quantidade;
- materializar cada imagem como artifact separado;
- publicar cada variante incrementalmente;
- expor a saída como coleção;
- preservar proporções 16:9, 1:1 e 9:16;
- permitir referências visuais anexadas;
- permitir regeneração, substituição, seleção e download.

### C3. Separar geração e animação

Capabilities-alvo:

1. `generate-images-in-browser` — prompt e referências para imagens.
2. `animate-image-in-browser` — imagem-base e prompt de movimento para vídeo.
3. `generate-text-in-browser` — permanece textual e sem configurações visuais.

A capability antiga de vídeo continuará como compatibilidade enquanto necessário.

### C4. Interface declarativa do Meta

Configuração de imagem:

- perfil;
- proporção.

Configuração de animação:

- perfil;
- uma ou duas variantes de vídeo.

Configurações técnicas como Chrome, portas, tracing, timeout e intervalo de fila permanecem no Gerenciador de Plugins.

### C5. Fila e resultados

Tarefas:

- manter execução serial;
- adicionar respiro configurável como preferência técnica;
- usar `itemOrchestration` para listas de prompts;
- publicar resultados assim que cada item terminar;
- preservar imagens intermediárias usadas para animação;
- impedir que retry por timeout crie uma segunda geração quando o resultado externo pode já existir.

### C6. Validação real do Meta

Cenários obrigatórios:

- texto simples;
- lista de textos por item;
- imagem sem referência;
- imagem com uma ou várias referências;
- captura de todas as variantes exibidas;
- proporções 16:9, 1:1 e 9:16;
- animação de imagem;
- uma e duas variantes de vídeo;
- regeneração isolada;
- sessão expirada;
- resposta textual de recusa sem mídia;
- geração concluída sem mídia visível e recuperação após reload;
- limite de uso;
- cancelamento.

## 8. Trilha D — Free Stock Media Studio

### D0. Preservar o agregador atual

Capacidades e provedores existentes serão mantidos. A primeira etapa não reescreverá adapters de Pexels, Pixabay, Unsplash, Coverr, Openverse, Wikimedia ou NASA.

Requisitos protegidos:

- validação de host e redirect;
- limites de download;
- detecção de MIME real;
- tracking exigido por provedor;
- proveniência, licença e atribuição;
- deduplicação por provedor e ID externo;
- ranking e filtros de qualidade;
- busca parcial quando uma fonte falha.

### D1. Simplificar a interface de busca direta

Capabilities preservadas:

- `search-stock-images`;
- `search-stock-videos`.

Interface proposta:

- consulta;
- fonte: todas ou uma fonte específica;
- quantidade desejada;
- orientação;
- busca segura.

Detalhes de paginação e limites específicos só aparecem quando necessários. O resultado deverá usar cards estruturados com preview, fonte, autor, licença, dimensões e duração.

### D2. Melhorar busca por briefings

A capability `search-stock-by-briefs` será a principal integração escalável com planejadores de cobertura visual.

Tarefas:

- manter uma execução por briefing com identidade preservada;
- publicar o candidato selecionado por item;
- mostrar progresso por briefing;
- distinguir `nenhum candidato aceitável` de falha técnica;
- manter query principal e fallbacks no diagnóstico seguro;
- usar campos condicionais para política de mídia e duração;
- documentar claramente a política de licença.

Configuração funcional:

- estratégia de fontes;
- política imagem/vídeo;
- quantidade mínima e máxima de candidatos;
- resolução mínima;
- duração mínima e máxima para vídeo;
- qualidade mínima;
- orientação estrita ou preferencial;
- perfil de licença;
- busca segura.

### D3. Separar descoberta de materialização

Fluxo recomendado:

```text
briefing ou consulta
  -> candidatos com preview e proveniência
  -> escolha humana/IA em um bloco VALIDAR
  -> capability de download
  -> artifact local + proveniência
```

`ESCOLHER` não se aplica aqui: ele seleciona itens preexistentes da Biblioteca Estratégica. Candidatos encontrados durante a execução pertencem ao resultado de `BUSCAR` e sua seleção ocorre em `VALIDAR`.

Não declarar `download` como ação local sobre um candidato remoto que ainda não é artifact. Enquanto o protocolo não possuir uma ação padronizada de materialização remota, o download continuará sendo capability explícita.

Capabilities preservadas:

- `download-selected-stock-assets`;
- `download-stock-image`;
- `download-stock-video`.

### D4. Entregas incrementais

Tarefas:

- publicar cada arquivo assim que o download terminar;
- usar chave incremental baseada no item do briefing;
- preservar o candidato original em `input`;
- registrar falha por item sem perder downloads concluídos;
- permitir retomada sem baixar novamente artifacts já importados;
- manter `source_url`, licença e atribuição junto da entrega.

### D5. Opções e credenciais

- Mostrar somente fontes utilizáveis com as credenciais atualmente configuradas.
- Fontes sem segredo obrigatório continuam disponíveis normalmente.
- A ausência de uma API key não deve inutilizar as outras fontes.
- Se a lista depender do estado local das credenciais, usar `configurationOptions` sem revelar secrets.
- A interface deve explicar quais provedores exigem chave e quais funcionam sem chave.

### D6. Validação real do Free Stock Media

Cenários obrigatórios:

- busca de imagem em cada provedor habilitado;
- busca de vídeo em cada provedor compatível;
- estratégia todas as fontes;
- falha de uma fonte com resultados das demais;
- busca por múltiplos briefings;
- orientação estrita e preferencial;
- filtros de dimensão e duração;
- licença comercial segura;
- deduplicação;
- seleção e download de imagem;
- seleção e download de vídeo;
- tracking do Unsplash;
- redirect permitido e redirect recusado;
- arquivo acima do limite;
- MIME falso;
- cancelamento;
- retomada sem download duplicado.

## 9. Trilha E — ChatGPT Browser Studio

### E0. Congelar as capabilities não visuais

Objetivo: garantir que a evolução de imagens não quebre o comportamento textual já validado.

Baseline protegido:

- `generate-text-in-browser`;
- `search-web-in-browser`;
- `deep-research-in-browser`;
- `choose-library-item-in-browser`;
- `validate-content-in-browser`;
- `analyze-images-in-browser`;
- `analyze-documents-in-browser`.

Tarefas:

- manter fixtures representativas de cada capability;
- adicionar testes de caracterização para construção de prompt, anexos, captura e output;
- manter a abertura de conversa nova e o envio único das capabilities textuais;
- preservar `parts`, fontes, decisões e contratos de análise;
- impedir que parâmetros visuais apareçam nos blocos textuais;
- revisar todo diff em funções compartilhadas antes de aceitar a mudança.

Critério de saída:

- todos os testes atuais continuam passando sem alteração de expectativa funcional;
- o `plugin:kit check` continua compatível;
- nenhuma porta ou capability textual é removida ou renomeada.

### E1. Preservar e formalizar a geração atual de imagens

A capability existente `generate-image-in-browser` será mantida para compatibilidade.

Comportamentos atuais que devem permanecer:

- ativação de **Create an image** quando disponível;
- fallback pelo prompt explícito quando o atalho visual não existir;
- imagens de referência autorizadas pelo núcleo;
- captura de todas as imagens novas da resposta;
- exclusão de imagens antigas, referências e histórico;
- importação autenticada dos bytes;
- porta `image` com a primeira imagem para contratos unitários;
- porta `images` com a coleção completa;
- descrição textual da geração;
- continuidade usada em refinamento quando disponível.

Não criar uma segunda capability com semântica duplicada apenas para pluralizar o nome. A evolução será compatível dentro do ID existente.

### E2. Resultados incrementais e ações por item

Tarefas:

- publicar cada imagem capturada como `itemUpdate` próprio;
- usar namespace com `request.batch.itemId` quando houver lote;
- preservar o prompt que originou cada grupo de imagens;
- manter a posição e o ID do item em regenerações;
- declarar `regenerate`, `replace`, `select` e `download`;
- anexar a imagem atual e o feedback apenas quando uma regeneração precisar de nova conversa;
- não recapturar referências ou imagens históricas como novas variantes.

Critério de saída:

- a galeria aparece progressivamente;
- selecionar uma imagem não remove as outras;
- regenerar uma variante não substitui resultados de outro prompt;
- a porta singular continua apontando para a primeira imagem válida.

### E3. Processamento de vários prompts

Objetivo: tornar a geração de imagens utilizável em Processos de Assets com várias cenas, mesmo sem tratar o ChatGPT como o gerador mais escalável do portfólio.

Plano inicial:

- declarar `execution.itemOrchestration` de `prompt` para `images`;
- processar prompts sequencialmente;
- achatar as coleções de arquivos na saída acumulada;
- persistir cada prompt concluído antes de iniciar o próximo;
- retomar sem repetir prompts já concluídos;
- respeitar cancelamento entre itens;
- manter `maxConcurrency: 1`.

Avaliação posterior:

- medir o custo de abrir ou reutilizar o Chrome entre itens;
- avaliar reaproveitamento seguro do processo Chrome sem compartilhar conversa entre prompts;
- não introduzir uma fila interna complexa antes de medir o gargalo real;
- não alterar a semântica da geração textual para otimizar imagens.

### E4. Interface declarativa do ChatGPT Images

Configuração funcional inicial:

- perfil principal;
- perfis de fallback preparados;
- execução minimizada.

Entradas:

- prompt ou lista de prompts;
- referências visuais opcionais.

Saídas:

- primeira imagem compatível;
- coleção completa de imagens;
- descrição da geração.

Não declarar controles de modelo, tamanho, proporção ou qualidade enquanto a interface real do ChatGPT não oferecer opções determinísticas e verificáveis. Essas intenções continuam na instrução do Bloco. Campos técnicos de Chrome, timeout e tracing permanecem no Gerenciador de Plugins.

### E5. Refinamento e reprovação

Tarefas:

- preservar a imagem reprovada como entrada explícita da nova tentativa;
- incluir feedback editorial sem repetir anexos desnecessariamente;
- reutilizar conversa somente quando o contrato de continuidade permitir;
- abrir conversa nova quando a sessão anterior não for reutilizável;
- manter o histórico de tentativas no item do núcleo;
- impedir que uma imagem anterior seja tratada como output novo sem mudança real.

### E6. Validação real do ChatGPT Images

Cenários obrigatórios:

- um prompt sem referência;
- um prompt com uma referência;
- um prompt com várias referências;
- resposta com uma imagem;
- resposta com várias imagens;
- vários prompts sequenciais;
- seleção de uma variante;
- regeneração com feedback;
- substituição por imagem do usuário;
- retry após perda de conexão CDP;
- resposta textual sem mídia;
- limite de geração da conta;
- cancelamento entre prompts;
- retomada sem repetir prompts concluídos;
- garantia de que referências, avatares e histórico não entram na captura;
- execução de regressão de todas as sete capabilities não visuais.

## 10. Fundação compartilhada

### 10.1. Contratos já disponíveis

Esta iniciativa parte dos seguintes recursos já implementados no núcleo:

- `configurationOptions`;
- `itemActions`;
- `services.publishPartial({ itemUpdates })`;
- itens incrementais persistidos;
- entradas fornecidas na execução;
- perfis nomeados;
- fallback entre perfis preparados;
- artifacts locais;
- seleção, substituição e download nativos;
- item orchestration sequencial.

O roadmap não deve criar exceções de fornecedor nesses contratos.

### 10.2. Convenção de identidade

Cada atualização incremental deverá:

- usar chave estável apenas dentro da tentativa;
- incluir `request.batch.itemId` no namespace quando houver batch;
- nunca inventar `itemId` universal;
- preservar o input que originou o slot;
- usar uma porta de saída declarada;
- reutilizar artifact importado em retry seguro.

### 10.3. Convenção de arquivos intermediários

- Entradas são resolvidas somente por `services.resolveInputFile()`.
- Saídas usam `services.getOutputPath()`.
- Estado retomável usa `services.getWorkspacePath()`.
- Valores não carregam base64 de mídia.
- Cada artifact declara nome, MIME, tamanho e origem controlada.
- Mídia intermediária pode ser preservada mesmo quando não for output oficial do Processo.

### 10.4. Convenção de browser automation

- Um perfil dedicado por conexão preparada.
- Uma única Browser Bridge compartilhada.
- Login e CAPTCHA em superfície visível.
- Execução normal minimizada ou em background.
- Nenhum mouse ou teclado global.
- Nenhuma extração silenciosa de perfil pessoal.
- Nenhuma rotação para contornar cota ou bloqueio.
- Origem, conta e resultado validados em cada etapa.

## 11. Plano operacional em pacotes ordenados

### 11.1. Mapa de dependências

Executar da esquerda para a direita. Pacotes na mesma coluna só podem ocorrer em paralelo quando não compartilham arquivos.

```text
P00
 └─ P01 ─ P02 ─ P03
             ├─ P10 ─ P11 ─ P12 ─ P13 ─ P14       Flow
             ├─ P20 ─ P21 ─ P22 ─ P23 ─ P24       Free Stock
             ├─ P30 ─ P31 ─ P32 ─ P33 ─ P34       ChatGPT Images
             └─ P40 ─ P41 ─ P42 ─ P43 ─ P44 ─ P45 ─ P46   Vibes
                                                   └─ P50 ─ P51 ─ P52 ─ P53   Meta

P14 + P24 + P34 + P46 + P53 ─ P60 ─ P61
```

Meta vem depois de Vibes porque a fronteira entre os produtos precisa estar comprovada antes de migrar ou renomear comportamentos. Vibes depende do spike `P40`; nenhum agente deve implementar a ponte a partir de suposições.

### 11.2. Comandos canônicos

Substitua `<plugin>` pelo caminho real.

```powershell
node --test <plugin>/test.mjs
npm run plugin:kit -- check <plugin>
npm run plugin:kit -- test-contract <plugin>
npm run plugin:kit -- test-sandbox <plugin>
```

Testes focados do repositório:

```powershell
npm run test:plugin-partials
npm run test:plugin-fallback
npm run test:plugin-options
npm run test:plugin-profiles
npm run test:browser-bridge
npm run test:browser-plugins
npm run test:i18n
npm run test:architecture
npm run typecheck
npm run lint
```

Não executar comandos de publicação. `npm run check` é obrigatório em `P03`, `P61` e antes de qualquer pedido futuro de release; nos pacotes intermediários, usar a menor suíte que cubra o diff mais os testes do plugin.

### 11.3. Defaults herdados por todos os pacotes

Para evitar repetição sem deixar decisões implícitas, qualquer campo não repetido em um pacote herda estes defaults:

- **Leitura mínima:** documentos normativos, este roadmap, relatório do pacote anterior, manifesto, handler, testes, fixtures e README do componente alterado.
- **Arquivos permitidos:** diretório do componente citado, seu teste direto e `docs/ecosystem/asset-generation-evidence/<ID>.md`. Qualquer arquivo adicional exige parar, explicar a necessidade e registrar a expansão antes de editar.
- **Evidências:** todos os itens do protocolo 4.3, mesmo quando o pacote menciona apenas o nome do relatório.
- **Critério de saída:** todos os testes listados passam depois da alteração, o baseline protegido continua passando e o relatório permite reprodução por outro agente.
- **Critério de parada:** conflito com mudança preexistente, necessidade de permissão/host novo, quebra incompatível, comportamento real diferente do plano, falha reproduzível no baseline ou ausência de acesso ao cenário E2E obrigatório.

Os defaults complementam, mas nunca substituem, regras mais restritivas escritas no próprio pacote.

### P00 — Congelar inventário, baseline e ambiente de validação

**Dependências:** aprovação deste roadmap.

**Objetivo observável:** qualquer agente consegue distinguir código preexistente, mudanças em andamento e referência externa sem sobrescrever trabalho do mantenedor.

**Leitura mínima:** documentos normativos, este roadmap, `git diff` dos arquivos já modificados, manifestos/READMEs/testes dos quatro plugins existentes e manifesto da Browser Bridge.

**Arquivos permitidos:** somente documentação em `docs/ecosystem/asset-generation-evidence/` e correções factuais neste roadmap.

**Passos:**

1. registrar branch, commit-base e `git status --short`;
2. classificar cada arquivo já modificado como núcleo, Flow, Meta, documentação ou não relacionado;
3. não limpar, resetar, mover ou formatar mudanças existentes;
4. registrar versões e IDs de todas as capabilities e portas atuais;
5. confirmar os hashes da extensão listados em 2.3;
6. registrar a base legal/proveniência autorizada para reutilização técnica;
7. definir perfis dedicados, contas, projetos descartáveis, cotas e orçamento máximo de chamadas E2E;
8. criar uma fixture canônica com pelo menos três slots: dois prompts distintos e um briefing de stock, cada um com ID esperado;
9. executar todos os testes atuais dos quatro plugins e da ponte sem editar código.

**Testes:** `node --test` dos quatro plugins, `npm run test:browser-bridge` e `npm run test:browser-plugins`.

**Evidências:** relatório `P00.md`, tabela de baseline e lista de falhas reproduzíveis/intermitentes.

**Critério de saída:** ambiente e baseline registrados; nenhum diff de implementação criado.

**Parar se:** houver falha reproduzível não explicada, hash diferente, dúvida de licença, perfil pessoal em vez de dedicado ou mudança existente sem autoria/objetivo compreendido.

### P01 — Provar contratos de identidade, variantes e compatibilidade

**Dependências:** `P00`.

**Objetivo observável:** um teste do núcleo demonstra dois prompts, múltiplas variantes por prompt e regeneração de uma única variante sem deslocar ou substituir as demais.

**Leitura mínima:** `server/plugin-item-orchestration.ts`, `server/plugin-incremental-items.ts`, `server/index.ts`, `src/components/process-runner.tsx`, `src/lib/plugin-contract.ts`, testes correspondentes e seções de itens/actions do protocolo.

**Arquivos permitidos:** módulos genéricos acima, seus testes diretos, schema/tipos se indispensáveis e documentação do protocolo. Nenhum plugin de provedor.

**Passos:**

1. escrever primeiro um teste com dois `batch.itemId` e duas variantes por item;
2. provar que a chave incremental inclui o item do lote e uma chave de variante local;
3. provar que o núcleo, não o plugin, atribui o `itemId` universal;
4. provar `select` e `download` locais, `replace` validado pelo núcleo e `regenerate` via `item_action`;
5. provar que `regenerate` mantém ID e posição e acrescenta tentativa ao histórico;
6. provar que uma porta singular legada pode coexistir com uma porta plural nova sem mudar o binding antigo;
7. documentar quando `outputPort` representa o item do lote e quando representa uma variante;
8. se o contrato atual não suportar os dois níveis, propor a menor extensão universal antes de alterar o schema.

**Testes:** `npm run test:plugin-partials`, `npm run test:plugin-fallback`, testes de `server/index.ts`, `npm run typecheck`.

**Evidências:** `P01.md` com diagrama de IDs e payloads de exemplo redigidos.

**Critério de saída:** testes cobrem lote, variantes, ação isolada, retry e compatibilidade singular/plural.

**Parar se:** a solução exigir regra de fornecedor, ID inventado pelo plugin ou mudança incompatível de porta.

### P02 — Implementar localização portátil de manifestos

**Dependências:** `P01`.

**Objetivo observável:** o mesmo plugin exibe labels e descrições em PT-BR, inglês e espanhol com fallback determinístico, sem textos de fornecedor no núcleo.

**Leitura mínima:** schema do manifesto, `server/plugin-validation.ts`, `src/lib/plugin-contract.ts`, renderização de configuração no construtor e infraestrutura de locale existente.

**Arquivos permitidos:** `docs/ecosystem/schemas/contentflow-plugin-v1.schema.json`, `docs/ecosystem/protocol.md`, `docs/ecosystem/development.md`, tipos/validador/UI genéricos e testes de i18n. Não editar os cinco plugins ainda.

**Passos:**

1. definir um único formato opcional de localização para plugin, capability, porta, option e propriedade de schema;
2. manter o texto-base obrigatório e compatível;
3. definir fallback `locale exato → idioma-base → texto-base`;
4. rejeitar locale malformado e alvo de tradução inexistente sem executar plugin; locales BCP 47 adicionais continuam permitidos e usam o fallback definido;
5. garantir que valores técnicos, IDs e conteúdo do usuário nunca sejam traduzidos;
6. implementar tipos, schema, validação e resolução genérica;
7. aplicar tradução somente na moldura visual;
8. criar fixture de plugin neutro com as três línguas;
9. testar manifesto antigo sem mapa de localização.

**Testes:** `npm run test:i18n`, `npm run test:plugin-options`, testes do validador, `npm run typecheck`, `npm run lint`.

**Evidências:** `P02.md` com exemplos de manifesto válido, inválido e fallback.

**Critério de saída:** três idiomas validados; manifestos antigos continuam funcionando; nenhum nome de provedor foi adicionado ao núcleo.

**Parar se:** a proposta exigir duplicar o manifesto inteiro por idioma ou traduzir dados do usuário.

### P03 — Fechar convenções transversais de automação e mídia

**Dependências:** `P01` e `P02`.

**Objetivo observável:** todos os pacotes seguintes usam a mesma taxonomia de erro, recibo de idempotência, política de artifacts, opções e logs.

**Leitura mínima:** protocolo, segurança, artifacts, browser automation, ponte e implementações atuais de Flow/ChatGPT/Meta.

**Arquivos permitidos:** documentação genérica, testes/helpers de teste sem lógica de fornecedor e módulos universais apenas quando uma lacuna já tiver teste falhando.

**Passos:**

1. documentar recibo mínimo por submissão: chave lógica, provedor, operação, projeto/conversa, item do lote, instante, estado e IDs externos;
2. definir reconciliação antes de repetir uma submissão incerta;
3. mapear estados para `error`, `pending` ou `success`: login expirado, CAPTCHA, cota, rate limit, upgrade, bloqueio, recusa, ausência de mídia e DOM incompatível;
4. definir quais estados permitem fallback de perfil e quais exigem intervenção no perfil atual;
5. definir limites de bytes, MIME, duração, dimensão, redirect e materialização imediata de CDN;
6. definir cache de `configurationOptions`: TTL, refresh, lista vazia, erro e opção salva que desapareceu;
7. definir logs permitidos e redaction;
8. criar checklist comum de `configure/status/prepare`, cancelamento e fechamento de recursos;
9. confirmar `promptPreview` em toda capability que envia prompt;
10. executar a suíte completa para congelar a fundação.

**Testes:** testes focados de jobs, partials, fallback, options, profiles, browser bridge, `npm run check`.

**Evidências:** `P03.md` e checklist reutilizável anexado ao relatório.

**Critério de saída:** nenhuma decisão transversal fica delegada implicitamente ao pacote de um provedor.

**Parar se:** uma convenção universal depender de nome, DOM ou limite específico de fornecedor.

### P10 — Caracterizar e selar o Flow atual

**Dependências:** `P03`.

**Objetivo observável:** testes falham se qualquer técnica protegida do Flow mudar de comportamento.

**Leitura mínima:** todo o diretório `ecosystem/plugins/reference/google-flow-browser-images/`, diff preexistente e relatório `P00`.

**Arquivos permitidos:** `test.mjs`, fixtures e documentação do Flow. `handler.mjs` e `flow-engine.js` são somente leitura neste pacote.

**Passos:** mapear funções protegidas; adicionar testes de associação, reservas, URL expirada, fallback UI, reload, cancelamento e 300 comandos; registrar assinaturas/comportamentos em vez de detalhes frágeis; repetir testes para identificar intermitência.

**Testes:** teste do plugin, kit completo do plugin, `npm run test:browser-bridge` e `npm run test:browser-plugins`.

**Evidências:** `P10.md` com matriz “técnica protegida → teste”.

**Critério de saída:** toda área protegida possui teste ou justificativa E2E explícita.

**Parar se:** um teste só puder ser criado modificando a automação estabilizada.

### P11 — Reorganizar apenas a interface declarativa do Flow

**Dependências:** `P10`.

**Objetivo observável:** capabilities e campos aparecem na ordem da seção A3, com campos condicionais e três idiomas, sem mudar submissão/coleta.

**Arquivos permitidos:** manifesto, README, fixtures e testes do Flow; handler somente para suportar `promptPreview` ou leitura de configuração já declarada, sem alterar driver.

**Passos:** comparar manifesto com A1/A3; classificar cada campo como funcional ou técnico; mover preferências técnicas para settings/perfil já suportado; aplicar `visibleWhen`; adicionar localizações; declarar `promptPreview`; preservar IDs, portas, defaults e permissões existentes.

**Testes:** plugin e kit completo; teste de schema/visibleWhen/i18n; diff explícito provando ausência de mudanças em `flow-engine.js`.

**Evidências:** `P11.md` com tabela campo antigo → campo novo/oculto/movido.

**Critério de saída:** interface menor e compatível; zero mudança nas técnicas protegidas.

**Parar se:** remover campo mudar semântica de Método existente ou exigir alteração no driver.

### P12 — Adicionar opções dinâmicas do Flow

**Dependências:** `P11`.

**Objetivo observável:** modelos disponíveis são consultados por perfil, têm cache/refresh e fallback seguro.

**Arquivos permitidos:** manifesto, handler, testes e README do Flow. Não reescrever a técnica interna que descobre modelos.

**Passos:** declarar providers de `configurationOptions`; implementar somente `configure/options`; validar perfil/origem; normalizar `{value,label,description?,disabled?}`; testar cache por perfil, refresh, erro, lista vazia e modelo salvo ausente; manter fallback documentado.

**Testes:** plugin e kit completo; `npm run test:plugin-options`; regressão `P10`.

**Evidências:** `P12.md` com respostas redigidas de duas contas simuladas.

**Critério de saída:** nenhuma lista mutável fica congelada no núcleo; nenhum modelo de conta A aparece na B.

**Parar se:** a descoberta exigir nova técnica de navegação não protegida por teste.

### P13 — Fechar items/actions do Flow

**Dependências:** `P12`.

**Objetivo observável:** prompt, referência, imagem e vídeo mantêm namespace e ações isoladas.

**Arquivos permitidos:** manifesto, handler, testes e README do Flow; técnicas protegidas só com autorização e reprodução de defeito.

**Passos:** aplicar contrato provado em `P01`; testar `outputPort` de cada action; preservar `batch.itemId`; garantir que intermediários não selecionáveis não recebam ações falsas; testar regenerate/replace/select/download; reconciliar antes de retry; validar artifacts e MIME.

**Testes:** plugin e kit completo; testes de partials/fallback; regressão `P10`.

**Evidências:** `P13.md` com árvore prompt → variantes → vídeo.

**Critério de saída:** ação sobre um item nunca altera item vizinho e nenhuma mídia é recapturada como resultado novo.

**Parar se:** surgir mídia cruzada, duplicação após retry ou necessidade de mudar associação estabilizada.

### P14 — Validar Flow no site real

**Dependências:** `P13`.

**Objetivo observável:** todos os cenários A5 passam no perfil dedicado.

**Arquivos permitidos:** correções estritamente relacionadas a defeito reproduzido, testes, README e evidência.

**Passos:** instalar por pasta ao vivo; validar perfil; executar Método mínimo e lote; executar todos os cenários A5; comparar IDs e arquivos com a fixture canônica; repetir reload/cancelamento/retry; rodar regressão após qualquer correção.

**Testes:** A5 completo, plugin/kit, browser plugins e `npm run check` se houver alteração transversal.

**Evidências:** `P14.md` com tabela cenário/resultado/artifact/hash.

**Critério de saída:** nenhuma mídia trocada, repetida ou perdida; interface verificada nos três idiomas.

**Parar se:** site bloquear a conta, pedir CAPTCHA/upgrade ou exigir alteração não autorizada em técnica protegida.

### P20 — Caracterizar Free Stock e corrigir o fluxo BUSCAR → VALIDAR → CRIAR

**Dependências:** `P03`.

**Objetivo observável:** o contrato deixa inequívoco que descoberta é `BUSCAR`, seleção de candidatos da execução é `VALIDAR` e materialização é `CRIAR`.

**Arquivos permitidos:** plugin Free Stock, testes/fixtures e documentação; núcleo somente se `P01` tiver apontado lacuna genérica aprovada.

**Passos:** congelar sete adapters; mapear portas/records/proveniência; adicionar teste que rejeite uso conceitual de `ESCOLHER`; caracterizar falha parcial, deduplicação, licença, tracking, redirect e MIME.

**Testes:** plugin e kit completo; smoke real existente quando credenciais estiverem disponíveis.

**Evidências:** `P20.md` com schema de candidato e artifact.

**Critério de saída:** adapters preservados e fluxo de blocos documentado corretamente.

**Parar se:** seleção exigir item da Biblioteca Estratégica ou perder proveniência.

### P21 — Simplificar busca direta e opções de provedores

**Dependências:** `P20` e `P02`.

**Objetivo observável:** busca direta mostra apenas campos úteis e fontes realmente disponíveis.

**Passos:** implementar D1/D5; usar cards para records; aplicar localizações e campos condicionais; consultar disponibilidade sem revelar secrets; tratar opção salva indisponível; preservar IDs e portas.

**Testes:** plugin/kit; opções sem chave, com uma chave e com falha de uma fonte; i18n.

**Evidências:** `P21.md` com matriz fonte/credencial/opção exibida.

**Critério de saída:** ausência de uma chave não bloqueia fontes independentes.

**Parar se:** estado de secret precisar entrar em configuração, log ou output.

### P22 — Tornar busca por briefings incremental

**Dependências:** `P21`.

**Objetivo observável:** cada briefing conclui e persiste independentemente, com candidato ou resultado vazio válido.

**Passos:** confirmar `itemOrchestration`; namespace por item; publicar progresso; distinguir vazio editorial de erro técnico; testar retry/retomada; preservar query e fallbacks apenas em diagnóstico redigido.

**Testes:** plugin/kit; três briefings com sucesso, vazio e falha; cancelamento após o primeiro.

**Evidências:** `P22.md` com timeline de itens.

**Critério de saída:** falha de um briefing não apaga os concluídos nem baixa mídia.

**Parar se:** busca e download voltarem a ser uma operação indivisível.

### P23 — Materializar downloads com segurança e retomada

**Dependências:** `P22`.

**Objetivo observável:** cada candidato aprovado vira artifact local validado, sem download duplicado.

**Passos:** manter capabilities explícitas de download; validar SSRF/redirect/MIME/tamanho; usar output path; registrar hash/proveniência/licença; publicar por item; reutilizar artifact importado; validar tracking do Unsplash.

**Testes:** D6 de segurança e download; plugin/kit/sandbox.

**Evidências:** `P23.md` com hashes, redirects aceitos/recusados e proveniência.

**Critério de saída:** nenhum candidato remoto é apresentado como artifact antes da materialização.

**Parar se:** URL privada, MIME divergente, licença ausente ou tracking obrigatório falhar.

### P24 — Validar Free Stock ponta a ponta

**Dependências:** `P23`.

**Objetivo observável:** todos os cenários D6 passam e um Método BUSCAR → VALIDAR → CRIAR produz assets locais.

**Testes:** D6 completo, plugin/kit e Método real nos três idiomas.

**Evidências:** `P24.md`.

**Critério de saída:** proveniência completa, falha parcial segura e retomada sem download duplicado.

### P30 — Congelar as sete capabilities não visuais do ChatGPT

**Dependências:** `P03`.

**Objetivo observável:** qualquer regressão em texto, pesquisa, escolha, validação ou análise falha antes de mudanças de imagem.

**Arquivos permitidos:** testes/fixtures/README do ChatGPT. Handler e manifesto são somente leitura neste pacote.

**Passos:** criar fixtures e asserts para as sete capabilities listadas em E0; cobrir prompt, anexos, conversa, fontes, decisions e outputs; registrar comportamento de nova conversa e continuidade; executar cada teste repetidamente.

**Testes:** plugin/kit e browser plugins.

**Evidências:** `P30.md` com capability → fixture → assertions.

**Critério de saída:** baseline textual congelado sem alterar expectativas.

**Parar se:** algum teste atual for intermitente ou depender de corrigir o handler.

### P31 — Formalizar imagens plurais e incrementalidade do ChatGPT

**Dependências:** `P30`, `P01` e `P02`.

**Objetivo observável:** todas as imagens novas aparecem progressivamente; `image` continua sendo a primeira e `images` a coleção.

**Arquivos permitidos:** manifesto, handler, testes, fixtures e README do ChatGPT.

**Passos:** preservar captura atual; adicionar localizações e `promptPreview`; publicar `itemUpdates`; excluir referências/histórico/avatar; validar bytes/MIME; testar singular/plural; executar toda a regressão `P30` após cada mudança compartilhada.

**Testes:** plugin/kit, partials, browser plugins e regressão não visual completa.

**Evidências:** `P31.md` com DOM simulado antes/depois e IDs das imagens aceitas/rejeitadas.

**Critério de saída:** compatibilidade da porta singular e captura plural provadas.

**Parar se:** uma mudança em helper compartilhado alterar qualquer snapshot não visual.

### P32 — Adicionar múltiplos prompts sequenciais ao ChatGPT Images

**Dependências:** `P31`.

**Objetivo observável:** três prompts são processados um por vez, persistidos e retomados sem repetição.

**Passos:** declarar `itemOrchestration` somente na capability de imagem; mapear `prompt → images`; manter `maxConcurrency: 1`; usar `batch.itemId`; achatar saída sem perder proveniência; não compartilhar conversa entre prompts; cancelar entre itens; testar fallback de perfil.

**Testes:** plugin/kit, fallback/orchestration, browser plugins e regressão `P30`.

**Evidências:** `P32.md` com três prompts e variantes associadas.

**Critério de saída:** item concluído não é reenviado após reload ou fallback.

**Parar se:** otimização exigir compartilhar conversa ou alterar geração textual.

### P33 — Implementar ações e refinamento do ChatGPT Images

**Dependências:** `P32`.

**Objetivo observável:** regenerar uma imagem com feedback preserva ID/posição e não recaptura imagens antigas.

**Passos:** declarar actions com outputPort correto; implementar `item_action` para regenerate; manter replace/select/download locais conforme protocolo; anexar imagem reprovada apenas quando nova conversa exigir; reutilizar conversa somente com mesmo plugin/conexão; registrar tentativa e feedback; testar ausência de mudança real.

**Testes:** plugin/kit, item actions, conversation e regressão `P30`.

**Evidências:** `P33.md` com histórico de uma regeneração.

**Critério de saída:** tentativa anterior rastreável e item vizinho intacto.

### P34 — Validar ChatGPT Images no site real

**Dependências:** `P33`.

**Objetivo observável:** todos os cenários E6 passam e as sete capabilities não visuais continuam iguais.

**Passos:** E2E da capability de imagem; lote; referências; resposta sem mídia; limite; cancelamento; reload; item actions; depois executar uma vez cada capability não visual no perfil dedicado.

**Testes:** E6, plugin/kit, browser plugins e regressão `P30`.

**Evidências:** `P34.md`.

**Critério de saída:** imagem melhorada sem qualquer regressão textual observável.

### P40 — Fazer spike técnico do Vibes antes de implementar

**Dependências:** `P03`.

**Objetivo observável:** documento decide arquitetura, origens, ações da ponte, downloads e retomada com evidência da extensão e do site real.

**Arquivos permitidos:** documentação/evidência; nenhum código de produção.

**Passos:** inventariar URLs/origens/CDNs; mapear estados de projeto; medir duração; observar se jobs sobrevivem reload; identificar IDs externos; listar seletores por papel/estado; provar necessidade de `Input.*`; decidir imediato versus `start/resume/cancel`; provar ou rejeitar lease; definir limites de referências, quatro variantes e resoluções; registrar erros reais.

**Testes:** sessão manual controlada, sem automação nova; nenhum gasto além do orçamento de `P00`.

**Evidências:** `P40.md` com decisão arquitetural e tabela operação → comando genérico da ponte.

**Critério de saída:** todas as lacunas `G04`, `G07` e `G11` fechadas.

**Parar se:** origem/conta não puder ser validada ou operação exigir mouse/teclado global/CDP arbitrário.

### P41 — Criar o esqueleto instalável do Vibes

**Dependências:** `P40`.

**Objetivo observável:** pacote vazio funcional passa validação sem alegar capabilities ainda não implementadas.

**Arquivos permitidos:** novo diretório `ecosystem/plugins/reference/vibes-browser-studio/`.

**Passos:** criar pacote pelo plugin kit; usar ID imutável aprovado; iniciar em prerelease como `0.1.0-dev.0`; adicionar licença/README/ícone próprio; declarar apenas permissões/hosts comprovados; implementar configure status/prepare mínimo; não declarar geração antes do handler/teste existir.

**Testes:** plugin/kit completo e package validation.

**Evidências:** `P41.md`.

**Critério de saída:** pacote instalável, sem capability fictícia e sem versão estável.

**Parar se:** licença do ícone/código ou host necessário estiver indefinido.

### P42 — Autorizar Vibes na Browser Bridge

**Dependências:** `P41`.

**Objetivo observável:** a ponte aceita somente o plugin Vibes, no perfil/sessão/aba/origem corretos e com ações genéricas mínimas.

**Arquivos permitidos:** `ecosystem/browser-bridge/`, testes da ponte e cliente Vibes.

**Passos:** adicionar hosts exatos; criar policy por ID; reutilizar ações comuns; adicionar ação nova somente se `P40` provar necessidade genérica; validar URL/aba/perfil/executionKey/commandId; testar replay, expiração, fila, cancelamento e detach; implementar lease apenas se aprovada com release em todos os caminhos; não colocar seletores Vibes na ponte.

**Testes:** `npm run test:browser-bridge`, `npm run test:browser-plugins`, testes do cliente e regressão de Flow/ChatGPT/Meta.

**Evidências:** `P42.md` com matriz de autorização e recusas.

**Critério de saída:** Vibes autorizado e todos os outros plugins inalterados.

**Parar se:** policy precisar de comando CDP arbitrário ou origem ampla não comprovada.

### P43 — Implementar geração de imagens no Vibes

**Dependências:** `P42`, `P01` e `P02`.

**Objetivo observável:** um prompt produz quatro imagens 9:16 materializadas, associadas ao item e manipuláveis.

**Arquivos permitidos:** plugin Vibes; ponte somente para defeito genérico reproduzido e tratado em pacote separado.

**Passos:** implementar B3; validar referências tipadas e limites; projeto novo/existente; submissão idempotente; coleta das quatro variantes; artifacts; partials; actions; localizações; prompt preview; cancelamento e erros da matriz `P03`.

**Testes:** plugin/kit, browser plugins e cenários de imagem B8.

**Evidências:** `P43.md`.

**Critério de saída:** quatro variantes corretas sem referências duplicadas ou cruzadas.

### P44 — Implementar vídeo por Frames no Vibes

**Dependências:** `P43`.

**Objetivo observável:** frame inicial e final opcionais produzem quatro vídeos em 480p/720p com associação correta.

**Passos:** implementar B4; validar alinhamento por identidade, não índice isolado; tratar frame final ausente; materializar intermediários; ações e retomada; provar reload sem resubmissão.

**Testes:** plugin/kit e cenários Frames de B8.

**Evidências:** `P44.md`.

**Critério de saída:** nenhum frame é associado ao prompt vizinho e retry não duplica job.

### P45 — Implementar vídeo por Elementos no Vibes

**Dependências:** `P44`.

**Objetivo observável:** referências Personagem/Cena/Estilo obedecem papéis e limites e produzem quatro vídeos.

**Passos:** implementar B5; rejeitar duas referências de Personagem; preservar papéis; validar uploads; materializar vídeos; actions, cancelamento e retomada.

**Testes:** plugin/kit e cenários Elementos de B8.

**Evidências:** `P45.md`.

**Critério de saída:** papéis não são intercambiados e mensagens de limite são claras nos três idiomas.

### P46 — Validar Vibes e decidir capability composta

**Dependências:** `P45`.

**Objetivo observável:** B8 completo passa; decisão sobre capability composta usa medição real.

**Passos:** executar B8; validar conta/origem/CDN; testar reload/cota/CAPTCHA; medir benefício de manter projeto/sessão; só então recomendar ou rejeitar B6; não implementar B6 neste pacote.

**Testes:** B8, plugin/kit, bridge/plugins e `npm run check` se a ponte mudou após `P42`.

**Evidências:** `P46.md` com decisão “adicionar depois” ou “não adicionar”, justificativa e custo.

**Critério de saída:** capabilities atômicas completas; `1.0.0` continua não autorizado até etapa de publicação separada.

### P50 — Caracterizar Meta e fixar a fronteira com Vibes

**Dependências:** `P46`.

**Objetivo observável:** testes e documentação distinguem `meta.ai` de `vibes.ai` e congelam texto/vídeo legado.

**Arquivos permitidos:** testes/fixtures/README do Meta; handler e manifesto somente leitura primeiro.

**Passos:** congelar três capabilities atuais; mapear origens/CDNs; provar comportamento da capability de vídeo legada; registrar portas/bindings; remover apenas linguagem documental que sugira Vibes completo.

**Testes:** plugin/kit e browser plugins.

**Evidências:** `P50.md`.

**Critério de saída:** fronteira e compatibilidade documentadas antes de código funcional.

### P51 — Entregar múltiplas imagens no Meta com compatibilidade

**Dependências:** `P50`, `P01` e `P02`.

**Objetivo observável:** todas as imagens novas são materializadas; a saída singular antiga continua válida e a plural é adicionada sem quebrar Método.

**Passos:** aplicar C2; preservar porta antiga; adicionar plural opcional; estabilizar contagem; excluir histórico/referências; partials/actions; proporções; localizações e prompt preview; regressão textual e de vídeo legado.

**Testes:** plugin/kit, partials, browser plugins e baseline `P50`.

**Evidências:** `P51.md`.

**Critério de saída:** singular/plural e múltiplas variantes comprovadas.

### P52 — Separar animação sem remover vídeo legado do Meta

**Dependências:** `P51`.

**Objetivo observável:** nova `animate-image-in-browser` funciona; `generate-video-in-browser` antigo mantém ID, portas e semântica.

**Passos:** adicionar capability nova; reutilizar internamente apenas código comprovadamente comum; não redirecionar silenciosamente Métodos antigos; preservar uma/duas variantes; artifacts/actions; testar retry incerto e referências.

**Testes:** plugin/kit, baseline `P50`, browser plugins.

**Evidências:** `P52.md` com tabela antiga/nova.

**Critério de saída:** animação sem quebra do alias legado.

### P53 — Adicionar lote e validar Meta real

**Dependências:** `P52`.

**Status:** implementação e regressões automatizadas concluídas; pacote ainda pendente porque o C6 real exige o perfil dedicado `meta-e2e` preparado e validado contra o Meta.

**Objetivo observável:** C6 completo passa para texto, imagens e animação, com retomada sem duplicação.

**Passos:** aplicar `itemOrchestration` onde o contrato for plural; manter serial; usar recibos/reconciliação; executar C6; validar interface nos três idiomas.

**Testes:** C6, plugin/kit, browser plugins e regressão textual.

**Evidências:** `P53.md`.

**Critério de saída:** fronteira Meta/Vibes correta e todos os Métodos antigos ainda legíveis/executáveis.

### P60 — Executar a esteira integrada com fixture canônica

**Dependências:** `P14`, `P24`, `P34`, `P46` e `P53`.

**Objetivo observável:** um Projeto real recebe dezenas de slots de fontes distintas sem perder identidade ou proveniência.

**Arquivos permitidos:** Métodos/fixtures de teste, documentação e correções localizadas no plugin responsável. Não corrigir vários plugins no mesmo diff.

**Passos:** criar Métodos mínimos por provedor; executar fixture de `P00`; combinar Flow, Vibes, Meta, ChatGPT Images e Free Stock; selecionar em `VALIDAR`; entregar assets para Edição; interromper e retomar; falhar um item de propósito; conferir IDs, ordem, hashes, licenças e histórico.

**Testes:** E2E integrado e suites de todos os plugins.

**Evidências:** `P60.md` com mapa slot → fonte → tentativa → artifact → seleção.

**Critério de saída:** falha de item não apaga concluídos; retomada não duplica custo; seleção mantém proveniência.

### P61 — Auditoria final de implementação, sem publicação

**Dependências:** `P60`.

**Objetivo observável:** estado exato da implementação está testado, documentado e pronto para o mantenedor decidir sobre versionamento/publicação.

**Passos:** revisar diffs por fronteira; verificar permissões/hosts/secrets; rodar `npm run check`; rodar todos os E2Es novamente no estado final; confirmar PT-BR/EN/ES; atualizar READMEs; listar versões candidatas sem alterá-las; apresentar evidências ao mantenedor.

**Evidências:** `P61.md`, índice de todos os relatórios e lista exata de arquivos candidatos.

**Critério de saída:** zero teste pendente e zero discrepância entre documentação e comportamento.

**Parar se:** qualquer correção após o último E2E mudar código; nesse caso, repetir a validação afetada. Não criar release, tag, commit de release ou publicação.

## 12. Matriz mínima de testes

| Categoria | Flow | Meta AI | Vibes | Free Stock | ChatGPT Images |
| --- | --- | --- | --- | --- | --- |
| Manifesto/schema/kit | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| Input ausente ou incorreto | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| Prompt preview | todas as capabilities que enviam prompt | texto/imagem/vídeo | imagem/Frames/Elementos | não se aplica | todas as capabilities que enviam prompt |
| Item do lote | prompt | prompt | prompt/frame | briefing/candidato | prompt |
| Variantes por item | imagem e vídeo | imagens e vídeos | quatro por operação | candidatos | todas as imagens novas |
| Ação regenerar | isolada | isolada | isolada | não se aplica à busca | isolada |
| Replace/select/download | conforme tipo materializado | conforme tipo | conforme tipo | VALIDAR + download explícito | conforme tipo |
| Cancelamento | fecha navegador/recursos | fecha navegador/recursos | fecha ponte/job | fecha requests/streams | fecha navegador/recursos |
| Retry idempotente | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| Timeout incerto | reconciliar | reconciliar | reconciliar job/projeto | reconciliar artifact | reconciliar conversa/resposta |
| Reload/retomada | fila/projeto | conversa/página | projeto/job | artifact/download | prompts concluídos |
| Autenticação | perfil Google | perfil Meta | perfil Vibes/Meta validado | API keys opcionais | perfil ChatGPT |
| Fallback de perfil | obrigatório | obrigatório | obrigatório | não se aplica | obrigatório |
| Cota/rate limit/upgrade | obrigatório | obrigatório | obrigatório | por API | obrigatório |
| Artifact/MIME/limite | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| Proveniência | projeto/modelo | conta/origem | projeto/modo | fonte/licença/autor | conversa/conta |
| PT-BR/EN/ES | obrigatório | obrigatório | obrigatório | obrigatório | obrigatório |
| Regressão protegida | técnicas Flow | texto + vídeo legado | ponte e plugins existentes | sete adapters | sete capabilities não visuais |
| E2E real | A5 | C6 | B8 | D6 | E6 |

## 13. Critérios globais de aceite

Um pacote só pode ser marcado como concluído quando:

- dependências anteriores possuem relatório aprovado;
- baseline foi executado antes da alteração;
- diff está limitado aos arquivos autorizados ou a expansão foi aprovada;
- manifesto e schema são válidos;
- entrypoint usa somente permissões e hosts declarados;
- testes unitários, kit, contrato e sandbox passam;
- identities de lote e variante são determinísticas;
- item action atua somente no item e na porta declarados;
- artifacts usam caminhos controlados e MIME/tamanho reais;
- cancelamento fecha recursos;
- timeout/retry não duplica efeito externo;
- logs e evidências estão redigidos;
- PT-BR, inglês e espanhol foram verificados;
- E2E exigido foi executado no estado exato do código;
- limitações conhecidas foram registradas;
- relatório de handoff foi criado;
- nenhuma release ou publicação foi realizada.

## 14. Riscos e mitigação

| Risco | Impacto | Mitigação e portão |
| --- | --- | --- |
| DOM do provedor muda | automação falha ou clica no alvo errado | seletores centralizados; validar origem/estado; erro fechado; smoke real |
| Cena recebe mídia errada | corrupção editorial silenciosa | `P01`; namespace de lote + variante; asserts por ID/hash |
| Retry duplica geração paga | custo e resultados duplicados | recibo persistido; reconciliação; nunca repetir timeout incerto às cegas |
| CDN expira ou redireciona | artifact perdido ou SSRF | materialização imediata; hosts/redirect/MIME/bytes validados |
| Sessão expira | prompt pode ser enviado em login | `configure/status/prepare`; validar conta/página antes de preencher |
| CAPTCHA/upgrade/bloqueio | loop ou evasão indevida | pausar para humano; nunca trocar fingerprint/IP ou burlar limite |
| Catálogo muda | configuração salva deixa de existir | opções por perfil; refresh; opção ausente desabilitada e erro claro |
| Variantes sobrecarregam UI | seleção confusa | agrupamento por input, actions explícitas e renderers nativos |
| Traduções entram no núcleo | acoplamento de fornecedor | `P02`; mapa portátil no manifesto |
| Licença de stock inadequada | risco de uso/publicação | perfil de licença, proveniência, atribuição e VALIDAR |
| Técnica do Flow muda | regressão grave | `P10`; arquivos protegidos; autorização antes de alterar |
| ChatGPT texto quebra | regressão em recurso maduro | `P30`; suíte não visual em P31–P34 |
| Ponte ganha poder excessivo | amplia autoridade de todos os plugins | policy por plugin/origem/ação; sem CDP arbitrário; regressão completa |
| Agente mistura tarefas | diff impossível de auditar | um pacote por vez; arquivos permitidos; relatório obrigatório |
| Worktree sujo é sobrescrito | perda de trabalho do mantenedor | `P00`; sem reset/checkout; parar em sobreposição não compreendida |

## 15. Política de versionamento durante o desenvolvimento

Este roadmap não autoriza alteração de versão. Quando houver autorização específica posterior:

- Flow, Meta, Free Stock e ChatGPT usam próxima minor somente se IDs, portas e semântica existentes forem preservados;
- Vibes usa prerelease durante desenvolvimento e só poderá receber `1.0.0` depois de `P46`, `P60`, `P61` e autorização explícita;
- remoção/renomeação de capability ou porta, campo novo obrigatório, mudança de tipo/semântica ou permissão significativamente ampliada exige major e plano de migração;
- conteúdo diferente nunca pode ser publicado sob a mesma versão/hash;
- versão, release, catálogo e site são uma etapa separada da implementação.

## 16. Decisões do mantenedor antes do primeiro pacote funcional

1. Confirmar Meta AI e Vibes como pacotes separados.
2. Confirmar manutenção da capability antiga de vídeo no Meta.
3. Aprovar as três capabilities atômicas do Vibes.
4. Manter a capability composta do Vibes fora da primeira implementação até `P46`.
5. Aprovar o contrato portátil de localização a ser detalhado em `P02`.
6. Definir contas, perfis, projetos e orçamento E2E de `P00`.
7. Registrar a autorização/proveniência para reutilização técnica da extensão.
8. Manter protegidas as técnicas do Flow e as sete capabilities não visuais do ChatGPT.
9. Autorizar ou rejeitar lease somente depois da evidência de `P40`.
10. Confirmar a ordem dos pacotes deste documento.

## 17. Definição de conclusão da iniciativa

A iniciativa estará concluída somente quando `P61` estiver aprovado e os cinco plugins puderem preencher assets de um único vídeo com:

- interface nativa, enxuta e traduzida;
- múltiplos arquivos e resultados intermediários;
- identidade por cena, prompt, variante e briefing;
- seleção, substituição e regeneração isoladas;
- retomada segura e idempotência comprovada;
- proveniência, licença e conta/origem rastreáveis;
- permissões e hosts mínimos;
- testes automatizados e E2E real por provedor;
- relatórios suficientes para outro agente reproduzir cada resultado;
- nenhuma regressão nas técnicas protegidas do Flow ou no texto do ChatGPT.

Publicação, catálogo, incremento de versão, tag, release e atualização do site permanecem posteriores, separados e dependentes de autorização explícita para o estado exato validado.
