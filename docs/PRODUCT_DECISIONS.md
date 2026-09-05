# Registro de decisões de produto do ContentFlow

Este documento separa correções técnicas objetivas de comportamentos que dependem da intenção do produto. O alvo principal é o aplicativo Electron local, auto-hospedado e usado por uma pessoa. Preview web, multi-tenant, alta disponibilidade, cluster, sharding e escalabilidade horizontal estão fora do escopo.

## 1. O que pode ser decidido tecnicamente sem mudar o produto

Esses itens podem ser implementados e refinados por boas práticas, desde que não alterem uma regra funcional já documentada:

- manter lint, TypeScript estrito, build, testes de domínio, integração, navegador e Electron verdes;
- corrigir exceções não tratadas, estados impossíveis, promessas órfãs e erros silenciosos;
- fechar processos, sockets, sessões CDP, handles, listeners, timers e arquivos em sucesso, erro e cancelamento;
- impedir deadlocks, starvation, duplo clique, respostas tardias e sobrescrita de estado mais novo;
- aplicar `maxConcurrency`, timeout, cancelamento e idempotência já declarados pelos plugins;
- serializar comandos que operam a mesma aba ou o mesmo perfil dedicado;
- permitir paralelismo somente quando os recursos declarados são independentes;
- persistir antes de produzir efeitos externos e reconciliar depois de falha incerta;
- rejeitar origem, aba, perfil, plugin, protocolo ou comando incompatível;
- impedir que comandos expirados executem efeitos atrasados;
- garantir que automação em background não use foco, teclado ou mouse do Windows;
- tornar seletores mais resilientes sem escolher controles ambíguos;
- validar o efeito observável depois de preencher, clicar, enviar ou baixar;
- pausar de forma segura quando a interface externa mudar;
- redigir logs e excluir secrets, prompts privados completos, cookies, tokens e caminhos sensíveis;
- validar MIME, tamanho, extensão, traversal, symlink, SSRF e redirects;
- usar transações para alterações que precisam ser atômicas;
- tornar migrações de banco idempotentes, testadas e recuperáveis;
- preservar snapshots e entregas concluídas durante retry, retomada ou reinício;
- impedir duplicação de projeto, job, artifact, entrega ou cobrança por repetição de request;
- manter a API e os servidores visuais presos a `127.0.0.1`;
- manter Electron com `contextIsolation`, sandbox e `nodeIntegration` desativado;
- drenar ou ignorar corretamente stdout/stderr de processos filhos para evitar bloqueio;
- detectar morte inesperada da API local e apresentar uma falha clara;
- evitar I/O síncrono repetitivo no processo principal do Electron;
- evitar flash de janela vazia e mostrar a interface somente quando estiver pronta;
- reduzir recomputações, renders, polling e requests duplicados medidos em profiling;
- dividir bundle apenas quando a medição mostrar benefício para inicialização ou navegação;
- atualizar dependências vulneráveis quando a correção for compatível;
- preservar arquivos e dados do usuário durante atualização ou reinstalação;
- testar instalador, portátil, runtime Node privado e dependências nativas;
- manter testes isolados dos dados e credenciais reais;
- impedir publicação se check, E2E web isolado ou E2E Electron falhar;
- melhorar acessibilidade, foco, teclado, estados de loading e mensagens de erro sem mudar a regra de negócio;
- documentar comportamento já implementado e remover divergências acidentais entre código e documentação.

## 2. Regras que precisam de decisão do proprietário

As recomendações abaixo são sugestões, não decisões aplicadas automaticamente.

### P0 — execução e concorrência

