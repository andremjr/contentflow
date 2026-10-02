# Guia de atualização para ContentFlow 1.3.1

Este guia prepara a atualização de instalações 1.2.1 e a migração explícita de extensões para Método v3 e Plugin API v2. Não afirma publicação nem aprovação de uma atualização real. Consulte [estado e limitações](CURRENT_STATE.md): testes de contratos ou pacotes não comprovam preservação de uma instalação existente.

## Documentação e versão

Os ZIPs `ContentFlow-Skill-Method-Development.zip` e `ContentFlow-Skill-Plugin-Development.zip` incluem, dentro da pasta da skill, `docs/`, `AGENTS.md`, `LICENSE`, `AI_USAGE_POLICY.md` e `DOCUMENTATION.json`. Esse manifesto identifica a versão documental alvo, o commit de origem, alterações locais nas fontes e SHA-256 de cada documento. As cópias são geradas das fontes do checkout; não são uma segunda autoridade mantida manualmente.

Fora do checkout, comece por `references/documentation.md` da skill extraída. A documentação incluída permite trabalhar offline. Referências públicas da versão alvo usam [v1.3.1](https://github.com/andremjr/contentflow/tree/v1.3.1/docs); enquanto a tag não for publicada, podem estar indisponíveis. Não substitua silenciosamente por `main` ou por docs de outra release. No checkout oficial, código e documentação vivos da versão de trabalho prevalecem. Sem o parser/validador correspondente, registre validação pendente; leitura de schema não comprova execução.

## 1. Inventário e backup antes de atualizar

1. Registre versão do aplicativo, plugins (ID, versão e hash), Métodos e processos, Canais, Projetos, execuções, filas/jobs e itens concluídos/parciais. Anote perfis, vínculos, readiness e pastas autorizadas sem registrar credenciais.
2. Pare o início de novos trabalhos e feche o ContentFlow e navegadores gerenciados antes da cópia. Efeito externo incerto precisa ser reconciliado, não repetido para produzir um backup aparentemente limpo.
3. Faça uma cópia consistente de `%APPDATA%\ContentFlow\data` e das pastas externas referenciadas por perfis, artifacts, plugins vinculados e workspaces. Exportar Métodos não substitui backup do banco, snapshots e arquivos. Preserve também a versão anterior do aplicativo e os pacotes exatos dos plugins.
4. Verifique inventário, tamanhos e hashes e ensaie a restauração em um ambiente isolado. Proteja o backup local: pode conter sessão e dados privados. Não o envie ao agente, não o inclua em pacote portátil nem extraia secrets do cofre; credenciais dependem do gerenciador seguro existente.

Não apague dados, compacte storage, mova pastas grandes ou reescreva snapshots históricos para tornar os novos contratos aceitos. Se não houver backup verificável e recuperação ensaiada, a atualização real permanece pendente.

## 2. Migrar Métodos explicitamente

### Dados já salvos na instalação

Na primeira abertura, Canais e Métodos incompatíveis continuam visíveis com seus dados originais. O painel global **Migração de dados** consulta um plano sem escrever no banco. Edição e execução incompatíveis, workers e Orchestrator ficam bloqueados antes da migração; a administração dos plugins permite instalar as capabilities API 2 necessárias e depois **Atualizar plano**.

Revise os diagnósticos e confirme explicitamente **Criar backup e aplicar migração**. O servidor usa a conexão SQLite existente, verifica a integridade e a equivalência do backup, grava seu SHA-256 em um manifesto e aplica as conversões em uma transação. Ambiguidade, mudança dos dados/capabilities ou falha de validação impedem a aplicação; falha dentro da transação desfaz todas as conversões. Jobs antigos e itens parciais são preservados e jobs com contrato incompatível nunca são executados ou reinterpretados automaticamente.

As rotas locais são `GET /api/upgrade/status`, `GET /api/upgrade/plan` e `POST /api/upgrade/apply` com `{ "planId": "<plano revisado>", "confirmBackup": true }`. O resultado informa `backupPath`. Não publique esse backup: contém dados locais privados. A CLI `scripts/migrate-user-data-v3.ts` continua disponível para ensaios; não é executada automaticamente ao importar o módulo nem no bundle do servidor.

Para recuperar, feche o ContentFlow e os navegadores gerenciados. Preserve o diretório atual inteiro antes de qualquer substituição. Confira o SHA-256 do arquivo `.sqlite` contra o manifesto `.sqlite.json`; abra a cópia com SQLite e confirme `integrity_check = ok`. Restaure o backup como `contentflow.sqlite` em uma cópia isolada da pasta de dados, sem transportar os arquivos `contentflow.sqlite-wal` e `contentflow.sqlite-shm` do banco migrado. Preserve uploads, plugins, pastas de perfis e workspaces; o backup desta migração cobre SQLite, não substitui a cópia completa feita antes da atualização. Para voltar ao aplicativo anterior, use também os pacotes anteriores exatos dos plugins. Ensaie a recuperação nessa cópia antes de usá-la como instalação ativa.

Métodos v1/v2 são inválidos no importador atual. Trabalhe numa cópia e produza um novo arquivo: `format: "contentflow-method"` (ou `contentflow-method-pack`), `version: 3` e `method.contractVersion: 3`. Apenas trocar o número não é migração. Preserve intenção, instruções e dependências; revise cada Bloco e ligação pelo [contrato de conteúdo](CONTENT_CONTRACT.md).

- Declare `ValueShape` em cada entrada/saída: conteúdo só tem `text`, `image`, `audio`, `video`; `cardinality` e `representation` são explícitas. TXT/Markdown/SRT são texto em artifact. Controles e registros possuem contratos separados.
- Retire tipos/famílias antigos (`file`, `files`, `list`, `textarea`, `records`, `artifact`, `media`, `mixed`) e listas legadas de tipos aceitos/produzidos. Não deduza shape de renderer, label, MIME ou do valor JavaScript. Quando a intenção estiver ambígua, registre `DECISION REQUIRED` e peça a decisão do autor antes de converter.
- Refaça bindings estruturais e `portKey` exato; múltiplas famílias exigem portas separadas. Não promova escalar a coleção nem converta mídia implicitamente. A única contração textual permitida está descrita em `CONTENT_CONTRACT.md`.
- Revise `VALIDAR`, coleção de `ESCOLHER`, histórico, outputs oficiais e dependências entre Processos. Preserve os oito Processos, quatro Blocos e três Operadores. A ordem dos Processos é estratégia do Canal, não uma sequência imposta pela skill.
- Use a versão exata do plugin/capability migrado; remova secrets, `connectionId`, `collectionId` local, `profileExecution`, IDs físicos, caminhos de sessão e IDs de execução/delivery/work unit do pacote portátil. Reassocie coleções, conexões e perfis explicitamente após importar.

Não converta snapshots de Projetos já iniciados para o novo Método. A revisão da estratégia para novos Projetos e qualquer adoção explícita de revisão numa execução são operações distintas do Core.

Métodos que já satisfazem o schema de edição v3, incluindo rascunhos vazios e snapshots, são preservados sem inferência legada. Uma ligação ainda incompatível ou uma porta de plugin não escolhida exige ajuste da configuração, não migração dos dados. O editor permite salvar uma entrada nova antes de escolher sua origem; o contrato executável e a exportação continuam exigindo referências completas. O plano não redefine o shape declarado de uma entrada v3 a partir de sua origem.

## 3. Migrar plugins explicitamente

Plugin API v1 é inválida no runtime atual. Gere um pacote API v2 independente com `apiVersion: "2"`, portas `inputPorts`/`outputPorts` com um `shape` por porta e handler que lê `request.inputs[portKey]` e retorna `values[portKey]`. Confira [protocolo](ecosystem/protocol.md), [segurança](ecosystem/security.md) e schema empacotado.

**Mudar shape ou porta exige nova major da versão do plugin**, inclusive cardinalidade, representação, chave/remoção de porta e mudanças incompatíveis de campos de registros. Mudar IDs públicos também exige nova major. `apiVersion` não é a versão semântica do pacote: por exemplo, um plugin `1.x` que rompe esse contrato passa a `2.0.0` mantendo API `"2"`. Não republique conteúdo diferente sob a mesma versão/hash e não substitua uma versão exata ausente por outra.

Atualize manifesto, handler, fixtures, README e Métodos consumidores como um conjunto. Documente o mapa antigo → novo e a versão do ContentFlow realmente testada. Preserve a versão anterior e não redirecione jobs em andamento ao pacote novo. Consentimento e vínculo de perfil permanecem explícitos; não copie cookies, storage ou credenciais para configuração portátil.

Plugins relatam fatos e efeitos; o Core decide recuperação, identifica work units e distribui unidades exclusivas. Timeout após efeito potencial exige reconciliação. Não esconda incompatibilidade com adapter, fallback silencioso, replay ou recarga. Leia as [limitações atuais](CURRENT_STATE.md) antes de prometer retomada automática.

## 4. Validadores e aceitação

No checkout oficial correspondente, com Node 26 e dependências preparadas:

```powershell
npm run test:skill-sync
npm run test:method-file
npm run test:content-shape
npm run plugin:kit -- validate <pasta-do-plugin>
npm run plugin:kit -- test-contract <pasta-do-plugin>
npm run plugin:kit -- test-sandbox <pasta-do-plugin>
npm run plugin:kit -- report <pasta-do-plugin>
```

As suites de Método exercitam o parser; para o arquivo migrado use `parseMethodFile`/`parseMethodImportFile` de `src/lib/method-file.ts` e a prévia do importador do aplicativo. As suites por si só não validam seu arquivo. Plugin Kit roda no checkout; não é um executável incluído na skill. Schemas/templates servem de apoio e não substituem os validadores reais. Confira também que v1/v2 de Método, API v1, porta desconhecida e shape incompatível são rejeitados.

Importe primeiro em Canal/Projeto de teste, associe recursos locais e execute o cenário real, incluindo outputs, artifacts, pendências humanas, cancelamento e retomada relevantes. Para navegador, valide readiness por vínculo, lease por perfil e reconciliação sem duplicar efeitos. Registre arquivo, versão, comandos, resultados e limites, sem dados privados.

## 5. Ensaio da instalação antiga e recuperação

Em cópia isolada representativa de 1.2.1, compare antes/depois Canais, Métodos, Projetos, snapshots/execuções, plugins e suas versões, perfis/vínculos, filas, jobs, itens parciais, artifacts e pastas. Demonstre leitura, continuidade segura e preservação do trabalho concluído, sem apagar histórico ou precisar de intervenção que mascare erro. Um teste de importação v3 não comprova essa atualização.

Se o ensaio falhar, preserve a cópia com falha e suas evidências. Recupere aplicativo, plugins e dados do mesmo backup consistente em outro ambiente isolado; não abra o banco já migrado com o binário antigo presumindo reversibilidade. Reconcile efeitos externos antes de retomar. Relate a limitação e mantenha a instalação original preservada.

Implementação, validação e publicação são etapas separadas. Este guia não autoriza incrementar core, tag, release ou GitHub Actions. Publicação depende de autorização explícita do titular para o conjunto exato validado, conforme `AGENTS.md`.
