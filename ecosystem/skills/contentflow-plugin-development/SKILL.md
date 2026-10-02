---
name: contentflow-plugin-development
description: Criação, revisão, teste e distribuição de plugins compatíveis com a ContentFlow Plugin API v2 atual.
---

# Desenvolvimento de Plugins no ContentFlow

Um **Plugin executa uma capability**. Ele não decide estratégia, próximo Bloco, próximo Processo, retry editorial, fallback estratégico ou progressão do Projeto.

## Antes de desenvolver

Aplique o guardrail `development-contentflow`; fora do checkout, leia a cópia incluída em `guardrails/development-contentflow/SKILL.md`. Leia `AGENTS.md`, `LICENSE`, `AI_USAGE_POLICY.md`, `docs/ARCHITECTURE.md` e `docs/CONTENT_CONTRACT.md` da versão em trabalho. Fora do checkout, siga [documentação standalone e versão](references/documentation.md): o ZIP inclui essas fontes e o guia de migração para 1.3.1. Não exija caminhos de código inexistentes para iniciar a análise nem declare validação automática sem o validador real.

No checkout correspondente, consulte `src/lib/plugin-contract.ts`, `server/plugin-validation.ts`, `server/plugin-runner.ts` e `ecosystem/plugin-kit/`. Para navegador, confira Browser Bridge, perfis, readiness, leases e work units vivos. O schema incluído não substitui validator, sandbox nem cenário real. As fontes vivas do checkout prevalecem sobre o snapshot documental e os exemplos desta skill.

## Migração para 1.3.1

Plugin API v1 é inválida; produza explicitamente um pacote API v2 novo. **Mudança de shape ou porta exige nova major do plugin**, inclusive cardinalidade, representação, chave/remoção de porta e campos incompatíveis de registros. Mudanças de IDs públicos também exigem major; `apiVersion: "2"` é independente da versão semântica do pacote. Atualize handler, fixtures e Métodos consumidores em conjunto, preserve versões anteriores e jobs existentes e siga o [roteiro de migração](references/documentation.md). Não republique bytes diferentes sob a mesma versão/hash nem crie adapter para API v1.

## Fronteiras

`Method → escolhe estratégia e capability`

`Plugin → executa capacidade e relata fatos/resultados`

`Core → possui execução, deliveries, work units, perfis, leases, progressão e recovery`

Plugins nunca inventam IDs universais de item/delivery, nem gerenciam diretamente identidade ou proveniência pertencente ao Core.

## Traduzir automações externas

Leia [automation-to-plugin.md](references/automation-to-plugin.md) antes de portar extensões, scripts ou serviços compostos. Inventarie preparo manual, entregas e decisões; redistribua estratégia ao Método e autoridade operacional ao Core antes de implementar a parte específica da ferramenta. Um plugin de IA pode produzir associações na etapa configurada; o consumidor não escolhe silenciosamente essas associações.

## Capability, Bloco e eficiência

Projete a capability para uma entrega estratégica observável, não para cada operação técnica. Ela pode conter navegação, upload, polling, download, parsing, checkpoints e vários jobs quando tudo servir a uma única intenção do Bloco. O Core continua responsável por work units, perfis, leases, tentativas, distribuição, deliveries e recovery; a Browser Bridge apenas transporta operações autorizadas de navegador.

Separe capabilities quando o intermediário precisar ser conectado, validado editorialmente, substituído, reutilizado ou preservado de forma independente. Não crie capabilities ou exija Blocos distintos por item, tentativa, perfil, página ou clique. Use portas `many`, item orchestration e política de perfil do Core para escala operacional. Validação técnica fica no plugin; decisão editorial fica em `VALIDAR`.

Leia [layer-boundaries.md](references/layer-boundaries.md) ao definir a superfície da capability e [browser-automation.md](references/browser-automation.md) quando houver navegador.

## Manifesto atual

Use `contentflow.plugin.json`, `apiVersion: "2"` e valide com `server/plugin-validation.ts`/Plugin Kit. Declare somente campos existentes no schema vivo.

Entre os contratos atuais estão:

