# Preparação da v1.3.7 — 06/10/2026

## Escopo

O criador pediu atualizar o GitHub e fazer a v1.3.7, corrigir os erros encontrados e investigar o download da extensão. O conjunto local contém inclusão do Bloco VALIDAR com alvo ainda pendente no workspace, preservação do rascunho recuperado, Suporte e diagnóstico em Preferências, empacotamento obrigatório da extensão e das duas skills e correção do erro 500 ao persistir resultado de plugin em Canal sem mapa de Métodos. Não há novas mudanças de migração, perfis, leases, filas, work units ou contratos de conteúdo. Plugins e Métodos independentes mantêm versões e catálogos publicados.

## Evidências

Os registros [VALIDAR](method-add-validation-2026-10-05.md) e [logs](support-diagnostics-2026-10-06.md) documentam os cenários verticais e limites. Nesta preparação, os três cenários web de VALIDAR passaram novamente com API real e base isolada, em PT-BR, inglês e espanhol. Foram aprovados typecheck, 22 testes de content-shape/contratos, seis testes do writer/exportação de suporte e a regressão de jobs persistentes.

A primeira execução de `release:verify` parou em 389 problemas de formatação preexistentes. A pedido do criador, eles foram corrigidos e o lint passou na nova rodada. A revisão geral reproduziu HTTP 500 em integrações de fallback, outputs e respostas de plugin: a leitura de `currentChannel.methods` assumia um mapa ausente nos Canais aceitos pelas fixtures da API. A leitura agora trata a ausência; outputs e fallback passaram na repetição. O contrato de execução continua estrito e nenhum Método é inventado.

Outras regressões exigiam definições congeladas em execuções abertas, campos de controle no editor estratégico ou versões antigas de plugins. Foram alinhadas à arquitetura de Métodos vivos e conteúdo do editor, preservando as verificações de entregas concluídas, ordem e plano de fila. As fixtures P24/P60 usam as versões atuais dos manifestos sem alterar capabilities, portas nem catálogos publicados. As skills locais foram sincronizadas com a fonte canônica do checkout.

A primeira rodada web passou 50/53; as três falhas passaram na repetição após corrigir expectativas/fixture (uma delas foi encerramento transitório do navegador). A rodada completa final ainda está em andamento. Os dois cenários API de ordem, incluindo lote, edição e reinício, passaram com os oito Processos e preservação da ordem/plano. A regressão de distribuição gerou e abriu os três ZIPs, confirmou arquivos da extensão, hashes documentais e rejeição de plano incompleto antes de acesso a credenciais/rede. A fonte de download da extensão e das duas skills é `releases/latest/download`; a API pública confirmou sua ausência na v1.3.6 e o link da extensão respondeu HTTP 404. A correção pública só estará concluída após publicar e conferir os assets da próxima release.

## Resultado final da preparação

- `npm run check`: exit 0, incluindo lint, os dois typechecks, todas as suites contratuais/de integração, sincronização de SDK/skills e build de produção (`check-corrected-v137.log`). As falhas da primeira rodada geral foram corrigidas/alinhadas e suas suites passaram nesta rodada completa.
- `npm run test:i18n`: 35/35 (`i18n-final-v137.log`).
- `npm run test:e2e`: 53/53, workers=1 (`web-final-v137.log`).
- Seis testes desktop: diagnóstico nas três línguas (3/3 em `electron-final-source-v137.log`) e navegação/notificações/migração assistida (3/3 em `desktop-regression-final-v137.log`).
- Executável atualizado: `desktop:prepare` e `electron-builder --win --x64 --dir --publish never` concluíram com exit 0. Os seis cenários adicionais rodaram com `executablePath=release/v1/win-unpacked/ContentFlow.exe`, bases temporárias individuais e API privada real: VALIDAR nas três línguas e diagnóstico/ZIP nas três línguas (6/6 em `packaged-vertical-complete-v137.log`, 49,1 s).
- Distribuição: 14/14 incluindo geração real dos ZIPs, comparação dos cinco arquivos da extensão com a fonte, hashes dos documentos e rejeição de plano sem os três downloads (`distribution-assets-v137.log`).

### Limites observados

