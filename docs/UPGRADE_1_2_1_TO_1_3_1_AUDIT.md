# Impacto prático da atualização 1.2.1 → possível 1.3.1

Investigação de 01/10/2026. Base publicada: tag `v1.2.1`, commit `8d735836dc8a23ef1dd47d7364e772ec338bba4b`. Código candidato: `76d9c9eff22de32aad5bb88b592f94f1deff7458`. A versão no checkout ainda é 1.2.1; 1.3.1 é uma hipótese de publicação, não um artefato ensaiado.

## Conclusão

**O estado atual não oferece uma transição orientada para quem já tem dados e plugins da 1.2.1.** O problema principal, considerando usuários que ainda estão experimentando, é a primeira experiência: dados presentes podem ficar invisíveis, a mensagem pode indicar a causa errada, e o caminho habitual de atualização de plugins deixa de alcançar os plugins antigos.

Não foi encontrada exclusão geral dos canais no ensaio. Foi reproduzida uma falha de carregamento da interface com dados preservados no SQLite. Portanto, “meus canais sumiram” pode significar incompatibilidade durante o carregamento, sem que os canais tenham sido apagados. Isso é compatível com o relato do criador, mas não determina retrospectivamente a causa exata daquele episódio.

É possível migrar representações persistidas sem recolocar contratos antigos no runtime: o migrador explícito já resolveu o cenário manual simples ensaiado. O trabalho pendente é transformar essa capacidade em um caminho acessível ao usuário, coordenado com a atualização dos plugins e com diagnóstico de casos ambíguos.

## Contexto do público

- Ainda não há produção real dependente dessa atualização, segundo o criador.
- Há canais, projetos e Métodos de teste que precisam ser encontrados e compreendidos.
- Os plugins oficiais são relevantes, mas também existem plugins criados pelos usuários.
- Aceitar ajustes e erros em uma versão diferente não significa aceitar uma aplicação vazia ou exigir acesso ao código para recuperar os testes.

## O que foi comparado e executado

1. Comparação do código da tag publicada com o checkout atual: 521 arquivos alterados, 70.437 inserções e 17.242 remoções. Esse volume inclui documentação e testes; não mede sozinho o risco.
2. Consulta da release pública pela API do GitHub. A 1.2.1 foi publicada em 25/09/2026. Suas notas anunciavam leitura de Métodos e manifestos anteriores e distribuição separada dos plugins.
3. Download do pacote público `ContentFlow-Plugin-text-file-builder.zip`: SHA-256 `8763a4373c6b4ca03b7547d98349a0bd7ccae5169ccef1de39478a2ac7484606`, igual ao digest informado pela API. O manifesto publicado é API 1, versão 1.0.0.
4. Extração isolada da tag, usando as dependências disponíveis no checkout atual. O servidor antigo criou um canal com oito Métodos manuais, três projetos, uma execução aguardando pessoa e outra concluída. O servidor atual abriu esse mesmo diretório de dados.
5. Exercício dos endpoints de canais, projetos, execuções, deliveries, comandos e atualizações de plugins antes/depois.
6. Reprodução da primeira abertura no navegador com a UI atual. Depois, repetição com a cópia explicitamente migrada.
7. Ensaio separado de migração estrutural com dois perfis homônimos pertencentes a plugins diferentes, arquivos sentinela, um upload e um job antigo pendente.
8. Execução de sete arquivos de testes focais: **27 testes passaram**, incluindo migrações, interrupção de migração, resolução de perfis, fixture persistida e conversão v3.

Tudo ocorreu em diretórios temporários com conteúdo sintético. Nenhuma conta, cookie, credencial ou instalação real foi usada ou alterada. Não foi executado o instalador antigo seguido de um instalador 1.3.1; esse último ainda não existe. Dependências atuais e servidores de desenvolvimento não equivalem ao ambiente exato do binário publicado.