| ID | Decisão necessária | Opções principais | Recomendação para Electron local |
| --- | --- | --- | --- |
| EXEC-01 | O que ocorre ao iniciar o Projeto B enquanto o Projeto A executa automaticamente? | Bloquear; colocar B em fila; executar em paralelo. | Colocar em fila quando disputarem o mesmo recurso; permitir paralelo somente com recursos independentes. |
| EXEC-02 | Qual é o escopo da exclusividade? | Aplicativo inteiro; canal; plugin; conta/perfil; capability. | Conta/perfil de navegador para plugins web; capability para APIs; nunca um bloqueio global desnecessário. |
| EXEC-03 | Uma execução manual pode começar enquanto uma fila do Orquestrador está ativa? | Nunca; sempre; somente fora dos projetos da fila; entra na mesma fila. | Permitir navegação e edição, mas enfileirar qualquer execução que dispute recursos da fila. |
| EXEC-04 | `awaiting_human` ocupa a vez de execução? | Bloqueia tudo; bloqueia apenas a fila atual; libera recursos e permite outros projetos. | Liberar worker/perfil, mas manter o cursor da fila atual parado. Outros projetos independentes podem avançar. |
| EXEC-05 | Uma execução com erro impede novos projetos? | Impede globalmente; impede no canal; não impede; impede apenas o mesmo perfil. | Não impedir projetos independentes; impedir apenas repetição conflitante do mesmo job/perfil. |
| EXEC-06 | Qual trabalho tem prioridade? | FIFO; manual antes do Orquestrador; Orquestrador antes do manual; prioridade configurável. | FIFO por padrão, com ação explícita de “executar agora” somente se não interromper efeito em andamento. |
| EXEC-07 | O segundo clique em Iniciar faz o quê? | Ignora; abre o job existente; reinicia; cria outra tentativa. | Abrir/mostrar a execução existente. Nunca criar efeito duplicado. |
| EXEC-08 | Ao concluir um Processo Universal, o seguinte começa automaticamente? | Sempre; nunca; configurável por projeto/método; somente no Orquestrador. | Somente quando o usuário iniciou “produção contínua” ou uma fila; execução isolada termina no processo escolhido. |
| EXEC-09 | Alterar um Método afeta projetos em andamento? | Imediatamente; próxima etapa; somente novos projetos. | Somente novos projetos. O snapshot iniciado permanece imutável. |
| EXEC-10 | Parar uma fila cancela o efeito externo atual? | Tenta cancelar; deixa concluir e ignora; pergunta em cada caso. | Solicitar cancelamento quando suportado; preservar e reconciliar efeito já aceito pelo provedor. |
| EXEC-11 | Fechar o Electron com trabalho em andamento faz o quê? | Bloqueia fechamento; pede confirmação; fecha e retoma; cancela tudo. | Pedir confirmação e oferecer “continuar em segundo plano” apenas se houver suporte real; caso contrário persistir e retomar. |
| EXEC-12 | Após reiniciar o aplicativo, jobs são retomados automaticamente? | Todos; nenhum; somente jobs comprovadamente idempotentes; perguntar. | Retomar consultas de jobs existentes; não repetir `start` de efeito incerto sem reconciliação. |
| EXEC-13 | O lote cria projetos antes de executar ou progressivamente? | Todos antes; um por vez; candidatos antes e materialização após confirmação. | Manter a regra atual: candidatos revisados, depois todos materializados atomicamente sem duplicação. |
| EXEC-14 | Pode existir mais de uma fila ativa? | Uma global; uma por canal; várias por recurso. | Uma por canal na UX, com scheduler técnico compartilhado por recurso. |
| EXEC-15 | Limite de projetos pendentes na fila local. | Sem limite; 50; outro valor. | 50 é seguro como proteção de erro; tornar maior somente se houver caso real. |
| EXEC-16 | Um único projeto pode executar dois processos ao mesmo tempo? | Sim; não; apenas processos sem dependência. | Não por padrão, porque o Método é linear e outputs anteriores podem ser dependências. |
| EXEC-17 | Usuário pode reordenar uma fila já iniciada? | Nunca; itens ainda não iniciados; qualquer item. | Permitir apenas itens ainda não iniciados, preservando o item atual e dependências. |
| EXEC-18 | Usuário pode remover um item da fila? | Não; somente não iniciado; também o atual. | Remover somente não iniciado; o atual exige ação separada de cancelar/parar. |

