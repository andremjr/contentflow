# Validação local — 4 de setembro de 2026

Escopo solicitado: um projeto por canal, Tema → Título → Thumbnail, sem
publicação e sem alteração de versão. Os projetos usam o banco local e os
plugins reais configurados pelo usuário. A versão da aplicação permanece 0.4.19.

## Registro da execução

A rodada começou indevidamente com mais de um canal em andamento. Após a
orientação explícita do usuário, a execução passou a ser estritamente sequencial;
as etapas já concluídas foram preservadas. Os resultados abaixo não devem ser
apresentados como uma rodada inteiramente sem falhas.

| Canal              | Projeto                                | Resultado observado                                                                                                                                                                              |
| ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| História           | `6903ddc6-b44d-43f7-90b1-ba420b9ab243` | Tema, Título e Thumbnail concluídos. Imagem real exibida. Foi necessário retomar o prompt do ChatGPT após falha de confirmação de envio.                                                         |
| Históricos         | `9b76c9e9-463e-4c4e-9f77-fe6fc56d0145` | Tema, Título e Thumbnail concluídos. Imagem real exibida e aprovada pela interface. Gemini recuperou o envio automaticamente; Flow exigiu retomar a etapa após falha de preenchimento do editor. |
| Negócios           | `dac8354a-b514-4c3e-a67c-d1d9d701df36` | Tema, Título e Thumbnail concluídos. Após retomar a falha anterior de sessão, o projeto percorreu as etapas sem outra intervenção técnica. Imagem real exibida e aprovada.                       |
| Sobrevivencialismo | `eef4f24e-12fc-4bd7-b2c1-ba46df176074` | Tema e Título concluídos; Thumbnail em validação.                                                                                                                                                |
| Agricultura        | `945fe043-22dd-4c3f-be88-a41152607778` | Em espera, sem início de Título ou Thumbnail nesta rodada.                                                                                                                                       |

As aprovações feitas nesta validação conferem o fluxo operacional e a entrega
visual; não constituem auditoria editorial das afirmações geradas pelos modelos.

## Testes automatizados

- `npm run check`: aprovado (lint, tipos, testes de domínio/integração e build).
- `npm run test:browser-bridge`: aprovado; regressão da sessão da ponte.
- `npm run test:e2e`: cinco testes aprovados após as correções de carregamento e
  permanência no resultado final. Banco isolado; imagem fixture, não geração real.
- Lint e tipos repetidos após a última correção de interface: aprovados.

Não houve commit de release, incremento de versão, tag ou publicação. Ainda não
há autorização de release para este conjunto de mudanças. As falhas intermitentes
registradas acima não podem ser tratadas como eliminadas apenas porque uma
retomada teve sucesso.

## Retomada em 5 de setembro

O serviço local estava desligado e foi reiniciado sem recriar o banco. História,
Históricos e Negócios continuam com as três entregas concluídas. Agricultura já
tinha Tema concluído e Título cancelado; esses estados foram preservados.

Sobrevivencialismo foi retomado somente no bloco de geração da Thumbnail. A falha
de preenchimento reapareceu. Foi aplicado no plugin um seletor explícito do editor
e diagnóstico limitado a foco, contagem de caracteres e presença de diálogos, sem
registrar conteúdo privado. Os testes existentes do plugin passaram, mas a rodada
real passou a parar antes, ao abrir o menu de envio de referência. Essa alteração
ainda não está validada de ponta a ponta e não é uma correção comprovada.

As tentativas foram interrompidas após repetição do mesmo erro. O Chrome dedicado
do Flow não está disponível para inspeção pelo controle de navegador da sessão.
Não houve geração substituta, edição de entregas no banco, início de Roteiro ou
publicação. O resultado continua parcial: três de cinco canais completos.
