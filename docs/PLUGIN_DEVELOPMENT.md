# Desenvolvimento de plugins

Este guia leva um plugin do manifesto ao resultado validado. O protocolo normativo é [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md); a referência TypeScript é [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts).

> Estado atual: o ContentFlow OS já descobre e apresenta manifestos. O carregamento isolado do `entrypoint` ainda não está disponível. Este guia define o alvo de implementação para que plugins possam ser preparados sem inventar contratos paralelos.

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

Comece pelo exemplo completo em [`examples/contentflow.plugin.example.json`](examples/contentflow.plugin.example.json). Defina:

1. identidade estável e versão semântica;
2. menor conjunto possível de permissões;
3. segredos pelo nome, nunca pelo valor;
4. uma ou mais capacidades;
5. configurações do plugin em JSON Schema;
6. blocos, processos e formatos realmente suportados.

`blockConfigSchema` descreve opções escolhidas no método, como modelo, temperatura ou endpoint. `settingsSchema` descreve preferências locais reutilizadas entre métodos. Credenciais ficam apenas em `secretKeys`.

## 4. Implemente um handler puro

O entrypoint deverá exportar uma função assíncrona que aceite `PluginExecutionRequest` e devolva `PluginExecutionResponse`:

```ts
import type { PluginExecutionRequest, PluginExecutionResponse } from "contentflow/plugin-contract";

export async function execute(request: PluginExecutionRequest): Promise<PluginExecutionResponse> {
  const topicInput = request.inputContract.find((field) => field.label === "Tema");
  const topic = topicInput ? request.inputs[topicInput.id] : undefined;

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
    values: { title_options: [`Como ${topic} funciona`, `${topic}: guia prático`] },
  };
}
```

O import público do SDK será disponibilizado junto com o executor. Até lá, use [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts) como referência ou copie apenas os tipos para prototipação; não acople o plugin a arquivos internos do aplicativo em produção.

Boas propriedades do handler:

- determinístico quando recebe a mesma entrada e configuração, salvo dependências externas;
- sem estado global mutável entre execuções;
- tolerante a campos opcionais ausentes;
- abortável pelo executor e com timeout próprio para chamadas externas;
- sem efeitos colaterais fora das permissões declaradas;
- retorna erros tipados em vez de lançar detalhes internos ao usuário.

## 5. Leia entradas pelo contrato

`inputs` é indexado pelo `id` presente em `inputContract`. Não dependa da posição visual nem tente buscar saídas diretamente no banco. O núcleo já resolveu a origem correta, inclusive quando ela veio de um processo muito anterior.

Para `records`, leia `recordFields` antes dos valores. Assim o mesmo plugin pode trabalhar com listas de cenas, CTAs ou planos sem assumir colunas invisíveis:

```ts
const shotsContract = request.inputContract.find((field) => field.type === "records");
const shots = shotsContract ? request.inputs[shotsContract.id] : undefined;
if (!Array.isArray(shots)) return invalidInput("Era esperada uma lista de registros.");
```

Para `datetime`, trate o texto como ISO 8601 e converta explicitamente. Para arquivos, use a referência `StoredFile` entregue pelo núcleo; não confunda a URL controlada com um caminho livre no sistema de arquivos.

## 6. Produza exatamente o output solicitado

Use as chaves de `outputContract`. O plugin pode suportar diversos formatos, mas em cada execução deve entregar o contrato configurado naquele bloco.

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

## 7. Respeite validações e tentativas

Um plugin de `VALIDAR` recebe `validation` para conhecer o modo configurado. Ele devolve a decisão nas saídas pedidas; não movimenta o fluxo sozinho.

Quando um resultado é reprovado e o núcleo repete o bloco-alvo, a nova requisição traz:

- `attempt`: número da tentativa atual, começando em 1;
- `retryFeedback`: valores produzidos pela validação, incluindo justificativa quando houver.

Use o feedback para alterar a produção. Não implemente um loop interno ilimitado: o limite `maxAttempts` é controlado pelo método.

## 8. Trate erros de forma operacional

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

## 9. Teste antes de distribuir

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
- segunda tentativa usando `retryFeedback`;
- ausência de segredos nos logs.

Fixtures de requisição e resposta podem seguir [`examples/plugin-request.example.json`](examples/plugin-request.example.json).

## 10. Checklist de publicação

- [ ] `apiVersion` é `"1"`.
- [ ] `id` não mudou desde a primeira publicação.
- [ ] A versão foi incrementada de acordo com a mudança.
- [ ] Permissões e segredos estão completos e mínimos.
- [ ] Capacidades não prometem processos ou formatos não testados.
- [ ] O build de produção está no caminho do `entrypoint`.
- [ ] README explica configuração, custos externos e limitações.
- [ ] LICENSE acompanha o pacote.
- [ ] Nenhum segredo ou dado local foi incluído.
- [ ] Testes cobrem sucesso, erro e nova tentativa.
