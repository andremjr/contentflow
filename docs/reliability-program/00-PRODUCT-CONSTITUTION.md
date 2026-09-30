# Constituição de produto do Reliability Program

## Propósito e autoridade

Esta Constituição registra promessas de produto e confiabilidade que devem governar o Reliability Program. Ela é deliberadamente estável, fala em linguagem de produto e não substitui [`../ARCHITECTURE.md`](../ARCHITECTURE.md), que continua sendo a fonte normativa principal do domínio atual.

O programa deve consolidar o núcleo sem redefinir o ContentFlow. Qualquer mudança que contrarie a arquitetura vigente exige decisão explícita do proprietário, migração compatível quando necessária e atualização da fonte normativa correta.

## 1. Hierarquia de responsabilidade

1. **O Core é o gerente soberano do processo.** Ele possui o estado, as identidades, as transições e a decisão sobre o que acontece depois.
2. **O Método define a estratégia.** Ele descreve intenção, ordem, contratos e composição do trabalho.
3. **O plugin implementa uma capability.** Ele executa trabalho delegado e devolve fatos, progresso, resultados e correlações. Nunca define a estratégia.
4. **O Orchestrator agenda trabalho elegível.** Ele decide quando e qual trabalho recebe recurso, sem interpretar a estratégia interna do Método nem criar um segundo motor de execução.
5. **A interface apresenta estado e envia intenções.** Ela não conserva uma máquina de estados paralela nem conclui trabalho apenas porque a tela parece concluída.

Nenhuma camada pode assumir silenciosamente a responsabilidade de outra.

## 2. Gramática preservada

O Reliability Program preserva a gramática existente do ContentFlow:

- 8 Processos Universais;
- 4 Blocos Essenciais: `BUSCAR`, `ESCOLHER`, `CRIAR` e `VALIDAR`;
- 3 Operadores: `Humano`, `IA` e `Código`.

Entre TASK-001 e TASK-052, nenhuma nova primitiva de domínio deve ser introduzida sem decisão explícita do proprietário. Uma necessidade nova deve primeiro ser testada como composição das primitivas existentes, de contratos universais, de Itens e de capabilities de plugins.

## 3. Estratégia congelada e significado histórico

O Método define a estratégia. Quando um Projeto começa, a estratégia usada por ele é congelada em snapshot.

Depois do início:

- alterações no Canal ou no Método não reinterpretam silenciosamente a execução;
- retries e retomadas preservam a estratégia e a proveniência originais;
- migrações não reescrevem o significado de snapshots, filas ou entregas históricas;
- dados operacionais persistidos continuam legíveis em seu contexto original ou passam por migração explícita e recuperável; essa garantia não adapta contratos antigos de Método ou plugin.

Compatibilidade significa preservar significado, não apenas conseguir desserializar bytes.

## 4. Execução desacompanhada é o caso normal

O ContentFlow deve assumir que uma pessoa pode iniciar trabalho e permanecer horas sem observar a aplicação. Durante esse período:

- a internet pode cair;
- um navegador pode fechar;
- um provider pode demorar ou ficar indisponível;
- um perfil pode falhar;
- um plugin pode responder com erro ou output inválido;
- o ContentFlow pode reiniciar;
- o computador pode reiniciar.

O objetivo não é eliminar todo erro. O objetivo é garantir comportamento correto quando o erro acontece.

O produto deve:

- preservar trabalho concluído;
- impedir duplicação silenciosa;
- recuperar automaticamente o que for seguro recuperar;
- estacionar o que precisa aguardar;
- continuar trabalho independente quando houver recurso e segurança para isso;
- apresentar uma razão concreta quando algo não puder continuar.

Um estado desconhecido não pode ser apresentado como sucesso, e uma interface desatualizada não pode apagar um fato persistido.

## 5. Hardware fraco é ambiente primário

Máquinas antigas e de baixo custo são ambientes válidos. Um computador representativo pode possuir processador Intel i3, pouca memória e nenhuma GPU dedicada.

Consequentemente:

