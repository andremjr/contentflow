# Architecture Map — ContentFlow

Este arquivo é um mapa rápido. A autoridade real continua sendo `docs/ARCHITECTURE.md`, `docs/CONTENT_CONTRACT.md` e o código atual.

## Core

Possui decisões universais de execução:

- estado e progressão;
- elegibilidade e dependências;
- retries e recovery universais;
- work units e identidade;
- deliveries;
- perfis, lanes e leases;
- preservação de trabalho concluído;
- decisões como continuar, aguardar, trocar recurso permitido ou falhar conforme contratos vigentes.

Não deve conhecer detalhes específicos de fornecedor.

## Method

Declara a estratégia de um Processo.

Define Blocks, ligações e configurações estratégicas. Não deve possuir lógica operacional global do runtime.

## Block

Unidade declarativa de trabalho dentro do Method.

Operadores podem mudar quem executa, mas não o significado contratual das entradas e saídas.

## Plugin

Executa uma capability específica.

Responsável por particularidades de ferramenta/provedor, integração e interpretação factual do resultado.

Não decide progressão global, estratégia do Project ou políticas universais de recovery.

## Browser Bridge

Infraestrutura compartilhada de automação privilegiada de navegador.

Pode oferecer primitivas universais como interação segura, lifecycle, idempotência, observação, arquivos, teclado e reconciliação.

Seletores, regras de DOM e peculiaridades de fornecedor ficam no plugin.

## Orchestrator

Fila/agendamento/agregação.

Não deve duplicar as decisões universais do Core.

## UI / Presentation

Apresenta estado, coleta configuração/interação e renderiza resultados.

Não redefine semântica de domínio.

## Persistence

Persiste estado definido pelas autoridades de domínio/runtime.

Não cria significado novo por conveniência de armazenamento.

## Regra de escalonamento

Particularidade da ferramenta fica no plugin.

Quando um conceito se mostra universal, ele deve subir apenas para a infraestrutura universal apropriada:

- semântica/decisão universal → Core/domínio;
- capacidade privilegiada genérica de browser → Browser Bridge;
- helper reutilizável de desenvolvimento → Plugin Kit/SDK;
- apresentação → UI/Presentation.

Nunca subir particularidade de fornecedor ao Core.
