# Working Protocol do Reliability Program

> **Documento histórico — arquivado em 01/10/2026.** Descreve uma fase anterior e não é o roadmap de implementação vigente. Estados, pendências e instruções abaixo pertencem àquele registro. Consulte a [arquitetura atual](../ARCHITECTURE.md), o [estado e limitações](../CURRENT_STATE.md) e o [processo de desenvolvimento](../DEVELOPMENT.md).

## Propósito

Este é o protocolo oficial de trabalho para TASK-001–TASK-052. Ele permite que uma nova sessão continue o programa usando memória versionada, sem depender de conversas anteriores e sem carregar contexto histórico indiscriminadamente.

O objetivo de contexto é:

> menor contexto suficiente para decisão correta.

## 1. Leitura obrigatória antes de cada task

Nesta ordem, a nova sessão deve ler integralmente:

1. [`../../AGENTS.md`](../../AGENTS.md);
2. [`../../LICENSE`](../../LICENSE);
3. [`../../AI_USAGE_POLICY.md`](../../AI_USAGE_POLICY.md);
4. [`../ARCHITECTURE.md`](../ARCHITECTURE.md);
5. [`README.md`](README.md);
6. [`00-PRODUCT-CONSTITUTION.md`](00-PRODUCT-CONSTITUTION.md);
7. [`01-TARGET-ARCHITECTURE.md`](01-TARGET-ARCHITECTURE.md);
8. [`04-CURRENT-STATE.md`](04-CURRENT-STATE.md);
9. `tasks/TASK-NNN.md` da missão ativa;
10. somente os ADRs e documentos de subsistema indicados pela task ativa.

O roadmap e os cenários de aceitação são consultados ao preparar a especificação ou quando a task os indicar. Eles não substituem a especificação ativa.

Quando `04-CURRENT-STATE.md` informar que não existe task ativa, a leitura obrigatória termina no Current State. Consulte o roadmap apenas para identificar a próxima missão `ready`; não crie sua especificação nem inicie implementação sem autorização explícita. O registro da task anterior é histórico e só precisa ser lido para uma dúvida concreta de handoff ou evidência.

Não carregar automaticamente:

- todos os ADRs;
- release notes;
- relatórios de evidência;
- roadmaps de plugins;
- inventários e baselines históricos;
- documentação de subsistemas fora do escopo.

Contexto adicional deve responder a uma dúvida concreta de compatibilidade, arquitetura, reprodução ou implementação da task atual.

### 1.1. Descoberta operacional ao vivo

Depois da documentação persistente e antes de preparar ou retomar uma task, descubra diretamente no checkout:

```bash
git rev-parse HEAD
git status --short
```

Quando a branch for relevante, execute também `git branch --show-current` ou equivalente seguro. SHA, branch ou condição do worktree registrados em documentos anteriores são evidência histórica, nunca autoridade para a sessão atual.

O fluxo obrigatório é:

```text
Documentação persistente
        ↓
descobrir HEAD/status ao vivo
        ↓
inspecionar código atual
        ↓
gerar TASK-NNN
        ↓
implementar
        ↓
validar
        ↓
registrar evidências históricas na task
```

## 2. Geração just-in-time da próxima task

Antes de implementar TASK-N:

1. confirmar que a missão está `ready` e foi autorizada;
2. confirmar ao vivo HEAD, branch quando relevante, status do worktree, versão, código e testes atuais;
3. comparar a missão do roadmap com a realidade encontrada;
4. identificar mudanças desde o `CURRENT-STATE` e atualizar o diagnóstico quando necessário;
5. criar `tasks/TASK-NNN.md` usando fatos do checkout atual;
6. somente então iniciar implementação dentro do escopo aprovado.

Cada especificação futura deve conter:

- objetivo de produto;
- problema técnico observado;
- decisão arquitetural aplicável;
- escopo;
- fora de escopo;
- arquivos prováveis, sem transformar estimativa em permissão irrestrita;
- invariantes;
- compatibilidade e migração;
- testes e evidências necessárias;
- definição de pronto;
- decisões relevantes já vigentes;
- condições que exigem `DECISION REQUIRED`.

A especificação não deve copiar uma conversa nem assumir que o diagnóstico de uma task anterior continua verdadeiro sem inspeção.

## 3. Autonomia do Codex

Dentro de uma task autorizada, o Codex pode decidir detalhes locais e reversíveis, como:

- criar ou extrair helper;
- dividir funções localmente;
- organizar arquivos dentro da fronteira aprovada;
- escolher nomes internos sem significado arquitetural ou de produto;
- acrescentar testes necessários para provar o comportamento solicitado.

O Codex não pode inventar ou alterar silenciosamente:

- regra de produto;
- Processo Universal, Bloco, Operador ou outra primitiva;
- autoridade entre Core, Método, Orchestrator, executor, UI e persistência;
- política de retry, backoff, fallback, intervenção ou cancelamento;
- política para efeito externo incerto ou duplicação;
- perda, descarte ou reinterpretação de dados;
- compatibilidade histórica ou migração destrutiva;
- decisão editorial;
- números permanentes de concorrência sem medição e autorização;
- versão, tag, release ou publicação.

Quando uma decisão permanente necessária não estiver determinada, registrar:

```text
DECISION REQUIRED
```

e relatar:

1. situação observada;
2. alternativas viáveis;
3. consequências e compatibilidade de cada alternativa;
4. decisão mínima necessária para continuar.

Não usar `DECISION REQUIRED` para detalhes locais que já pertencem à autonomia normal da task.

## 4. Disciplina de implementação

- Preservar alterações existentes e investigar sobreposições antes de editar.
- Separar implementação, validação e publicação.
- Não ampliar escopo para corrigir todo problema encontrado; registrar fatos relevantes e manter o foco da task.
- Não declarar correção apenas porque unit tests ou typecheck passam quando o cenário exige prova integrada ou real.
- Não substituir E2E real exigido por fixture, mock ou inspeção parcial.
- Não reescrever snapshots históricos, apagar representação antiga ou mover storage no mesmo passo que introduz um modelo novo sem plano recuperável autorizado.
- Textos visíveis na interface exigem PT-BR, inglês, espanhol e regressão de internacionalização.
- Nunca usar GitHub Actions como validação ou contingência de release.

## 5. Fechamento de uma task

Uma task só muda para `done` quando:

1. o código ou documento previsto está completo;
2. os testes obrigatórios passam;
3. regressões relevantes passam;
4. cenários reais exigidos foram executados ou a task não os exige;
5. [`04-CURRENT-STATE.md`](04-CURRENT-STATE.md) representa o novo estado atual, sem virar changelog;
6. [`02-RELIABILITY-ROADMAP.md`](02-RELIABILITY-ROADMAP.md) registra o estado real da missão;
7. ADR aplicável foi criado ou atualizado quando houve decisão arquitetural permanente;
8. `tasks/TASK-NNN.md` registra evidências finais, comandos e resultados reais;
9. nenhuma limitação relevante foi apresentada como sucesso;
10. a próxima missão elegível foi marcada `ready` sem iniciar sua implementação.

Se uma correção posterior mudar o código depois da última validação, repetir as provas afetadas antes de fechar a task.

## 6. Atualização do Current State

Ao fechar uma task:

- substituir fatos que deixaram de ser verdadeiros;
- atualizar versão e fatos semânticos quando aplicável;
- remover gaps realmente fechados;
- registrar novos gaps somente quando confirmados no código;
- atualizar blockers e a próxima missão;
- manter evidências detalhadas na task, no ADR ou no relatório apropriado.

Não grave HEAD, branch ou condição do worktree como “estado atual” persistente em `04-CURRENT-STATE.md`. Registre esses dados, quando úteis, como evidência histórica em `tasks/TASK-NNN.md`.

Não anexar uma seção cronológica a cada execução. `CURRENT-STATE` é uma fotografia substituível.

## 7. Recalibração do roadmap

As 52 missões não podem ser renumeradas silenciosamente.

Se uma missão ficar desnecessária:

- marcar `superseded`;
- registrar a razão e a evidência que a substituiu;
- não reutilizar seu número para outro objetivo.

Se surgir trabalho intermediário indispensável:

- usar sufixo, como `TASK-017A`, quando preservar a sequência for suficiente; ou
- registrar e autorizar explicitamente outra mudança de estrutura.

Tasks intermediárias não deslocam a numeração existente. TASK-052 permanece o Reliability Gate final.

## 8. Pausa, blocker e handoff

Uma task bloqueada deve preservar checkout, estado, evidências e diagnóstico. Seu arquivo deve registrar a condição concreta para retomar. O roadmap usa `blocked` somente quando a task realmente não pode avançar.

Uma nova sessão retoma pela especificação ativa e pelo `CURRENT-STATE`, confirma se o blocker ainda existe e continua do ponto seguro. Conversa anterior pode ajudar, mas não é autoridade.