### P0 — controle de navegador e contas

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| BROWSER-01 | Estado normal da janela dedicada. | Visível; minimizada; fechada após cada job. | Minimizada/background durante execução; visível para login, CAPTCHA, consentimento, diagnóstico e teste manual de bloco no Editor de Métodos. |
| BROWSER-02 | Manter Chrome aberto após o job. | Sempre; nunca; preferência global; por conexão. | Preferência por conexão, padrão aberto para reduzir custo de inicialização e preservar sessão. |
| BROWSER-03 | Um perfil pode ser compartilhado entre canais? | Sim; não; configurável. | Sim, se a conexão for explicitamente associada aos Métodos; scheduler serializa o perfil. |
| BROWSER-04 | Perfis diferentes podem executar em paralelo? | Sim; não. | Sim, desde que usem portas/pastas separadas e o computador suporte. |
| BROWSER-05 | Em quais falhas trocar automaticamente para a próxima conta? | Qualquer erro; somente técnico temporário; nunca. | Precisa de decisão explícita. Troca em autenticação/cota pode esconder um problema importante e consumir outra conta. |
| BROWSER-06 | Após clique de envio com resultado incerto, repetir automaticamente? | Sim; não; reconciliar primeiro. | Reconciliar página/job/rede primeiro; nunca repetir cegamente. |
| BROWSER-07 | Quando a UI do provedor muda. | Tentar seletores genéricos; abrir diagnóstico; falhar fechado. | Falhar fechado e oferecer diagnóstico visível. Não clicar em alvo ambíguo. |
| BROWSER-08 | Sessão expirada ou logout. | Tentar outra conta; abrir login; pausar. | Pausar e pedir reautenticação da mesma conexão; fallback depende da decisão BROWSER-05. |
| BROWSER-09 | CAPTCHA ou anti-bot. | Pausar; trocar conta; cancelar. | Pausar e mostrar a janela. Nunca contornar automaticamente. |
| BROWSER-10 | Confirmação de direitos de mídia. | Sempre manual; lembrar por sessão; cancelar. | Sempre manual, pois é uma declaração do usuário ao provedor. |
| BROWSER-11 | Cota ou plano insuficiente. | Falhar; trocar conta; esperar reset. | Mostrar causa e opções; qualquer troca automática depende de BROWSER-05. |
| BROWSER-12 | Timeout padrão de UI. | Curto e falha; longo; adaptativo por fase. | Adaptativo: segundos para controles, minutos para upload e limite declarado para geração. |
| BROWSER-13 | O que fazer se o usuário mexer na aba durante automação? | Continuar; pausar; detectar apenas troca de origem/projeto. | Pausar ao detectar mudança de origem, projeto, conta ou estado esperado. |
| BROWSER-14 | Após crash do Chrome. | Reiniciar e repetir; reiniciar e reconciliar; exigir ação humana. | Reiniciar perfil, reconciliar o job e só repetir quando comprovadamente não enviado. |
| BROWSER-15 | Bridge ausente/desatualizada. | Instalar automaticamente; instruir; abrir tela de diagnóstico. | Falhar com diagnóstico e instrução. Instalação continua manual conforme arquitetura atual. |
| BROWSER-16 | Atualização da Bridge em perfis já preparados. | Manual; aviso; atualização empacotada automática. | Avisar incompatibilidade e orientar recarga manual enquanto a instalação for “Carregar sem compactação”. |
| BROWSER-17 | Seleção da aba quando há dois projetos do provedor abertos. | Mais recente; ativa; URL exata; perguntar. | URL exata vinculada ao job; se não houver correspondência única, pausar. |
| BROWSER-18 | Diagnóstico pode abrir a janela automaticamente após falha? | Sim; não; preferência. | Não durante execução comum; oferecer botão “Abrir diagnóstico”. |
| BROWSER-19 | Captura de evidências de falha. | Screenshot; árvore DOM redigida; somente códigos/contagens. | Códigos, URL sem query sensível, contagens e estados; screenshot somente por ação explícita. |
| BROWSER-20 | O usuário pode reutilizar o Chrome pessoal em vez de perfil dedicado? | Sim; não; modo avançado. | Não como padrão. Se existir, deve ser opção avançada com aviso forte e seleção explícita. |

