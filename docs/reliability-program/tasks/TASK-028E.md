# TASK-028E — Dev Monitor local para testes verticais

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../../ARCHITECTURE.md), o [estado e limitações](../../CURRENT_STATE.md) e o [processo de desenvolvimento](../../DEVELOPMENT.md).

Estado: done. Autorização: pedido explícito de implementação integral em 01/10/2026.

## Diagnóstico e escopo

HEAD histórico investigado: `782b69498e9b7402d3f2bfc456ce9344fff3f0b8`.
O checkout contém mudanças em andamento da TASK-028D, preservadas por este trabalho.
Não existe collector transversal de desenvolvimento. A API usa processo Node local;
plugins usam workers sandboxados com stdin/stdout; Browser Bridge usa CDP local.

Implementar protocolo v1, sink noop, collector loopback autenticado por token efêmero,
projeções, checks, evidências, digest, diff, coverage e runner sobre os testes existentes.
Eventos são observações, nunca autoridade de estado. BlockExecution é identificado
por executionId + blockId + attempt; não criar ID de domínio fictício para ele.
Workers encaminham metadados Bridge pelo canal existente, sem conceder rede adicional.

## Invariantes e compatibilidade

Nenhuma mudança em decisões de execução, contratos públicos, dados de usuário ou UI.
Ativação explícita por run. Não salvar payload funcional, tokens, caminhos ou DOM.
Ausência de eventos/checks/producers e flush incompleto invalidam a prova.
Não implementar TASK-029, mudar versão, criar commit, tag ou publicar.

## Validação e pronto

Testar adversarialmente integridade, replay, checks, slices, diff e todos os verdicts.
Executar um fluxo real HTTP → Core → persistência → delivery/output em base temporária;
executar worker real e Bridge com os testes existentes. Lint, typecheck e gate existente.
Registrar lacunas de observação como cobertura parcial/deferred, nunca checks simulados.
Atualizar skill instalada e referência versionada, docs e Current State sem encerrar 028D.

DECISION REQUIRED somente se for necessário alterar política funcional ou autoridade;
detalhes reversíveis do monitor estão autorizados pelo pedido.

## Evidências e estado final da sessão

Implementação validada em 01/10/2026. Consulte `../../DEV_MONITOR_REPORT.md`
para arquitetura, checks, comandos e bundles reais. Os cenários human-theme e
sandbox-faults passaram com monitor íntegro; 19 testes do monitor passaram.
O gate integral `npm run check` passou, incluindo precheck, lint, typecheck,
suítes agregadas e build. Verify confirmou TRACE_VALID e diff real não encontrou
violações novas. Lacunas de provider autenticado e demais lifecycles estão
explicitamente documentadas na matriz. TASK-028D segue ativa e TASK-029 não foi
iniciada. Nenhuma publicação foi feita.
