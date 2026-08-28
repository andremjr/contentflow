# Criar plugins com IA

Este documento é o contexto compacto para criar ou adaptar um plugin com um agente de código sem compartilhar o repositório inteiro. Envie ao agente:

1. este arquivo;
2. [`schemas/contentflow-plugin-v1.schema.json`](schemas/contentflow-plugin-v1.schema.json);
3. opcionalmente, um handler de [`../plugin-kit/templates`](../plugin-kit/templates) e os arquivos da automação existente.

Compatibilidade: Plugin API v1 e Node 26. O contrato normativo continua em [`protocol.md`](protocol.md).

## Prompt sugerido

> Crie ou adapte um plugin independente para a ContentFlow Plugin API v1. Preserve a lógica da automação existente e implemente somente o adapter necessário para `execute(request, services)`. Use o contrato e o schema anexos. Não importe arquivos internos do aplicativo, não injete React/HTML, não grave credenciais e não execute instaladores. Entregue `contentflow.plugin.json`, o entrypoint ESM, `README.md`, `test.mjs` e uma fixture. Declare dados enviados a terceiros, permissões, dependências empacotadas, custos e riscos. Valide todos os itens deste documento antes de concluir.

Inclua no pedido o objetivo observável, operador, blocos compatíveis, entradas, saídas, tipos, hosts externos, nomes de credenciais, política de dados do provedor e se a implementação usa API, programa local, navegador ou job assíncrono.

## Contrato resumido

Um plugin é uma pasta independente com `contentflow.plugin.json` e um entrypoint ESM que exporta `async function execute(request, services)`. A resposta pública tem estado `success`, `pending` ou `error`.

- `request.inputs` contém os valores indexados por `portKey`.
- `request.inputContract` e `request.outputContract` descrevem o binding atual.
- `request.inputDeliveries` e `request.context.previousDeliveries` fornecem somente o histórico autorizado.
- `services.signal` controla cancelamento e timeout.
- `getSecret`, `resolveInputFile`, `getOutputPath` e `getWorkspacePath` dão acesso controlado aos recursos declarados.
- arquivos produzidos usam `artifact://<id>` em `values` e o mesmo ID em `artifacts`.
- jobs retornam `pending` com `jobId` e `pollAfterMs`; início, retomada e cancelamento devem ser idempotentes.
- o núcleo cria IDs universais, entregas e itens; o plugin preserva apenas IDs externos para proveniência.

Resposta imediata mínima:

```js
return { status: "success", values: { result: "texto" } };
```

Declare apenas as permissões necessárias entre `network`, `filesystem:read`, `filesystem:write`, `process`, `worker` e `native`. Rede exige `networkHosts`; credenciais exigem nomes em `secretKeys`. Dependências e runtimes adicionais precisam estar dentro do pacote final. O ContentFlow não executa `npm install`, `pip install` nem scripts de instalação do plugin.

## Checklist

- [ ] `apiVersion` é `1`, o ID é reverso e estável e a versão é semântica.
- [ ] O runtime declara Node `>=26 <27`; o entrypoint existe e exporta `execute`.
- [ ] Portas usam chaves semânticas, tipos públicos e outputs obrigatórios.
- [ ] Permissões, efeitos, custos, provedores e política de dados descrevem o comportamento real.
- [ ] `networkHosts` e `secretKeys` estão declarados quando aplicáveis.
- [ ] O pacote não contém secrets, cookies, tokens, dados pessoais ou `.env`.
- [ ] Caminhos vêm de `services`, permanecem relativos e não permitem travessia.
- [ ] Requisições de rede recebem `services.signal`, validam status e limitam respostas.
- [ ] Erros esperados não vazam segredos.
- [ ] Não há React, HTML arbitrário, acesso ao SQLite ou import de módulos internos do núcleo.
- [ ] Não há downloads ou scripts de instalação em tempo de instalação ou execução.
- [ ] Executáveis e runtimes são resolvidos dentro do pacote, nunca pelo `PATH`.
- [ ] O plugin usa `request.inputs` e não inventa IDs universais.
- [ ] Automação de navegador usa perfil explicitamente preparado e a Browser Bridge quando aplicável.
- [ ] Testes cobrem sucesso, entrada inválida, contrato e sandbox.

## Validação final

```sh
npm run plugin:kit -- validate ./meu-plugin
npm run plugin:kit -- test-contract ./meu-plugin
npm run plugin:kit -- test-sandbox ./meu-plugin
npm run plugin:kit -- fixture ./meu-plugin
npm run plugin:kit -- report ./meu-plugin
```

O relatório deve terminar em `COMPATÍVEL`. Em seguida, conecte a pasta na tela **Plugins**, revise o consentimento e teste a capacidade em um Método.