Fontes públicas: [release 1.2.1](https://github.com/andremjr/contentflow/releases/tag/v1.2.1) e [API da release](https://api.github.com/repos/andremjr/contentflow/releases/tags/v1.2.1).

## Resultado por situação do usuário

| Situação | Efeito observado ou previsto | Evidência e limite |
| --- | --- | --- |
| Abre a nova aplicação com um Método antigo | Nenhum canal aparece; carregamento permanece pendente e surge mensagem de conexão | Reproduzido na UI atual, com API funcionando e canal no banco |
| Tenta iniciar um Processo com Método antigo | “Configure o Método antes de executar” | HTTP 409 no ensaio |
| Tenta concluir uma etapa humana antiga pendente | Erro técnico sobre `cardinality` | HTTP 409 no ensaio; não significa que todas as retomadas falharão da mesma maneira |
| Tem entregas antigas concluídas | A entrega continua recuperável pela API no caso simples | Uma delivery preservada; visualização geral é afetada pela falha global de carregamento |
| Tem plugin oficial API 1 instalado | Plugin vai para os problemas de descoberta e deixa de aparecer como plugin utilizável | Reproduzido com pacote/modelo da 1.2.1 |
| Espera a bolinha azul desse plugin | A atualização deixa de ser listada | Catálogo de teste continha versão superior; lista atual retornou vazia |
| Tenta atualizar diretamente o plugin rejeitado | “Plugin não encontrado” | HTTP 404 no endpoint de catálogo |
| Atualiza o plugin antes do aplicativo antigo | A 1.2.1 rejeita o manifesto API 2 | Validação direta do contrato antigo com manifesto atual |
| Tem plugin próprio API 1 | Precisa adequar manifesto, portas, payloads e respostas à API 2 | Mesmo validador, sem exceção por autoria |
| Tem perfis de navegador antigos | Recebem identidades globais distintas; pastas antigas são referenciadas | Dois perfis homônimos preservados, sem fusão; não foi ensaiado login real |
| Tem job de plugin antigo pendente | Pode ser abandonado por plugin indisponível ou versão trocada | Job sintético foi abandonado com mensagem de plugin removido |
| Usa o portátil | Troca/baixa distribuição manualmente | Updater indica distribuição sem atualização interna suportada |
| Quer voltar à 1.2.1 | Reinstalar apenas o executável não recompõe contratos/plugins antigos | Inspeção dos contratos; rollback completo do instalador não ensaiado |

## A primeira abertura: onde os canais ficam invisíveis

A cadeia confirmada é:

`/api/state` responde → `applyState()` normaliza todos os canais → um output antigo não possui `shape` → apresentação acessa `shape.kind` → exceção antes de gravar os canais no store → banco da UI permanece sem carregamento concluído.

Código envolvido:

- `src/lib/store.ts`: `normalizeChannel()`, `applyState()` e `refreshState()`;
- `src/lib/human-workflow.ts`: `normalizeActionBlock()`;
- `src/lib/presentation.ts`: `getCompatiblePresentationRenderers()`.

Uma incompatibilidade em um canal pode impedir a apresentação de todos os canais daquele estado. O tratamento de erro de `refreshState()` apresenta **“Sem conexão com o serviço local. Seus dados salvos estão preservados; tentando reconectar…”**, mesmo quando a resposta HTTP foi bem-sucedida. Na reprodução, o dashboard também exibiu **“Carregando seus canais...”**. Esperar ou reiniciar não converte a representação antiga.

Após migração explícita, o store aceitou o estado; no navegador, o canal `Synthetic upgrade` apareceu no menu e no dashboard, sem erros capturados. O cenário manual novo iniciou, a etapa pendente pôde ser concluída e a entrega histórica recebeu seu shape canônico sem perder o conteúdo.

**Implicação:** a orientação de atualização precisa distinguir falha do serviço, migração necessária, dados em outro diretório e instalação realmente vazia. Hoje essa distinção não é comunicada adequadamente.

## A bolinha azul: o fluxo existe, mas a troca de contrato o interrompe

O fluxo habitual está implementado:

1. Ao abrir Plugins, a interface consulta `/api/plugins` e `/api/plugins/updates`.
2. O servidor lê por padrão `releases/latest/download/ContentFlow-Plugin-Catalog.json`; mantém cache de cinco minutos e permite atualização forçada.
3. Para cada plugin **instalado e registrado com sucesso**, compara ID e versão do manifesto com a versão do catálogo.
4. Uma versão maior faz aparecer o indicador e a ação de atualização. Trocar conteúdo/hash mantendo a versão não basta.
5. O clique baixa o ZIP, confere tamanho e SHA-256, extrai e valida, substitui a pasta por staging e restaura a anterior se a troca falhar.
6. Uma atualização bem-sucedida exige revisar permissões e reativar o plugin: consentimento inclui versão, permissões e hosts. O backup temporário do pacote anterior é removido após sucesso.

Plugins vinculados por pasta de desenvolvimento não recebem atualização pelo catálogo: usam a própria pasta. Configurações de Blocos/Métodos, conexões e perfis não são convertidas pelo simples ato de substituir o pacote.

O obstáculo específico é que `server/plugin-validation.ts` exige `apiVersion: "2"`. `server/plugin-runner.ts` coloca o pacote API 1 em `issues`, sem registrá-lo. `/api/plugins/updates` percorre somente os registrados, e `/update-from-catalog` exige encontrar esse registro. O usuário fica sem o cartão/ação habitual que faria a atualização.

O ensaio usou um catálogo local com versão 9.0.0 para provar que não era falta de versão nova na rede:

- núcleo 1.2.1: um plugin, zero problemas e `updateAvailable: true`;
- núcleo atual: zero plugins, um problema de contrato e `updates: []`;
- tentativa de atualizar: HTTP 404.

Além disso, dos **21 manifests de referência existentes na tag e no checkout**, todos passaram de API 1 para API 2, mas **19 continuam com a mesma versão**. Só ChatGPT Browser Studio passou de 1.0.14 para 1.0.15 e Google Flow de 1.3.7 para 1.3.8. Versões iguais não geram indicador, mesmo depois de resolver a descoberta de pacotes incompatíveis.

**Publicar primeiro os plugins também não resolve sozinho:** o núcleo 1.2.1 aceita API 1 e rejeita API 2. O catálogo atual não declara API/minCoreVersion por entrada; `minCoreVersion` existe no manifesto, mas não foi encontrada aplicação dessa restrição no fluxo de atualização/registro. O manifesto atual do Text File Builder ainda declara 0.3.0.

Recomendação técnica: conservar uma identidade administrativa segura do pacote incompatível, suficiente para diagnóstico/substituição, mantendo sua execução bloqueada. Isso não exige aceitar API 1 no runtime. Coordenar versões maiores dos plugins, seleção de catálogo compatível com o núcleo e atualização/migração dos Métodos. O pacote coletivo por pasta não é saída geral: a instalação atual pula destinos já existentes, em vez de substituí-los.

## Migração de Métodos, Biblioteca e histórico

A 1.2.1 trabalha com campos `type`, origens antigas e envelopes de exportação v1/v2. O código atual exige `ProcessMethod.contractVersion = 3`, `shape`, bindings explícitos, portas e alvos explícitos de validação; a importação de arquivos aceita envelope v3.

`scripts/migrate-user-data-v3.ts` já converte payloads de:

- `channels`;
- `projects`, incluindo estratégia congelada;
- `process_executions`, incluindo Método congelado e deliveries;
- `library_collections`.

O planejamento bloqueia escrita quando encontra diagnósticos, usa capabilities API 2 instaladas/vinculadas para resolver portas, faz backup SQLite com integridade verificada e escreve em transação. Jobs e receipts históricos não são convertidos por essa lista de tabelas. Pacotes antigos exportados que estejam fora do banco também não são regravados por esse script.

No cenário manual ensaiado: um canal, três projetos e duas execuções; cinco payloads pendentes, zero diagnósticos; aplicação concluída, backup criado e replanejamento com zero alterações pendentes. Isso comprova esse caso, não todos os Métodos dos usuários. A migração local documentada em TASK-028B exigiu antes resolver bindings/portas ambíguos, mostrando por que o sucesso da instalação do criador não garante migração automática de qualquer base.

Não há chamada a esse migrador no startup normal. Ele tampouco está listado entre os arquivos da distribuição ou importado pelo entrypoint empacotado. A atualização do executável, sozinha, não executa essa conversão. Não é razoável orientar usuários comuns a configurar Node, abrir o checkout e rodar TypeScript.

## Skills e documentação para a migração conduzida por agentes

Esta é uma parte central da experiência, conforme o esclarecimento do criador: os usuários costumam criar/adaptar Métodos e plugins com agentes. **Entregar as skills atuais reduz bastante o atrito depois que o agente consegue identificar a instalação, acessar os contratos e aplicar mudanças pelos caminhos suportados.**

Já existe distribuição separada das duas skills. `scripts/package-ecosystem.mjs` gera `ContentFlow-Skill-Method-Development.zip` e `ContentFlow-Skill-Plugin-Development.zip` a partir de `ecosystem/skills/`. Os dois assets também estavam na release 1.2.1. A aplicação tem links para `releases/latest/download`; a área de Métodos oferece a skill e a configuração MCP local.

Os dois ZIPs publicados na 1.2.1 foram baixados e inspecionados nesta investigação. A skill publicada de plugins ensina explicitamente API 1 e campos antigos, como `deliveryTypes`. Portanto, fontes atualizadas no GitHub não significam pacote publicado atualizado: enquanto a release correspondente não existir, o usuário pode baixar instruções antigas pelo link de download habitual.

As fontes atuais já ensinam Método v3 e Plugin API v2: shapes, bindings, portas, fronteiras Core/Método/plugin, perfis, leases e validação. Isso ajuda o agente a preservar a intenção do Método e adaptar a automação do usuário ao contrato novo. A referência de protocolo da skill de plugins determina nova major quando shapes/portas mudam; apenas trocar `apiVersion` ou republicar um ZIP com a mesma versão não cumpre esse fluxo.

Ainda faltam partes específicas da transição:

- **Atualização da skill no agente:** baixar um ZIP não substitui automaticamente a skill já instalada/configurada em Codex, Claude ou outro agente. Não foi encontrado um fluxo de atualização das skills equivalente à bolinha dos plugins. Explicar instalação/substituição e como confirmar que o agente carregou a edição correta.
- **Acesso fora do aplicativo:** o botão dentro do Canal não pode ser a única entrada quando os canais não carregam. Publicar links diretos na release e num guia de transição acessível pelo GitHub.
- **Versão da referência:** identificar a versão instalada antes de aplicar documentação. `main` já descreve o novo contrato enquanto a release pública ainda é 1.2.1. Fixar o guia/skill/schema a uma tag ou commit correspondente evita que o agente aplique regras novas a um núcleo antigo.
- **Documentação disponível no pacote:** os ZIPs contêm a árvore de cada skill, mas referências como `../../../../docs/CONTENT_CONTRACT.md` pressupõem o checkout do repositório. Em instalação avulsa da skill esse caminho não é garantido. Fornecer documentação essencial no pacote ou links absolutos, associados à versão, e instruções para obter os validadores quando necessários.
- **Guia de migração ativo:** as skills são guias de criação/revisão; não constituem hoje um assistente completo de recuperação do banco, atualização de pacote rejeitado e migração de histórico. Incluir uma referência de transição, com inventário, cópia de segurança, identificação do formato antigo, ferramentas suportadas, ambiguidades e provas de preservação.
- **Limites do MCP:** o builder local expõe contexto, contrato, capabilities, validação e aplicação de Métodos de canais existentes. Não cria plugins nem é um migrador geral do banco. A skill de plugin precisa de acesso aos arquivos e ambiente de validação; um agente conectado somente ao MCP de Métodos não ganha essas capacidades.

O GitHub já fornece fontes úteis: `docs/ARCHITECTURE.md`, `docs/CONTENT_CONTRACT.md`, `docs/ecosystem/protocol.md`, `docs/ecosystem/ai-development.md`, os schemas e as duas skills. A edição deve acompanhar o aplicativo/contrato alvo. Roadmaps e registros arquivados não devem dirigir a migração.

Prompt sugerido para acompanhar o pacote/guia, depois de disponibilizar um caminho suportado de migração:

> Use as skills atuais de Método e plugin do ContentFlow. Primeiro identifique a versão instalada, a versão alvo e onde estão os dados. Leia a documentação correspondente a essas versões. Inventarie meus canais, Métodos, projetos, Biblioteca e plugins, distinguindo oficiais e próprios. Preserve uma cópia antes de alterar dados persistidos. Adapte meus Métodos para v3 e os plugins próprios para API 2, preservando intenção, configurações, entregas e histórico. Use as ferramentas e validadores oficiais; não adapte contratos antigos no runtime, não recrie canais para esconder erros e não copie credenciais ou sessões para arquivos portáteis. Se houver ambiguidade editorial, explique e peça minha decisão. Ao terminar, mostre o que foi preservado, o que mudou e o que ainda precisa de atualização, preparação ou teste.

Esse prompt orienta a atuação do agente, mas não cria ferramentas que ainda não existem. O núcleo continua responsável por conseguir abrir/diagnosticar os dados e alcançar administrativamente os plugins antigos. **A experiência recomendada é aplicativo recuperável + skills atuais + documentação por versão + agente para adaptar a estratégia e a automação particular.**

## Perfis, arquivos, credenciais e trabalhos em andamento

As migrações estruturais de startup chegam ao schema 4 e criam perfis globais, vínculos e leases com journals e backups verificados. Elas não são a migração de contrato v3 acima.

No ensaio com perfis:

- dois aliases `principal`, de plugins diferentes, produziram `legacy:profile-one` e `legacy:profile-two`;
- os vínculos originais foram preservados, sem compartilhar sessões por nome;
- storage continuou nas duas pastas legadas; ambos os arquivos sentinela e o upload ficaram intactos;
- `integrity_check = ok`; backups das migrações estruturais foram gerados;
- não houve criação de readiness por esses registros antigos: cadastro, vínculo e preparação continuam diferentes.

Não há evidência aqui de que todos terão de fazer login novamente, nem prova de que toda sessão real será imediatamente reutilizável. É necessário ensaio com perfil real, workspace customizado e conta autenticada. Credenciais de conexões usam o armazenamento seguro existente; não foram lidas ou migradas nesta investigação.

A Browser Bridge é copiada pelo startup para a pasta estável nos dados. Seu código mudou, embora o manifesto da extensão continue em 0.4.0. A verificação de presença não comprova o código em memória/protocolo do navegador. Recarregamento/preparação precisa ser ensaiado e explicado quando necessário, preservando o perfil.

O job antigo pendente inserido no ensaio tornou-se `abandoned`, com **“O plugin foi removido enquanto o job estava pendente.”** A pasta estava presente, mas o contrato impediu o registro. O código também abandona job quando a versão do plugin mudou. Portanto, atualização de pacote não promete retomar uma operação iniciada na versão anterior. Não recomendar retry indiscriminado se houver geração/publicação remota de resultado incerto.

## Onde os dados ficam e o que significa retornar à versão anterior

O caminho padrão Windows continua `%APPDATA%\ContentFlow\data`, com SQLite, uploads, plugins, workspaces, perfis e backups. `CONTENTFLOW_DATA_DIR` pode selecionar outro caminho. Caminhos customizados/externos devem integrar o inventário de recuperação.

O instalador preserva AppData; isso não garante legibilidade do contrato novo nem rollback. Backups automáticos de migração são backups do banco, não cópia completa dos plugins, uploads, perfis externos e credenciais. Após conversão v3/API 2, reinstalar 1.2.1 mantendo esses dados não é um retorno comprovadamente funcional.

Para suporte, preservar uma cópia do diretório completo com o aplicativo e seus navegadores de automação fechados, mais workspaces externos. Manter a cópia no dispositivo do usuário; não pedir cookies, tokens ou pastas de perfil em um chamado. Uma cópia de arquivos também não transforma credenciais do cofre do Windows em credenciais portáteis.

## Orientação que pode ser dada hoje

Sem uma ferramenta de transição empacotada, o caminho atual é uma migração assistida. Um aviso honesto para os usuários seria:

> Esta atualização muda o formato dos Métodos e a comunicação dos plugins. Seus testes antigos podem precisar de conversão e seus plugins precisam de versões compatíveis. Antes de atualizar, feche o aplicativo e preserve uma cópia dos dados. Se os canais não aparecerem, não recrie tudo nem apague a instalação: isso pode ser uma falha de leitura, com os dados ainda presentes. Procure o suporte para verificar o diretório usado e converter uma cópia da base. Plugins próprios também precisarão ser adequados à API 2.

Roteiro de suporte:

1. Confirmar versão, instalado/portátil, momento da falha e diretório de dados efetivo.
2. Preservar banco e pastas antes de alterar; localizar cópia anterior e workspaces externos.
3. Distinguir serviço indisponível de estado incompatível e de diretório diferente.
4. Planejar a conversão em cópia, com os pacotes API 2 corretos disponíveis para resolver os contratos.
5. Resolver ambiguidades com o usuário; não inventar significado editorial nem substituir seus Métodos pelos oficiais.
6. Aplicar somente um plano validado, com backup; confirmar canais, projetos, Biblioteca e histórico.
7. Atualizar/reativar plugins, preparar os vínculos necessários e testar um fluxo curto antes de tentar retomar jobs antigos.

Esse roteiro depende de suporte técnico hoje. Não apresentar a bolinha azul como solução suficiente nesta transição.

## Mínimo recomendado para reduzir o atrito antes da publicação

1. **Abertura compreensível:** identificar contrato antigo antes da normalização global; mostrar migração necessária, dados encontrados e recuperação possível. Um canal incompatível não pode ocultar toda a instalação.
2. **Migração acessível:** distribuir uma fronteira explícita de conversão com planejamento, backup, recuperação e diagnóstico. Pode ser integrada ao aplicativo ou uma ferramenta assistida empacotada; a escolha de UX permanece pendente.
3. **Atualização alcançável dos plugins antigos:** identidade administrativa e ação de substituição para pacotes inválidos, sem permitir executá-los; versões maiores e catálogo coordenado com o núcleo.
4. **Skills e guia para agentes:** distribuir as duas skills atuais com referências acessíveis e associadas à versão, instruções para substituir as edições instaladas e roteiro de migração de Métodos e plugins próprios. Separar defeito do plugin de dados perdidos.
5. **Confirmação após a transição:** números e nomes de canais/projetos preservados, histórico acessível, plugins que precisam de atualização/consentimento, perfis que precisam de preparação e trabalhos que não serão retomados automaticamente.
6. **Ensaio de instalação e recuperação:** 1.2.1 instalada → candidato empacotado, reinício, plugin oficial e próprio, Método manual e automatizado, Biblioteca, perfil autenticado, workspace customizado e retorno usando backup completo.

Não é necessário resolver toda a confiabilidade do produto para acolher testadores. É necessário não deixá-los descobrir sozinhos onde estão seus dados ou exigir código para realizar a transição básica.

## Limites da evidência

Os 27 testes focais passaram, mas não contradizem as falhas reproduzidas. A fixture denominada 1.2.1 usa infraestrutura do código atual e schema 4; seu teste de bootstrap preserva dados, sem comprovar que a UI carrega qualquer banco criado pela tag antiga ou que Métodos antigos executam. O ensaio desta investigação criou a base pelo servidor da tag justamente para cobrir essa diferença.

Também não foram comprovados: atualização pelo NSIS/updater real, credenciais reais, Browser Bridge autenticada, todo plugin personalizado, todos os contratos ambíguos, retomada remota sem duplicação ou rollback integral. O gate agregado aprovado no trabalho anterior valida o checkout, não a experiência completa de upgrade.

**Recomendação final:** não oferecer o estado atual como atualização tranquila/in-place para 1.2.1. Preparar primeiro o caminho de transição ou anunciar e fornecer uma migração assistida concreta. A possibilidade de erros de execução é aceitável no público descrito; a falta de acesso aos próprios dados e à atualização necessária dos plugins é o atrito evitável mais urgente.
