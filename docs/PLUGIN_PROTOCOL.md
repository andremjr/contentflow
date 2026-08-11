# Protocolo de Plugins do ContentFlow OS — API v1

Este documento é o contrato normativo entre o núcleo do ContentFlow OS e plugins dos operadores `IA` e `Código`. Em caso de divergência, a tipagem em [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts) e este documento devem ser atualizados juntos.

O executor isolado atende plugins oficiais, locais e comunitários. Plugins externos são validados automaticamente, exigem consentimento local por versão/permissões e executam em processo separado sob a sandbox do Node 26. Não existe aprovação central para criar, compartilhar, instalar ou ativar um plugin. Depois da publicação do primeiro plugin, qualquer alteração incompatível exigirá nova `apiVersion`.

Documentos relacionados:

- [`PLUGIN_AI_KIT.md`](PLUGIN_AI_KIT.md): pacote curto para criação assistida por IA.
- [`PLUGIN_TUTORIAL_30_MIN.md`](PLUGIN_TUTORIAL_30_MIN.md): aula prática com o kit oficial.
- [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md): tutorial de implementação.
- [`PLUGIN_ROADMAP.md`](PLUGIN_ROADMAP.md): ordem estratégica e catálogo por processo.
- [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md): modelo de ameaças e requisitos do executor.
- [`PLUGIN_BROWSER_AUTOMATION.md`](PLUGIN_BROWSER_AUTOMATION.md): requisitos futuros para automação autorizada de interfaces web.
- [`PLUGIN_ECOSYSTEM.md`](PLUGIN_ECOSYSTEM.md): publicação, revisão e governança do catálogo.
- [`schemas/contentflow-plugin-v1.schema.json`](schemas/contentflow-plugin-v1.schema.json): schema validável do manifesto v1.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): domínio, processos, blocos e operadores.
- [`LEGAL_AND_LICENSING.md`](LEGAL_AND_LICENSING.md): limites jurídicos e política de licenciamento.

## 1. Objetivos do protocolo

O protocolo deve permitir que um plugin:

- declare capacidades atômicas e compatibilidade;
- receba entradas já resolvidas e tipadas;
- produza saídas aderentes ao bloco;
- execute operações imediatas ou demoradas;
- reporte progresso, uso e erros operacionais;
- gere arquivos sem obter acesso ao armazenamento interno;
- seja cancelado e retomado com segurança;
- funcione sem conhecer SQLite, rotas, componentes ou estado da interface.

Não fazem parte da API v1:

- novos Processos Universais, blocos ou operadores;
- ramificações, loops ou paralelismo definidos pelo plugin;
- acesso direto ao banco;
- componentes React injetados pelo plugin;
- instalação arbitrária de dependências durante a execução;
- execução de plugins do operador `Humano`.
- acesso a navegador, cookies, tokens de sessão ou perfis autenticados.

## 2. Vocabulário

- **Plugin:** pacote instalável com manifesto e entrypoint.
- **Capacidade:** operação atômica oferecida pelo plugin para combinações de bloco, operador e processo.
- **Porta:** papel semântico de uma entrada ou saída, como `audio`, `script` ou `timeline`.
- **Binding:** conexão entre uma entrada/saída do Método e uma porta da capacidade.
- **Configuração do bloco:** parâmetros da capacidade salvos naquela instância do bloco.
- **Setting:** preferência local global do plugin, compartilhada por blocos.
- **Secret:** credencial local declarada por nome e nunca serializada no Método.
- **Artifact:** arquivo produzido pelo plugin e importado pelo núcleo.
- **Job:** execução externa demorada que pode ser consultada ou cancelada.
- **Tentativa:** número de execução do bloco dentro da política de validação/repetição.

## 3. Fronteira de responsabilidades

### Núcleo

O ContentFlow OS controla:

- canais, projetos e Métodos;
- ordem e estado dos blocos;
- resolução e binding das entradas;
- Biblioteca Estratégica;
- snapshot e persistência da execução;
- tentativas, validações e repetição de trechos;
- staging e armazenamento definitivo de arquivos;
- credenciais, permissões e consentimento;
- timeout, polling, cancelamento e limites de recursos;
- validação de manifestos, configurações, requisições e respostas;
- promoção para outputs universais e notificações humanas.

### Plugin

O plugin:

- executa somente a capacidade solicitada;
- interpreta as portas semânticas que declarou;
- respeita configuração, contrato de saída e permissões;
- devolve sucesso, pendência ou erro;
- não altera a ordem dos blocos;
- não inicia sozinho outra capacidade;
- não acessa diretamente SQLite, interface ou diretórios internos;
- não decide repetição, aprovação humana ou publicação pública fora do contrato.

Tudo que o plugin pode ler chega na requisição, por secrets declarados ou por APIs controladas do futuro SDK. Tudo que produz volta na resposta e em artifacts declarados.

## 4. Pacote e runtime

A API v1 começa com um único runtime para reduzir superfície de segurança:

```text
runtime.kind     node
runtime.module   esm
runtime.version  faixa compatível com o runtime empacotado pelo aplicativo
```

Estrutura mínima:

```text
meu-plugin/
├── contentflow.plugin.json
├── dist/
│   └── index.js
├── README.md
└── LICENSE
```

Regras:

- `entrypoint` é relativo à raiz e não pode conter travessia (`..`).
- O entrypoint exporta uma função assíncrona chamada `execute(request, services)`.
- O pacote distribuído contém o build e todas as dependências de runtime necessárias.
- Scripts de instalação não são executados automaticamente.
- Arquivos `.env`, caches, credenciais e dados de usuário são proibidos.
- Symlinks que escapem da pasta do plugin são rejeitados.
- O carregador pode impor limite de tamanho e quantidade de arquivos.

O segundo argumento contém serviços controlados pelo executor:

```ts
type PluginExecutionServices = {
  signal: AbortSignal;
  getSecret(key: string): Promise<string | undefined>;
  resolveInputFile(file: StoredFile): Promise<string>;
  getOutputPath(relativePath: string): string;
  getWorkspacePath(relativePath: string): string;
};
```

