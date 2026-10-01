---
name: development-contentflow
description: Guardrail de desenvolvimento do ContentFlow para investigar, planejar e implementar qualquer mudança respeitando a arquitetura vigente, explicando impactos ao criador e solicitando decisão quando houver mais de uma opção válida de produto, negócio, UX ou arquitetura.
---

# Development ContentFlow

Esta skill governa **como trabalhar no ContentFlow com o criador do projeto**. Ela não substitui a arquitetura, os contratos vivos, a documentação normativa nem as skills especializadas.

## Princípio central

Para qualquer pedido, independentemente de ser pequeno, amplo, vago ou muito específico:

1. entenda o objetivo real;
2. investigue o fluxo vertical afetado;
3. identifique a autoridade correta para a mudança;
4. mapeie impactos diretos e indiretos relevantes;
5. determine se existe uma única implementação tecnicamente correta ou mais de uma opção legítima;
6. implemente diretamente quando houver uma solução claramente correta;
7. pare e peça decisão do criador quando houver mais de uma opção válida com impacto estratégico, de negócio, arquitetura, semântica de produto ou usabilidade.

Nunca aplique um patch local apenas porque o prompt menciona uma tela, função ou arquivo específico.

## Contexto do criador

O criador do ContentFlow **não é programador** e trabalha majoritariamente por Vibe Coding com agentes de IA.

Consequências obrigatórias:

- não presuma que o escopo literal do prompt representa todo o impacto técnico;
- investigue ramificações que o criador pode não ter como antecipar;
- explique impactos importantes em linguagem clara, evitando jargão desnecessário;
- diferencie problema técnico, decisão arquitetural e decisão de produto;
- não transfira ao criador decisões puramente técnicas quando existe uma única solução correta;
- não esconda decisões de produto dentro de implementação técnica;
- quando uma escolha exigir decisão do criador, apresente poucas opções reais, seus impactos e aguarde a escolha antes de implementar essa parte;
- nunca use o desconhecimento técnico do criador como permissão para decidir silenciosamente comportamento de negócio ou UX.

## Ordem de autoridade

Use esta ordem:

1. código e contratos vivos do checkout atual;
2. documentação normativa atual do repositório;
3. decisões explícitas mais recentes do criador;
4. esta skill;
5. exemplos, testes históricos e inferências do agente.

A skill nunca congela uma arquitetura antiga. Se houver conflito, investigue a fonte vigente.

