# Protocolo de Plugins do ContentFlow OS — API v1

Este documento é o contrato normativo entre o núcleo do ContentFlow OS e plugins dos operadores `IA` e `Código`. Em caso de divergência, a tipagem em [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts) e este documento devem ser atualizados juntos.

O executor isolado ainda não foi implementado. Como ainda não existem plugins públicos, a API v1 pode ser refinada antes da primeira distribuição. Depois da publicação do primeiro plugin, qualquer alteração incompatível exigirá nova `apiVersion`.

Documentos relacionados:

- [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md): tutorial de implementação.
- [`PLUGIN_ROADMAP.md`](PLUGIN_ROADMAP.md): ordem estratégica e catálogo por processo.
- [`ARCHITECTURE.md`](ARCHITECTURE.md): domínio, processos, blocos e operadores.

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
};
```

O plugin encaminha `signal` a operações abortáveis. `getSecret` aceita apenas chaves declaradas pelo próprio manifesto. Os dois serviços de arquivo retornam caminhos dentro do sandbox, nunca caminhos arbitrários do host.

Webhooks e runtimes adicionais podem ser oferecidos depois por adapters oficiais, sem tornar a API v1 genérica demais.

## 5. Manifesto

Cada plugin possui `contentflow.plugin.json` na raiz:

```json
{
  "apiVersion": "1",
  "id": "com.exemplo.gerador-texto",
  "name": "Gerador de texto",
  "version": "1.0.0",
  "description": "Cria textos usando um provedor externo.",
  "author": "Exemplo",
  "runtime": {
    "kind": "node",
    "version": ">=22",
    "module": "esm"
  },
  "minCoreVersion": "1.0.0",
  "entrypoint": "dist/index.js",
  "permissions": ["network"],
  "secretKeys": ["EXEMPLO_API_KEY"],
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
        "supportsCancellation": false
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

### Runtime

- `runtime.kind` é `node` na API v1.
- `runtime.module` é `esm`.
- `runtime.version` é validada contra o Node empacotado pelo aplicativo.

### Capacidades

- `operator` aceita somente `IA` ou `Código`.
- `blockTypes` contém um ou mais dos quatro blocos.
- `processTypes` restringe a capacidade; ausência significa todos os processos.
- `inputPorts` e `outputPorts` descrevem os papéis semânticos.
- `acceptedInputTypes` e `producedOutputTypes` são resumos para descoberta rápida; portas são a autoridade para binding.
- `execution` declara comportamento imediato ou assíncrono.
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

| Permissão          | Autoriza                                                             |
| ------------------ | -------------------------------------------------------------------- |
| `network`          | Conexões de rede sob políticas do executor.                          |
| `filesystem:read`  | Leitura do diretório de staging e arquivos liberados.                |
| `filesystem:write` | Escrita apenas no diretório de saída temporário.                     |
| `process`          | Subprocessos permitidos, como FFmpeg, dentro de allowlist e limites. |

Uma permissão declarada não significa acesso irrestrito. O executor ainda aplica:

- diretórios permitidos;
- bloqueio de travessia e symlink escape;
- allowlist de executáveis;
- timeout e cancelamento;
- limites de CPU, memória, disco e tamanho de saída;
- política de rede e redirecionamentos;
- redaction de secrets em logs.

Instalação e atualização exibem qualquer aumento de permissões e exigem novo consentimento.

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

O núcleo chama `execute()` com `invocation.mode = "start"`. A capacidade devolve `success` ou `error` dentro do timeout.

### 9.3 Execução assíncrona

Geradores de vídeo, avatares, renderizações e uploads podem durar minutos. Eles não devem manter um processo local ocioso fazendo polling indefinido.

1. `start` inicia o job externo.
2. O plugin devolve `pending`, `jobId` e `pollAfterMs`.
3. O núcleo persiste o estado e agenda nova chamada.
4. `resume` consulta o mesmo job.
5. O plugin retorna novamente `pending`, ou finaliza com `success`/`error`.
6. Se o usuário cancelar e a capacidade suportar, o núcleo chama `cancel`.

O `jobId` é opaco para o núcleo, mas não pode conter secrets. O plugin deve conseguir retomar usando `jobId`, settings e secrets declarados, sem memória global do processo anterior.

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
- O valor de mídia correspondente usa um `StoredFile` com mesmo `id` e URL temporária `artifact://final-video`.
- O núcleo verifica MIME, tamanho, existência e hash, importa o arquivo e substitui a URL temporária.
- Artifacts não referenciados por uma saída podem ser descartados.
- Arquivos parciais são removidos em erro ou cancelamento.
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
  usage?: PluginUsage;
  logs?: string[];
}
```

`pollAfterMs` respeita mínimo e máximo impostos pelo núcleo. `progress` deve ser monotônico quando conhecido; ausência é preferível a um valor inventado.

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

## 21. Conformidade mínima

Antes de publicar um plugin:

- [ ] Manifesto válido e IDs estáveis.
- [ ] Runtime e entrypoint compatíveis.
- [ ] Portas obrigatórias e opcionais declaradas.
- [ ] Configuração validada e defaults visíveis.
- [ ] Permissões mínimas.
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
- [ ] README documenta custos, limites, licenças e efeitos externos.

O ContentFlow Reference Plugin será a implementação executável de conformidade para este protocolo.
