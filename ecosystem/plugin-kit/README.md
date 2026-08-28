# ContentFlow Plugin Kit

CLI e templates para criar, validar, testar e gerar relatórios de compatibilidade de plugins da API v1.

Execute a partir da raiz do repositório:

```sh
npm run plugin:kit -- create ./meu-plugin
npm run plugin:kit -- check ./meu-plugin
```

Os templates ficam em [`templates`](templates/) e um conjunto de respostas reproduzível fica em [`examples`](examples/). O guia completo está em [`../docs/development.md`](../docs/development.md).

O sandbox do comando `check` nunca injeta credenciais fictícias nem chama provedores reais. Ele considera compatível qualquer resposta v1 bem formada (`success`, `pending` ou `error`); testes unitários do próprio plugin continuam responsáveis por validar seus caminhos funcionais com serviços simulados.