O plugin encaminha `signal` a operações abortáveis. `getSecret` aceita apenas chaves declaradas pelo próprio manifesto. `resolveInputFile` abre uma entrada, `getOutputPath` cria um artifact temporário e `getWorkspacePath` aponta para arquivos/checkpoints persistentes na pasta escolhida pelo usuário ou na pasta interna padrão. Os serviços retornam caminhos dentro das raízes concedidas, nunca um caminho arbitrário escolhido pelo código do plugin.

Webhooks e runtimes adicionais podem ser oferecidos depois por adapters oficiais, sem tornar a API v1 genérica demais.

## 5. Manifesto

Cada plugin possui `contentflow.plugin.json` na raiz:

```json
{
  "$schema": "https://raw.githubusercontent.com/andremjr/contentflow-os/main/docs/schemas/contentflow-plugin-v1.schema.json",
  "apiVersion": "1",
  "id": "com.exemplo.gerador-texto",
  "name": "Gerador de texto",
  "version": "1.0.0",
  "description": "Cria textos usando um provedor externo.",
  "author": "Exemplo",
  "license": "MIT",
  "homepage": "https://example.com/contentflow-plugin",
  "repository": "https://github.com/example/contentflow-plugin",
  "runtime": {
    "kind": "node",
    "version": ">=22",
    "module": "esm"
  },
  "minCoreVersion": "1.0.0",
  "entrypoint": "dist/index.js",
  "permissions": ["network"],
  "secretKeys": ["EXEMPLO_API_KEY"],
  "deliveryTypes": ["text"],
  "settingsSchema": {
    "type": "object",
    "properties": {
      "baseUrl": { "type": "string", "format": "uri" }
    }
  },
  "capabilities": [
    {
      "id": "generate-text",
      "operator": "IA",
      "blockTypes": ["CRIAR"],
      "processTypes": ["theme", "title", "script"],
      "inputPorts": [
        {
          "key": "prompt",
          "label": "Contexto",
          "acceptedTypes": ["text", "textarea", "list", "records"],
          "required": true,
          "multiple": true
        }
      ],
      "outputPorts": [
        {
          "key": "result",
          "label": "Resultado",
          "producedTypes": ["text", "textarea", "list", "records"],
          "required": true
        }
      ],
      "acceptedInputTypes": ["text", "textarea", "list", "records"],
      "producedOutputTypes": ["text", "textarea", "list", "records"],
      "execution": {
        "mode": "immediate",
        "defaultTimeoutMs": 60000,
        "supportsCancellation": false,
        "maxConcurrency": 2
      },
      "sideEffects": ["external_write"],
      "cost": {
        "model": "metered",
        "estimateSupported": true
      },
      "dataPolicy": {
        "sendsDataToThirdParties": true,
        "providers": ["Exemplo AI"],
        "retentionPolicyUrl": "https://example.com/retention",
        "trainingPolicyUrl": "https://example.com/training"
      },
      "blockConfigSchema": {
        "type": "object",
        "properties": {
          "model": { "type": "string" },
          "temperature": { "type": "number", "minimum": 0, "maximum": 2, "default": 0.7 }
        },
        "required": ["model"]
      },
      "outputSchema": { "type": "object" }
    }
  ]
}
```

### Identidade e versão

- `apiVersion` deve ser `"1"`.
- `id` é global, imutável e usa domínio reverso em minúsculas.
- `version` segue SemVer.
- `minCoreVersion` impede instalação em núcleos incompatíveis.
- `capability.id` é único dentro do plugin e não muda depois de publicado.
- `license` identifica a licença do pacote com expressão SPDX quando existir; licenças personalizadas usam um identificador estável e incluem o arquivo integral no pacote.
- `homepage` e `repository`, quando informados, usam URLs HTTPS e apontam para páginas controladas pelo publicador.
- Nome, descrição, autor, licença e URLs são metadados não confiáveis: a interface escapa o conteúdo e nunca renderiza HTML fornecido pelo manifesto.

### Runtime

- `runtime.kind` é `node` na API v1.
- `runtime.module` é `esm`.
- `runtime.version` é validada contra o Node empacotado pelo aplicativo.

### Capacidades

No nível do manifesto, `deliveryTypes` classifica o plugin para descoberta na galeria. Um plugin pode declarar qualquer combinação de `text`, `image`, `audio`, `video` e `processing`. O campo descreve a natureza das entregas e transformações do pacote inteiro; não substitui portas, formatos universais ou capacidades executáveis. Plugins legados sem o campo permanecem compatíveis e são apresentados como `processing` até atualizarem o manifesto.

- `operator` aceita somente `IA` ou `Código`.
- `blockTypes` contém um ou mais dos quatro blocos.
- `processTypes` restringe a capacidade; ausência significa todos os processos.
- `inputPorts` e `outputPorts` descrevem os papéis semânticos.
- `acceptedInputTypes` e `producedOutputTypes` são resumos para descoberta rápida; portas são a autoridade para binding.
- `execution` declara comportamento imediato ou assíncrono.
- `execution.maxConcurrency` informa o teto seguro declarado pelo autor; o núcleo pode impor um valor menor.
- `sideEffects` declara todos os efeitos observáveis fora da resposta do bloco.
- `cost` informa se a capacidade é gratuita, tarifada ou de custo desconhecido e se consegue estimar o uso antes da confirmação.
- `dataPolicy` informa se dados deixam a máquina, para quais provedores e onde consultar retenção e uso para treinamento.
- `blockConfigSchema` descreve parâmetros salvos no bloco.
- `outputSchema` adiciona validação específica da capacidade sem substituir `outputContract`.

## 6. Portas e binding

Somente comparar tipos não é suficiente. Dois campos `audio` podem representar voz principal e música; dois campos `video` podem representar A-roll e B-roll. Por isso, cada capacidade declara portas semânticas.

Exemplo:

```json
{
  "inputPorts": [
    { "key": "voice", "label": "Voz", "acceptedTypes": ["audio"], "required": true },
    { "key": "music", "label": "Música", "acceptedTypes": ["audio"], "required": false }
  ]
}
```

Regras de binding:

1. O núcleo filtra por operador, bloco e processo.
2. Confirma que todas as portas obrigatórias podem receber campos compatíveis.
3. Faz binding automático somente quando houver correspondência inequívoca.
4. Quando houver ambiguidade, a configuração do bloco solicita o mapeamento.
5. O binding salvo referencia o campo do Método e a `portKey` da capacidade.
6. Na execução, `inputs` é indexado por `portKey`, nunca por label traduzível.
7. A mesma entrada só atende várias portas quando a capacidade permite e o usuário confirma.

