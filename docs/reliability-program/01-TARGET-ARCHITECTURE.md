# Arquitetura-alvo do Reliability Program

## Propósito e relação com a arquitetura vigente

Este documento traduz a [`Constituição de produto`](00-PRODUCT-CONSTITUTION.md) em fronteiras técnicas desejadas. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) continua sendo a fonte normativa do domínio e do comportamento vigente.

A arquitetura-alvo descreve o estado que deve emergir ao longo do Reliability Program. Ela não declara que o código atual já possui todas estas separações e não autoriza uma refatoração ampla fora das tasks correspondentes.

## 1. Fluxo canônico

```text
Method Snapshot
      ↓
Core State Machine
      ↓
Core Decisions / Commands
      ↓
Human or Plugin Executor
      ↓
Facts / Results / External Receipts
      ↓
Core State Machine
```

O fluxo possui uma única autoridade de decisão: a máquina de estados do Core.

- O snapshot fornece a estratégia imutável daquela execução.
- O Core combina snapshot, estado durável, fatos e política para produzir uma decisão explícita.
- A decisão é aplicada como comando controlado.
- O executor realiza o trabalho e devolve fatos; não escolhe a próxima etapa estratégica.
- Os fatos são validados e persistidos antes de causarem nova transição.

Nenhum resultado de UI, resposta HTTP ou callback de plugin avança o processo por conta própria.

## 2. Core canônico

O Core alvo é independente de interface, transporte, banco, framework e fornecedor. Ele recebe representações canônicas e produz decisões observáveis e testáveis.

Somente o Core decide:

- qual Bloco está ativo;
- se o trabalho pode avançar;
- se deve pausar ou aguardar;
- se uma falha permite retry;
- se o retry é técnico ou editorial;
- se pode trocar de perfil;
- se precisa reconciliar um efeito externo;
- se deve solicitar intervenção humana;
- se deve cancelar ou registrar falha terminal;
- se o Bloco, Processo ou Projeto concluiu;
- se uma delivery satisfaz o contrato;
- como work units são identificadas, relacionadas e resolvidas;
- quais concluídos podem ser reutilizados numa retomada.

Uma decisão do Core deve carregar motivo, identidade do alvo, revisão esperada e informação suficiente para aplicação idempotente. O Core não executa diretamente HTTP, SQL, automação de navegador ou renderização de interface.

## 3. Estado, fatos, decisões e comandos

A arquitetura distingue quatro conceitos:

1. **Estado durável** — o que o Core sabe e preserva sobre a execução.
2. **Fato** — algo observado e validado, como resultado recebido, timeout, recibo externo, perfil indisponível ou intenção humana.
3. **Decisão** — interpretação do Core sobre o que deve acontecer em seguida.
4. **Comando** — aplicação controlada daquela decisão em um executor ou adapter.

Fatos são registrados; não são comandos ocultos. Um `timeout`, por exemplo, não significa automaticamente `retry`: ele pode produzir `backoff`, `reconcile`, `switch_profile`, `intervene` ou `fail`, conforme estado e política.

Comandos possuem identidade idempotente. Repetir a aplicação do mesmo comando depois de crash não pode criar uma nova intenção lógica nem apagar o histórico anterior.

## 4. Executor humano ou plugin

O executor:

- recebe trabalho explicitamente identificado;
- executa a capability ou a ação humana solicitada;
- publica progresso correlacionado;
- retorna resultado ou pendência;
- reporta falhas classificáveis;
- pode fornecer receipt, correlation ID, checkpoint ou evidência para reconciliação;
- respeita cancelamento e libera recursos.

O executor não:

- escolhe o próximo Bloco ou Processo;
- marca estratégia como concluída sem validação do Core;
- inventa identidade de Item, delivery ou artifact do ContentFlow;
- decide silenciosamente repetir efeito externo;
- transforma erro contratual em sucesso;
- altera o snapshot do Método.

Um plugin pode ser internamente complexo, manter checkpoints e executar subtarefas necessárias à capability. Essa liberdade de implementação não lhe transfere a estratégia, a identidade das unidades nem o avanço do ContentFlow.

## 5. Orchestrator como scheduler

O Orchestrator observa o estado canônico e:

- identifica trabalho elegível;
- escolhe qual trabalho recebe recurso disponível;
- estaciona trabalho inelegível, bloqueado ou em espera;
- continua outros trabalhos independentes quando permitido;
- respeita limites de recurso, locks e prioridades definidos pela política;
- volta a avaliar elegibilidade quando novos fatos chegam.

