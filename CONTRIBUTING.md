# Como contribuir com o ContentFlow

Obrigado pelo interesse em contribuir com o repositório oficial.

## Antes de começar

Leia integralmente:

- [`LICENSE`](LICENSE);
- [`AI_USAGE_POLICY.md`](AI_USAGE_POLICY.md);
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
- [`docs/ecosystem/quickstart.md`](docs/ecosystem/quickstart.md), para integrações externas;
- [`docs/ecosystem/development.md`](docs/ecosystem/development.md), quando precisar do contrato detalhado.

O ContentFlow é source-available proprietário, não open source. Contribuições destinam-se ao produto oficial. A licença pública não autoriza clones, distribuições modificadas, produtos concorrentes, white-label, rebranding ou reskins.

## Ambiente

Use Node.js 26 (`26.x`). Essa major é necessária para executar a mesma sandbox de permissões usada pelo aplicativo:

```sh
git clone https://github.com/andremjr/contentflow.git
cd contentflow
npm ci
npm run dev
```

Antes de enviar uma contribuição:

```sh
npm run check
```

## Desenvolvimento e validação

Siga o [processo de desenvolvimento vertical](docs/DEVELOPMENT.md): escolha um Método/plugin real, execute o cenário afetado, observe resultado e invariantes, corrija a causa e repita a jornada com regressão/check quando aplicável. Leia [AGENTS.md](AGENTS.md), o [contrato de conteúdo](docs/CONTENT_CONTRACT.md) e os contratos pertinentes.

O Dev Monitor e a skill `development-contentflow` apoiam o desenvolvimento interno; o aplicativo não depende de agentes de IA. Os [limites de validação](docs/CURRENT_STATE.md) continuam explícitos. O programa separado de confiabilidade foi encerrado e suas tasks não são pré-requisitos para contribuir.

## Segurança e privacidade

- Nunca envie chaves de API, tokens, senhas, bancos SQLite, uploads ou dados de canais reais.
- Não abra uma issue pública para vulnerabilidades exploráveis; siga [`SECURITY.md`](SECURITY.md).
- Plugins não devem acessar diretamente o SQLite nem contornar o protocolo documentado.

## Pull requests

Explique o problema, a solução e como ela foi testada. Mudanças de arquitetura, domínio, navegação, persistência e protocolo devem atualizar a documentação correspondente.

Ao enviar uma contribuição, você aceita os termos de contribuição definidos na seção 6 da licença do projeto.
