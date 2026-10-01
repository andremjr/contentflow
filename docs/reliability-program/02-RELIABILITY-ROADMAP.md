# Roadmap oficial do Reliability Program

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../ARCHITECTURE.md), o [estado e limitações](../CURRENT_STATE.md) e o [processo de desenvolvimento](../DEVELOPMENT.md). A sequência TASK-029–TASK-052 foi encerrada; nenhum estado ready/pending abaixo autoriza retomá-la. O encerramento não significa implementação dessas missões.

## Propósito

Este roadmap registra as missões do Reliability Program. Ele não é um prompt de Codex, uma especificação de implementação ou autorização para executar antecipadamente uma task.

A especificação de cada TASK-N será criada somente quando a missão estiver prestes a começar, usando o código, as evidências e as limitações reais daquele momento. [`00-PRODUCT-CONSTITUTION.md`](00-PRODUCT-CONSTITUTION.md) governa as promessas do programa e [`01-TARGET-ARCHITECTURE.md`](01-TARGET-ARCHITECTURE.md) define sua direção arquitetural.

## Estados permitidos

| Estado        | Significado                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------- |
| `pending`     | Missão registrada, ainda sem autorização ou dependências suficientes para iniciar.            |
| `ready`       | Próxima missão apta a receber especificação e autorização de início.                          |
| `in_progress` | Trabalho autorizado e ainda não concluído.                                                    |
| `blocked`     | Trabalho iniciado, mas impossibilitado de avançar sem condição externa ou decisão registrada. |
| `done`        | Missão e validações correspondentes concluídas.                                               |
| `superseded`  | Missão substituída explicitamente por decisão posterior rastreável.                           |

## Preparação do programa — TASK-000

**Estado da TASK-000: `done`.** A preparação foi concluída por TASK-000A a TASK-000F. Seu registro operacional está em [`tasks/TASK-000.md`](tasks/TASK-000.md).

| Task      | Missão                                                         | Estado |
| --------- | -------------------------------------------------------------- | ------ |
| TASK-000A | Auditoria e saneamento documental                              | `done` |
| TASK-000B | Constituição do produto e arquitetura-alvo                     | `done` |
| TASK-000C | Roadmap do Reliability Program e cenários de aceitação         | `done` |
| TASK-000D | Current State e Working Protocol                               | `done` |
| TASK-000E | ADRs iniciais, `AGENTS.md` e integração do sistema documental  | `done` |
| TASK-000F | Auditoria final do sistema de contexto e conclusão da TASK-000 | `done` |

## Milestones e missões

### Foundation — TASK-001 a TASK-005

| Task     | Missão                                             | Estado |
| -------- | -------------------------------------------------- | ------ |
| TASK-001 | Congelar baseline de confiabilidade                | `done` |
| TASK-002 | Characterization tests da máquina de estados atual | `done` |
| TASK-003 | Caracterizar `VALIDAR` e retry editorial           | `done` |
| TASK-004 | Plugin determinístico de fault injection           | `done` |
| TASK-005 | Fixture persistente representativa da 1.2.1        | `done` |

### Sovereign Core — TASK-006 a TASK-020

| Task     | Missão                                              | Estado |
| -------- | --------------------------------------------------- | ------ |
| TASK-006 | Criar módulo canônico do Core de execução           | `done` |
| TASK-007 | Unificar criação de `ProcessExecution`              | `done` |
| TASK-008 | Fazer start manual usar criação canônica            | `done` |
| TASK-009 | Fazer Orchestrator/standalone usar criação canônica | `done` |
| TASK-010 | Isolar `POST /api/executions` legado                | `done` |
| TASK-011 | Unificar transição bloco concluído → próximo estado | `done` |
| TASK-012 | Conclusão Humana passa pelo Core                    | `done` |
| TASK-013 | Conclusão de Plugin passa pelo Core                 | `done` |
| TASK-014 | Unificar semântica de `VALIDAR`                     | `done` |
| TASK-015 | Centralizar retry manual de Bloco                   | `done` |
| TASK-016 | Centralizar “usar entrega atual”                    | `done` |
| TASK-017 | Centralizar cancelamento                            | `done` |
| TASK-018 | Centralizar projeção do estado de Project           | `done` |
| TASK-019 | Persistência atômica das transições                 | `done` |
| TASK-020 | Remover auto-agendamento interno via HTTP loopback  | `done` |

### Deterministic Contracts — TASK-021 a TASK-028

