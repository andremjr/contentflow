# Dev Monitor — relatório de implementação e validação

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](./ARCHITECTURE.md), o [estado e limitações](./CURRENT_STATE.md) e o [processo de desenvolvimento](./DEVELOPMENT.md). Comandos e resultados são evidências da sessão relatada, não validação nova de todo o checkout.

Data: 01/10/2026. Implementação local, provas verticais e gate global concluídos. TASK-028E concluída; TASK-028D permanece ativa. Nenhum commit, incremento de versão, tag ou release foi realizado.

## 1. Arquitetura implementada

`server/dev-monitor/` contém contrato v1 validado por Zod, sink noop/cliente, collector TCP autenticado em loopback, projeções determinísticas, registry de checks, evidence slicing, digest, diff e matriz de coverage. `scripts/dev-monitor.ts` usa os runners Node/tsx existentes. `.dev-monitor/` é ignorado pelo Git.

Eventos são fatos derivados e append-only; não substituem Core ou SQLite. BlockExecution continua identificado por execução e Bloco, com tentativa separada. Nenhum contrato público de Método/plugin foi alterado pelo monitor.

## 2. Instrumentação

- Core: snapshots pós-commit de execução, Blocos/tentativas, itens, tentativas concedidas e deliveries; reaproveita os invariantes estruturais existentes.
- Method: versão e estado dos Blocos do snapshot persistido, correlacionados ao Core.
- Plugin: begin/end da invocação real, resultado/exceção e snapshots de jobs nos commits observados.
- Profiles/Instances: acquire/reject/release de leases e create/ready/closed/crashed no startup do navegador; IDs físicos são fornecidos explicitamente pelo job.
- Browser Bridge: sessão negociada e comandos sent/completed/failed com outcome conhecido, cancelado ou incerto. Frames do SDK atravessam stdout existente do worker, com sequência validada pelo runner.

Workers não recebem o token do collector ou nova permissão de rede. Token de lease e recibo externo são hashes; prompts, DOM, conteúdo, caminhos e cookies não são gravados. O runner não despeja logs tradicionais automaticamente.

## 3. Checks implementados

- `CORE.EXECUTION.STRUCTURAL_INVARIANTS`
- `CORE.EXECUTION.HAS_TERMINAL_STATE`
- `CORE.BLOCK.HAS_TERMINAL_STATE`
- `CORE.ITEM.HAS_TERMINAL_STATE`
- `CORE.ATTEMPT.HAS_TERMINAL_STATE`
- `CORE.BLOCK.REQUIRED_OUTPUTS`
- `CORE.EXECUTION.OFFICIAL_OUTPUT`
- `METHOD.BLOCK.CORE_EXECUTION_MATCH`
- `METHOD.SNAPSHOT.CANONICAL`
- `PLUGIN.INVOCATION.HAS_TERMINAL_RESULT`
- `PLUGIN.INVOCATION.CORE_ORIGIN`
- `PLUGIN.JOB.HAS_TERMINAL_STATE`
- `PROFILE.LEASE.RELEASED`
- `PROFILE.LEASE.EXCLUSIVE`
- `RUN.NO_DANGLING_INSTANCE`
- `PROFILE.INSTANCE.REQUIRES_VALID_LEASE`
- `BRIDGE.COMMAND.HAS_TERMINAL_RESULT`
- `BRIDGE.COMMAND.NO_DUPLICATE_TERMINAL_RESULT`
- `BRIDGE.COMMAND.INSTANCE_READY_AND_OWNED`
- `BRIDGE.COMMAND.SESSION_ORIGIN`

Checks sem entidades recebem NOT_OBSERVED. Cenários declaram requiredChecks; ausência de check prometido invalida a prova. Schema, gaps, duplicatas, perdas, ausência de produtores/famílias/domínios e flush incompleto também impedem PASS.

## 4. Reliability coverage

Verificações automáticas cobrem integridade estrutural do Core, estados terminais, presença de outputs obrigatórios/oficiais, versão de Método, correlação Method/Core, origem/terminal de invocação, leases e origem/readiness/terminal de comandos. Cada check aponta para sua referência normativa.

`coverage.ts` registra separadamente IMPLEMENTED, PARTIALLY_IMPLEMENTABLE, NOT_MACHINE_CHECKABLE e DEFERRED. Ainda faltam fatos completos para replay externo seguro, identidade persistida antes do efeito, bindings/readiness, restart/migração, renderer, scheduling independente, recovery e medições de hardware. Checks implementados sem cenário monitorado permanecem coverageGap, nunca cobertura presumida.

## 5. Skill

Atualizada a skill instalada em `C:/Users/andre/.codex/skills/development-contentflow/SKILL.md`, com cópia versionada e referências em `ecosystem/skills/development-contentflow/`. O fluxo passa a priorizar digest → checks específicos → slices → projeções relevantes → trace apenas quando necessário → logs tradicionais.

PASS não abre logs completos. Instrumentação inválida precisa ser resolvida antes de confiar no cenário. Depois de corrigir, repete-se exatamente o cenário e compara-se before/after, exigindo integridade, resultado funcional e ausência de violações novas. O sincronizador e o teste de sincronização agora incluem as três skills oficiais, inclusive a generalista. Frontmatter e sincronização foram validados com js-yaml; o validador Python disponível não executou por falta de PyYAML.

## 6. Testes verticais reais

