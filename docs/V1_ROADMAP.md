# Roadmap de finalização da V1.0.0

Este documento é o guia operacional para levar o ContentFlow OS da versão atual `0.4.2` até a primeira versão estável `1.0.0`. Ele registra a ordem de desenvolvimento, as decisões já tomadas, as dependências entre frentes e os critérios mínimos para considerar cada fase concluída.

O roadmap complementa [`ARCHITECTURE.md`](ARCHITECTURE.md). A arquitetura continua sendo a fonte normativa do produto; quando uma decisão aprovada neste roadmap alterar o comportamento normativo, a arquitetura e os documentos técnicos afetados devem ser atualizados antes ou junto da implementação.

## Como usar este documento

- Trabalhar nas fases na ordem definida abaixo, salvo decisão explícita posterior do titular.
- Antes de iniciar uma fase, confirmar suas dependências e atualizar o campo **Estado**.
- Durante a implementação, registrar decisões relevantes na seção **Registro de decisões**.
- Marcar critérios de aceite somente depois de código, testes e validação visual/operacional.
- Não considerar uma fase concluída enquanto houver migração, documentação ou teste obrigatório pendente.
- Preservar os 8 Processos Universais, 4 Blocos Essenciais, 3 Operadores e 3 interfaces do produto.
- Tratar Métodos como processos de um vídeo individual. Coordenação de vários Projetos pertence ao Orquestrador.
- Nunca serializar chaves, tokens, cookies ou outros secrets em Métodos, SQLite, logs ou arquivos exportados.
- Preservar a separação absoluta entre núcleo e plugins: o ContentFlow OS deve permanecer útil com zero plugins, e nenhuma integração, API de fornecedor, FFmpeg ou automação de navegador pode ser incorporada ao núcleo.

Estados usados neste documento:

- `PENDENTE`: ainda não iniciada.
- `EM PLANEJAMENTO`: contrato e escopo sendo definidos.
- `EM DESENVOLVIMENTO`: implementação em andamento.
- `EM VALIDAÇÃO`: código pronto, aguardando testes finais ou validação de produto.
- `CONCLUÍDA`: critérios de aceite cumpridos e documentação sincronizada.

## Ordem de execução

| Ordem | Fase                                          | Estado atual | Dificuldade | Dependências   |
| ----- | --------------------------------------------- | ------------ | ----------- | -------------- |
| 0     | Sincronização arquitetural                    | CONCLUÍDA    | Baixa       | Nenhuma        |
| 1     | Atualização pelo próprio aplicativo           | CONCLUÍDA    | Média       | Fase 0         |
| 2     | Nova galeria e gerenciamento de Plugins       | CONCLUÍDA    | Baixa       | Fase 0         |
| 3     | Conexões, contas e configurações no Método    | CONCLUÍDA    | Alta        | Fases 0 e 2    |
| 3.5   | Release estável V0.4.3 e validação do updater | CONCLUÍDA    | Média       | Fases 1, 2 e 3 |
| 4     | Hierarquia visual do editor de Métodos        | CONCLUÍDA    | Baixa       | Fase 3.5       |
| 5     | Jornada de contas dos plugins de navegador    | PENDENTE     | Média       | Fases 3.5 e 4  |
| 6     | Lote inteligente de Projetos                  | PENDENTE     | Alta        | Fases 3, 4 e 5 |
| 7     | Estabilização e release V1.0.0                | PENDENTE     | Alta        | Fases 1–6      |

## Fase 0 — Sincronização arquitetural

**Objetivo:** transformar as decisões deste roadmap em contratos inequívocos antes de alterar persistência e interfaces.

### Entregas

- Atualizar `ARCHITECTURE.md` para separar instalação do plugin, configuração funcional do Método, referência de conexão e armazenamento seguro de secrets.
- Definir o contrato de múltiplas conexões por plugin.
- Definir os metadados opcionais de branding do manifesto de plugin.
- Definir a fronteira do novo lote inteligente sem criar Processo Universal, Bloco ou Operador.
- Identificar migrações e compatibilidade necessárias para Métodos e instalações existentes.

### Critérios de aceite

- [x] Documentação normativa sincronizada com as decisões aprovadas.
- [x] Nenhum secret passa a fazer parte do Método ou de arquivos exportáveis.
- [x] Estratégia de compatibilidade com dados da `0.4.2` documentada.
- [x] Contratos necessários às fases 2, 3 e 6 definidos antes da implementação.

