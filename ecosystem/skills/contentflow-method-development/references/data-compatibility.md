# Compatibilidade de dados entre Blocos

Leia primeiro [`docs/CONTENT_CONTRACT.md`](../../../../docs/CONTENT_CONTRACT.md). A conexão é válida somente quando `areValueShapesCompatible(source.shape, target.shape)` for verdadeira.

Valide:

- mesmo `kind` e mesma cardinalidade;
- conteúdo da mesma família;
- representação compatível (`inline`, `artifact`, `either`);
- interseção de MIME/extensões quando declaradas;
- mesmo controle e opções compatíveis;
- registros com campos obrigatórios compatíveis por chave e shape.

Não use label, renderer, posição, extensão isolada ou forma do valor para inferir semântica. Não converta escalar em coleção, artifact em família, texto em seleção ou uma família de mídia em outra. Quando uma transformação for necessária, use um Bloco explícito que produza o shape de destino.

Outputs oficiais:

| Processo | Shape |
| --- | --- |
| `theme` | `text/one/inline` |
| `title` | `text/one/inline` |
| `thumbnail` | `image/one/artifact` |
| `script` | `text/one/inline` |
| `narration` | `audio/one/artifact` |
| `assets` | portas `images: image/many/artifact` e `videos: video/many/artifact` |
| `editing` | `video/one/artifact` |
| `publishing` | controle `url/one` ou registro estruturado |