Último `human-theme`: `human-theme-31a47c68-f81c-4e2f-8995-5c8a2088e7f9`. API real com base temporária → Canal/Projeto/snapshot → conclusão humana via command → persistência → delivery/output oficial. Command repetido conserva idempotência. Digest: PASS; 7 checks aprovados, 0 falhas; 2 domínios esperados/observados; zero perdas/gaps e todos os producers flushed.

Último `sandbox-faults`: `sandbox-faults-7e61528c-7858-4b5f-bce3-122d69656c92`. Worker real, sandbox real e plugin de teste existente: sucesso, erros classificados, timeout e cancelamento. Digest: PASS; 18 checks aprovados, 0 falhas; 1 domínio esperado/observado; zero perdas/gaps e todos os producers flushed.

NOT_OBSERVED de outros domínios é explícito. Nenhum desses dois cenários é apresentado como jornada de provider autenticado ou dos cinco domínios completos. Bundles locais estão em `.dev-monitor/runs/`.

## 7. Performance

Inativo: sem socket, JSON, projeção ou consultas adicionais aos jobs. Ativo: somente metadados; buffer de cliente de 256 KiB, frames de 64 KiB, fila de disco de 1 MiB, no máximo 128 producers e 100.000 eventos. Exceder limites invalida a execução. Não houve benchmark de CPU/RAM em máquina i3; não se declara impacto quantitativo sem medição.

## 8. Testes executados

| Comando/prova                                     | Resultado                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| npm run test:dev-monitor                          | 19/19; schema, privacidade, noop, integridade, transporte/truncamento, projeções, checks, slices, diff e verdicts |
| npm run dev-monitor -- run human-theme            | PASS                                                                                                              |
| npm run dev-monitor -- run sandbox-faults         | PASS                                                                                                              |
| dev-monitor inspect/evidence/verify/diff/coverage | Ferramentas implementadas; verify e diff reais sem violações novas                                                |
| npm run typecheck                                 | PASS                                                                                                              |
| ESLint nos módulos novos e fronteiras editadas    | PASS                                                                                                              |
| npm run test:execution-core                       | 65/65                                                                                                             |
| npm run test:execution-state-machine              | 17/17 no rerun isolado; primeira tentativa sob carga falhou ao iniciar API                                        |
| npm run test:content-shape                        | 19/19                                                                                                             |
| npm run test:architecture                         | 9/9; guardrail pós-commit preservado                                                                              |
| npm run test:shared-browser-v43                   | 4/4                                                                                                               |
| npm run test:browser-runtime-core                 | 17/17 + 1/1 de sincronização SDK                                                                                  |
| npm run test:browser-bridge                       | 7/7                                                                                                               |
| npm run test:i18n                                 | 27/27                                                                                                             |
| npm run build                                     | PASS                                                                                                              |
| npm run check                                     | PASS integral, incluindo precheck, lint global, typecheck, todas as suítes agregadas e build                      |
| npm run test:shared-browser-v89                   | 5/5; fixture atualizada para JSON estruturado e regressão da resposta escalar rejeitada                           |
| npm run test:skill-sync                           | PASS; três skills oficiais e exemplos de Método/plugin                                                            |

O gate inicial identificou 459 diagnósticos em 13 arquivos já em alteração. Foram corrigidos por formatação, anotações de tipo equivalentes para JSON histórico e comentário no catch vazio; os scripts de migração não foram executados. A fixture v89 foi alinhada ao contrato vigente, sem mudar o handler. As três referências especializadas mais recentes de .agents foram preservadas e sincronizadas com ecosystem e a instalação do usuário. O gate completo passou após essas correções. Registro local: `.tmp-dev-monitor-final-check.log`.

O verify do bundle human-theme retornou TRACE_VALID. O diff entre a prova anterior e a final é comparável, conserva PASS e não apresenta violações novas. Os dois cenários finais foram executados após as alterações de código e fixtures.

## 9. Limitações restantes

- Não foi executado Chrome real com provider autenticado sob o monitor. Browser/Profile checks possuem instrumentação e provas sintéticas/regressões existentes, não cobertura vertical completa.
- Hooks de preparação, lanes e cancelamento ainda têm correlações parciais quando não fornecem o profileId físico. Eventos detalhados de binding, expiry, crash após startup, recovery e reconciliação ainda faltam.
- Nem todos os caminhos históricos de persistência passam pelas fronteiras instrumentadas; validação de outputs no monitor verifica presença, não substitui a boundary material.
- O produtor Bridge é um proxy do runner; não comprova flush independente da extensão Chrome. Diff básico depende da ordem de primeira observação em casos concorrentes.

Esses limites técnicos estão documentados em DEV_MONITOR.md e coverage.ts; não foram ocultados como checks aprovados.

## 10. Arquivos principais

- Novos: server/dev-monitor/{contract,client,collector,projectors,checks,probes,report,coverage,scenarios}.ts e testes monitor/vertical.
- Novo: scripts/dev-monitor.ts; comandos dev-monitor e test:dev-monitor em package.json.
- Modificados: server/index.ts, plugin-runner.ts, browser-profile-leases.ts e browser-session-manager.ts.
- Modificados: SDK canônico da Bridge e suas seis cópias geradas pelo sincronizador existente.
- Novos: docs/DEV_MONITOR.md, este relatório, TASK-028E e skill generalista versionada com referências.
- Atualizados: .gitignore, Current State e roadmap, preservando TASK-028D ativa e sem iniciar TASK-029.

O fechamento também atualizou o sincronizador e seu teste, a fixture v89 e as três referências especializadas; a limpeza de lint preservou o comportamento do trabalho anterior.
