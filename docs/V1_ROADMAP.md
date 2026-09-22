# Checklist de estabilização da V1

Este documento não define a arquitetura do ContentFlow. A fonte normativa é [`ARCHITECTURE.md`](ARCHITECTURE.md). Aqui ficam apenas os gates restantes para considerar uma versão `1.0.0` candidata a release.

## Escopo já consolidado

A V1 preserva as leis descritas em `ARCHITECTURE.md`: 8 Processos Universais obrigatórios, 4 Blocos Essenciais, 3 Operadores, ordem configurável por Canal congelada no Projeto, contratos universais de dados, Itens como identidade operacional transversal, núcleo funcional sem plugins e Orquestrador separado da estratégia.

O foco depois da V1 deve ser predominantemente a criação e evolução de **Métodos** e **plugins independentes**. Alterações no núcleo devem ser justificadas por uma necessidade que não possa ser expressa pela composição das primitivas existentes.

## Gates técnicos antes da V1

- [ ] `npm run check` aprovado no commit candidato.
- [ ] Instalação limpa validada no Windows suportado.
- [ ] Atualização da última versão pública para a candidata a V1 validada sem perda de dados.
- [ ] Migrações de Métodos, conexões, plugins, Projetos, snapshots e filas validadas em dados representativos.
- [ ] Fluxo humano validado de ponta a ponta sem nenhum plugin instalado.
- [ ] Pelo menos um fluxo real de operador `IA` e um de `Código` validados por plugins externos.
- [ ] Orquestração com um Canal e com múltiplos Canais validada, incluindo parada, falha, retomada e reinício do aplicativo.
- [ ] Ordem personalizada de Processos validada em execução real e preservada pelo snapshot do Projeto.
- [ ] Retry e retomada de Itens validados sem duplicar entregas já persistidas.
- [ ] Importação/exportação de Método e pacote de Métodos validadas com dependências e associações locais ausentes.
- [ ] Backup e recuperação dos dados locais documentados e testados.
- [ ] Nenhum problema crítico ou alto conhecido permanece aberto.

## Gates de distribuição

- [ ] Instalador e portátil gerados localmente a partir do mesmo commit candidato.
- [ ] Updater validado com os metadados produzidos pela candidata.
- [ ] Separação entre núcleo e plugins confirmada no conteúdo final do pacote.
- [ ] Licença, política de IA, privacidade, permissões e proveniência revisadas.
- [ ] Notas de release e guia inicial revisados para não descrever fluxos antigos.
- [ ] Publicação autorizada explicitamente pelo titular somente depois das validações acima.

## Regra para evolução pós-V1

Uma proposta de mudança no núcleo deve responder, nesta ordem:

1. A necessidade pode ser resolvida por um Método?
2. Pode ser resolvida por uma capability de plugin?
3. Pode ser resolvida por composição de Blocos, contratos, Itens ou Orquestração já existentes?
4. Se não, qual é a menor primitiva universal necessária e como ela preserva snapshots e filas anteriores?

Se uma das três primeiras respostas for positiva, a solução não deve ampliar a gramática central.
