# Checklist de revisão de plugin gerado por IA

Antes de testar:

- `apiVersion` é `1`, o ID é reverso/estável e a versão é semântica;
- o entrypoint existe, é ESM e exporta `execute`;
- portas usam chaves semânticas, tipos públicos e outputs obrigatórios;
- permissões, efeitos colaterais e política de dados descrevem o comportamento real;
- `networkHosts`, `secretKeys` e provedores estão declarados quando aplicáveis;
- nenhum valor secreto, `.env`, cookie, token, dado pessoal ou instrução de usuário entrou no pacote;
- caminhos vêm de `services`, permanecem relativos e não usam travessia;
- `fetch` recebe `services.signal`, valida status e limita/parsa respostas com cautela;
- erros esperados retornam `status: "error"` sem vazar segredos;
- não há React, HTML arbitrário, acesso ao SQLite ou import de módulos internos do ContentFlow;
- não há script de instalação nem dependência baixada automaticamente;
- `test.mjs` cobre sucesso e ao menos a entrada inválida principal.

Validação final:

```sh
npm run plugin:kit -- validate ./meu-plugin
npm run plugin:kit -- test-contract ./meu-plugin
npm run plugin:kit -- test-sandbox ./meu-plugin
npm run plugin:kit -- fixture ./meu-plugin
npm run plugin:kit -- report ./meu-plugin
```

O relatório deve terminar em `COMPATÍVEL`. Depois, conecte a pasta na tela **Plugins**, leia o consentimento e crie um Método com uma capacidade declarada. Não aceite uma correção que apenas retire do manifesto uma permissão ainda usada pelo handler.
