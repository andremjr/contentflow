# Cenários de aceitação do Reliability Program

## Propósito

Estes cenários preservam histórias observáveis de produto que devem orientar decisões e provas do Reliability Program. Eles complementam a [`Constituição de produto`](00-PRODUCT-CONSTITUTION.md) e a [`Arquitetura-alvo`](01-TARGET-ARCHITECTURE.md), sem antecipar implementação, ferramenta ou desenho final dos testes.

Cada cenário descreve uma situação e o resultado que o usuário e o sistema devem observar. Detalhes executáveis serão definidos nas tasks apropriadas, contra o runtime real daquele momento.

## S01 — Caminho feliz dos 8 Processos

**Situação:** um Projeto inicia com um snapshot válido e percorre os oito Processos Universais.

**Resultado esperado:**

- a sequência segue a ordem congelada no snapshot;
- cada Bloco avança somente depois de satisfazer seu contrato;
- deliveries e respectivos itens permanecem rastreáveis até os outputs oficiais;
- o estado de Blocos, Processos e Projeto permanece coerente;
- nenhum adapter ou executor inventa uma etapa estratégica.

## S02 — Cinco vídeos desacompanhados

**Situação:** uma usuária inicia cinco Projetos e deixa o ContentFlow trabalhando. Um deles entra em backoff ou falha recuperável.

**Resultado esperado:**

- trabalhos realmente independentes continuam quando houver recursos e segurança;
- Blocos e unidades concluídos não são repetidos;
- o trabalho afetado fica estacionado com razão observável;
- quando volta a ser elegível, ele retoma do ponto seguro;
- ao retornar, a usuária encontra conclusões ou motivos concretos, não estados indefinidos.

## S03 — Restart durante execução

**Situação:** o aplicativo ou o computador reinicia enquanto existe trabalho ativo, pendente ou em espera.

**Resultado esperado:**

- estado `completed` continua concluído;
- trabalho pendente continua identificável e recuperável;
- estado em voo é reconciliado antes de eventual replay;
- locks e leases transitórios não corrompem nem sequestram permanentemente o trabalho;
- nenhum efeito é duplicado apenas por causa do restart.

## S04 — Timeout antes de efeito externo

**Situação:** ocorre timeout e existe evidência suficiente de que nenhum efeito externo foi submetido.

**Resultado esperado:**

- a falha é classificada como retry técnico seguro;
- a mesma unidade lógica pode ser repetida conforme limites e backoff aplicáveis;
- a tentativa fica registrada;
- nenhuma nova rodada editorial é consumida.

## S05 — Queda após possível efeito externo

**Situação:** a conexão cai depois de uma submissão potencial, sem confirmação do resultado.

**Resultado esperado:**

- a unidade entra em estado de efeito incerto;
- o Core decide reconciliar antes de retry, fallback ou troca de perfil;
- recibos, correlações ou estado remoto são preservados;
- não ocorre retry cego;
- incerteza persistente resulta em espera ou intervenção explicada, não em sucesso fictício.

## S06 — Perfil indisponível

**Situação:** o perfil selecionado fica indisponível antes ou durante uma unidade.

**Resultado esperado:**

- fallback ocorre somente quando a política permite e não existe efeito externo incerto;
- apenas perfis vinculados e preparados podem ser considerados;
- unidades concluídas permanecem preservadas;
- a mesma unidade não é distribuída simultaneamente para dois perfis;
- ausência de alternativa segura estaciona o trabalho com diagnóstico.

## S07 — CAPTCHA, autenticação ou intervenção

**Situação:** a execução encontra CAPTCHA, sessão expirada, permissão, cota, upgrade ou outra condição que exige uma pessoa.

**Resultado esperado:**

- o trabalho afetado é estacionado;
- a interface explica o motivo e a ação necessária;
- retries técnicos não são consumidos indefinidamente;
- estado, resultados e recibos permanecem preservados;
- trabalhos independentes podem continuar;
- o produto não tenta contornar a proteção externa.

## S08 — Resposta inválida do plugin

**Situação:** um plugin retorna porta, tipo, cardinalidade, artifact ou payload incompatível com o contrato.

**Resultado esperado:**

- a resposta é rejeitada com erro explícito de contrato;
- o Bloco não é concluído;
- nenhum fallback heurístico converte a resposta em sucesso;
- o diagnóstico identifica a incompatibilidade sem expor secret ou dado privado;
- entregas anteriores válidas permanecem intactas.

## S09 — Binding ambíguo

**Situação:** mais de uma origem parece elegível para uma entrada, ou a origem normalizada não está definida.

