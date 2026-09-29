# Deterministic Fault Injection

Fixture interna do Reliability Program. Não é plugin oficial de usuário final e não pertence ao catálogo público.

A capability `fault` recebe `inputs.content` e seleciona um resultado exclusivamente por `configuration.scenario`. Ela não usa rede, browser, provider, filesystem, subprocessos, aleatoriedade, relógio decisório ou estado global.

Os cenários estáveis são `success`, `technical_retryable`, `timeout`, `rate_limit`, `intervention`, `external_effect_uncertain`, `external_effect_confirmed_failure` e `cancel_aware`.

Execute a partir da raiz do repositório:

```sh
npm run test:fault-injection
```

Este fixture é regido pelo `LICENSE` da raiz do ContentFlow e não deve ser empacotado ou publicado separadamente.
