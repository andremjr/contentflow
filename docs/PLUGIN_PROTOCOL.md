# Protocolo de Plugins do ContentFlow OS — versão 1

Este documento congela o contrato que será usado na próxima fase do projeto. Ele não instala nem executa plugins ainda.

## Responsabilidades do núcleo

O ContentFlow OS controla canais, projetos, métodos, ordem dos blocos, estados de execução, Biblioteca Estratégica, arquivos locais, credenciais, notificações e outputs universais. Plugins nunca acessam diretamente o banco SQLite.

## Responsabilidades do plugin

Um plugin declara capacidades para os operadores `IA` ou `Código`, os tipos de entrada e saída compatíveis, recebe um contexto limitado do motor e devolve um resultado padronizado. A interface lista somente plugins compatíveis com o processo, a ação e o contrato de dados do bloco. Depois da seleção, os parâmetros próprios daquele plugin são gerados a partir do `blockConfigSchema` do manifesto.

O contrato de dados é independente do executor: trocar `Humano` por um plugin não altera as entradas e saídas definidas no Método.

## Regra dos blocos

- `BUSCAR`: recebe contexto e devolve dados ou mídias externas.
- `ESCOLHER`: sempre recebe os itens da coleção da Biblioteca Estratégica vinculada pelo núcleo e devolve o ID do item escolhido. Nunca escolhe resultados de blocos anteriores.
- `CRIAR`: produz um novo texto, arquivo, ativo ou dado.
- `VALIDAR`: avalia resultados produzidos durante a execução. Pode aprovar, reprovar ou selecionar um ou mais resultados.

## Manifesto

Cada plugin terá um arquivo `contentflow.plugin.json` com identidade, versão, compatibilidade, permissões, schemas, segredos e capacidades. A tipagem de referência está em `src/lib/plugin-contract.ts`.

## Estrutura local

```text
plugins/bundled/          Plugins oficiais versionados no GitHub
data/plugins/installed/   Plugins instalados somente na máquina do usuário
```

Plugins comunitários são código executável. A implementação do carregador deverá validar manifesto e versão, pedir consentimento para permissões e executar o plugin isolado do processo principal, com timeout e contexto limitado.

A rota global `/plugins` descobre manifestos chamados `contentflow.plugin.json` nas subpastas desses dois diretórios. A API retorna somente caminhos relativos e nunca expõe diretórios específicos da máquina do usuário. A presença do manifesto permite gerenciamento e compatibilidade visual; a execução isolada permanece uma etapa posterior do carregador.

## Credenciais

Segredos são configurações locais globais identificadas pelas chaves declaradas em `secretKeys`. Eles nunca fazem parte do Método, de arquivos compartilhados ou do repositório Git.
