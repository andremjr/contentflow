# Pacote curto para criação de plugins com IA

Este é o índice de um pacote pequeno que pode ser enviado integralmente a ChatGPT, Claude ou Gemini sem compartilhar o repositório inteiro. Envie somente estes quatro itens:

Compatibilidade: ContentFlow OS v0.3.6, Plugin API v1 e Node 26.

1. este arquivo;
2. [`PLUGIN_AI_PROTOCOL_BRIEF.md`](PLUGIN_AI_PROTOCOL_BRIEF.md);
3. [`PLUGIN_AI_REVIEW_CHECKLIST.md`](PLUGIN_AI_REVIEW_CHECKLIST.md);
4. [`schemas/contentflow-plugin-v1.schema.json`](schemas/contentflow-plugin-v1.schema.json).

Opcionalmente acrescente um dos handlers em [`../plugin-kit/templates`](../plugin-kit/templates) e os arquivos da automação que será convertida. O contrato normativo completo continua em [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md); este pacote é um mapa compacto, não uma API alternativa. O guia humano mais curto é [`PLUGIN_START_HERE.md`](PLUGIN_START_HERE.md).

## Prompt sugerido

> Crie ou adapte um plugin independente para o ContentFlow OS API v1. Preserve a lógica da automação anexada quando ela já existir e crie apenas o adapter necessário para `execute(request, services)`. Use exclusivamente o contrato e o schema anexos. Não importe arquivos internos do aplicativo, não injete React/HTML, não grave credenciais e não crie scripts de instalação. Entregue `contentflow.plugin.json`, `handler.mjs`, `README.md`, `test.mjs` e `fixtures/execution.json`. Liste claramente dados enviados a terceiros, permissões, dependências empacotadas e riscos. Antes de encerrar, confira cada item de `PLUGIN_AI_REVIEW_CHECKLIST.md`.

Inclua no mesmo pedido:

- objetivo observável do plugin;
- operador (`Código` ou `IA`);
- blocos compatíveis (`BUSCAR`, `ESCOLHER`, `CRIAR`, `VALIDAR`);
- entradas, saídas e tipos;
- API/hosts, se houver;
- nomes das credenciais, nunca seus valores;
- política de retenção e treinamento do provedor;
- arquivos ou descrição da automação existente e o que deve ser preservado;
- se a implementação usa API, programa local, navegador ou job demorado.

Depois de receber os arquivos, execute localmente `npm run plugin:kit -- check <pasta>`. Erros do manifesto precisam ser corrigidos na origem; não peça à IA para desativar, falsificar permissões ou contornar a validação. Dependências necessárias devem ser incluídas no pacote final pelo autor; o aplicativo não executa gerenciadores de pacotes durante a instalação.
