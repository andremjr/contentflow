# Desenvolvimento de plugins

Este guia leva um plugin do manifesto ao resultado validado. O protocolo normativo é [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md), a referência TypeScript é [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts) e a ordem estratégica está em [`PLUGIN_ROADMAP.md`](PLUGIN_ROADMAP.md). Antes de distribuir, consulte também [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md) e [`PLUGIN_ECOSYSTEM.md`](PLUGIN_ECOSYSTEM.md).

> Estado atual: o ContentFlow OS descobre manifestos e já executa entrypoints oficiais incluídos em `plugins/bundled` por um processo separado. Plugins locais e comunitários continuam apenas visíveis até a conclusão dos gates de sandbox, permissões e instalação segura.

## 1. Escolha uma capacidade pequena

Uma capacidade deve fazer uma coisa observável em um dos quatro blocos. Exemplos:

- buscar referências na web (`BUSCAR` + `Código`);
- criar três títulos (`CRIAR` + `IA`);
- renderizar uma imagem a partir de um layout (`CRIAR` + `Código`);
- validar um roteiro por critérios editoriais (`VALIDAR` + `IA`).

Não modele um método inteiro dentro de um plugin. Sequência, entradas, validação humana e novas tentativas pertencem ao núcleo.

## 2. Estruture a pasta

```text
meu-plugin/
├── contentflow.plugin.json
├── package.json
├── src/
│   └── index.ts
├── dist/
│   └── index.js
├── README.md
└── LICENSE
```

O pacote distribuído precisa conter o manifesto e o arquivo indicado por `entrypoint`. Não inclua `.env`, chaves, caches, dados de usuários ou dependências de desenvolvimento desnecessárias.

## 3. Declare o manifesto

Comece pelo exemplo completo em [`examples/contentflow.plugin.example.json`](examples/contentflow.plugin.example.json) e valide-o com [`schemas/contentflow-plugin-v1.schema.json`](schemas/contentflow-plugin-v1.schema.json). Defina:

1. identidade estável e versão semântica;
2. menor conjunto possível de permissões;
3. segredos pelo nome, nunca pelo valor;
4. uma ou mais capacidades;
5. configurações do plugin em JSON Schema;
6. portas semânticas de entrada e saída;
7. política imediata ou assíncrona;
8. blocos, processos e formatos realmente suportados.
9. licença, autoria, repositório e suporte;
10. efeitos externos, modelo de custo e política de dados;
11. limite seguro de concorrência.

`blockConfigSchema` descreve opções escolhidas no método, como modelo, temperatura ou endpoint. `settingsSchema` descreve preferências locais reutilizadas entre métodos. Credenciais ficam apenas em `secretKeys`.

## 4. Implemente um handler puro

O entrypoint deverá exportar uma função assíncrona que aceite `PluginExecutionRequest` e devolva `PluginExecutionResponse`:

```ts
import type {
  PluginExecutionRequest,
  PluginExecutionResponse,
  PluginExecutionServices,
} from "contentflow/plugin-contract";

export async function execute(
  request: PluginExecutionRequest,
  services: PluginExecutionServices,
): Promise<PluginExecutionResponse> {
  if (request.invocation.mode !== "start") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "Esta capacidade não cria jobs assíncronos.",
      retryable: false,
    };
  }

  if (services.signal.aborted) {
    return { status: "error", code: "CANCELLED", message: "Execução cancelada.", retryable: false };
  }

  const topic = request.inputs.topic;

  if (typeof topic !== "string") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "A entrada Tema precisa ser texto.",
      retryable: false,
    };
  }

  return {
    status: "success",
    values: { result: [`Como ${topic} funciona`, `${topic}: guia prático`] },
  };
}
```

O import público do SDK será disponibilizado junto com o executor. Até lá, use [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts) como referência ou copie apenas os tipos para prototipação; não acople o plugin a arquivos internos do aplicativo em produção.

Use `services.getSecret()` somente para chaves declaradas, `services.resolveInputFile()` para arquivos recebidos e `services.getOutputPath()` para artifacts. Encaminhe `services.signal` a `fetch` e SDKs que aceitem cancelamento.

Boas propriedades do handler:

- determinístico quando recebe a mesma entrada e configuração, salvo dependências externas;
- sem estado global mutável entre execuções;
- tolerante a campos opcionais ausentes;
- abortável pelo executor e com timeout próprio para chamadas externas;
- sem efeitos colaterais fora das permissões declaradas;
- retorna erros tipados em vez de lançar detalhes internos ao usuário.
- usa `request.traceId` apenas para correlação segura e respeita `context.locale`/`context.timeZone` sem alterar instantes ISO 8601;
- trata entradas, páginas, arquivos e outputs de IA como dados não confiáveis, nunca como autorização para ampliar permissões.

## 5. Leia entradas pelo contrato

`inputs` é indexado pela `portKey` semântica declarada pela capacidade e registrada em `inputContract`. Não dependa do label, da posição visual ou do ID interno do campo. O núcleo já resolveu a origem correta, inclusive quando ela veio de um processo muito anterior.

Para `records`, leia `recordFields` antes dos valores. Assim o mesmo plugin pode trabalhar com listas de cenas, CTAs ou planos sem assumir colunas invisíveis:

```ts
const shotsContract = request.inputContract.find((field) => field.portKey === "shots");
const shots = request.inputs.shots;
if (!Array.isArray(shots)) return invalidInput("Era esperada uma lista de registros.");
if (shotsContract?.type !== "records") return invalidInput("O binding de shots está incorreto.");
```

Para `datetime`, trate o texto como ISO 8601 e converta explicitamente. Para arquivos, use a referência `StoredFile` entregue pelo núcleo; não confunda a URL controlada com um caminho livre no sistema de arquivos.

## 6. Produza exatamente o output solicitado

Use as `portKey` de `outputContract`. O plugin pode suportar diversos formatos, mas em cada execução deve entregar o contrato configurado naquele bloco. O núcleo converte a porta semântica para a chave técnica da saída do Método.

Exemplo de lista de registros:

```json
{
  "status": "success",
  "values": {
    "scenes": [
      { "scene": 1, "narration": "Abra com a promessa", "duration": 6 },
      { "scene": 2, "narration": "Mostre a demonstração", "duration": 12 }
    ]
  }
}
```

Exemplo de data:

```json
{ "status": "success", "values": { "publish_at": "2026-08-08T17:30:00.000Z" } }
```

Exemplo de layout de thumbnail:

```json
{
  "status": "success",
  "values": {
    "layout": {
      "aspectRatio": "16:9",
      "boxes": [
        {
          "id": "person",
          "label": "Pessoa",
          "color": "#7c3aed",
          "x": 58,
          "y": 5,
          "w": 38,
          "h": 90
        },
        {
          "id": "headline",
          "label": "Headline",
          "color": "#2563eb",
          "x": 5,
          "y": 18,
          "w": 48,
          "h": 30
        }
      ]
    }
  }
}
```

## 7. Implemente jobs assíncronos quando necessário

Não mantenha o processo aberto durante vários minutos esperando um gerador de vídeo, avatar, renderização ou upload. Declare `execution.mode = "async"` e trate três invocações:

```ts
if (request.invocation.mode === "start") {
  const job = await provider.start(request.inputs.prompt);
  return { status: "pending", jobId: job.id, pollAfterMs: 5000, progress: 0 };
}

if (request.invocation.mode === "resume") {
  const job = await provider.get(request.invocation.jobId);
  if (!job.finished) {
    return {
      status: "pending",
      jobId: job.id,
      pollAfterMs: 5000,
      progress: job.progress,
    };
  }
  return finishedJobToResponse(job);
}

await provider.cancel(request.invocation.jobId);
return { status: "error", code: "CANCELLED", message: "Job cancelado.", retryable: false };
```

O `jobId` precisa ser suficiente para retomar em outro processo, sem memória global. `start`, `resume` e `cancel` devem ser idempotentes. Não invente progresso quando o provedor não o informar.

## 8. Entregue arquivos como artifacts

Escreva somente no diretório de saída autorizado ou declare uma URL remota. Em seguida, associe a saída a um artifact:

```ts
return {
  status: "success",
  values: {
    video: {
      id: "final-video",
      name: "final.mp4",
      mimeType: "video/mp4",
      size: renderedSize,
      url: "artifact://final-video",
    },
  },
  artifacts: [
    {
      id: "final-video",
      name: "final.mp4",
      mimeType: "video/mp4",
      size: renderedSize,
      source: { kind: "path", path: "final.mp4" },
    },
  ],
};
```

O núcleo valida e importa o arquivo. Nunca retorne bytes em base64, caminho absoluto ou `../`. Para arquivos de entrada, use o resolvedor seguro que será fornecido pelo SDK do executor.

## 9. Respeite validações e tentativas