- `capabilities[]`: `id`, `operator`, `blockTypes`, portas, `execution`, `sideEffects`, `cost`, `dataPolicy`, schemas e metadados opcionais suportados;
- `inputPorts[].shape` e `outputPorts[].shape`, associados pelo Core aos `portKey` dos Blocos; cada porta declara família/controle/registro e cardinalidade diretamente;
- `permissions`, `networkHosts`, `secretKeys`/`optionalSecretKeys` quando realmente necessários;
- `sideEffects`, `cost` e `dataPolicy` como declaração factual de efeitos, custo e transferência de dados;
- `profileSetup`/`browserRuntime` somente para capacidades que realmente usam o fluxo de navegador suportado;
- `execution.itemOrchestration` apenas conforme o contrato atual, inclusive estratégias e elegibilidade de paralelismo quando declaradas.

Não mantenha campos retirados apenas porque aparecem em um exemplo antigo.

## Handler e recovery

Implemente `execute(request, services)` e leia entradas por `request.inputs[portKey]`. Retorne `success`, `pending` ou `error` no contrato atual.

Em erro, `retryable` e `recovery` descrevem fatos técnicos observados; não são ordens para repetir, trocar perfil ou avançar fluxo. A política de recovery pertence ao Core. Depois de possível efeito externo, preserve receipt/fatos de reconciliação quando o contrato permitir e não repita silenciosamente o efeito.

## Browser Bridge, perfis e leases

Fluxo: `Plugin → Browser Bridge → Browser/Profile/Page`.

A Browser Bridge é protocolo compartilhado e versionado. O Core abre/fecha o browser físico e seleciona o perfil autorizado; o plugin controla somente a página/capability concedida. Perfis são identidades locais globais. Binding do plugin e readiness são estados separados; autenticação, URL, seletores e preparo continuam específicos do plugin.

Um perfil físico suporta no máximo uma execução de navegador ativa por vez, protegida por lease global. Nunca copie cookies, storage ou credenciais para manifest, snapshot, pacote ou exportação.

## Multi-profile e work units

Quando a capability declara suporte, paralelismo multiperfil distribui **work units exclusivos** entre perfis físicos distintos. Não execute o Bloco inteiro nem a mesma unidade em cada perfil.

O Core cria/persiste identidade, ordem, tentativa e proveniência. O plugin só recebe/atualiza itens concedidos pelos serviços atuais (`registerItems`, `claimItems`, `publishItemUpdate`) quando negociados e disponíveis.

## Workflow

1. Escolha a capability mínima e a entrega observável.
2. Confirme se os passos internos pertencem à mesma entrega ou se algum intermediário exige capability separada.
3. Gere/parta dos templates atuais do Plugin Kit quando disponíveis.
4. Declare manifesto, portas, permissões e metadados honestamente.
5. Implemente handler sem estratégia de projeto embutida.
6. Teste erro, cancelamento, idempotência, artifacts, secrets e efeitos externos relevantes.
7. Para browser, teste preparação/readiness, lease, reconciliação e comportamento sem sessão pronta.
8. Rode `npm run plugin:kit -- check <plugin>` e `test-contract`; use sandbox test quando aplicável.

## Exemplo oficial

`templates/contentflow.plugin.json` + `templates/handler.mjs` formam o exemplo mínimo oficial. Valide-os com o validator real do checkout antes de copiar. Não inclua secrets, dados pessoais ou paths locais.

## Referências

- `docs/ARCHITECTURE.md`
- `src/lib/plugin-contract.ts`
- `server/plugin-validation.ts`
- `server/plugin-runner.ts`
- `ecosystem/plugin-kit/`
- `ecosystem/browser-bridge/`
- `references/protocol.md`
- `references/security.md`
- `references/browser-automation.md`
- `references/automation-to-plugin.md`

## Checklist

- plugin executa capability; estratégia/progressão ficam fora dele;
- capability representa uma entrega observável sem expor subtarefas técnicas como Blocos;
- manifesto e portas passam no validator atual;
- efeitos, custo, dados e permissões estão declarados conforme contrato vivo;
- Browser Bridge/perfis respeitam binding, readiness e lease do Core;
- multiperfil distribui work units exclusivos;
- recovery devolve fatos estruturados, sem decidir política do Core;
- pacote não contém secrets, estado de máquina, cookies, tokens ou caminhos locais.

Para associações em conteúdo textual, consulte `docs/PLUGIN_INTERFACE.md`: o produtor fornece IDs canônicos ao modelo e valida o JSON conforme configuração do plugin; o consumidor resolve os IDs e traduz para sua ferramenta. O Core preserva identidade/proveniência sem decidir relações editoriais. No exemplo visual: roteiro → personagens → referências → prompts com IDs → cenas. Controles funcionais são declarados pelo plugin, sem interpretação de nomes de campos pelo renderer.