| Task     | Missão                                                  | Estado |
| -------- | ------------------------------------------------------- | ------ |
| TASK-021 | Guardrails arquiteturais automatizados                  | `done` |
| TASK-022 | Representação canônica de bindings                      | `done` |
| TASK-023 | Retirar `labelScore` do runtime canônico                | `done` |
| TASK-024 | Porta de entrada de plugin explícita                    | `done` |
| TASK-025 | Outputs de plugin explícitos                            | `done` |
| TASK-026 | `VALIDAR` com alvo explícito                            | `done` |
| TASK-027 | Adapter para Métodos legados                            | `done` |
| TASK-028 | Normalização/validação canônica da resposta do executor | `done` |

Deterministic Contracts está encerrada. Nenhuma task da fase Universal Recovery está autorizada ou pronta por consequência automática desse encerramento.

### Extensão autorizada de contratos — TASK-028A

| Task      | Missão                                  | Estado |
| --------- | --------------------------------------- | ------ |
| TASK-028A | Contrato canônico de conteúdo e entrega | `done` |

### Migração autorizada de dados — TASK-028B

| Task      | Missão                                       | Estado |
| --------- | -------------------------------------------- | ------ |
| TASK-028B | Migrar dados locais para contratos canônicos | `done` |

### Correção autorizada de retry — TASK-028C

| Task      | Missão                                 | Estado |
| --------- | -------------------------------------- | ------ |
| TASK-028C | Atualizar o Método ao refazer um Bloco | `done` |

### Extensão autorizada de consumo — TASK-028D

| Task      | Missão                                         | Estado   |
| --------- | ---------------------------------------------- | -------- |
| TASK-028D | Consumo textual e relações explícitas de itens | `active` |

### Infraestrutura interna autorizada — TASK-028E

| Task      | Missão                                  | Estado |
| --------- | --------------------------------------- | ------ |
| TASK-028E | Dev Monitor local e integração da skill | `done` |

Implementação, cenários monitorados e gate integral validados; 19 testes próprios
aprovados, traces íntegros e diff real sem violações novas.
Esta extensão não encerra TASK-028D nem inicia TASK-029.

### Universal Recovery — TASK-029 a TASK-038

| Task     | Missão                                       | Estado    |
| -------- | -------------------------------------------- | --------- |
| TASK-029 | Estados duráveis de recovery                 | `ready`   |
| TASK-030 | `applyRecoveryDecision()` único              | `pending` |
| TASK-031 | Aplicar decisão `cancel` corretamente        | `pending` |
| TASK-032 | Implementar estado `intervene`               | `pending` |
| TASK-033 | Reconciliação de efeito externo incerto      | `pending` |
| TASK-034 | Unificar reconciliação multiperfil           | `pending` |
| TASK-035 | Fallback passa pelo recovery canônico        | `pending` |
| TASK-036 | Backoff/retry integralmente durável          | `pending` |
| TASK-037 | Unificar limites, retries e deadlines        | `pending` |
| TASK-038 | Restart durante todos os estados de recovery | `pending` |

### Unattended Execution — TASK-039 a TASK-043

| Task     | Missão                                         | Estado    |
| -------- | ---------------------------------------------- | --------- |
| TASK-039 | Política canônica de elegibilidade de trabalho | `pending` |
| TASK-040 | Cenário dos cinco vídeos                       | `pending` |
| TASK-041 | Fairness e prevenção de starvation             | `pending` |
| TASK-042 | Restart do Orchestrator V5                     | `pending` |
| TASK-043 | Isolamento de cancelamento e falha             | `pending` |

### Persistence/Compatibility — TASK-044 a TASK-047

| Task     | Missão                                              | Estado    |
| -------- | --------------------------------------------------- | --------- |
| TASK-044 | Tirar reconciliações semânticas do bootstrap normal | `pending` |
| TASK-045 | Verificador de invariantes persistentes             | `pending` |
| TASK-046 | Isolar V1–V4 e compatibilidade histórica            | `pending` |
| TASK-047 | Upgrade real da fixture 1.2.1                       | `pending` |

### Reliability Proof — TASK-048 a TASK-052

| Task     | Missão                                          | Estado    |
| -------- | ----------------------------------------------- | --------- |
| TASK-048 | Jornada determinística completa dos 8 Processos | `pending` |
| TASK-049 | Matriz determinística de falhas                 | `pending` |
| TASK-050 | Governador global de recursos                   | `pending` |
| TASK-051 | Endurance de produção desacompanhada            | `pending` |
| TASK-052 | Reliability Gate oficial                        | `pending` |

## Regra de encerramento

TASK-052 encerra o Reliability Program.

Uma mudança de estado deve refletir resultado real e evidência da task correspondente. Conclusão parcial, código sem validação ou especificação escrita sem execução não transforma uma missão em `done`.