Leia primeiro, conforme a área afetada:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/CONTENT_CONTRACT.md`
- documentação normativa específica da área
- código real que implementa o fluxo

Se a tarefa envolver plugins, use também `contentflow-plugin-development`.
Se envolver criação/alteração de Methods, use também `contentflow-method-development`.

## Regra de investigação

**Investigação ampla não significa edição ampla.**

O prompt define o problema a resolver, não os únicos arquivos que podem ser investigados.

Siga o fluxo até encontrar a autoridade real. Quando necessário, percorra:

`UI → contrato → persistência → runtime → Core → plugin/bridge → resultado`

ou qualquer outra cadeia pertinente.

Edite somente as camadas necessárias para resolver a causa corretamente.

## Regra da menor mudança correta

Não busque a menor mudança em número de linhas.

Busque:

> a menor mudança que resolva a causa na autoridade correta, sem duplicar responsabilidade e sem enfraquecer contratos universais.

Se a correção correta exigir vários arquivos ou camadas, faça isso.

## Regra da classe de problema

Não corrija apenas a ocorrência concreta quando ela revelar uma classe de falhas. Antes de editar:

1. descreva a natureza comum do problema sem nomes de fornecedor, tela, Método ou caso particular;
2. identifique a autoridade canônica capaz de resolver todos os casos equivalentes;
3. inventarie consumidores, produtores, persistência e fluxos que compartilham o mesmo contrato;
4. implemente a regra geral na menor fronteira correta, mantendo particularidades fora do Core;
5. migre ou diagnostique representações existentes conforme a política vigente;
6. proteja a classe com validações e testes contratuais, além do cenário real que revelou a falha.

Uma generalização só é válida quando preserva a arquitetura e resolve casos da mesma natureza. Não amplie o escopo para problemas apenas parecidos, não transforme um exemplo em regra de negócio universal e não crie abstração sem consumidores reais.

### Aprendizado a partir de testes reais

Um teste vertical não serve apenas para confirmar uma correção previamente imaginada. Cada falha real deve ser tratada como evidência para auditar o repertório do produto:

1. preserve o fato bruto e identifique em qual fronteira ele se perdeu ou foi achatado;
2. verifique se o Core já possui vocabulário suficiente para distinguir a situação de outras classes de falha;
3. quando faltar vocabulário, amplie contratos de fatos e a política universal na autoridade correta, sem interpretar texto localizado e sem especializar por fornecedor;
4. plugins, Browser Bridge e adapters reportam fatos estruturados; somente o Core escolhe retry, backoff, reload, fallback, reconciliação, intervenção ou falha;
5. valide tanto a decisão positiva quanto as recuperações perigosas que agora devem ficar bloqueadas;
6. registre o aprendizado em código, testes, documentação normativa e skills aplicáveis no mesmo trabalho.

Não considere o cenário “resolvido” quando ele apenas avança por fallback, intervenção manual ou reinício que mascara a causa. Confirme o comportamento observável que motivou o teste e use a nova classificação em todos os consumidores equivalentes.

Respeite a camada de tradução: Browser Bridge relata transporte/lifecycle; o plugin interpreta a página e o protocolo específicos do fornecedor e os traduz para a taxonomia universal; o Core decide a recuperação. Nunca faça o Core analisar texto de página ou conhecer mensagens/seletores do fornecedor, e nunca deixe o plugin devolver a ação de recovery. Quando fornecedores diferentes expressarem a mesma condição, normalize-os no mesmo código universal; quando as recuperações seguras forem diferentes, preserve códigos distintos.

## Autoridade e fronteiras

Use `references/architecture-map.md` como mapa rápido, sempre subordinado à arquitetura viva.

Princípios:

- Core possui decisões universais de execução.
- Method declara estratégia; não executa política operacional.
- Block é unidade declarativa da estratégia.
- Plugin executa particularidade de ferramenta e relata fatos/resultados.
- Browser Bridge oferece capacidade universal e privilegiada de navegador, sem incorporar regra específica de fornecedor.
- Orchestrator organiza/agrega trabalho; não duplica inteligência do Core.
- UI/Presentation apresenta e coleta interação; não redefine semântica de domínio.
- Persistence preserva estado; não inventa significado.
- particularidade da ferramenta fica no plugin;
- significado universal sobe para a autoridade universal apropriada;
- Humano, IA e Código obedecem aos mesmos contratos de entrada e entrega;
- trabalho concluído deve ser preservado e reutilizado sempre que possível;
- não duplique autoridade;
- não crie heurística silenciosa para mascarar configuração inválida;
- não restaure legado apenas para fazer um caso antigo voltar a funcionar;
- não transforme renderer, nome de campo, MIME ou formato físico em semântica universal sem contrato explícito.

Para conteúdo, `docs/CONTENT_CONTRACT.md` é a autoridade vigente.

## Protocolo de decisão

Antes de editar, classifique a situação.

### Caso A — uma única solução correta

Implemente sem pedir autorização adicional quando a mudança for claramente determinada pelos contratos/arquitetura, por exemplo:

- remover duplicação de responsabilidade;
- usar uma autoridade canônica já existente;
- corrigir validação inconsistente;
- alinhar código com contrato normativo vigente;
- corrigir bug cuja semântica esperada já está definida.

Explique brevemente o que foi encontrado e siga.

### Caso B — mais de uma opção legítima

Pare antes da decisão quando a escolha alterar qualquer um destes pontos:

- comportamento percebido pelo usuário;
- regra de negócio;
- UX ou fluxo de interação;
- estratégia de produto;
- semântica de Method, Block, Process, Channel ou Project;
- responsabilidade entre camadas;
- política de compatibilidade;
- persistência ou migração com consequências de produto;
- contrato público;
- custo, segurança ou operação com trade-offs legítimos.

Apresente no máximo as opções realmente relevantes:

- Opção A — o que muda e impacto.
- Opção B — o que muda e impacto.
- Recomendação técnica, se houver, claramente separada da decisão de produto.

Depois aguarde a decisão do criador.

Não invente opções artificiais só para perguntar.

## Comunicação obrigatória

Ao explicar antes ou durante uma mudança:

- seja conciso;
- use português claro quando estiver falando com o criador;
- traduza implicações técnicas para efeito prático;
- diga onde está a causa, não apenas onde apareceu o sintoma;
- sinalize impacto indireto importante;
- não despeje detalhes de implementação irrelevantes;
- não trate testes como autoridade sobre o código real.

## Implementação

Durante a alteração:

- preserve responsabilidades arquiteturais;
- evite sistemas paralelos;
- reutilize contratos e autoridades existentes;
- remova código que perdeu função quando isso fizer parte da correção;
- não mantenha compatibilidade legada sem necessidade real;
- não introduza fallback silencioso;
- preserve identidade, progresso e trabalho já concluído;
- não especialize o Core para uma ferramenta específica;
- não mova decisões universais para plugins;
- atualize documentação normativa quando o contrato ou comportamento arquitetural mudar.

## Coerência entre código, testes, documentação e skills

Uma mudança não está encerrada quando apenas o código funciona. Antes de concluir, faça uma
auditoria explícita das quatro superfícies que preservam o conhecimento do projeto:

1. **código e contratos vivos** — a autoridade executável implementa a regra na camada correta;
2. **testes** — protegem a classe do problema e o cenário real que a revelou;
3. **documentação normativa** — registra semântica, responsabilidades e exceções deliberadas;
4. **skills aplicáveis** — orientações operacionais não contradizem o checkout nem perpetuam a
   regra anterior.

Atualize somente as superfícies afetadas, mas verifique todas as quatro em toda mudança de
arquitetura, domínio, contrato, execução, retry, plugin ou persistência. Se uma delas não precisar
de alteração, confirme que continua coerente; não presuma isso. Procure afirmações antigas nas
skills especializadas e em suas referências, não apenas no `SKILL.md` principal.

Não duplique a documentação normativa inteira dentro das skills. A skill deve registrar o método
de trabalho e apontar para a fonte viva; detalhes de produto permanecem na documentação do
checkout. Ao encontrar divergência, corrija a autoridade apropriada e valide novamente o conjunto.

## Validação vertical

Depois de implementar, valide o fluxo real afetado, não apenas funções isoladas.

Exemplos:

`UI → configuração → persistência → execução → resultado`

`Method → capability → Plugin → Browser Bridge → resultado → Core → Delivery`

`input → materialização → work units → execução → retry/resume → output`

Escolha o fluxo pertinente à tarefa.

Testes, typecheck e build confirmam a implementação, mas não substituem a auditoria do código real.

## Critério de conclusão

Uma tarefa só está concluída quando:

- a causa foi tratada na autoridade correta;
- não foi criada responsabilidade duplicada;
- o fluxo vertical continua coerente;
- impactos relevantes foram considerados;
- decisões de produto não foram tomadas silenciosamente pelo agente;
- código obsoleto criado pela solução anterior foi removido quando aplicável;
- documentação normativa foi atualizada quando necessário;
- código, testes, documentação e skills aplicáveis foram auditados em conjunto;
- validações apropriadas foram executadas.

## Referências da skill

- `references/architecture-map.md`
- `references/collaboration-protocol.md`

Sempre prefira a arquitetura e o código vivos do checkout às referências desta skill.

## Dev Monitor em testes verticais

Antes de um teste vertical monitorado, leia `docs/DEV_MONITOR.md` do checkout atual e identifique a fronteira afetada. Selecione um cenário em `server/dev-monitor/scenarios.ts`; se não houver cenário pertinente, crie um com requisitos e asserções do fluxo real, sem tratar cenário aproximado como prova. Execute `npm run dev-monitor -- run <scenario>` e comece pelo `ai-digest.json`.

- `PASS`: registre a evidência; não abra automaticamente trace/logs completos.
- `FAIL_INVARIANT`: leia os checks que falharam e os slices indicados no digest.
- `FAIL_SCENARIO`: investigue a asserção funcional e as projeções pertinentes.
- `INVALID_INSTRUMENTATION`: resolva perda, produtor, sequência, flush ou cobertura ausente antes de confiar no resultado funcional; nunca apresente como sucesso.
- `TIMEOUT`: use projeções e slices para localizar o último ponto confirmado.

Prioridade de contexto: digest → checks específicos → evidence slices → projeções relevantes → events.jsonl somente se necessário → logs tradicionais somente depois. Se o digest indicar truncamento, consulte os demais checks específicos. Distinga `NOT_OBSERVED` de check aprovado.

Depois de localizar/corrigir a causa, repita exatamente o mesmo cenário e execute `npm run dev-monitor -- diff <before> <after>`. Exija cenário funcional ok, instrumentação íntegra, violações resolvidas e nenhuma nova violação. Diff não comparável não prova correção. Não extrapole um PASS ao Chrome/provider real, renderer, restart ou migração que o cenário não exercitou. Consulte os gaps em `npm run dev-monitor -- coverage`. O monitor observa; não escolhe políticas do Core.