## Fase 1 — Atualização pelo próprio aplicativo

**Objetivo:** permitir que o aluno verifique, baixe e instale a versão estável mais recente sem procurar arquivos manualmente.

### Decisões de produto

- O instalador NSIS será a distribuição principal e atualizável.
- GitHub Releases será inicialmente o canal oficial de releases estáveis.
- A versão portátil terá fallback explícito para baixar/abrir o instalador mais recente; não será apresentada como atualização silenciosa equivalente.
- O preview web não executará o updater do Electron.
- Projetos, plugins, perfis e credenciais permanecerão fora da pasta substituível do programa.

### Entregas

- Integrar um updater compatível com o instalador NSIS no processo principal do Electron.
- Criar uma ponte mínima e segura entre renderer e processo principal para consultar estado, iniciar download e instalar.
- Adicionar ao dashboard os estados: versão atual, verificando, disponível, baixando, pronta, atualizada e erro recuperável.
- Criar workflow de release que publique instalador e metadados de atualização gerados no mesmo build.
- Definir política de assinatura de código e canal de release.
- Registrar logs locais seguros, sem dados de usuário ou credenciais.

### Critérios de aceite

- [x] Botão “Verificar atualização” funcional no aplicativo instalado.
- [x] Download mostra progresso e não bloqueia o restante da interface.
- [x] “Reiniciar e atualizar” instala a nova versão de forma controlada.
- [x] Atualização real da versão N-1 para N validada no Windows (`0.4.2 → 0.4.3`).
- [x] Banco, Canais, Projetos, plugins instalados, conexões e perfis preservados após a atualização.
- [x] Release sem metadados, incompleta, corrompida ou incompatível falha com mensagem segura.
- [x] Fluxo da versão portátil claramente diferenciado.
- [x] Documentação de compilação, publicação e recuperação atualizada.

### Validação realizada em 2026-08-27

- Suíte completa `npm run check` aprovada, incluindo o ciclo IPC do updater e mensagens de erro seguras.
- Instalador NSIS, `latest.yml`, `app-update.yml` e `.blockmap` gerados e inspecionados localmente.
- Preload isolado, módulo do updater e dependências de runtime confirmados dentro do pacote.
- A atualização real `0.4.2 → 0.4.3` foi concluída em 2026-08-27: o aplicativo identificou a release estável, exibiu progresso, preparou o reinício e passou a informar `0.4.3` na instalação existente.
- Os quatro Canais e seus dados permaneceram visíveis depois da atualização; plugins e dados locais continuaram fora da pasta substituída.
- Bloqueio identificado: as releases publicadas até `v0.4.2` são pré-releases e não participam do canal estável `latest`; elas também não incluem `latest.yml` e `.blockmap`.
- A validação operacional ficou deliberadamente adiada para a Fase 3.5 e não bloqueia o desenvolvimento das Fases 2 e 3.

## Fase 2 — Nova galeria e gerenciamento de Plugins

**Objetivo:** transformar `/plugins` em uma área simples de instalação e gerenciamento do ciclo de vida dos plugins.

### Decisões de produto

- Em telas grandes, a galeria usará quatro cards quadrados por linha.
- O card mostrará somente ícone e nome, além de sinalização mínima quando houver erro ou desativação.
- O card mostrará também uma descrição curta de até três linhas para reduzir ambiguidade sem voltar ao excesso de informações anterior.
- Detalhes e ações ficarão em modal ou painel lateral aberto pelo card.
- Configuração funcional, modelo, conta e credencial não serão editados diretamente no card do catálogo.

### Entregas

- Criar o novo card quadrado e layout responsivo.
- Adicionar branding opcional ao manifesto com asset local validado e fallback seguro.
- Não buscar favicons remotos automaticamente.
- Mover versão, origem, permissões, capacidades, manifesto e ações para a visualização de detalhes.
- Manter instalação, vínculo de desenvolvimento, ativação, desativação, atualização e remoção.
- Ao remover, informar Métodos dependentes e preservar outputs históricos.
- Verificar direitos e regras de uso dos logos oficiais incluídos na distribuição.

### Critérios de aceite