`multiple: true` significa que a porta pode agregar mais de um campo compatível. Isso não transforma automaticamente valores escalares em listas; o contrato enviado informa a forma efetiva.

Saídas seguem a mesma lógica. `outputContract` contém a chave do bloco e a `portKey` correspondente. A resposta usa `portKey`; o núcleo persiste o valor na chave técnica do bloco.

### Apresentação declarativa

Uma porta pode incluir `presentation` para solicitar uma forma padronizada de exibição, sem alterar `acceptedTypes` ou `producedTypes`:

```json
{
  "key": "assets",
  "label": "Assets visuais",
  "producedTypes": ["files"],
  "required": true,
  "presentation": {
    "renderer": "image-gallery",
    "itemType": "image",
    "acceptedMimeTypes": ["image/*"]
  }
}
```

Os identificadores v1 são `auto`, `text-short`, `text-long`, `list`, `tags`, `table`, `cards`, `file-list`, `image-gallery`, `audio-player`, `video-player` e `decision`. O núcleo valida compatibilidade, normaliza valores inválidos para `auto` e implementa toda a interface. Plugins não podem registrar renderers, injetar React ou HTML, nem fornecer scripts ou componentes arbitrários. A ausência de `presentation` preserva o comportamento legado.

## 7. Configuração, settings e secrets

Há três categorias distintas:

| Categoria       | Escopo                     | Exemplo                               | Compartilhada no Método? |
| --------------- | -------------------------- | ------------------------------------- | ------------------------ |
| `configuration` | Instância do bloco         | modelo, formato, proporção, qualidade | Sim                      |
| `settings`      | Instalação local do plugin | URL base, região, preferências        | Não                      |
| `secrets`       | Cofre local                | API key, OAuth refresh token          | Nunca                    |

Regras:

- Campo obrigatório sem valor ou default impede salvar/executar o bloco.
- Defaults do JSON Schema são materializados de forma visível; não ficam implícitos no plugin.
- Parâmetros como proporção de vídeo permanecem no plugin/bloco que os utiliza, não viram parâmetros globais do Projeto.
- Configurações exportadas não podem conter secrets.
- Secrets são disponibilizados apenas à execução que declarou a chave, por `services.getSecret()`.
- O plugin não pode enumerar secrets de outros plugins.
- OAuth deve usar fluxo mediado pelo núcleo quando for implementado.

## 8. Permissões

Permissões da API v1:

| Permissão          | Autoriza                                                                             |
| ------------------ | ------------------------------------------------------------------------------------ |
| `network`          | Conexões de rede sob políticas do executor.                                          |
| `filesystem:read`  | Leitura do diretório de staging e arquivos liberados.                                |
| `filesystem:write` | Escrita apenas no diretório de saída temporário.                                     |
| `process`          | Subprocessos como FFmpeg; permissão avançada, pois o filho não herda toda a sandbox. |
| `worker`           | Workers locais para processamento paralelo declarado.                                |
| `native`           | Addons nativos empacotados, como codecs ou bibliotecas de imagem.                    |

Uma permissão declarada não significa acesso irrestrito. O executor ainda aplica:

- diretórios permitidos;
- bloqueio de travessia e symlink escape;
- allowlist de executáveis;
- timeout e cancelamento;
- limites de CPU, memória, disco e tamanho de saída;
- política de rede e redirecionamentos;
- redaction de secrets em logs.

Instalação e atualização exibem qualquer aumento de permissões e exigem novo consentimento.

Plugins com `network` podem declarar `networkHosts`, com hosts exatos (`api.example.com`) ou curingas de subdomínio (`*.cdn.example.com`). A lista é opcional para preservar plugins v1 existentes. Quando presente, ela integra o snapshot de consentimento e é aplicada pelo núcleo a downloads de artifacts; redirects precisam continuar dentro da lista. Quando ausente, a tela de consentimento alerta que o plugin comunitário pediu rede irrestrita.

O Permission Model do Node 26 oferece apenas `--allow-net` como chave binária, sem allowlist por host. Portanto, `networkHosts` não restringe tecnicamente sockets abertos diretamente pelo código do plugin nesta versão. A lista expressa intenção auditável e controla clientes de rede mediados pelo núcleo. Um proxy/SDK obrigatório será necessário para egress por domínio de todo o processo.

Essas permissões podem conceder capacidades amplas sem conceder a máquina inteira. Quando o usuário escolher uma pasta de trabalho persistente, o núcleo poderá montá-la como raiz autorizada para aquele plugin/projeto. Dentro dessa raiz, um plugin com leitura/escrita poderá criar centenas de arquivos, reabrir artifacts por ID, conferir lacunas e alimentar plugins posteriores. O limite impede apenas sair da pasta escolhida sem novo consentimento.

## 9. Ciclo de execução

### 9.1 Preparação

1. O núcleo valida plugin, capacidade, runtime e versão.
2. Valida `configuration` contra `blockConfigSchema`.
3. Resolve todas as entradas do bloco.
4. Aplica os bindings de portas.
5. Se uma entrada obrigatória estiver ausente ou incompatível, pausa sem chamar o plugin.
6. Cria staging, diretório de saída e contexto mínimo.
7. Injeta somente settings e secrets autorizados.

### 9.2 Execução imediata

O núcleo chama `execute()` com `invocation.mode = "start"`. A capacidade devolve `success` ou `error` dentro do timeout declarado. A API v1 aceita timeout de até 24 horas; duração longa não torna a capacidade inválida.

### 9.3 Execução assíncrona

Geradores de vídeo, avatares, renderizações e uploads podem durar minutos ou horas. Uma resposta `pending` encerra a requisição HTTP atual. O núcleo persiste o job no SQLite, agenda `resume` e publica snapshots curtos para a interface; nenhuma conexão HTTP permanece aberta durante o intervalo de processamento.

1. `start` inicia o job externo ou um worker local supervisionado.
2. O plugin devolve `pending`, `jobId` e `pollAfterMs`.
3. O núcleo persiste o estado e agenda nova chamada.
4. `resume` consulta o mesmo job.
5. O plugin retorna novamente `pending`, ou finaliza com `success`/`error`.
6. Se o usuário cancelar e a capacidade suportar, o núcleo chama `cancel`.

