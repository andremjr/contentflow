# Desenvolvimento do ContentFlow

O ContentFlow evolui por Métodos e plugins reais, executados em cenários verticais. A confiabilidade faz parte de cada mudança: resultado funcional, contratos, proveniência, recuperação segura e comportamento da interface são verificados no contexto do uso.

## Fluxo de trabalho vigente

1. Escolha um Método, plugin ou problema observado e descreva o resultado esperado e os comportamentos visíveis.
2. Leia `AGENTS.md`, `LICENSE`, `AI_USAGE_POLICY.md` e as fontes normativas da área. Para arquitetura e execução, leia integralmente `ARCHITECTURE.md`; para valores e entregas, `CONTENT_CONTRACT.md`. Descubra HEAD e alterações locais com `git rev-parse HEAD` e `git status --short`.
3. Investigue a cadeia afetada: interface → configuração → snapshot → Core → executor/Bridge → persistência → delivery → interface. Particularidades de fornecedor ficam no plugin; decisões universais ficam no Core.
4. Execute o cenário real e observe resultado funcional e invariantes. Use o Dev Monitor quando houver cenário pertinente; ausência de cobertura exige prova complementar, não um PASS aproximado.
5. Diante de falha, preserve evidências, localize a autoridade correta, corrija a classe do problema e acrescente regressão/check quando aplicável. Registre `DECISION REQUIRED` se uma política permanente necessária ainda não estiver definida; obtenha a decisão antes de implementar essa parte.
6. Repita exatamente o cenário, confirme os comportamentos observáveis e revise código, testes, documentação e skills afetadas. Registre comandos, resultados, limites e evidências sem dados privados.
7. Avance para o próximo Método/plugin quando o cenário estiver aprovado. Build, teste unitário ou intervenção manual que mascara a falha não comprovam a correção de um fluxo real.

Não existe sequência obrigatória de hardening antes dessa evolução. O [programa anterior foi encerrado](reliability-program/README.md); seu histórico pode explicar uma decisão, mas não gera novas tarefas automaticamente.

## Ambiente e verificações

Use Node 26 e npm 10 ou superior. Na raiz do checkout:

```sh
npm ci
npm run dev
npm run check
```

Selecione também as suites pertinentes em `package.json`: `test:execution-core`, `test:plugin-responses`, `test:method-file`, `test:plugin-kit`, `test:browser-runtime-core`, `test:browser-bridge`, `test:e2e` e `test:electron`, conforme a mudança. Textos da interface exigem PT-BR, inglês, espanhol e regressão de internacionalização (`npm run test:i18n`).

Para criar um [plugin](ecosystem/tutorial.md), valide contrato e sandbox com o Plugin Kit e depois execute sua capability em um Método. Para criar um [Método](../ecosystem/skills/contentflow-method-development/references/method-format.md), valide o envelope v3, bindings e dependências e execute no aplicativo com os operadores configurados. Importação e runtime não adaptam Métodos v1/v2 nem Plugin API v1.

## Observação e desenvolvimento assistido

O [Dev Monitor](DEV_MONITOR.md) é uma ferramenta interna, local e opt-in. Comece por `ai-digest.json`; falhas levam aos checks e slices pertinentes. Depois da correção, repita o cenário e compare runs íntegros e comparáveis. Consulte `npm run dev-monitor -- coverage` antes de extrapolar uma evidência. Os cenários atuais não comprovam Chrome com provedor autenticado, renderer, restart ou migração que não exercitaram.

```sh
npm run dev-monitor -- run human-theme
npm run dev-monitor -- run sandbox-faults
npm run dev-monitor -- diff <before-run-id> <after-run-id>
npm run dev-monitor -- coverage
```

A [skill development-contentflow](../ecosystem/skills/development-contentflow/SKILL.md) orienta o desenvolvimento assistido por IA neste repositório, subordinada às decisões explícitas do criador e aos contratos vivos. Ela auxilia investigação, decisões e validação; o aplicativo funciona sem agentes ou skills instaladas.

## Preservação e publicação

Preserve alterações locais e trabalho concluído. Migrações operacionais exigem ensaio, backup verificável e recuperação; não apague storage nem reescreva histórico para ajustar uma documentação. Consulte as [limitações atuais](CURRENT_STATE.md) e os [ADRs](reliability-program/decisions/README.md) pertinentes sem carregar todo o histórico.

Implementação, validação e publicação são etapas separadas. Esta rotina não autoriza versão, commit de release, tag ou publicação. A política completa está em [AGENTS.md](../AGENTS.md) e no [guia desktop](DESKTOP.md); validação e montagem são locais, sem GitHub Actions, e publicação exige autorização explícita para o conjunto exato validado.