- throughput máximo não é prioridade absoluta;
- concorrência deve ser conservadora e adaptável;
- esperas devem consumir o mínimo de CPU e memória;
- navegadores e outros recursos caros devem ser liberados quando não forem necessários;
- paralelismo só é aceitável quando identidade, isolamento, recursos e recuperação estiverem seguros;
- estabilidade e previsibilidade valem mais que velocidade nominal.

Este documento não fixa quantidades de workers, tempos ou limites. Valores concretos dependem de medição posterior e devem possuir defaults seguros.

## 6. Cenário central dos cinco vídeos

Uma usuária inicia cinco vídeos pela manhã e sai. Ao longo do dia podem ocorrer timeout, queda de navegador, plugin inválido, perfil indisponível, espera longa ou reinício do aplicativo ou computador.

Ao retornar à noite:

- idealmente, os cinco vídeos terminaram;
- se algum não terminou, o produto informa uma razão concreta e uma ação possível;
- trabalho concluído permanece concluído;
- um vídeo estacionado não bloqueia os demais quando eles forem independentes;
- nenhuma geração, cobrança ou publicação é repetida apenas porque o sistema perdeu a resposta.

Esse cenário é uma referência de produto para decisões de persistência, scheduling, recovery e interface. Ele não autoriza paralelismo irrestrito nem altera a estratégia de cada Projeto.

## 7. Efeito externo incerto

Quando o sistema não sabe se um efeito externo aconteceu, ele não deve repeti-lo cegamente.

Exemplo: um pedido de geração foi submetido, a conexão caiu e o resultado ficou desconhecido. Nesse caso, o ContentFlow deve preservar o estado e tentar reconciliar recibo, correlação, estado remoto ou outro fato verificável antes de autorizar retry, troca de perfil ou nova submissão.

Evitar duplicidade, custo repetido e efeitos externos conflitantes tem prioridade sobre throughput. Ausência de confirmação não equivale a ausência de efeito.

## 8. Contratos determinísticos

O runtime canônico executa contratos explícitos. Ele não pode:

- escolher input por semelhança textual;
- inventar porta, tipo ou cardinalidade;
- converter contrato incompatível em sucesso por fallback genérico;
- resolver ambiguidade silenciosamente;
- aceitar output inválido porque ele se parece com o esperado.

Heurísticas podem auxiliar sugestões do editor, mas nunca completar um contrato ausente. Antes da execução canônica, toda origem precisa estar materializada como binding explícito ou diagnóstico determinístico. Ambiguidade bloqueia o trabalho afetado com explicação concreta; não muda o significado do contrato. Importadores de Método aceitam somente o envelope v3 e plugins somente a API v2.

## 9. Intervenção humana é uma decisão, não um fallback genérico

Antes de pedir intervenção, o sistema deve, quando seguro e permitido pela política aplicável, tentar retry técnico, backoff, fallback de recurso, reconciliação e continuação de trabalho independente.

Quando a intervenção for realmente necessária, o ContentFlow deve:

- estacionar o trabalho afetado;
- preservar estado, tentativas, entregas, artifacts e recibos;
- explicar o motivo e a ação esperada;
- não consumir retries indefinidamente;
- continuar outros trabalhos independentes quando possível;
- retomar do ponto seguro depois da correção, sem refazer concluídos.

CAPTCHA, login, permissão, cota, upgrade, contrato ambíguo e efeito externo irreconciliável são exemplos de estados que podem exigir uma pessoa. O produto não contorna proteções do provider para evitar essa intervenção.

## 10. Escopo do Reliability Program

Entre TASK-001 e TASK-052, o objetivo é consolidar o núcleo e sua confiabilidade. As funcionalidades atuais são suficientes para esse escopo.

O programa deve evitar:

- novas features sem relação direta com confiabilidade;
- novas primitivas de domínio;
- regras de fornecedor dentro do núcleo;
- máquinas de estado concorrentes em UI, plugins ou Orchestrator;
- migrações destrutivas sem ensaio, backup e recuperação;
- otimizações que sacrifiquem correção, observabilidade ou hardware fraco.

Depois do Reliability Gate, o foco principal poderá voltar à evolução de plugins e Métodos. Isso não transforma o programa em autorização automática para release, versionamento ou publicação.