- [x] Quatro cards por linha na largura de desktop definida pelo design.
- [x] Cards continuam utilizáveis e legíveis em larguras menores.
- [x] Ícone ausente, inválido ou incompatível usa fallback local.
- [x] Instalar, ativar, desativar, atualizar, desvincular e desinstalar continuam acessíveis.
- [x] Remoção informa dependências antes da confirmação.
- [x] Nenhuma configuração sensível aparece diretamente na galeria.
- [x] Manifestos API v1 existentes continuam válidos sem o novo branding opcional.

### Estado da implementação

- O detalhe do plugin concentra ativação, desativação, atualização por pasta, desvinculação e desinstalação.
- A atualização aceita somente uma versão SemVer superior do mesmo plugin, valida uma cópia temporária e restaura automaticamente a versão anterior se a substituição falhar.
- Alterar a versão invalida o consentimento anterior; o usuário precisa revisar permissões e reativar o pacote.
- Antes da remoção, a API consulta todos os Métodos salvos e a interface informa Canal, Processo e Bloco dependentes.
- A remoção preserva Projetos, execuções e outputs históricos; somente o pacote, consentimento, workspace e secrets locais são removidos após confirmação.
- A suíte completa e o build passaram em 2026-08-27.
- A validação operacional instalou o plugin comunitário de referência `v1.0.0`, ativou, rejeitou atualização para a mesma versão, atualizou para `v1.0.1`, confirmou a invalidação do consentimento anterior, reativou e desinstalou o pacote. O fixture e a instalação de teste foram removidos ao final.
- O preview confirmou versão, descrição, permissões e ações de ativar/desativar, atualizar e desinstalar no modal.
- Por decisão explícita do titular em 2026-08-27, os ícones atuais permanecem na distribuição. As fontes e condições identificadas continuam documentadas para revisão antes das releases públicas.

## Fase 3 — Conexões, contas e configurações no Método

**Objetivo:** permitir que cada bloco selecione a ferramenta e a conta adequadas ao Canal, Processo ou Método, eliminando redundância na Central de Plugins.

### Separação obrigatória

O Método poderá armazenar:

- `pluginId` e versão compatível;
- `capabilityId`;
- configuração funcional do executor;
- modelo, operação, formato e parâmetros específicos;
- referência opaca da conexão ou perfil selecionado;
- bindings tipados de inputs e outputs.

O núcleo continuará armazenando fora do Método:

- valor real de chaves, tokens, cookies e secrets;
- consentimentos e permissões;
- integridade, origem e runtime do pacote;
- workspaces e diretórios autorizados;
- sessões e perfis locais de navegador.

### Entregas

- Evoluir o cofre de uma credencial única por plugin para múltiplas conexões nomeadas.
- Definir identidade estável semelhante a `pluginId + connectionId + secretKey`.
- Criar APIs para listar, criar, testar, renomear, desconectar e revogar conexões sem retornar secrets.
- Permitir criar ou escolher a conexão dentro da configuração do bloco.
- Fazer o Método salvar somente o identificador opaco da conexão.
- Criar migração segura para as conexões existentes de OpenAI, Anthropic e plugins comunitários.
- Bloquear execução de conexão ausente, incompatível ou revogada com estado explícito.
- Preservar exportação segura de Métodos sem credenciais.

### Critérios de aceite

- [x] Um mesmo plugin aceita múltiplas contas nomeadas.
- [x] Blocos diferentes podem selecionar contas diferentes.
- [x] Um Método exportado não contém secrets nem dados de sessão.
- [x] Importação informa conexões que precisam ser associadas localmente.
- [x] Renomear uma conexão não quebra Métodos vinculados.
- [x] Remover ou revogar uma conexão informa dependências e bloqueia novas execuções.
- [x] Métodos antigos e credenciais existentes são migrados ou normalizados sem perda.
- [x] Logs, snapshots e mensagens de erro permanecem redigidos.

### Estado da implementação

