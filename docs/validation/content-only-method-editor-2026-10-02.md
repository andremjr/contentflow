# Editor de Métodos: conteúdo na superfície estratégica

Decisão explícita do criador em 02/10/2026: entradas e saídas visíveis no editor
estratégico usam somente texto, imagem, áudio e vídeo. Remover o seletor de
conteúdo/controle/registros, sem apagar nem converter os contratos internos.

## Implementação

- O editor filtra campos internos em cards, formulários de entradas/entregas,
  variáveis e opções de conexão entre resultados. O formulário de conteúdo
  oferece família e quantidade; texto mantém representação inline/arquivo.
- Sugestões de entregas preservam campos internos e evitam conflito com suas chaves.
- O Builder MCP publica a regra no contrato e nas instruções, rejeita novos
  schemas estratégicos de controle/registros e preserva shapes/bindings internos
  existentes. Decisão de VALIDAR, identidade de ESCOLHER e histórico continuam
  mecanismos nativos. Coleções da Biblioteca e portas de plugin mantêm seus contratos.
- Arquitetura, contrato de conteúdo, skill development-contentflow e skill de
  Métodos (incluindo referências) foram alinhados. As cópias do checkout estão
  sincronizadas com ecosystem/skills; os pacotes publicados não foram atualizados.

## Evidências e limites

- 43 testes focados: projeção/preservação, conteúdo, contrato v3, fontes de
  Método e traduções — aprovados.
- `npm run test:i18n`: 30 testes aprovados.
- `npm run test:builder-mcp`: 16 testes aprovados, incluindo transporte stdio,
  API real, rejeição de novos controles e aplicação de um Método humano.
- Playwright `method-content-fields.spec.ts`: três cenários aprovados,
  PT-BR/EN/ES. Edição de família, salvamento, recarga, sugestões e preservação
  de relações/bindings internos exercitados em banco temporário isolado.
- Typecheck, ESLint dos arquivos alterados e build aprovados.
- `sync-contentflow-plugin-skill.mjs --check`: três skills sincronizadas.

O Dev Monitor não comprova esse renderer; a evidência vertical pertinente é
Playwright. Não foi validada geração real em provedor autenticado, publicação
externa nem uma nova associação visual. JSON textual não passou a ser interpretado
como relação pelo Core. Nenhuma migração de dados ou publicação de release foi feita.

## Casos para próximas interações

| Caso | Relação/estrutura necessária | Resultado visível |
| --- | --- | --- |
| Personagens consistentes | Prompt/cena → um ou mais personagens e suas referências | Texto de prompts e imagens |
| Narração por cena | Trecho do roteiro → áudio correspondente e intervalo | Texto e áudio |
| Legendas sincronizadas | Trecho falado → texto e tempos de início/fim | Texto SRT e vídeo |
| Montagem com assets | Cena/trecho → imagens, vídeos, ordem e duração | Imagens e vídeo |
| Revisão de variantes | Item original → variantes selecionadas/rejeitadas | Conteúdo escolhido |
| Tradução e dublagem | Trecho original → tradução e áudio no idioma de destino | Texto e áudio |
| Proveniência e créditos | Asset → origem, autor e autorização informada | Mídia e texto de créditos |
| Layout de thumbnail | Texto/imagem → posição, tamanho e camada | Imagem final |

Esses casos explicam a utilidade das estruturas internas. Um plugin pode consumir
JSON/SRT por porta textual quando declarar e validar esse formato; isso não garante
que plugins existentes aceitem o novo caminho nem substitui a validação de relações
do núcleo. Interações intuitivas e eventual protocolo para relações textuais serão
definidos separadamente.