O `jobId` é opaco para o núcleo, mas não pode conter secrets. O plugin deve conseguir retomar usando `jobId`, settings e secrets declarados, sem memória global do processo anterior.

O registro persistente contém plugin e versão, capacidade, `executionId`, `blockId`, tentativa, `traceId`, `jobId`, deadline, próxima consulta, progresso, mensagem, valores/artifacts parciais, cancelamento, erro e contador de novas tentativas. Um lease transacional impede duas chamadas `resume` simultâneas. Ao reiniciar, leases interrompidos são liberados e jobs voltam ao agendamento original.

O núcleo interrompe com erro explícito um job cujo plugin tenha sido removido, atualizado, desativado, perdido consentimento ou removido a capacidade. Registros terminais expiram após sete dias; artifacts parciais de jobs falhos, cancelados ou abandonados são removidos nessa limpeza. Artifacts promovidos por jobs concluídos permanecem no armazenamento normal.

Workers locais contínuos ainda precisam persistir seu próprio checkpoint em workspace e ser reiniciáveis por `jobId`. O núcleo v1 não conserva PID nem processo filho entre invocações ou reinicializações.

### 9.4 Idempotência

A chave lógica de idempotência é:

```text
executionId + blockId + capabilityId + attempt + invocation.mode
```

Chamadas `start` repetidas para a mesma tentativa não devem criar cobranças ou jobs duplicados. Quando o provedor suportar idempotency keys, o plugin deve encaminhar uma chave derivada. O núcleo nunca executa dois `start` concorrentes para a mesma chave.

`resume` pode ser repetido. `cancel` deve ser idempotente.

## 10. Requisição

Forma canônica simplificada:

```ts
type PluginExecutionRequest = {
  executionId: string;
  traceId: string;
  blockId: string;
  capabilityId: string;
  attempt: number;
  invocation:
    { mode: "start" } | { mode: "resume"; jobId: string } | { mode: "cancel"; jobId: string };
  configuration: Record<string, unknown>;
  settings: Record<string, unknown>;
  inputs: Record<string, RuntimeValue>; // chave = portKey
  inputContract: Array<{
    id: string;
    portKey: string;
    label: string;
    type: HumanFieldType;
    recordFields?: RecordFieldDefinition[];
  }>;
  outputContract: Array<{
    portKey: string;
    key: string;
    label: string;
    type: HumanFieldType;
    required: boolean;
    options?: string[];
    recordFields?: RecordFieldDefinition[];
  }>;
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  context: PluginExecutionContext;
};
```

O plugin usa `inputs[portKey]` e nunca procura entradas por label. `inputContract` serve para conhecer tipo e schema dos registros recebidos. `settings` contém somente preferências não secretas validadas por `settingsSchema`; secrets declarados são acessados pelo mecanismo seguro do SDK/runtime e não aparecem no envelope serializável.

## 11. Contexto permitido

`context` contém:

- localidade (`locale`) e fuso horário IANA (`timeZone`) da execução;
- canal: `id`, nome, idioma e nicho;
- projeto: `id` e título;
- Processo Universal atual;
- outputs universais de processos anteriores;
- resultados concluídos de blocos anteriores;
- coleção vinculada, quando aplicável.

Princípios:

- menor contexto necessário;
- objetos tratados como não confiáveis;
- nenhum caminho de banco ou implementação interna;
- nenhum secret dentro do objeto serializável;
- conteúdo de outros canais nunca é incluído;
- logs não devem repetir contexto sensível integralmente.

`traceId` correlaciona uma chamada entre núcleo, plugin e provedor sem revelar dados do usuário. Ele permanece o mesmo em `start`, `resume` e `cancel` do mesmo job; uma nova tentativa editorial recebe novo `traceId`. Datas continuam sendo transmitidas em ISO 8601: `timeZone` serve apenas para apresentação ou regras explicitamente dependentes do calendário local.

## 12. Formatos universais

| ID                 | Valor JSON                   | Uso principal                                |
| ------------------ | ---------------------------- | -------------------------------------------- |
| `text`             | string                       | Nome, título ou texto curto.                 |
| `textarea`         | string                       | Roteiro, instrução ou texto longo.           |
| `number`           | number finito                | Quantidade, nota, duração ou coordenada.     |
| `boolean`          | boolean                      | Estado binário sem semântica de aprovação.   |
| `list`             | string[]                     | Lista homogênea de textos.                   |
| `records`          | object[]                     | Lista ordenada com schema em `recordFields`. |
| `select`           | string                       | Uma opção de `options`.                      |
| `multiselect`      | string[]                     | Opções únicas de `options`.                  |
| `datetime`         | string ISO 8601              | Instante com data, hora e fuso.              |
| `url`              | string URI absoluta          | Link navegável.                              |
| `file`             | `StoredFile`                 | Referência gerenciada a arquivo genérico.    |
| `files`            | `StoredFile[]`               | Referências gerenciadas a vários arquivos.   |
| `image`            | `StoredFile` ou URL          | Imagem; prefira referência gerenciada.       |
| `audio`            | `StoredFile` ou URL          | Áudio; prefira referência gerenciada.        |
| `video`            | `StoredFile` ou URL          | Vídeo; prefira referência gerenciada.        |
| `approval`         | `"approved"` ou `"rejected"` | Decisão formal.                              |
| `thumbnail_layout` | `ThumbnailLayout`            | Composição 16:9 editável.                    |

### Regras gerais

- Strings usam UTF-8 e preservam quebras de linha quando o formato permitir.
- Números devem ser finitos; `NaN` e infinito são inválidos.
- Datas usam ISO 8601, preferencialmente UTC.
- Listas preservam ordem.
- Valores extras não declarados são rejeitados.
- Saídas obrigatórias não podem ser vazias.
- O núcleo aplica limites de tamanho por configuração do executor.

### Records

- Cada registro contém apenas chaves declaradas.
- Chaves obrigatórias não podem estar vazias.
- Tipos internos obedecem a `RecordFieldDefinition`.
- A ordem dos registros possui significado.
- IDs de domínio, quando necessários, são campos explícitos como `segment_id` ou `asset_id`.
- Relações entre listas usam IDs, não posição do array.
- Tempo de mídia usa milissegundos inteiros em campos terminados por `_ms`.
- Records não são aninhados na API v1.