### P0 — falhas, retry e resultados parciais

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| FAILURE-01 | Quantas tentativas técnicas automáticas? | 0; 1; 2; configurável. | Duas para falhas retryable, com backoff; nenhuma para efeito externo incerto. |
| FAILURE-02 | Retry editorial conta junto com retry técnico? | Sim; não. | Não. São conceitos diferentes e o código atual já os separa. |
| FAILURE-03 | Falha de um bloco encerra o projeto? | Sim; pausa processo; pausa fila. | Pausar processo e fila associada; preservar demais projetos e entregas. |
| FAILURE-04 | Output parcial aparece ao usuário? | Imediatamente; somente ao falhar; nunca. | Mostrar progresso e entregas persistidas, marcadas claramente como parciais. |
| FAILURE-05 | Output parcial pode alimentar bloco seguinte? | Sim; não; somente após aprovação. | Não até a entrega estar concluída, salvo contrato explícito futuro. |
| FAILURE-06 | Quando um retry invalida outputs posteriores? | Sempre; somente dependentes; perguntar. | Invalidar o trecho linear dependente, preservando histórico e provenance. |
| FAILURE-07 | Erro recuperável some automaticamente após correção? | Sim; exige botão Retomar. | Exigir Retomar quando houve intervenção humana; automático quando foi apenas backoff técnico. |
| FAILURE-08 | Estado de erro antigo permanece no histórico visual? | Sim; não; somente logs. | Manter tentativas anteriores recolhidas para auditoria. |
| FAILURE-09 | Se o plugin devolve formato inválido. | Retry; falha imediata; aceitar parcialmente. | Uma repetição somente se retryable e sem efeito incerto; nunca aceitar contrato inválido. |
| FAILURE-10 | Se o aplicativo perde energia durante persistência. | Recuperar último snapshot; rollback; marcar corrompido. | Transação/rollback e retomada do último estado integral confirmado. |

### P1 — ações humanas, validação e outputs oficiais

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| HUMAN-01 | Pendência humana bloqueia somente a fila ou todo o canal? | Fila; canal; aplicativo. | Somente a fila que depende dela. |
| HUMAN-02 | Prazo para pendência humana. | Sem prazo; lembrete; cancelamento automático. | Sem cancelamento automático; lembretes configuráveis. |
| HUMAN-03 | Reprovação sem feedback é permitida? | Sim; não; configurável. | Exigir feedback quando o Método manda refazer; opcional quando apenas pausa. |
| HUMAN-04 | Aprovação pode ser desfeita? | Nunca; até próximo bloco; sempre criando nova tentativa. | Criar nova tentativa e invalidar dependentes; nunca reescrever histórico. |
| OUTPUT-01 | Usuário pode substituir manualmente output oficial gerado? | Sim; não; somente com nova versão. | Sim, como nova revisão com autoria e provenance humanas. |
| OUTPUT-02 | Mais de um candidato compatível com output oficial. | Primeiro; último; escolher; regra do Método. | Exigir seleção/validação explícita se não houver um vencedor inequívoco. |
| OUTPUT-03 | Arquivo externo removido depois de importado. | Quebrar referência; copiar para armazenamento; tentar relocalizar. | Copiar/promover para armazenamento controlado antes de concluir entrega. |
| OUTPUT-04 | Duplicatas de mídia. | Aceitar; deduplicar por hash; deduplicar por URL. | Deduplicar por hash dentro da mesma tentativa, preservando provenance. |
| OUTPUT-05 | Um output manual pode ignorar o tipo esperado? | Sim; não. | Não. O contrato universal continua obrigatório. |
| OUTPUT-06 | Quando o output oficial fica “final”. | Ao criar; ao validar; ao terminar processo. | Depois de validação quando houver bloco VALIDAR; caso contrário ao concluir o processo. |