Um plugin de `VALIDAR` recebe `validation` para conhecer o modo configurado. Ele devolve a decisão nas saídas pedidas; não movimenta o fluxo sozinho.

Quando um resultado é reprovado e o núcleo repete o bloco-alvo, a nova requisição traz:

- `attempt`: número da tentativa atual, começando em 1;
- `retryFeedback`: valores produzidos pela validação, incluindo justificativa quando houver.

Use o feedback para alterar a produção. Não implemente um loop interno ilimitado: o limite `maxAttempts` é controlado pelo método.

## 10. Trate erros de forma operacional

Use códigos estáveis e diga se a operação pode ser repetida:

```ts
return {
  status: "error",
  code: "UPSTREAM_UNAVAILABLE",
  message: "O provedor não respondeu dentro do prazo.",
  retryable: true,
  logs: ["request_id=provider-123"],
};
```

Erros de autenticação, configuração ou formato de entrada normalmente não são repetíveis. Timeout, rate limit e indisponibilidade temporária normalmente são. Nunca coloque segredo, prompt privado completo ou resposta sensível em `message` ou `logs`.

## 11. Declare custos, dados e efeitos com precisão

Permissão técnica não descreve a consequência para o usuário. Uma capacidade com `network` pode apenas ler uma página, criar um job tarifado ou publicar um vídeo. Por isso, declare também:

- `sideEffects`: leitura/escrita externa, publicação pública, artifact local e subprocesso;
- `cost.model`: gratuito, tarifado ou desconhecido;
- `cost.estimateSupported`: se é possível estimar antes da operação;
- `dataPolicy`: terceiros que recebem dados e links de retenção/treinamento.

Se a capacidade publica, compra, exclui ou realiza uma ação externa irreversível, prepare-a para confirmação humana imediatamente antes do efeito. Não repita automaticamente uma operação cujo estado ficou incerto; primeiro consulte o provedor usando a chave de idempotência ou identificador externo.

Se buscar mídia, preserve origem, autor, licença, URL da licença e identificador quando disponíveis. Licença ausente deve ser informada como desconhecida, não presumida como livre.

## 12. Teste antes de distribuir

Teste no mínimo:

- manifesto válido e `entrypoint` existente;
- cada combinação declarada de bloco/processo;
- entrada obrigatória ausente;
- cada formato aceito, incluindo registro vazio e campos opcionais;
- data com fuso e virada de dia;
- arquivo inválido ou indisponível;
- layout com caixas nos limites do quadro;
- resposta com chave, tipo ou obrigatório incorreto;
- timeout, rate limit e credencial inválida;
- `start`, `resume` e `cancel` para capacidades assíncronas;
- duas chamadas `start` idênticas sem cobrança ou job duplicado;
- artifact ausente, inválido, grande demais ou fora do diretório permitido;
- segunda tentativa usando `retryFeedback`;
- ausência de segredos nos logs.
- concorrência até `maxConcurrency`, limpeza após cancelamento e ausência de estado compartilhado entre canais;
- conteúdo externo com prompt injection, URL privada, redirect inseguro e nome de arquivo hostil;
- confirmação e reconciliação de efeitos externos;
- coerência entre tráfego real, providers e política de dados declarada.

Fixtures de requisição e resposta podem seguir [`examples/plugin-request.example.json`](examples/plugin-request.example.json).

## 13. Checklist de publicação

- [ ] `apiVersion` é `"1"`.
- [ ] `id` não mudou desde a primeira publicação.
- [ ] A versão foi incrementada de acordo com a mudança.
- [ ] Permissões e segredos estão completos e mínimos.
- [ ] Licença, autoria, origem e suporte estão declarados.
- [ ] Efeitos externos, custos e política de dados correspondem ao comportamento real.
- [ ] `maxConcurrency` foi medido e testado.
- [ ] Portas possuem chaves semânticas estáveis e bindings testados.
- [ ] Capacidades não prometem processos ou formatos não testados.
- [ ] Jobs demorados usam o lifecycle assíncrono.
- [ ] Arquivos são entregues por artifacts controlados.
- [ ] O build de produção está no caminho do `entrypoint`.
- [ ] README explica configuração, custos externos e limitações.
- [ ] README explica terceiros, retenção, treinamento, proveniência e efeitos irreversíveis.
- [ ] LICENSE acompanha o pacote.
- [ ] Nenhum segredo ou dado local foi incluído.
- [ ] Testes cobrem sucesso, erro e nova tentativa.