### Thumbnail layout

```json
{
  "aspectRatio": "16:9",
  "boxes": [
    {
      "id": "headline",
      "label": "Título",
      "color": "#2563eb",
      "x": 6,
      "y": 8,
      "w": 55,
      "h": 24
    }
  ]
}
```

Coordenadas são percentuais. `x`, `y`, `w` e `h` ficam entre 0 e 100 e a caixa não ultrapassa o quadro.

## 13. Arquivos e artifacts

Plugins não gravam diretamente no armazenamento definitivo.

### Arquivos de entrada

- O núcleo disponibiliza arquivos autorizados no staging somente leitura.
- `StoredFile.url` é uma referência controlada, não um caminho arbitrário.
- `services.resolveInputFile()` fornece resolução segura dessa referência.
- A permissão `filesystem:read` não libera outras pastas da máquina.

### Arquivos de saída

O plugin obtém destinos com `services.getOutputPath()`, escreve no diretório temporário de saída ou declara uma URL remota. Em `success`, inclui `artifacts`:

```json
{
  "id": "final-video",
  "name": "final.mp4",
  "mimeType": "video/mp4",
  "size": 10485760,
  "source": { "kind": "path", "path": "final.mp4" }
}
```

Regras:

- `source.path` é relativo ao diretório de saída e não contém `..`.
- `source.url` exige `network` e passa por download controlado do núcleo.
- URLs remotas usam HTTPS, não aceitam credenciais embutidas e precisam corresponder a `networkHosts` quando a lista existir.
- Antes de cada conexão e redirect, o núcleo resolve todos os endereços DNS, bloqueia qualquer resultado local, privado, link-local, reservado ou multicast e fixa a conexão a um dos IPs já validados. Uma nova resolução não ocorre dentro do socket, mitigando DNS rebinding.
- O downloader não encaminha cookies ou autorização, limita redirects, tempo e bytes, compara o MIME HTTP ao MIME declarado e confere `Content-Length`/`size` quando disponíveis.
- O valor de mídia correspondente usa um `StoredFile` com mesmo `id` e URL temporária `artifact://final-video`.
- O núcleo transmite o corpo diretamente para um arquivo parcial exclusivo, calcula SHA-256 durante o stream, valida o arquivo final e promove por rename. O `StoredFile` definitivo registra `size`, `mimeType`, URL local e `sha256`.
- O núcleo substitui tanto um valor `artifact://id` quanto a propriedade `url` de um `StoredFile` temporário pelo `StoredFile` local definitivo.
- Artifacts não referenciados por uma saída podem ser descartados.
- Arquivos `.partial` que não foram promovidos são removidos no erro; resíduos de queda abrupta expiram em 24 horas. Artifacts progressivos já promovidos permanecem disponíveis no snapshot do job e são removidos com a retenção do job se ele terminar em erro, cancelamento ou abandono.
- O plugin nunca retorna bytes em base64 dentro de `values`.

## 14. Semântica dos quatro blocos

### BUSCAR

Consulta fonte externa e devolve dados ou mídia. Deve preservar origem, licença e identificadores quando aplicável.

### ESCOLHER

Recebe do núcleo a coleção estratégica vinculada. Seleciona itens preexistentes, nunca resultados criados na execução. A saída canônica contém `selectedItemId` ou uma chave explicitamente mapeada para esse papel.

O operador Humano continua sendo a forma padrão de escolha manual; plugins de IA/Código podem automatizar a seleção quando o Método solicitar.

### CRIAR

Produz novo texto, dado, layout ou arquivo. Não consulta fonte externa como responsabilidade principal, embora possa chamar o provedor necessário à criação.

### VALIDAR

Avalia um bloco anterior e respeita `validation.mode`:

- `approval`: devolve `decision` com `approved` ou `rejected` e feedback opcional;
- `select_one`: devolve `selected_value`;
- `select_many`: devolve `selected_values`.

O plugin não reinicia o bloco validado. O núcleo interpreta a decisão e aplica `onReject` e `maxAttempts`.

## 15. Respostas

### Sucesso

```ts
{
  status: "success";
  values: Record<string, RuntimeValue>; // chave = output portKey
  artifacts?: PluginArtifact[];
  usage?: PluginUsage;
  logs?: string[];
}
```

O núcleo valida:

- porta conhecida;
- binding para saída do bloco;
- tipo e schema;
- obrigatoriedade;
- ausência de chaves adicionais;
- artifacts referenciados e seguros.

### Pendência

```ts
{
  status: "pending";
  jobId: string;
  pollAfterMs: number;
  progress?: number; // 0 a 1
  message?: string;
  partialValues?: Record<string, RuntimeValue>;
  partialArtifacts?: PluginArtifact[];
  usage?: PluginUsage;
  logs?: string[];
}
```

`pollAfterMs` respeita mínimo e máximo impostos pelo núcleo. `progress` deve ser monotônico quando conhecido; ausência é preferível a um valor inventado. `partialValues` é um snapshot por campo: uma chave presente substitui o snapshot anterior daquela chave, o que torna repetições de `resume` idempotentes. Listas, cartões, tabelas e galerias devem devolver a coleção acumulada até aquele instante.

`partialArtifacts` usa exatamente o contrato e o importador de `artifacts`: path/URL, permissões, HTTPS, SSRF, MIME, tamanho, streaming e SHA-256 são revalidados. IDs já importados são reutilizados e tornam retries seguros; mudar nome, MIME ou tamanho de um mesmo ID é erro. O núcleo troca `artifact://` por `StoredFile` antes de persistir e expor o snapshot.

### Erro

```ts
{
  status: "error";
  code: string;
  message: string;
  retryable: boolean;
  retryAfterMs?: number;
  usage?: PluginUsage;
  logs?: string[];
}
```

Códigos recomendados:

| Código                     | Repetível normalmente? | Uso                                  |
| -------------------------- | ---------------------- | ------------------------------------ |
| `INVALID_INPUT`            | Não                    | Valor incompatível com a porta.      |
| `INVALID_CONFIGURATION`    | Não                    | Parâmetro ausente ou inválido.       |
| `AUTHENTICATION_FAILED`    | Não                    | Credencial inválida ou expirada.     |
| `PERMISSION_DENIED`        | Não                    | Permissão não concedida.             |
| `NOT_FOUND`                | Não                    | Recurso solicitado não existe.       |
| `RATE_LIMIT`               | Sim                    | Limite temporário do provedor.       |
| `UPSTREAM_UNAVAILABLE`     | Sim                    | Provedor indisponível.               |
| `TIMEOUT`                  | Sim                    | Prazo excedido.                      |
| `OUTPUT_VALIDATION_FAILED` | Depende                | Provedor devolveu formato incorreto. |
| `JOB_FAILED`               | Depende                | Job assíncrono terminou com falha.   |
| `CANCELLED`                | Não                    | Execução cancelada.                  |

`retryable` informa possibilidade técnica; a política final pertence ao núcleo.

## 16. Validação e novas tentativas

`attempt` começa em 1. Quando um bloco é refeito após reprovação:

- o núcleo incrementa `attempt`;
- invalida o trecho linear necessário;
- envia `retryFeedback` do bloco `VALIDAR`;
- cria nova chave de idempotência;
- preserva histórico das tentativas anteriores.

O plugin usa feedback para mudar o resultado. Não cria loop interno para contornar `maxAttempts`.

Erro técnico e reprovação editorial são diferentes:

- erro técnico usa resposta `error`;
- reprovação é um `success` válido de uma capacidade `VALIDAR` com `decision = rejected`.

## 17. Logs, progresso e uso

Logs são mensagens curtas para diagnóstico. Não devem conter:

- secrets ou headers de autorização;
- prompts privados completos;
- conteúdo integral de arquivos;
- caminhos privados da máquina;
- payloads inteiros de provedores;
- dados de outros usuários.

Quando disponível, `usage` registra provedor, modelo, unidades e custo estimado. Valores de custo são informativos e identificam moeda. O núcleo pode agregar uso por canal, projeto, processo, bloco, plugin e tentativa.

O plugin deve propagar IDs seguros do provedor para diagnóstico, como `request_id`, sem expor credenciais.

## 18. Segurança do executor

Requisitos mínimos antes de executar plugins comunitários:

- validação integral do manifesto e JSON Schemas;
- verificação de runtime e entrypoint;
- isolamento do processo principal;
- ambiente limpo com variáveis permitidas;
- staging separado por execução;
- permissões mínimas e consentimento;
- timeout, limites de recursos e encerramento da árvore de processos;
- cancelamento recuperável;
- validação de artifacts e URLs;
- proteção contra SSRF, path traversal e symlink escape;
- redaction de secrets;
- hash do pacote instalado;
- registro de versão usada em cada snapshot de Método/execução.

Plugins oficiais seguem as mesmas regras, mesmo quando distribuídos em `plugins/bundled`.

## 19. Instalação, atualização e remoção

```text
plugins/bundled/          plugins oficiais versionados com o aplicativo
data/plugins/installed/   plugins instalados apenas na máquina do usuário
```

O gerenciador descobre manifestos somente em subpastas diretas autorizadas e expõe caminhos relativos.

### Instalação

1. Extrair em pasta temporária.
2. Validar estrutura, manifesto, runtime e integridade.
3. Exibir autor, versão, permissões, settings e secrets.
4. Obter consentimento.
5. Mover atomicamente para a pasta instalada.
6. Executar teste de saúde sem secrets, quando declarado.

### Atualização

- Validar compatibilidade antes de substituir.
- Exigir consentimento se permissões aumentarem.
- Manter versão anterior até a nova passar na validação.
- Execuções em andamento continuam associadas à versão do snapshot.

### Remoção

- Bloquear nova seleção.
- Não apagar outputs já produzidos.
- Informar Métodos que dependem do plugin.
- Remover settings e secrets somente com confirmação explícita.

## 20. Compatibilidade e versionamento

Alterações compatíveis em uma versão de plugin:

- adicionar capacidade;
- ampliar processo ou tipo aceito;
- adicionar configuração opcional com default;
- melhorar implementação sem mudar semântica.

Alterações que exigem major do plugin:

- remover ou renomear capacidade/porta;
- tornar campo opcional obrigatório;
- mudar tipo ou significado de output;
- remover processo ou formato suportado;
- alterar efeitos colaterais ou permissões de forma significativa.

Alterações que exigem nova `apiVersion` do ContentFlow OS:

- mudar envelopes de manifesto, requisição ou resposta de forma incompatível;
- alterar semântica dos estados de execução;
- mudar representação universal de valores;
- mudar regras obrigatórias de artifacts, bindings ou segurança.

O Método deve salvar `pluginId`, `pluginVersion`, `capabilityId` e bindings. A execução salva um snapshot desses dados para ser reproduzível.

## 21. Subconjunto de JSON Schema e validação

`settingsSchema`, `blockConfigSchema` e `outputSchema` usam JSON Schema Draft 2020-12, limitado aos recursos que o núcleo consegue validar e renderizar de forma idêntica em todas as plataformas.

O schema canônico do manifesto fica versionado em [`schemas/contentflow-plugin-v1.schema.json`](schemas/contentflow-plugin-v1.schema.json). Durante o desenvolvimento, `$schema` pode apontar para a cópia local ou para a futura URL oficial; esse campo ajuda editores, mas não substitui a validação feita pelo núcleo.

Recursos aceitos na API v1:

- `type`, `properties`, `required`, `additionalProperties`;
- `title`, `description`, `default`, `examples`;
- `enum`, `const`;
- `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`;
- `minLength`, `maxLength`, `pattern`, `format`;
- `minItems`, `maxItems`, `uniqueItems`, `items`;
- `allOf`, `anyOf`, `oneOf` e `not`, desde que a interface consiga representar o resultado sem código customizado.

Regras adicionais:

- o schema raiz de configurações é sempre `object`;
- `additionalProperties` deve ser `false`, salvo justificativa expressa no protocolo de uma versão futura;
- referências remotas (`$ref` por HTTP), schemas recursivos, funções, expressões e código embutido são proibidos;
- `format` é validado, não apenas exibido; os formatos inicialmente suportados são `uri`, `email`, `date`, `date-time` e `duration`;
- defaults precisam satisfazer o próprio schema;
- valores desconhecidos são rejeitados antes de chamar o plugin;
- limites do executor prevalecem sobre limites mais permissivos do manifesto.

