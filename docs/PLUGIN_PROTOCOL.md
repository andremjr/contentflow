# Protocolo de Plugins do ContentFlow OS — API v1

Este é o contrato normativo entre o núcleo do ContentFlow OS e plugins dos operadores `IA` e `Código`. A descoberta e o gerenciamento de manifestos já usam este contrato; o executor isolado ainda será implementado. Mudanças incompatíveis exigem uma nova `apiVersion`.

Para um tutorial de implementação, exemplos e checklist, consulte [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md).

## 1. Fronteira de responsabilidades

O núcleo controla canais, projetos, métodos, ordem e estado dos blocos, resolução das entradas, Biblioteca Estratégica, arquivos, credenciais, tentativas, validações, notificações e outputs universais. O plugin executa uma capacidade declarada e devolve somente as saídas tipadas solicitadas.

Plugins nunca acessam diretamente o SQLite, o estado da interface ou diretórios internos. Tudo que podem ler chega em `PluginExecutionRequest`; tudo que produzem volta em `PluginExecutionResponse`.

## 2. Manifesto

Cada plugin possui um `contentflow.plugin.json` na raiz:

```json
{
  "apiVersion": "1",
  "id": "com.exemplo.gerador-texto",
  "name": "Gerador de texto",
  "version": "1.0.0",
  "description": "Cria textos usando um provedor externo.",
  "author": "Exemplo",
  "entrypoint": "dist/index.js",
  "permissions": ["network"],
  "secretKeys": ["EXEMPLO_API_KEY"],
  "settingsSchema": {
    "type": "object",
    "properties": { "baseUrl": { "type": "string", "format": "uri" } }
  },
  "capabilities": [
    {
      "id": "generate-text",
      "operator": "IA",
      "blockTypes": ["CRIAR"],
      "processTypes": ["theme", "title", "script"],
      "acceptedInputTypes": ["text", "textarea", "list", "records"],
      "producedOutputTypes": ["text", "textarea", "list", "records"],
      "blockConfigSchema": {
        "type": "object",
        "properties": { "model": { "type": "string" } },
        "required": ["model"]
      },
      "outputSchema": { "type": "object" }
    }
  ]
}
```

Regras:

- `apiVersion` deve ser `"1"`.
- `id` é global, estável e usa notação de domínio reverso.
- `version` segue versionamento semântico.
- `entrypoint` é relativo à raiz do plugin e não pode escapar dela.
- `operator` aceita apenas `IA` ou `Código`; `Humano` é nativo do núcleo.
- Uma capacidade só aparece quando operador, bloco, processo e formatos são compatíveis.
- `blockConfigSchema` gera os parâmetros próprios da capacidade no editor do método.
- `settingsSchema` descreve configuração local global; `secretKeys` lista segredos que nunca entram no método.

## 3. Permissões

Permissões válidas na API v1: `network`, `filesystem:read`, `filesystem:write` e `process`. O carregador deve validar o manifesto, exibir as permissões e obter consentimento antes da instalação. Uma permissão declarada não autoriza acesso irrestrito: o executor ainda limita caminhos, rede, tempo e recursos.

## 4. Ciclo de execução

1. O núcleo encontra a capacidade compatível selecionada no bloco.
2. Resolve todas as entradas a partir do projeto, processos anteriores, blocos anteriores, biblioteca ou valor fixo.
3. Se uma entrada estiver ausente ou incompatível, pausa o bloco sem chamar o plugin.
4. Monta a requisição com somente o contexto permitido, o contrato esperado e a tentativa atual.
5. Executa o entrypoint com isolamento e timeout.
6. Valida a resposta e cada valor contra `outputContract`.
7. Persiste as saídas; em erro, aplica a política de repetição do núcleo.

O plugin não controla a ordem dos blocos, não cria ramificações e não reinicia blocos. Em uma reprovação, o núcleo decide o trecho linear a repetir e envia `attempt` e `retryFeedback` na nova chamada.

## 5. Requisição

A tipagem canônica está em [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts).

```ts
type PluginExecutionRequest = {
  executionId: string;
  blockId: string;
  capabilityId: string;
  attempt: number;
  configuration: Record<string, unknown>;
  inputs: Record<string, RuntimeValue>; // chave = id de input em inputContract
  inputContract: Array<{
    id: string;
    label: string;
    type: HumanFieldType;
    recordFields?: RecordFieldDefinition[];
  }>;
  outputContract: PluginFieldContract[];
  validation?: BlockValidationConfig;
  retryFeedback?: Record<string, RuntimeValue>;
  context: PluginExecutionContext;
};
```

