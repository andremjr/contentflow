# Flow: associações em conteúdo textual

Decisão do criador: personagens são extraídos do roteiro; os prompts das cenas
incluem os IDs dos personagens escolhidos. O Core administra identidade,
artifacts e proveniência. O plugin interpreta as associações e traduz o uso para
o fornecedor. A interface funcional vem do schema do plugin.

## Implementação

- Renderer sem controles funcionais fabricados a partir de `generationMode`.
- ChatGPT Browser Studio: configuração opcional de textos JSON com campos
  `string`/`string[]`, IDs canônicos obtidos de `inputDeliveries` e validação antes
  da entrega; cada objeto é serializado como conteúdo `text`. Porta opcional
  `context_items` recebe listas sem alterar as portas existentes.
- Flow: formato explícito de prompt JSON e referências por cena. IDs são resolvidos
  contra itens de imagem ou linhagem `derived_from`; referências ausentes e
  limites excedidos são rejeitados antes da geração. `[]` permite uma cena sem
  personagens. Modos existentes e contratos internos permanecem disponíveis.
- Animação usa as imagens selecionadas como referências mesmo sem porta de
  referências separada.
- Método de assets salvo via API local no canal Gerar Imagens Flow, revisão 23:
  roteiro → personagens → referências → prompts com nomes e IDs dos personagens → cenas →
  seleção humana → animação. As vinculações de perfil existentes foram
  preservadas. Definição anterior guardada localmente em `.tmp`; snapshots de
  execuções históricas não foram reescritos.
- Outputs canônicos `images` e `videos`. Método portátil usado como fixture de
  contrato em `tests/fixtures/flow-content-associations/method.json`, sem IDs de
  perfis locais.
- Documentação normativa, orientações MCP, contrato Builder e três skills do
  checkout alinhados. Rótulos e mensagens novos em PT-BR/EN/ES.

## Evidências e limites

- 97 testes de plugins aprovados, incluindo produção de textos JSON, rejeição de
  IDs inventados, seleção por proveniência, ausência de personagens, animação,
  serialização por item e erros nos três idiomas. O teste do Flow agrega diversas
  asserções internas; esse número não mede cobertura do fornecedor.
- 32 testes focados de contratos, Builder/MCP, localização e renderer aprovados.
- Método real validado com manifests atuais e perfis existentes: zero erros e
  zero avisos. Salvamento seguido de nova leitura pela API confirmou a definição.
- Playwright: três cenários do editor de conteúdo aprovados em PT-BR/EN/ES,
  usando banco isolado. Typecheck, build, lint dos arquivos TypeScript afetados e
  sincronização das skills aprovados.
- Plugin Kit aprovou os dois plugins com execução simulada no sandbox. Essa
  execução não abriu o Flow nem o ChatGPT para gerar conteúdo real.
- O bundle fornecido foi consultado como referência técnica; não foi executado.
  A implementação não equivale a portar todas as funções da extensão.
- Por instrução explícita do criador, não houve geração real nem validação ponta
  a ponta no provedor. Consistência visual e comportamento da página atual
  permanecem para seu teste. Nenhuma release, tag ou incremento de versão.