- O cofre aceita múltiplas conexões nomeadas por `pluginId + connectionId + secretKey`; o SQLite armazena apenas identidade, nome, metadados seguros, datas e estado de revogação.
- APIs locais listam, criam, testam, renomeiam e revogam conexões sem devolver valores de secrets.
- O editor do Bloco permite selecionar uma conexão existente, criar outra no cofre local e testar a conta no contexto do Método.
- Jobs persistentes registram somente o `connectionId` opaco e resolvem os secrets em memória no momento da invocação. Conexão ausente, revogada ou ambígua bloqueia a execução com mensagem explícita.
- A compatibilidade com a `0.4.2` migra a credencial global somente após confirmar a cópia no novo endereço do cofre. A conexão OpenAI existente neste ambiente foi normalizada operacionalmente sem expor o valor.
- Exportações preservam plugin, versão, capability, configuração e requisito de conexão, mas removem o ID local. Importações avisam sobre a reassociação; cópias internas entre Canais podem preservar a referência local.
- Remover uma conexão consulta os Métodos dependentes antes da confirmação; remover um plugin também limpa todas as conexões e secrets associados.
- A resolução do runtime foi validada isoladamente com duas contas do mesmo plugin atribuídas a blocos distintos; cada `connectionId` recebeu somente o secret correspondente. Ambiguidade em Método antigo e conexão revogada foram bloqueadas.
- A validação operacional da conexão OpenAI existente consultou 31 modelos pela API oficial. O editor exibiu a conexão selecionada, ação de teste e a lista específica dessa conta, sem recorrer à credencial global legada.
- O Canal temporário usado na inspeção visual foi removido após o teste e o preview foi restaurado ao Canal original.
- `npm run check` completo, incluindo os novos testes de conexões, runtime, dependências e arquivos de Método, passou em 2026-08-27.

## Fase 3.5 — Release estável V0.4.3 e validação do updater

**Objetivo:** publicar um checkpoint estável depois das mudanças estruturais de Plugins e conexões, permitindo validar no aplicativo instalado todo o fluxo de atualização antes de avançar para o refinamento visual dos Métodos.

### Regra de autorização

- Esta fase só pode iniciar após comando explícito do titular para preparar e publicar a `v0.4.3`.
- Até esse comando, não alterar a versão para `0.4.3`, não criar tag e não publicar nem modificar releases no GitHub.
- A publicação deve usar a API oficial ou o workflow autenticado do repositório; automação pelo navegador não faz parte desse processo.

### Gate arquitetural incorporado em 2026-08-27

Antes de publicar, a `v0.4.3` deve consolidar a separação absoluta entre núcleo e plugins aprovada pelo titular:

- o aplicativo deve iniciar e permanecer plenamente utilizável como organizador de Métodos com o registro de plugins vazio;
- a release do núcleo não pode empacotar ou instalar plugins e exemplos;
- integrações com fornecedores, FFmpeg, executáveis, codecs e automações de navegador devem existir somente nos pacotes externos;
- nenhum plugin recebe tratamento privilegiado por ser mantido pelo autor do produto;
- todos os plugins instalados exigem consentimento, usam a mesma sandbox e podem ser removidos;
- a documentação normativa e de distribuição deve deixar explícito que plugins são software externo e separado.

### Entregas

- Consolidar as Fases 1, 2 e 3 num commit candidato e atualizar a versão para `0.4.3`.
- Executar a suíte completa, o empacotamento NSIS e as verificações de migração.
- Publicar `v0.4.3` como release estável normal, não como draft ou pré-release.
- Gerar instalador, versão portátil, `latest.yml`, `.blockmap` e manifesto SHA-256 no mesmo workflow.
- Usar a instalação `0.4.2` já preparada para verificar, baixar e instalar a `0.4.3` pelo dashboard.
- Registrar resultado, logs seguros, tempo aproximado, comportamento de recuperação e preservação dos dados locais.

### Critérios de aceite

- [x] Titular autorizou explicitamente o início da release `v0.4.3` em 2026-08-27.
- [x] Gate de separação núcleo/plugins aprovado pela suíte e por execução isolada com `0` plugins e `0` problemas de descoberta.
- [x] `npm run check` aprovado no commit exato `4e21983` da tag.
- [x] Release publicada como estável e reconhecida pelo canal `latest`.
- [x] Instalador, portátil, `latest.yml`, `.blockmap` e SHA-256 foram produzidos no mesmo build local e estão disponíveis publicamente.
- [x] Aplicativo instalado na `0.4.2` identifica a `0.4.3` sem configuração manual.
- [x] Download mostra progresso e a ação “Reiniciar e atualizar” conclui a instalação.
- [x] Banco, Projetos, Métodos, plugins, conexões, perfis e credenciais permanecem disponíveis após a atualização.
- [x] Falhas simuladas de manifesto, integridade e rede apresentam mensagem segura e permitem nova tentativa nos testes do updater.
- [x] Critérios operacionais pendentes da Fase 1 foram reconciliados e marcados com evidências.