O Orchestrator não:

- interpreta a semântica interna de um Bloco;
- recalcula ou reescreve a estratégia do Método;
- decide validade de outputs;
- implementa retry ou recovery paralelo ao Core;
- mantém uma segunda representação autoritativa da execução.

A serialização vigente dentro de uma fila continua sendo comportamento atual até mudança autorizada. A arquitetura-alvo exige apenas que um trabalho estacionado não impeça trabalho realmente independente — por exemplo, em outra fila ou Canal — de ser considerado. Não há aqui definição de quantidade de workers ou autorização para concorrência irrestrita.

## 6. Persistência como infraestrutura, não regra de negócio

A camada de persistência oferece:

- armazenamento durável de snapshots, estado, unidades, tentativas, deliveries, artifacts, recibos e checkpoints;
- transações atômicas para transições relacionadas;
- idempotência e restrições de unicidade;
- revisões e compare-and-swap quando houver escritores concorrentes;
- leitura consistente para recovery;
- trilha de proveniência e histórico necessário;
- migrações ensaiadas, recuperáveis e observáveis.

Ela não decide se um retry é seguro, qual output é válido ou qual Processo avança. Essas regras pertencem ao Core. Constraints do armazenamento protegem invariantes, mas não se tornam uma segunda política de execução.

Uma transição só pode ficar visível como concluída depois que seu estado e os fatos necessários estiverem duravelmente persistidos. Em crash entre decisão e efeito, a retomada usa revisão, command ID e receipt para descobrir o que ocorreu.

## 7. Adapters nas bordas

Tecnologias e formatos concretos ficam nas bordas:

- Express e HTTP traduzem requests e responses;
- React apresenta projeções e envia intenções;
- SQLite persiste representações duráveis;
- Plugin API traduz comandos e fatos de executores externos;
- Browser Bridge transporta operações de navegador autorizadas;
- formatos históricos passam por adapters de compatibilidade;
- filesystem e processos locais aplicam comandos sob permissões controladas.

O Core alvo não importa tipos de framework, não depende de rotas HTTP, não conhece tabelas SQLite, não interpreta DOM e não contém IDs, seletores ou regras de provider.

Adapters validam sintaxe, autenticidade, permissão e tradução de formato. Eles não preenchem lacunas semânticas por adivinhação.

## 8. Compatibilidade converge para o modelo canônico

```text
Legacy persisted representation
           ↓
Compatibility/Migration Adapter
           ↓
Canonical Core Representation
```

Representações antigas devem ser lidas por adapters explícitos, versionados e testáveis. O resultado adaptado entra no Core com significado canônico ou com um diagnóstico de incompatibilidade.

Deve-se evitar:

```text
Canonical Core
  ↓
Permanent branches for every historical version
```

Compatibilidade não pode espalhar condicionais históricos indefinidamente pela política central. Durante uma migração, leitura dupla ou escrita compatível pode existir nas bordas, com gate, telemetria local redigida, rollback e critério explícito de remoção. Snapshots históricos não são reescritos apenas para parecerem atuais.

## 9. Identidade e proveniência

O modelo canônico preserva a distinção entre:

1. **`BlockExecution`** — instância da ação estratégica;
2. **work unit / execution item** — parcela endereçável de trabalho;
3. **delivery** — materialização de uma porta de saída;
4. **delivery item** — elemento endereçável de uma delivery;
5. **artifact** — arquivo ou mídia ligada ao resultado.

Essas identidades não são intercambiáveis. Posição em array, nome de arquivo, prompt, URL remota ou ID inventado pelo plugin não substitui identidade do Core.

Antes do primeiro efeito externo, o Core cria e persiste a identidade da unidade. Resultados, recibos, tentativas e artifacts correlacionam-se a identidades concedidas pelo Core. Reorder altera ordem, não identidade; retry acrescenta tentativa e histórico, não apaga o significado lógico; uma delivery promovida a output oficial preserva proveniência.

## 10. Contratos e bindings determinísticos

O runtime canônico recebe bindings resolvidos. Para cada entrada, ele conhece origem, porta, tipo, cardinalidade e identidade dos dados.

Critérios de proximidade, compatibilidade aproximada ou semelhança de nome podem ajudar a propor uma conexão no editor ou a interpretar um formato legado. Eles não escolhem silenciosamente dados durante a execução canônica.

O fluxo alvo é:

