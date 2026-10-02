# Compatibilidade de dados entre Blocos

Leia primeiro [`docs/CONTENT_CONTRACT.md`](documentation.md). A conexão é válida somente quando `areValueShapesCompatible(source.shape, target.shape)` for verdadeira.

Como regra, valide:

- mesmo `kind` e mesma cardinalidade;
- conteúdo da mesma família;
- representação compatível (`inline`, `artifact`, `either`);
- interseção de MIME/extensões quando declaradas;
- mesmo controle e opções compatíveis;
- registros com campos obrigatórios compatíveis por chave e shape.

A única contração canônica entre cardinalidades é
`text/many/inline → text/one/inline|either` na entrada consumidora. A delivery de origem continua
`many`, com seus IDs preservados, enquanto o runtime entrega ao executor um texto unido em ordem.
Não aplique essa regra a mídia, artifacts, controles ou registros e não permita a direção inversa.

Contratos internos existentes de registros podem declarar campos `identifier` com `referencesInputId` para relacionar seus valores
a itens de uma entrada do mesmo Bloco. Esses contratos internos preservam a relação; o Core valida somente IDs
concedidos e o plugin consumidor traduz a relação para sua ferramenta.

Novas entradas e saídas estratégicas criadas no editor ou MCP usam somente conteúdo. JSON/SRT podem ser texto aceito pelo plugin, sem interpretação automática de relações pelo Core. Preserve estruturas existentes; novas interações visuais de associação ainda exigem definição explícita.

Não use label, renderer, posição, extensão isolada ou forma do valor para inferir semântica. Não converta escalar em coleção, artifact em família, texto em seleção ou uma família de mídia em outra. Quando uma transformação for necessária, use um Bloco explícito que produza o shape de destino.

Outputs oficiais:

| Processo     | Shape                                                                |
| ------------ | -------------------------------------------------------------------- |
| `theme`      | `text/one/inline`                                                    |
| `title`      | `text/one/inline`                                                    |
| `thumbnail`  | `image/one/artifact`                                                 |
| `script`     | `text/one/inline`                                                    |
| `narration`  | `audio/one/artifact`                                                 |
| `assets`     | portas `images: image/many/artifact` e `videos: video/many/artifact` |
| `editing`    | `video/one/artifact`                                                 |
| `publishing` | controle `url/one` ou registro estruturado                           |

Associações editoriais em texto JSON pertencem ao contrato do plugin produtor/consumidor: o produtor recebe IDs canônicos de `inputDeliveries`, instrui o modelo e valida o texto; o consumidor resolve referências pelas entregas e linhagem. Isso não cria `RecordShape` nem parsing semântico no Core.