`context` contém apenas identidade e metadados úteis do canal/projeto, o processo atual, outputs anteriores e, para `ESCOLHER`, a coleção vinculada. O plugin deve tratar todos esses dados como não confiáveis e não presumir que campos opcionais existem.

## 6. Formatos universais

| ID                 | Valor JSON                   | Uso principal                                            |
| ------------------ | ---------------------------- | -------------------------------------------------------- |
| `text`             | string                       | Nome, título ou valor curto.                             |
| `textarea`         | string                       | Roteiro, instrução ou texto longo.                       |
| `number`           | number                       | Quantidade, nota ou duração numérica.                    |
| `boolean`          | boolean                      | Estado binário sem semântica de aprovação.               |
| `list`             | string[]                     | Lista homogênea de textos.                               |
| `records`          | object[]                     | Lista ordenada com colunas tipadas por `recordFields`.   |
| `select`           | string                       | Uma opção dentre `options`.                              |
| `multiselect`      | string[]                     | Várias opções dentre `options`.                          |
| `datetime`         | string ISO 8601              | Instante com data, hora e fuso.                          |
| `url`              | string URI                   | Link navegável.                                          |
| `file`             | `StoredFile`                 | Referência a um arquivo genérico gerenciado pelo núcleo. |
| `files`            | `StoredFile[]`               | Várias referências de arquivo.                           |
| `image`            | `StoredFile` ou URL          | Imagem. Prefira referência gerenciada.                   |
| `audio`            | `StoredFile` ou URL          | Áudio. Prefira referência gerenciada.                    |
| `video`            | `StoredFile` ou URL          | Vídeo. Prefira referência gerenciada.                    |
| `approval`         | `"approved"` ou `"rejected"` | Decisão formal de validação.                             |
| `thumbnail_layout` | `ThumbnailLayout`            | Composição 16:9 editável, não uma imagem renderizada.    |

Datas devem sair em ISO 8601, preferencialmente UTC (`2026-08-08T17:30:00.000Z`). Arquivos são referências; o plugin não deve embutir bytes em base64. Uma lista de registros deve conter somente as chaves declaradas e respeitar os tipos e campos obrigatórios do esquema interno.

```json
{
  "aspectRatio": "16:9",
  "boxes": [
    { "id": "headline", "label": "Título", "color": "#2563eb", "x": 6, "y": 8, "w": 55, "h": 24 }
  ]
}
```

Coordenadas e dimensões do layout são percentuais. `x`, `y`, `w` e `h` devem permanecer entre 0 e 100, sem ultrapassar os limites do quadro.

## 7. Semântica dos quatro blocos

- `BUSCAR`: consulta uma fonte e devolve dados ou mídias externas.
- `ESCOLHER`: recebe do núcleo os itens da coleção estratégica vinculada e devolve o item escolhido. Não seleciona resultados de blocos anteriores.
- `CRIAR`: produz novo texto, arquivo, mídia, layout ou dado estruturado.
- `VALIDAR`: avalia o output de um bloco anterior. Pode aprovar/reprovar, escolher uma ou várias opções. O núcleo interpreta a decisão e controla novas tentativas.

## 8. Resposta e erros

```ts
type PluginExecutionResponse =
  | { status: "success"; values: Record<string, RuntimeValue>; logs?: string[] }
  | { status: "error"; code: string; message: string; retryable: boolean; logs?: string[] };
```

Em sucesso, as chaves de `values` devem existir no `outputContract`; saídas obrigatórias não podem estar vazias. Valores adicionais são rejeitados. Em erro, use um `code` curto e estável (`RATE_LIMIT`, `INVALID_CONFIGURATION`, `UPSTREAM_UNAVAILABLE`) e uma mensagem segura para o usuário. `retryable` informa se repetir a mesma chamada pode funcionar; a decisão final pertence ao núcleo.

Logs não podem conter segredos, conteúdo integral de credenciais, tokens de autorização ou caminhos privados da máquina.

## 9. Instalação e armazenamento

```text
plugins/bundled/          plugins oficiais versionados no GitHub
data/plugins/installed/   plugins instalados apenas na máquina do usuário
```

A rota global `/plugins` descobre `contentflow.plugin.json` nas subpastas desses diretórios. A API expõe somente caminhos relativos. Segredos são configurações locais globais e nunca fazem parte do método, de arquivos compartilhados, logs ou Git.

## 10. Compatibilidade

Adicionar capacidade, processo ou formato aceito é compatível. Remover ou renomear capacidade, configuração, output ou semântica exige nova versão do plugin. Alterar o envelope de execução de forma incompatível exige nova `apiVersion` do ContentFlow OS.