A primeira rodada adicional do executável, simultânea à montagem/check/web/Electron, excedeu o prazo de inicialização de 15 s antes de abrir a janela. A API ficou acessível depois; a rodada foi interrompida, sem tratá-la como aprovação. A repetição isolada abriu normalmente, mas o teste identificou o aviso recuperável de hidratação React #419, já documentado neste checkout. Os cenários completos seguintes registraram separadamente dois avisos de shell por idioma (entrada/reload), exigiram ausência de outros pageerrors e verificaram todas as ações do Método, persistência e reabertura. Não se afirma correção desse aviso nem desempenho de inicialização sob aquela carga concorrente; nenhuma intervenção foi aplicada ao Método para completar o fluxo.

O diagnóstico foi validado com erros reais da interface/API sobre dados sintéticos. O diálogo nativo de destino do ZIP e a abertura da pasta tiveram destinos controlados pelo teste; IPC, exportador, arquivos e conteúdo do ZIP foram reais. Não foi usado navegador de provedor nem perfil/credencial de aluno. Não há afirmação de funcionamento em toda instalação externa.

Após receber as evidências e limites acima, o criador autorizou explicitamente a publicação deste conjunto em 06/10/2026: “Ok, se todos os testes já passaram, pode só fazer a publicação.” A montagem e publicação usarão esse estado do código, validação repetida no commit exato, oito assets obrigatórios e links diretos do site. Este registro antecede a publicação; sua conclusão depende da conferência pública dos arquivos e do site.

Nenhum workflow versionado existe em `.github/workflows`; a montagem e publicação não usam GitHub Actions. A atualização dos links do site gh-pages deve apontar diretamente para o Setup da 1.3.7, preservando comunidade, assinatura e downloads independentes.

Este registro é de preparação; a conclusão exige conferência pública de assets, integridade, latest.yml e links do site.

## Publicação concluída

A autorização foi executada em 06/10/2026. O commit `dee47c7ebfbcf22b13df0ff95f4ce806d40d1af9` e a tag anotada `v1.3.7` foram enviados ao GitHub sem workflows versionados. A montagem local terminou com instalador (135.656.521 bytes), portátil (135.332.492 bytes), blockmap, `latest.yml`, extensão, duas skills e manifesto SHA-256 dos sete arquivos.

A repetição no commit exato aprovou i18n, lint, tipos e as suites até execução automática. Um teste de startup do Orchestrator excedeu o prazo durante compactação concorrente. Após terminar a montagem, a validação foi retomada nessa suite: ela passou, assim como todas as restantes, build, 53 testes web e seis testes desktop. O resultado agregado ficou registrado em `release/v1/verification-commit-137.json` (`complete: true`), sem mudança de código nem intervenção no domínio. Os arquivos desktop e bundles API/MCP do executável foram comparados com os arquivos validados do checkout; as skills registram esse commit e `sourceHasLocalChanges: false`.

A [release estável](https://github.com/andremjr/contentflow/releases/tag/v1.3.7) foi criada e preenchida diretamente pela API com a credencial existente do Git Credential Manager mantida somente em memória. Todos os oito assets tiveram estado, tamanho e SHA-256 confirmados pelo upload e pela API pública. A conferência pública baixou `latest.yml`, manifesto e ZIPs, verificou o SHA-512 do instalador, a integridade dos ZIPs e os hashes/documentação das skills. Todos os downloads, incluindo os três links `latest/download` usados pela interface, resolveram HTTP 200.

O branch gh-pages foi atualizado para `f18e93db72419c5794b5d6df8b802b9de8025b9c`. A primeira leitura ainda encontrou o site antigo durante propagação; a repetição pública confirmou todos os links em `/`, `index.html`, comunidade, conceito, ecossistema e o chunk da página inicial apontando diretamente para `ContentFlow-V1-1.3.7-x64-Setup.exe`. A auditoria local comprovou que somente as URLs do instalador foram substituídas. Comunidade, assinatura, plugins e Métodos conservaram seus links.

Os catálogos públicos permaneceram byte a byte iguais aos capturados antes da publicação: plugins SHA-256 `6acfe2543455c856d936990b5ea1af126584ee9a62bed69073c34c3afa45e5b9`; Métodos SHA-256 `f342f43a39e1b28a92854f843ccc4cf63df5b9e70c99c7d88a57872c7856f57f`. Os estados, tamanhos e hashes dos 21 assets do catálogo de plugins também foram conferidos pela API pública. A evidência final está em `release/v1/publication-verified-137.json`. Os limites de hidratação/startup e de ambientes externos descritos acima permanecem explícitos. Não foi usado GitHub Actions.