O manifesto é validado em duas etapas: primeiro contra o schema estrutural da `apiVersion`; depois por regras semânticas, como unicidade de IDs, compatibilidade entre portas e tipos, coerência entre permissões e efeitos colaterais e existência do entrypoint.

## 22. Concorrência, isolamento e limpeza

Cada invocação deve ser tratada como independente. Plugins não podem depender de variáveis globais mutáveis, arquivos temporários compartilhados ou ordem entre execuções diferentes.

- `maxConcurrency` declara quantas invocações da capacidade podem coexistir com segurança. Ausência não significa ilimitado: o núcleo escolhe um padrão conservador.
- O núcleo aplica limites globais, por plugin, capacidade, provedor e usuário. O menor limite vence.
- Duas invocações com chaves de idempotência diferentes podem executar ao mesmo tempo; a mesma chave nunca recebe dois `start` concorrentes.
- O diretório de staging e saída é exclusivo por invocação e tentativa.
- Ao terminar, falhar ou cancelar, o plugin fecha streams, sockets, processos filhos e handles. O executor elimina recursos restantes após o prazo de encerramento.
- Cache só pode existir em área concedida pelo núcleo, deve ser descartável, não pode conter secrets e nunca substitui persistência do job.
- Estado necessário para `resume` deve estar no provedor externo, no `jobId` opaco ou em armazenamento futuro explicitamente mediado pelo SDK.

Uma capacidade não deve implementar mutex global para serializar silenciosamente todo o aplicativo. Se o provedor só permite uma operação por vez, declare `maxConcurrency: 1` e documente o limite.

## 23. Efeitos externos, custos e confirmação

`sideEffects` usa os seguintes valores:

| Valor            | Significado                                                 |
| ---------------- | ----------------------------------------------------------- |
| `external_read`  | Consulta ou download em serviço externo.                    |
| `external_write` | Criação, alteração ou exclusão em conta/serviço externo.    |
| `public_publish` | Conteúdo pode se tornar público ou ser enviado a audiência. |
| `local_artifact` | Geração de arquivo importado pelo ContentFlow OS.           |
| `subprocess`     | Execução de programa permitido pelo executor.               |

O array vazio significa que a capacidade é computacional e não produz efeitos fora de `values`. Permissões e efeitos são complementares: `network` autoriza o meio técnico; `external_write` declara a consequência.

Regras:

- todo efeito precisa ser declarado, descrito no README e coerente com as permissões;
- `public_publish`, exclusão remota, compra, contratação, cobrança ou alteração irreversível exigem confirmação humana imediatamente antes do primeiro efeito, com destino e resumo visíveis;
- confirmação não pode ser escondida em termos gerais de instalação nem reutilizada para outro destino;
- simulação ou estimativa deve ocorrer antes da confirmação quando o provedor permitir;
- retries automáticos não podem repetir efeitos não idempotentes;
- o plugin registra identificadores externos necessários à reconciliação e deixa claro quando uma operação ficou em estado incerto;
- `cancel` não promete desfazer um efeito já concluído; deve informar o que permaneceu externo.

`cost.model` aceita:

- `free`: a capacidade não cobra por uso, sem contar infraestrutura própria do usuário;
- `metered`: o provedor cobra por unidade, operação, tempo ou assinatura;
- `unknown`: o plugin não consegue afirmar o modelo de cobrança.

`estimateSupported: true` obriga o plugin a fornecer uma estimativa pelo mecanismo que o SDK definir antes de iniciar operações tarifadas. Estimativas são informativas, incluem moeda/unidade e nunca são apresentadas como preço garantido. Mudança de custo ou efeito externo significativo exige major version do plugin e novo consentimento.

## 24. Privacidade, dados externos e conteúdo não confiável

`dataPolicy.sendsDataToThirdParties` é `true` quando qualquer entrada, contexto, metadado ou arquivo pode sair da máquina do usuário. Nesse caso:

- `providers` lista empresas ou serviços que recebem dados diretamente;
- URLs de retenção e treinamento devem apontar para políticas públicas atuais quando existirem;
- a instalação e a configuração do bloco exibem quais dados podem sair e para qual finalidade;
- o plugin envia somente os campos necessários para a capacidade;
- dados de um canal não podem ser combinados com outro canal;
- secrets de provedor nunca são encaminhados a outro provedor;
- o plugin não pode usar conteúdo do usuário para treinamento, analytics de conteúdo ou finalidade secundária sem consentimento separado e explícito;
- mudança de provedor ou finalidade exige atualização do manifesto e novo consentimento.

Todo conteúdo externo e todo conteúdo gerado por IA são não confiáveis. O plugin deve tratar páginas, legendas, documentos, prompts, nomes de arquivos e metadados como dados, nunca como instruções do sistema. Em especial:

- instruções encontradas dentro de uma entrada não ampliam permissões;
- URLs são validadas contra SSRF, esquemas inseguros, redirecionamentos e destinos locais;
- HTML é sanitizado e scripts não são executados;
- arquivos são verificados por tipo real, tamanho, descompressão excessiva e conteúdo ativo;
- valores externos não são interpolados em shell, SQL, caminhos ou templates executáveis;
- logs e mensagens de erro minimizam dados pessoais e permitem redaction.

O núcleo deve oferecer ao usuário uma forma de inspecionar e revogar consentimentos, apagar settings/secrets locais e identificar o provedor que processou cada execução.

## 25. Proveniência, direitos e mídia gerada

Capacidades que buscam ou geram mídia preservam, quando disponíveis:

- URL e identificador da fonte;
- autor ou titular informado;
- licença e URL da licença;
- data de obtenção;
- termos ou restrições relevantes;
- provedor, modelo e parâmetros necessários à rastreabilidade;
- indicação de conteúdo sintético quando fornecida pelo provedor;
- hash do arquivo importado.

Um resultado tecnicamente válido não implica autorização jurídica de uso. O plugin não deve rotular um asset como “livre” ou “comercial” sem base verificável. Quando a licença estiver ausente ou ambígua, deve marcar a condição como desconhecida para decisão humana.

O README do plugin informa quem é responsável por contas, termos do provedor, direitos de imagem, voz, música, marcas, dados pessoais e publicação. Metadados de proveniência devem acompanhar `records` ou artifacts por campos definidos na capacidade; o núcleo poderá padronizar um envelope de proveniência em versão compatível futura.