### Estado da implementação

- As integrações diretas com YouTube, OpenAI e Anthropic foram removidas do núcleo; fornecedores passam a existir somente por plugins externos.
- O runner não descobre mais `plugins/bundled`, não concede confiança especial por origem e aplica a mesma validação, consentimento e sandbox a todos os plugins.
- O pacote desktop deixou de incluir plugins ou exemplos e não os copia para a máquina do usuário.
- A criação de Canal passou a ser local e manual; recursos de fornecedor podem ser adicionados posteriormente por plugin sem alterar o domínio.
- `npm run check` completo passou em 2026-08-27 após a separação.
- Uma API isolada, iniciada com diretórios de dados e plugins vazios, retornou `0` plugins, `0` problemas de descoberta e manteve o endpoint de Canais operacional.
- O preview e a API principal foram restaurados em `127.0.0.1:8080` e `127.0.0.1:8787`.
- A versão foi atualizada para `0.4.3`, consolidada no commit `4e21983`, enviada à `main` e marcada pela tag anotada `v0.4.3`.
- O GitHub Actions recusou o job antes de iniciar qualquer etapa devido a uma pendência de cobrança contestada pelo titular. A publicação não ficou dependente dessa pendência: o build foi concluído localmente com a mesma configuração e os artefatos foram enviados diretamente pela API oficial do GitHub.
- A release pública `v0.4.3` está estável, não é draft nem pre-release e é a resposta atual de `/releases/latest`; o instalador público responde com o tamanho esperado de `133120251` bytes.
- O pacote final foi inspecionado e contém `0` diretórios de plugins incluídos. Os executáveis permanecem sem assinatura Authenticode comercial, conforme a política já documentada da V0; `latest.yml` contém o SHA-512 exigido pelo updater e a release publica também os SHA-256.
- A validação operacional no aplicativo instalado concluiu a atualização `0.4.2 → 0.4.3` e confirmou a preservação dos dados locais.

## Fase 4 — Hierarquia visual do editor de Métodos

**Objetivo:** tornar o editor atual mais autoexplicativo para quem usa o ContentFlow OS como ferramenta de organização, sem criar outro construtor, outro modo de criação ou qualquer novo conceito de domínio.

### Limites obrigatórios

- Preservar exatamente o mesmo fluxo de edição, os mesmos campos e o mesmo formato salvo do Método.
- Não criar assistente, wizard, modo guiado, abas paralelas, templates automáticos ou etapas adicionais.
- Não alterar os 8 Processos Universais, 4 Blocos Essenciais, 3 Operadores, contratos de inputs/outputs ou regras de execução.
- Não alterar a Biblioteca Estratégica nesta fase.
- Manter a identidade visual simples, moderna e neutra, sem novas famílias de cores ou ornamentação.

### Entregas

- Agrupar visualmente os campos existentes conforme quatro perguntas: o que o bloco faz, quem executa, o que precisa e o que entrega.
- Expor **Adicionar entrada** de forma opcional nos quatro tipos de bloco, sem criar campos por padrão.
- Reduzir o Histórico do Canal em `ESCOLHER` e `CRIAR` a ativar ou desativar e informar somente quantos resultados recentes considerar; schema, origem e proveniência permanecem internos.
- Reforçar a diferença entre prompt/orientação, informações de entrada e resultado da ação com títulos e textos auxiliares curtos.
- Melhorar espaçamento, separação e ordem de leitura do modal existente sem esconder recursos avançados.
- Manter as configurações do plugin no contexto do mesmo bloco e subordinadas ao operador escolhido.
- Validar a leitura do editor em desktop e em largura reduzida.

### Critérios de aceite

- [x] O usuário localiza rapidamente onde registrar o prompt ou orientação do bloco.
- [x] Entradas e entregas possuem hierarquia visual e linguagem distintas.
- [x] `BUSCAR`, `ESCOLHER`, `CRIAR` e `VALIDAR` permitem adicionar contexto de uma entrega anterior sem campo padrão.
- [x] O Histórico do Canal não expõe formato, campos de registro ou seleção técnica de origem; o usuário informa somente a quantidade recente.
- [x] Operador, plugin, capacidade e conexão continuam no mesmo bloco e com o comportamento atual.
- [x] Nenhum campo, modo de criação ou conceito novo foi acrescentado.
- [x] Um Método existente permanece semanticamente idêntico após abrir e salvar sem alterações.
- [x] Layout permanece legível em desktop e largura reduzida.
- [x] Typecheck, suíte de testes e build aprovados.