**Resultado esperado:**

- o runtime canônico não escolhe por nome, proximidade ou semelhança textual;
- o trabalho afetado não inicia com dado possivelmente incorreto;
- a ambiguidade produz diagnóstico identificável;
- sugestão do editor só pode materializar um binding depois de confirmação; formato antigo ou origem indefinida permanece bloqueado antes da execução.

## S10 — Retry editorial após `VALIDAR`

**Situação:** um Bloco `VALIDAR` reprova o resultado e solicita nova rodada editorial.

**Resultado esperado:**

- uma nova tentativa editorial é criada;
- somente o trecho linear correto entre o alvo e a validação é invalidado;
- feedback e histórico anterior permanecem preservados;
- entregas da tentativa anterior não são tratadas como atuais;
- retries técnicos não consomem o limite de rodadas editoriais.

## S11 — Lote parcial

**Situação:** um Bloco possui muitas work units e falha depois de concluir parte delas.

**Resultado esperado:**

- cada unidade concluída está persistida antes da falha;
- retomada não repete concluídos;
- unidades pendentes mantêm identidade e tentativa corretas;
- ordem, `sourceItemId`, deliveries, artifacts e proveniência permanecem preservados;
- uma falha parcial não transforma o lote inteiro em concluído nem apaga progresso válido.

## S12 — Cancelamento

**Situação:** o usuário cancela uma execução ou fila com trabalho concluído, pendente e possivelmente em voo.

**Resultado esperado:**

- nenhum novo efeito é iniciado depois que o cancelamento se torna efetivo;
- executores recebem cancelamento e liberam recursos quando possível;
- trabalho já concluído e sua proveniência são preservados;
- efeitos externos incertos continuam explicitamente identificados;
- cancelamento não promove output incompleto nem avança cursor;
- restart não ressuscita silenciosamente o trabalho cancelado.

## S13 — Máquina fraca

**Situação:** o ContentFlow executa em computador antigo, com processador modesto, pouca memória e sem GPU dedicada.

**Resultado esperado:**

- waits e backoff consomem recursos mínimos;
- concorrência permanece conservadora;
- lock e lease de perfil físico são respeitados;
- browsers e workers desnecessários são liberados;
- backpressure impede crescimento descontrolado de filas em memória;
- interface e aplicativo continuam responsivos o suficiente para inspeção e intervenção.

Este cenário não fixa números antecipados de workers, memória ou latência; os limites serão definidos por medição posterior.

## S14 — Upgrade de base antiga representativa

**Situação:** uma instalação antiga representativa é atualizada para o estado candidato do Reliability Program.

**Resultado esperado:** preservar ou migrar de forma verificável e recuperável:

- Canais e Métodos;
- Projetos e snapshots;
- executions e jobs;
- deliveries e work units;
- plugins instalados;
- profiles, bindings e readiness;
- queues e respectivos cursores;
- arquivos e pastas associados a esses registros.

O upgrade não funde perfis por heurística, não reinterpreta snapshots históricos e não apaga a representação anterior antes de backup e validação.

Métodos v1/v2 e plugins API v1 podem ser preservados como dados históricos para recuperação pelo usuário, mas permanecem inválidos para importação e execução. O upgrade não os adapta; um pacote utilizável precisa ser produzido novamente nos contratos Método v3 e Plugin API v2.

## S15 — Estratégia imutável depois do início

**Situação:** Canal, ordem de Processos ou Método é editado depois que um Projeto começou.

**Resultado esperado:**

- o Projeto iniciado conserva a estratégia de seu snapshot;
- retomada e retry usam a mesma estratégia congelada;
- novos Projetos podem usar a definição atualizada;
- a interface distingue a configuração atual do Canal da configuração histórica do Projeto;
- nenhuma migração silenciosa altera o significado da execução em andamento.

## S16 — Falha terminal inevitável

**Situação:** todas as recuperações seguras foram esgotadas ou a falha é definitivamente não recuperável.

**Resultado esperado:**

- o trabalho chega a estado terminal explícito;
- o diagnóstico apresenta causa concreta e última decisão relevante;
- tentativas, resultados parciais, recibos e proveniência permanecem inspecionáveis;
- nenhum job, lease ou estado intermediário fica como zombie;
- o sistema não continua consumindo retries ou recursos;
- trabalhos independentes continuam quando elegíveis.

## Regra de uso

Uma task futura pode detalhar precondições, fixtures, instrumentação e evidências de um cenário quando ele entrar em seu escopo. Esse detalhamento não pode enfraquecer o resultado observável registrado aqui nem declarar sucesso parcial como aceitação integral.
