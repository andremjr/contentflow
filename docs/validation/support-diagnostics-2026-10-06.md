# Diagnóstico local de suporte — 06/10/2026

## Escopo autorizado

O criador autorizou a seção Suporte e diagnóstico no fim de Preferências, com Exportar diagnóstico e Abrir pasta de logs, sem nova aba na navegação. Pediu retenção curta, aproximadamente 24 horas, e baixo custo em computadores fracos. A implementação usa retenção de até 24 horas e teto de 4 MiB, sem monitoramento de cliques, progresso granular ou leitura periódica bem-sucedida. Não altera contratos de conteúdo, persistência operacional, identidade, leases, execução ou política de recovery.

## Fronteira implementada

O Electron grava eventos estruturados em arquivos JSONL sob `userData/logs`. API e renderer fornecem apenas fatos técnicos autorizados; mensagens, corpos de requisição e stacks completos não entram nos arquivos. Código, classe do erro, posição relativa no código, status, duração, versões e IDs resumidos por hash permitem correlacionar o ocorrido. Não há coleta automática de dados do computador ou envio remoto.

O writer limita segmentos de hora a 256 KiB, o conjunto a 4 MiB, a fila a 64 KiB e a aceitação a 40 eventos/s. Deduplica por cinco segundos e grava em lotes de um segundo. Limpa segmentos expirados na inicialização, gravação e virada de hora. Com o programa fechado, a próxima abertura faz a limpeza. Limites podem omitir eventos, informados pelo código RECORDS_DROPPED quando houver espaço. Arquivos estranhos e ZIPs exportados não são apagados; o antigo updates.log deixa de receber gravações e não entra no ZIP.

A exportação manual revalida o conteúdo dos arquivos e gera ZIP com LEIA-ME.txt trilingue, versões técnicas e eventos. Os dois comandos IPC aceitam somente a janela principal e não recebem caminhos arbitrários do renderer. Erro de armazenamento apresenta mensagem localizada; cancelamento do seletor não é erro. Logs de suporte são observação e não autoridade operacional.

## Validação

- `npm run desktop:prepare`: build da interface e API desktop com runtime privado concluído, sem criação de instalador ou publicação.
- `node --test desktop/diagnostics.test.cjs desktop/updater.test.cjs desktop/distribution-boundaries.test.cjs`: 17 testes aprovados de sanitização, expiração, preservação de arquivo externo, limites, deduplicação, ZIP, stream marcado e armazenamento indisponível; updater e distribuição preservados. A suite nova integra o check existente de distribuição.
- `npm run typecheck` e lint direcionado aos arquivos de implementação/teste alterados: aprovados. Não foi executada a suite geral de release.
- `npm run test:i18n`: 35 testes, incluindo todos os textos novos em PT-BR, inglês e espanhol.
- `npm run test:plugin-jobs`: regressões de reinício, idempotência, lease, cancelamento, timeout e limpeza aprovadas.
- `npx playwright test --config playwright.electron.config.ts tests/electron/support-diagnostics.spec.ts`: três cenários aprovados na shell Electron real, interface → IPC → arquivo ZIP, com API real e base temporária isolada. Conferem falha HTTP com corpo privado, TypeError de interface, rejeição de Promise, exclusão de valores privados, ausência de logs de polling, cancelamento, abertura da pasta, limpeza de segmento expirado e feedback nas três línguas.

O cenário desktop revelou que o evento console-message entrega os detalhes no primeiro argumento na versão vigente do Electron e que o mundo isolado nem sempre fornece o Error do renderer. A captura final usa os detalhes tipados do evento e extrai somente classes/códigos seguros da mensagem, sem persistir texto bruto. O cenário foi repetido após o ajuste.

## Limites das evidências

O seletor nativo e shell.openPath são interceptados no teste para escolher um destino temporário e verificar o caminho; não se afirma inspeção manual do Explorador de Arquivos. Os arquivos e o ZIP são reais, assim como o renderer, IPC, API e banco da instância isolada. Não houve execução autenticada de um plugin/provedor, benchmark de CPU/RAM em computador fraco ou teste de instalador atualizado. O Dev Monitor vigente não cobre essa superfície renderer/IPC/exportação; estes testes Electron são a evidência pertinente.

Mensagens privadas de exceção são excluídas deliberadamente. Erros não classificados podem exigir reprodução e descrição do aluno. Encerramento forçado pode perder o último segundo de eventos. Não há garantia de coleta diante de falha de disco nem de histórico completo sob limites.

Código, regressões, ARCHITECTURE, DESKTOP, CURRENT_STATE e skills aplicáveis foram auditados. As skills permanecem coerentes: a exportação não altera contratos ou política de plugin/Bridge. A versão continua 1.3.6; implementação e validação locais não autorizam release.