### Validação realizada em 2026-08-27

- O editor existente foi reorganizado visualmente em quatro perguntas: o que faz, quem executa, o que precisa e o que entrega.
- `BUSCAR`, `CRIAR`, `ESCOLHER` e `VALIDAR` mantiveram seus campos e contratos; os dois últimos receberam somente explicações visuais para suas entregas implícitas.
- Após a revisão do titular, `ESCOLHER` e `VALIDAR` também passaram a expor o mesmo botão opcional **Adicionar entrada** já disponível em `BUSCAR` e `CRIAR`; o Histórico do Canal permanece separado das entradas comuns e aparece somente em `ESCOLHER` e `CRIAR`.
- O Histórico do Canal foi simplificado nos blocos `ESCOLHER` e `CRIAR`. O primeiro consulta escolhas anteriores do mesmo bloco; o segundo consulta os outputs finais anteriores do mesmo Processo. A interface mostra somente ativação e quantidade recente.
- Nenhum handler, tipo de domínio, persistência, serialização, regra de execução ou Biblioteca Estratégica foi alterado.
- A inspeção local confirmou o modal em desktop, `800 px` e `390 px`, sem rolagem horizontal na menor largura.
- `npm run check` completo, incluindo lint, typecheck, testes e builds de cliente e servidor, passou em 2026-08-27.

## Fase 5 — Jornada de contas dos plugins de navegador

**Objetivo:** fazer o usuário conectar contas de navegador sem precisar entender pastas, portas de depuração ou extensões.

### Decisões de produto

- Os plugins atuais usarão Chrome com perfil dedicado e persistente; não exigirão extensão instalada no perfil pessoal do usuário.
- Cada conta/provedor será preparada explicitamente uma vez pelo usuário.
- O ContentFlow criará e localizará automaticamente as pastas dedicadas.
- Login, CAPTCHA, consentimento, reautenticação, cota e bloqueio continuarão visíveis e não serão contornados.
- O Chrome instalado pelo usuário será a opção inicial; empacotar Chromium só será reconsiderado com justificativa de compatibilidade e distribuição.

### Entregas

- Substituir aliases técnicos por uma interface “Adicionar conta”.
- Abrir o provedor correto, orientar login e validar a área autenticada.
- Mostrar conta pronta, requer atenção, cota esgotada, bloqueada ou desconectada.
- Permitir múltiplas contas por provedor e seleção no bloco do Método.
- Documentar onde os perfis vivem e como sair, revogar ou remover uma sessão.
- Manter fallback automático restrito a falhas técnicas transitórias permitidas.
- Se algum plugin futuro realmente exigir extensão, empacotá-la no plugin e carregá-la apenas no navegador dedicado após consentimento explícito.

### Critérios de aceite

- [ ] Usuário não precisa escolher manualmente uma pasta para o caso padrão.
- [ ] Nenhuma extensão é exigida para os plugins atuais.
- [ ] Cada conta é autenticada pelo próprio usuário em janela visível.
- [ ] Conta ativa e origem são verificadas antes de enviar conteúdo.
- [ ] CAPTCHA, login, reautenticação, limite, cota e bloqueio pausam corretamente.
- [ ] Várias contas podem coexistir sem compartilhar silenciosamente cookies ou sessões.
- [ ] Remoção de conta não apaga outputs já produzidos.

## Fase 6 — Lote inteligente de Projetos

**Objetivo:** substituir o lote sequencial por processo por uma única geração estruturada de temas, seguida da criação e execução dos Projetos.

### Fluxo de produto

1. Usuário informa quantidade, contexto e critérios.
2. Escolhe plugin, capability e conexão.
3. O executor recebe um único pedido de geração.
4. Retorna `list` ou `records` estruturados e validados.
5. O ContentFlow apresenta uma revisão editável.
6. Usuário confirma os itens que realmente virarão Projetos.
7. O núcleo materializa um Projeto por item e registra seu Tema oficial.
8. A fila continua os processos seguintes, preferencialmente ponta a ponta.

### Restrições arquiteturais