Plugins e conteúdos de terceiros possuem suas próprias licenças. A licença do ContentFlow OS não relicencia automaticamente plugins independentes, e a licença de um plugin não concede direito de copiar o núcleo.

## 26. Dependências, snapshots e ausência de plugin

Um Método referencia exatamente `pluginId`, `pluginVersion`, `capabilityId`, configuração e bindings. Na execução, o snapshot registra também hash do pacote e `apiVersion`.

- Um plugin não pode importar código ou chamar capacidades de outro plugin diretamente.
- Composição entre capacidades ocorre no Método, por blocos e contratos universais, mantendo dependências visíveis.
- Se a versão exata não estiver instalada, o núcleo não substitui silenciosamente por outra versão.
- Uma versão patch ou minor compatível pode ser proposta ao usuário; a decisão e a versão efetiva ficam no snapshot.
- Plugin ausente, desativado pelo usuário, bloqueado por política técnica local ou incompatível gera `blocked_executor` com instrução de resolução, nunca sucesso fictício.
- Outputs já produzidos continuam acessíveis após remoção do plugin.
- Importação de Método apresenta dependências, permissões, provedores, custos e versões antes de instalar qualquer pacote.

Para reprodutibilidade, o catálogo deve manter o pacote ou hash das versões usadas durante o período de suporte. Se um provedor remoto mudar o comportamento do modelo, o plugin registra a versão/modelo efetivamente usados sempre que a API permitir.

## 27. Atualização, migração e descontinuação

O plugin pode declarar futuramente migrações de configuração, mas a API v1 não executa scripts arbitrários de migração. Alterações de schema devem ser compatíveis ou exigir uma nova major com migração mediada pelo núcleo e confirmação do usuário.

Política mínima de descontinuação:

- marcar a versão/capacidade como `deprecated` no catálogo sem removê-la imediatamente;
- explicar substituto e prazo de suporte;
- preservar documentação e verificação de integridade das versões ainda referenciadas;
- impedir novas seleções somente após aviso adequado;
- não alterar um pacote publicado sob o mesmo número de versão;
- remover imediatamente do catálogo apenas para malware, credencial comprometida, violação grave ou risco material, sem apagar cópias locais.

Atualizações são instaladas lado a lado ou de modo atomicamente reversível. Falha de validação mantém a versão anterior. Jobs assíncronos continuam presos à versão que iniciou a operação.

## 28. Diagnóstico, telemetria e suporte

O executor associa logs, métricas e eventos a `traceId`, `executionId`, bloco, tentativa, plugin, capacidade e versão, sem incluir secrets ou conteúdo integral.

Telemetria do plugin:

- é desativada por padrão quando não for indispensável ao serviço contratado;
- requer declaração de provedor e finalidade;
- não pode capturar prompts, arquivos ou outputs para analytics sem consentimento separado;
- respeita exclusão e preferências locais;
- não envia identificadores estáveis desnecessários.

O pacote deve documentar canal de suporte e de vulnerabilidades. Diagnósticos exportáveis passam por redaction, mostram previamente o que será compartilhado e dependem de ação humana. Health checks não usam secrets nem realizam cobrança, publicação ou escrita externa.

## 29. Governança e distribuição do ecossistema

Plugins podem ser distribuídos por arquivo, URL, repositório, organização ou catálogo. A instalação e execução local de um pacote compatível não exigem submissão nem aprovação do mantenedor. Catálogos são superfícies opcionais de descoberta e confiança.

Quando houver catálogo, ele diferencia plugins `official`, `verified`, `community` e `private`:

- `official`: mantido e assinado pelo ContentFlow OS;
- `verified`: identidade, pacote e requisitos mínimos revisados, sem garantia de ausência de falhas;
- `community`: distribuído pelo autor e ainda não verificado pelo projeto.
- `private`: instalado diretamente pelo usuário ou por uma organização, fora do catálogo público.

Todo anúncio exibe autor, licença, versão, origem, hash/assinatura quando disponível, permissões, efeitos externos, provedores, política de dados, custos, suporte e histórico de segurança. “Verified” não equivale a endosso do conteúdo gerado ou dos termos do provedor.

O processo opcional de publicação, revisão, denúncia, remoção de catálogo e recurso está detalhado em [`PLUGIN_ECOSYSTEM.md`](PLUGIN_ECOSYSTEM.md). Requisitos técnicos automáticos de instalação e execução estão em [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).

Plugins podem ser gratuitos, pagos, proprietários ou de código aberto conforme a licença de cada autor, desde que sejam integrações independentes construídas sobre o protocolo público. Não podem incorporar código protegido do núcleo nem se apresentar como clone, edição white-label ou substituto rebatizado do ContentFlow OS. A exceção para plugins e os limites de uso do código principal estão no [`LICENSE`](../LICENSE).

## 30. Conformidade mínima

Antes de publicar um plugin:

- [ ] Manifesto válido e IDs estáveis.
- [ ] Licença, autoria, origem e suporte documentados.
- [ ] Runtime e entrypoint compatíveis.
- [ ] Portas obrigatórias e opcionais declaradas.
- [ ] Configuração validada e defaults visíveis.
- [ ] Permissões mínimas.
- [ ] Efeitos externos, custos, provedores e políticas de dados declarados.
- [ ] Confirmação humana testada para publicação e ações irreversíveis.
- [ ] Concorrência, idempotência e limpeza de recursos testadas.
- [ ] Secrets ausentes de método, resposta e logs.
- [ ] Sucesso validado para todos os formatos declarados.
- [ ] Entrada ausente e tipo incorreto testados.
- [ ] Idempotência testada.
- [ ] Timeout e cancelamento testados.
- [ ] `pending`/`resume` testados quando assíncrono.
- [ ] Artifacts inválidos e grandes demais rejeitados.
- [ ] Rate limit e falha do provedor tratados.
- [ ] Retry com `retryFeedback` testado.
- [ ] Uso e logs não expõem conteúdo sensível.
- [ ] Conteúdo externo tratado como não confiável e resistência a prompt injection testada.
- [ ] Proveniência e situação de licença de mídia preservadas quando disponíveis.
- [ ] Ausência, atualização e descontinuação do plugin não corrompem Métodos ou outputs.
- [ ] README documenta custos, limites, licenças e efeitos externos.

O ContentFlow Reference Plugin será a implementação executável de conformidade para este protocolo.