### P1 — dados locais, backup e retenção

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| DATA-01 | Retenção de tentativas, jobs e logs. | Para sempre; por dias; limite de tamanho. | Entregas finais permanentes; logs/jobs técnicos por tempo e limite de espaço configuráveis. |
| DATA-02 | Exclusão de projeto remove artifacts imediatamente? | Sim; lixeira; manter órfãos temporariamente. | Lixeira/retensão curta para recuperação, se você quiser recuperação; hoje a regra precisa ser definida. |
| DATA-03 | Backup automático. | Nenhum; cópia local rotativa; pasta escolhida. | Cópia local rotativa opcional em pasta escolhida, nunca nuvem implícita. |
| DATA-04 | Frequência do backup. | Ao fechar; diário; antes de migração; manual. | Antes de migração e diariamente quando houve mudança. |
| DATA-05 | Restauração substitui ou mescla. | Substitui; mescla; usuário escolhe. | Restaurar como nova cópia/preview e só substituir após confirmação. |
| DATA-06 | Limite de armazenamento local por artifacts. | Nenhum; alerta; limpeza automática. | Alerta e relatório; nunca apagar entrega final automaticamente. |
| DATA-07 | Canal excluído. | Cascata imediata; lixeira; bloquear se houver jobs. | Bloquear jobs ativos e usar lixeira se recuperação for desejada. |
| DATA-08 | Banco corrompido. | Reset automático; abrir backup; modo somente leitura. | Nunca resetar automaticamente; preservar arquivo, abrir recuperação/backup. |
| DATA-09 | Histórico do Canal retém quantos projetos? | Janela por bloco; global; todos. | Consulta configurável de 1–100 conforme arquitetura; dados-base acompanham retenção dos projetos. |
| DATA-10 | Exportação inclui artifacts. | Somente JSON; pacote completo; opções. | Oferecer ambos: Método portátil sem dados locais e backup completo separado. |

### P1 — ciclo de vida de plugins

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| PLUGIN-01 | Desativar plugin com job ativo. | Bloquear; cancelar; deixar concluir. | Bloquear e oferecer cancelar explicitamente. |
| PLUGIN-02 | Revogar conexão com job ativo. | Bloquear; cancelar; deixar concluir. | Bloquear até cancelar/concluir; não trocar credencial no meio. |
| PLUGIN-03 | Atualização de plugin afeta snapshot em andamento. | Sim; não; perguntar. | Não. Execução usa versão/hash iniciado; novo job usa versão nova. |
| PLUGIN-04 | Plugin ausente em Método importado. | Instalar; bloquear; substituir. | Bloquear com requisito visível; nenhuma substituição silenciosa. |
| PLUGIN-05 | Permissão nova em atualização. | Herdar consentimento; pedir novamente; bloquear atualização. | Pedir novo consentimento antes de executar. |
| PLUGIN-06 | Plugin de desenvolvimento alterado durante job. | Hot reload; congelar hash; cancelar. | Congelar hash/snapshot da invocação; nova alteração vale no próximo job. |
| PLUGIN-07 | Versão incompatível disponível. | Atualizar mesmo assim; manter; oferecer migração. | Manter versão compatível e exigir migração explícita. |
| PLUGIN-08 | Plugin falha repetidamente. | Continuar; desativar; marcar atenção. | Marcar atenção e interromper automação daquele plugin após limite técnico, sem desinstalar. |

### P1 — interface, notificações e operação em background

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| UX-01 | Mostrar uma central global de execuções além das pendências humanas? | Sim; não. | Sim: em execução, enfileirado, aguardando humano, falhou e concluído. |
| UX-02 | Notificações nativas do Windows. | Nunca; sempre; somente atenção/conclusão. | Somente intervenção humana, falha e conclusão longa; configurável. |
| UX-03 | Som ou destaque de tarefa. | Nunca; sempre; preferência. | Desativado por padrão. |
| UX-04 | Fechar janela minimiza para tray? | Sim; não; preferência. | Precisa ser definido junto com EXEC-11; não prometer background se a API for encerrada. |
| UX-05 | Mostrar posição estimada na fila. | Posição; tempo; nenhum. | Mostrar posição e recurso ocupado; tempo apenas se houver medição confiável. |
| UX-06 | Mensagem para conflito de execução. | Erro; diálogo; inclusão automática na fila. | Mostrar que foi enfileirado e permitir cancelar/reordenar conforme regras escolhidas. |
| UX-07 | Exibir detalhes técnicos. | Sempre; nunca; expansível. | Resumo humano e seção técnica expansível, com logs redigidos. |
| UX-08 | Estado “Preparando execução” pode durar quanto sem explicação? | Indefinido; limite fixo; fases visíveis. | Mostrar fases e transformar silêncio prolongado em diagnóstico recuperável. |

### P2 — atualização e distribuição local