- O gerador de lote pertence ao Orquestrador, não a um Método normal de vídeo individual.
- Não criar novo Processo Universal, Bloco ou Operador.
- O plugin continua sendo uma capability; o núcleo controla revisão, criação, persistência, IDs, cursor e retomada.
- Projetos só devem ser materializados após validação estrutural e confirmação do usuário.

### Entregas

- Definir schema mínimo dos candidatos de Tema.
- Criar configuração de quantidade, critérios, executor e conexão.
- Implementar uma única invocação com output estruturado.
- Criar tela de revisão, edição, exclusão, reordenação e regeneração.
- Validar quantidade, campos obrigatórios e duplicidade.
- Criar Projetos e promover o Tema de forma idempotente.
- Persistir checkpoints para retomar sem duplicar Projetos.
- Migrar ou retirar o modo atual “Em lote por processo” depois da validação do substituto.

### Critérios de aceite

- [ ] Dez temas podem ser produzidos por uma única invocação compatível.
- [ ] Nenhum Projeto é criado antes da confirmação da lista.
- [ ] Repetir uma requisição após falha não duplica Projetos já materializados.
- [ ] Lista incompleta ou inválida pode ser corrigida ou regenerada.
- [ ] Projetos criados recebem Tema oficial com proveniência rastreável.
- [ ] Continuação ponta a ponta usa o motor linear existente.
- [ ] Parada, falha, retomada e reinício do aplicativo preservam o cursor.
- [ ] O lote sequencial antigo é removido somente depois da equivalência funcional necessária.

## Fase 7 — Estabilização e release V1.0.0

**Objetivo:** consolidar as fases anteriores numa distribuição estável, recuperável e compreensível para alunos.

### Entregas

- Congelar contratos públicos necessários à V1 e registrar política de compatibilidade.
- Executar testes completos do núcleo, plugins oficiais, migrações e distribuição desktop.
- Revisar onboarding inicial, estados vazios, mensagens de erro e recuperação.
- Validar instalação limpa e atualização a partir da última versão V0 distribuída.
- Revisar privacidade, consentimentos, licenças, proveniência e uso de marcas.
- Preparar notas de release, guia rápido e procedimento de backup/recuperação.
- Corrigir documentação que ainda descreva interfaces ou fluxos anteriores.

### Critérios de aceite

- [ ] `npm run check` aprovado no commit candidato.
- [ ] Instalação limpa validada em ambiente Windows suportado.
- [ ] Atualização N-1 → V1 validada sem perda de dados.
- [ ] Migrações de Métodos, credenciais, plugins e filas cobertas por testes.
- [ ] Plugins oficiais essenciais executam casos mínimos reais.
- [ ] Fluxos de Humano, IA e Código validados nos 8 Processos Universais aplicáveis.
- [ ] Backup e recuperação documentados e testados.
- [ ] Nenhum problema crítico ou alto conhecido permanece aberto.
- [ ] Release `1.0.0` publicada com instalador, metadados de atualização e notas completas.

## Registro de decisões

