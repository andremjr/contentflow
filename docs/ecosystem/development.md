# Desenvolvimento de plugins API v2

O contrato normativo está em [`protocol.md`](protocol.md) e [`../CONTENT_CONTRACT.md`](../CONTENT_CONTRACT.md).

## Fluxo

1. Defina a entrega observável como `ValueShape`.
2. Separe famílias diferentes em portas distintas.
3. Declare somente permissões, providers, custos e efeitos necessários.
4. Modele configuração funcional em `blockConfigSchema`; não injete UI.
5. Consuma `request.inputs[portKey]` e devolva `values[portKey]`.
6. Use services para secrets, arquivos, workspace, partials e perfis.
7. Faça jobs, cancelamento e efeitos externos idempotentes.
8. Teste contrato, sandbox e execução real antes de distribuir.

Após as validações locais, conecte o plugin ao aplicativo e execute o [cenário vertical](../DEVELOPMENT.md) do Método que usa a capability. Confira o resultado na interface e a delivery persistida; teste de contrato isolado não comprova a integração real.

## Shapes

- Texto inline: `text/one/inline` ou `text/many/inline`.
- Documento de texto: `text/one/artifact` com MIME/extensões.
- Imagem, áudio e vídeo: família correspondente com representação `artifact`.
- Número, booleano, seleção, data, URL, approval, IDs e layout: `ControlShape`.
- Estruturas como cenas ou planos: `RecordShape` com cardinalidade explícita.

Não declare `file`, `files`, `list`, `textarea`, `records` ou `artifact` como família/tipo de conteúdo. Não declare campos redundantes de API v1.

## Artifacts

Resolva inputs com `services.resolveInputFile()` e produza arquivos somente sob `services.getOutputPath()`. A resposta referencia `artifact://<id>` e o núcleo importa o arquivo. O artifact concretiza conteúdo; não altera seu shape.

## Segurança

Secrets só existem em `services.getSecret()`. Não serializar tokens, cookies, caminhos físicos, profiles ou material autenticado. Trate páginas, prompts, nomes de arquivo e respostas externas como dados não confiáveis.

Para automação de navegador, siga [`browser-automation.md`](browser-automation.md). Para distribuição, siga [`distribution.md`](distribution.md).