```text
Design-time suggestion or legacy interpretation
                  ↓
Explicit normalized binding or diagnostic
                  ↓
Canonical runtime validation
```

Porta ausente, tipo incompatível, cardinalidade errada, múltiplas origens elegíveis ou output inválido produzem diagnóstico. Um adapter pode preservar comportamento legado conhecido, mas precisa identificá-lo como compatibilidade e nunca ampliar o contrato por fallback genérico.

## 11. Recovery com política única

O Core possui uma política única que, a partir de estado e fatos, pode decidir:

- `retry` — repetir a mesma unidade quando o efeito anterior é conhecido como seguro;
- `backoff` — aguardar sem ocupar recurso caro;
- `switch_profile` — redistribuir somente quando a falha permite e a unidade não possui efeito incerto;
- `reconcile` — descobrir o resultado de efeito potencialmente ocorrido;
- `intervene` — estacionar e solicitar ação humana concreta;
- `cancel` — encerrar trabalho solicitado sem promover resultado incompleto;
- `fail` — registrar falha terminal com motivo;
- `complete` — concluir somente depois de validar e persistir o contrato.

Retry técnico preserva a intenção editorial e tenta realizar a mesma unidade. Retry editorial representa uma nova tentativa solicitada pela estratégia ou por validação e preserva o histórico anterior. Essa distinção pertence ao Core.

A aplicação dessas decisões também é única. Rotas, workers, filas, UI e plugins não implementam variantes locais da escada de recovery. Eles enviam fatos ou aplicam comandos do Core.

## 12. Reconciliação de efeito externo

Uma unidade potencialmente submetida entra em estado que impede replay automático. Receipt, correlation ID, command ID, checkpoint, snapshot remoto ou observação segura podem provar uma destas condições:

- o efeito não ocorreu e retry é seguro;
- o efeito ocorreu e o resultado pode ser recuperado;
- o efeito foi rejeitado sem resultado;
- o estado continua incerto e precisa aguardar ou receber intervenção.

Timeout, reconnect, restart ou troca de perfil não apagam a incerteza. Recarregar uma página também não é fallback universal. Enquanto a incerteza existir, o scheduler pode liberar recursos e continuar outro trabalho, mas não pode duplicar aquela unidade.

## 13. Interface como projeção e intenção

A UI lê projeções derivadas do estado durável e apresenta:

- progresso confirmado;
- trabalho aguardando;
- razão de bloqueio;
- tentativas e resultados preservados;
- intervenção solicitada;
- ações que o Core considera válidas naquele estado.

A UI envia intenções como iniciar, cancelar, fornecer input, aprovar, reprovar, retomar ou solicitar nova tentativa. O Core valida a intenção contra a revisão atual antes de decidir. Estado local de tela pode otimizar apresentação, mas nunca substitui a autoridade persistida.

Depois de reconnect ou restart, a interface reconstrói a projeção a partir do Core. Ela não presume que um comando anterior falhou apenas porque a resposta HTTP se perdeu.

## 14. Recursos e hardware fraco

Scheduling e recovery consideram recursos como parte da correção operacional:

- espera não mantém browser, worker ou polling ativo sem necessidade;
- locks e leases possuem dono, validade e liberação recuperável;
- um perfil físico atende no máximo uma execução de navegador por vez;
- paralelismo usa unidades exclusivas e perfis físicos distintos;
- cancelamento e falha terminal liberam recursos sem apagar estado;
- backpressure impede que produtores sobrecarreguem persistência, UI ou extensão;
- concorrência concreta é definida por medição posterior, com defaults conservadores.

O scheduler prefere progresso estável a ocupação máxima da máquina.

## 15. Critério arquitetural de chegada

A direção alvo foi alcançada quando, para um mesmo estado canônico e os mesmos fatos:

- existe uma decisão de Core determinística e explicável;
- existe um único caminho para aplicar a decisão;
- UI, HTTP, banco, plugin e Browser Bridge permanecem adapters;
- restart em qualquer fronteira retoma do estado durável sem repetir concluídos;
- efeito incerto bloqueia replay e aciona reconciliação;
- trabalho independente continua quando recursos e política permitem;
- contratos ambíguos falham com diagnóstico em vez de sucesso aparente;
- instalações antigas preservam significado por adapters e migrações recuperáveis;
- o cenário dos cinco vídeos produz conclusão ou razões concretas sem exigir vigilância constante.

Este critério orienta as futuras tasks, mas não substitui acceptance scenarios, medições, ADRs ou gates que serão definidos separadamente.