| ID | Decisão necessária | Opções principais | Recomendação |
| --- | --- | --- | --- |
| UPDATE-01 | Verificação de atualização. | Automática; manual; ambas. | Verificação automática silenciosa, download e instalação somente por ação do usuário. |
| UPDATE-02 | Atualização obrigatória. | Nunca; somente quebra de segurança; sempre. | Nunca, salvo incompatibilidade de dados/protocolo realmente bloqueante e claramente explicada. |
| UPDATE-03 | Rollback. | Não; instalador anterior; backup integrado. | Preservar dados e oferecer link/artefato anterior; migrações precisam ser retrocompatíveis ou ter backup. |
| UPDATE-04 | Portable e instalador compartilham dados. | Sim; não; configurável. | Manter `%APPDATA%` como padrão compartilhado; modo realmente portátil exigiria uma decisão separada. |
| UPDATE-05 | Bridge e plugins atualizam junto com o núcleo. | Sim; não; opcional. | Não junto do núcleo; avisar compatibilidade e atualizar separadamente. |

## 3. Decisões já estabelecidas na arquitetura atual

Estas não precisam ser redefinidas, salvo se o proprietário quiser mudar explicitamente a visão do produto:

- existem exatamente 8 Processos Universais, 4 Blocos Essenciais e 3 Operadores;
- núcleo e plugins são produtos separados;
- o núcleo funciona sem plugins;
- secrets não entram em Método, SQLite, snapshot, exportação ou logs;
- o Método iniciado é preservado como snapshot da execução;
- blocos do Método permanecem lineares;
- outputs e artifacts mantêm provenance e identidade por tentativa;
- uma reprovação pode pausar ou refazer o trecho linear configurado;
- pendências humanas derivam do estado real da execução;
- a fila do Orquestrador executa um item por vez;
- Stop preserva projetos já criados e cancela a execução atual;
- projeto pertencente a fila ativa não pode ser excluído antes de parar a fila;
- plugins de navegador usam perfil dedicado e Bridge externa;
- automação rotineira deve funcionar minimizada, sem foco, teclado ou mouse do Windows;
- login, reautenticação, CAPTCHA, consentimento e diagnóstico podem exigir superfície visível;
- a distribuição Electron usa runtime Node privado e dados substituíveis separados em `%APPDATA%`;
- build, testes e validação não autorizam versão, tag ou release.

## 4. Divergências que exigem confirmação, não correção silenciosa

1. A arquitetura afirma que APIs de YouTube pertencem a plugins, mas o núcleo consulta dados públicos de canal diretamente. É preciso decidir se essa consulta básica é uma exceção oficial do domínio ou se deve virar plugin.
2. A arquitetura do repositório permite fallback para outra conta em qualquer erro, inclusive autenticação, cota e bloqueio; a orientação conservadora de segurança recomenda não trocar identidade automaticamente nesses casos. BROWSER-05 precisa definir a regra oficial.
3. O Orquestrador é serial, mas execuções iniciadas manualmente em projetos diferentes ainda precisam de uma política explícita. EXEC-01 a EXEC-06 definem essa experiência.
4. O Electron encerra a API ao fechar a janela. Se o produto deve continuar produzindo em background, EXEC-11 e UX-04 exigem tray/processo residente e uma regra clara de encerramento.

## 5. Ordem sugerida para responder

Para reduzir retrabalho, decidir nesta ordem:

1. EXEC-01 a EXEC-06: concorrência, fila e prioridade.
2. BROWSER-01 a BROWSER-18: contas, fallback, intervenção e retomada.
3. EXEC-08 a EXEC-12 e FAILURE-01 a FAILURE-10: continuidade e falhas.
4. HUMAN-01 a OUTPUT-06: revisão e outputs oficiais.
5. DATA-01 a DATA-10: retenção, exclusão e backup.
6. PLUGIN-01 a PLUGIN-08: ciclo de vida.
7. UX-01 a UPDATE-05: experiência desktop e distribuição.

As respostas podem ser registradas usando apenas os IDs, por exemplo: `EXEC-01 = fila; EXEC-02 = perfil; BROWSER-05 = somente falhas técnicas temporárias`.
