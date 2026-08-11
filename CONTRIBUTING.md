# Como contribuir com o ContentFlow OS

Obrigado pelo interesse em contribuir com o repositório oficial.

## Antes de começar

Leia integralmente:

- [`LICENSE`](LICENSE);
- [`AI_USAGE_POLICY.md`](AI_USAGE_POLICY.md);
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md);
- [`docs/PLUGIN_START_HERE.md`](docs/PLUGIN_START_HERE.md), para integrações externas;
- [`docs/PLUGIN_DEVELOPMENT.md`](docs/PLUGIN_DEVELOPMENT.md), quando precisar do contrato detalhado.

O ContentFlow OS é source-available proprietário, não open source. Contribuições destinam-se ao produto oficial. A licença pública não autoriza clones, distribuições modificadas, produtos concorrentes, white-label, rebranding ou reskins.

## Ambiente

Use Node.js 26 (`26.x`). Essa major é necessária para executar a mesma sandbox de permissões usada pelo aplicativo:

```sh
git clone https://github.com/andremjr/contentflow-os.git
cd contentflow-os
npm ci
npm run dev
```

Antes de enviar uma contribuição:

```sh
npm run check
```

## Segurança e privacidade

- Nunca envie chaves de API, tokens, senhas, bancos SQLite, uploads ou dados de canais reais.
- Não abra uma issue pública para vulnerabilidades exploráveis; siga [`SECURITY.md`](SECURITY.md).
- Plugins não devem acessar diretamente o SQLite nem contornar o protocolo documentado.

## Pull requests

Explique o problema, a solução e como ela foi testada. Mudanças de arquitetura, domínio, navegação, persistência e protocolo devem atualizar a documentação correspondente.

Ao enviar uma contribuição, você aceita os termos de contribuição definidos na seção 6 da licença do projeto.
