# ContentFlow v1.3.2

Esta versão simplifica a criação de Métodos e amplia a Biblioteca Estratégica,
preservando os contratos internos de execução e as responsabilidades dos plugins.

- Entradas e entregas visíveis dos Métodos usam texto, imagem, áudio e vídeo.
  O seletor de conteúdo/controle/registros foi removido. Contratos internos
  existentes permanecem preservados; o Builder MCP segue a mesma regra.
- A interface funcional de cada plugin é renderizada a partir de seu schema,
  incluindo modelos, proporções, variantes e referências por cena.
- Flow e ChatGPT Browser Studio 2.0.1 permitem o fluxo roteiro → personagens →
  referências → prompts com nomes e IDs → cenas → seleção → animação. Conteúdo
  JSON textual é interpretado pelos plugins; o Core administra identidade e
  proveniência.
- Biblioteca Estratégica com coleções fixas/consumíveis, reservas exclusivas,
  importação em lote e consumo somente ao concluir o Processo.
- Correções na leitura de Projetos com responsável incompleto, preservação de
  Métodos v3/rascunhos, recuperação de jobs atuais sem alterar históricos e
  limpeza segura de reservas expiradas.
- Ajustes no início de sessões de navegador, correlação de gerações concorrentes
  do Flow e apresentação das opções numéricas.
- Skills de desenvolvimento, Métodos e plugins incluem orientações para traduzir
  automações manuais em etapas e responsabilidades do ContentFlow. Os pacotes das
  skills incluem a nova referência do guardrail.

## Validação

O criador confirmou em 02/10/2026 a aprovação do fluxo completo no Flow e da
atualização da instalação anterior, autorizando todo o conjunto pendente. Essa
evidência é relatada pelo criador; os registros de testes locais preservam seus
limites de cobertura. O sweep local passou por lint, tipos, contratos, plugins, migrações e build.
As regressões de referência de versão e isolamento de idioma foram corrigidas
e aprovadas em testes direcionados. Em seguida, o criador solicitou explicitamente
interromper novos testes e publicar: a repetição de `release:verify` foi interrompida,
sem aprovação integral de E2E/Electron. A publicação usa build local dos binários
e conferência pública dos assets e links do site.

Métodos v3 e Plugin API v2 continuam sendo os contratos vigentes. As versões
anteriores desses contratos não recebem adapter. Nenhum dado de Canal ou snapshot
histórico integra os artefatos publicados.
