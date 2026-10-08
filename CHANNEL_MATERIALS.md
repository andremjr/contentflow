# Materiais do canal

A terceira opção do Ecossistema reúne os materiais prometidos nos vídeos.
Link direto: https://andremjr.github.io/contentflow/ecosystem/?category=materials

Para adicionar um material, coloque o arquivo em `downloads/channel-materials/`,
adicione uma entrada em `channel-materials.json` e informe `id`, `name`,
`description` (pt/en/es), `type` (skill/prompts), `format`, `downloadUrl` e `cover`.
Preserve os nomes e o conteúdo de autoria do criador; traduza a apresentação.
Outros tipos de material podem acrescentar seu rótulo nos três idiomas de `ecosystem.js`.
O catálogo é independente dos catálogos externos de Plugins e Métodos.

Validação de regressão: `node --test tests/channel-materials.test.cjs`.
Antes de publicar, confira os três idiomas, busca, seleção e downloads no navegador.
