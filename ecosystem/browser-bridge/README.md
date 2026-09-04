# ContentFlow Browser Bridge

Extensão companheira Manifest V3 única para todos os plugins de automação de navegador compatíveis com o ContentFlow. Ela é externa ao núcleo e não pertence a nenhum plugin individual.

## Regra de arquitetura

- existe uma única extensão instalada por perfil dedicado;
- cada comando identifica plugin, perfil, execução, origem, aba e versão do protocolo;
- apenas plugins, ações e origens registrados na allowlist da versão instalada são aceitos;
- novos provedores entram por atualização desta mesma extensão, nunca por uma segunda extensão;
- o núcleo do ContentFlow não recebe seletores, cookies, sessões ou regras de fornecedor.

A versão `0.3.0` atende Google Flow, ChatGPT, Claude, Gemini, Grok e Meta AI. A ponte mantém apenas transporte, autenticação efêmera, isolamento por origem/aba/perfil, idempotência e operações de UI limitadas. O Service Worker localiza alvos com scripts efêmeros via CDP e entrega cliques e texto com `Input.*`; o Content Script apenas desperta o worker após a navegação. Seletores e regras de cada provedor continuam no adapter do respectivo plugin.

## Instalação

Consulte [INSTALAR.md](INSTALAR.md). Na V1, o usuário carrega manualmente esta pasta em cada perfil dedicado usando `chrome://extensions` → **Modo do desenvolvedor** → **Carregar sem compactação**.

Scripts pessoais usados pelo mantenedor para preparar vários perfis de sua própria máquina ficam em `local-tools`, ignorados pelo Git, e não fazem parte do aplicativo ou da experiência dos usuários.