| Data       | Decisão                                                                                                                                      | Impacto                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-26 | Adotar este roadmap como guia operacional até a V1.0.0.                                                                                      | Toda implementação das fases deve atualizar seu estado e critérios.                                                           |
| 2026-08-26 | Priorizar updater antes da reorganização estrutural de Plugins e Métodos.                                                                    | Permite entregar uma melhoria independente e simplifica as releases seguintes.                                                |
| 2026-08-26 | Reduzir a galeria de Plugins a cards quadrados com ícone e nome.                                                                             | Configuração deixa o card e vai para o contexto do Método/conexão.                                                            |
| 2026-08-26 | Configuração funcional e seleção de conta pertencem ao Método; secrets permanecem no cofre do núcleo.                                        | Exige múltiplas conexões nomeadas e referências opacas.                                                                       |
| 2026-08-26 | Plugins de navegador atuais não exigirão extensões; usarão perfis dedicados preparados explicitamente.                                       | A interface deve ocultar detalhes técnicos e guiar o login.                                                                   |
| 2026-08-26 | Substituir o lote sequencial por geração estruturada única seguida de revisão e criação de Projetos.                                         | O novo fluxo pertence ao Orquestrador, não ao Método de vídeo individual.                                                     |
| 2026-08-27 | Conexões são registros locais nomeados e reutilizáveis; o Bloco guarda `connectionId` e a exportação preserva apenas o requisito de conexão. | Renomear não quebra Métodos, secrets não são exportados e importações exigem associação local.                                |
| 2026-08-27 | Branding opcional usa `branding.iconPath` com PNG/WebP local de até 512 KiB.                                                                 | Manifestos API v1 antigos usam fallback; favicon remoto e SVG não entram no contrato inicial.                                 |
| 2026-08-27 | O lote inteligente exige `theme`; `angle`, `promise` e `notes` são opcionais.                                                                | Permite lista mínima e extensível sem transformar o Método em fluxo multivídeo.                                               |
| 2026-08-27 | A V1 usará somente o canal estável `latest` do GitHub Releases.                                                                              | Drafts, prereleases e canais beta não serão oferecidos pelo botão inicial.                                                    |
| 2026-08-27 | Assinatura Authenticode é recomendada para a distribuição pública da V1 e suportada pelo workflow via secrets.                               | O mecanismo pode ser testado sem certificado; a release final deve registrar seu estado.                                      |
| 2026-08-27 | Adiar a primeira validação pública do updater para a Fase 3.5, por meio da release estável `v0.4.3`.                                         | Fases 2 e 3 avançam sem publicar; versão, tag e release dependem de comando explícito do titular.                             |
| 2026-08-27 | Releases serão administradas pela API oficial ou workflow autenticado, não por automação de navegador.                                       | Operações externas ficam auditáveis e reproduzíveis no pipeline do repositório.                                               |
| 2026-08-27 | Cards de plugin mantêm ícone e nome, acrescentando descrição limitada a três linhas.                                                         | A galeria continua compacta em quatro colunas sem deixar a função do plugin ambígua.                                          |
| 2026-08-27 | Ícones de provedores são incorporados como PNG local com origem documentada; o runtime nunca busca favicon remoto.                           | Assets passam por validação de caminho, assinatura e tamanho; ausência ou falha usa fallback.                                 |
| 2026-08-27 | Remoção de plugin exige consulta prévia dos Métodos dependentes e confirmação informada.                                                     | Novas execuções ficam bloqueadas sem apagar outputs históricos já produzidos.                                                 |
| 2026-08-27 | Atualização manual por pasta é atômica, aceita apenas SemVer superior e invalida o consentimento da versão anterior.                         | Falha restaura o pacote anterior; nova versão exige revisão de permissões antes da execução.                                  |
| 2026-08-27 | Favicon público não será tratado como licença automática de redistribuição.                                                                  | A proveniência e o risco de redistribuição continuam documentados para revisão antes das releases.                            |
| 2026-08-27 | O titular decidiu manter os ícones atuais e encerrar a Fase 2 após a validação operacional.                                                  | A proveniência e as diretrizes identificadas permanecem registradas para revisão de release.                                  |
| 2026-08-27 | Núcleo e plugins são produtos absolutamente separados; o ContentFlow OS deve ser útil com zero plugins.                                      | Releases não incluem integrações; todo plugin é externo, removível, consentido e submetido à mesma sandbox.                   |
| 2026-08-27 | A atualização real `0.4.2 → 0.4.3` foi concluída preservando os dados locais.                                                                | Fases 1 e 3.5 foram concluídas; o desenvolvimento avança para o refinamento visual dos Métodos.                               |
| 2026-08-27 | A Fase 4 é exclusivamente um refinamento visual do editor de Métodos existente.                                                              | O layout explicita ação, operador, entradas e entregas sem criar modo guiado, lógica ou conceitos novos.                      |
| 2026-08-27 | Histórico do Canal existe em `ESCOLHER` para escolhas anteriores do mesmo bloco e em `CRIAR` para resultados finais anteriores do Processo.  | O usuário ativa a memória e informa apenas a quantidade; schema, elegibilidade, origem técnica e proveniência ficam internas. |

## Pendências de decisão do titular

Estas decisões não bloqueiam a criação do roadmap, mas devem ser resolvidas antes da fase correspondente:

- Aquisição e configuração do certificado Authenticode antes da release pública V1.0.0.

## Indicador geral de progresso

O percentual abaixo mede fases concluídas, não quantidade de código. Deve ser atualizado somente quando todos os critérios obrigatórios da fase estiverem cumpridos.

- Fases concluídas: `6 / 9`
- Progresso operacional: `66,7%`
- Fase concluída mais recente: **Fase 4 — Hierarquia visual do editor de Métodos**.
- Próxima fase: **Fase 5 — Jornada de contas dos plugins de navegador**.
