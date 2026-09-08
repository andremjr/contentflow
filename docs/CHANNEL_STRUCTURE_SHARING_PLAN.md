# Plano futuro — compartilhamento completo da Estrutura de Canal

> Status: planejamento de produto. Este documento não autoriza implementação, migração, mudança de contrato, versionamento ou publicação.

## 1. Objetivo

Permitir que um criador compartilhe uma **Estrutura de Canal** completa e que outra pessoa consiga reconstruir, em uma instalação diferente do ContentFlow, o mesmo sistema estratégico de produção: Métodos, prompts, pontos de intervenção humana, Biblioteca Estratégica, plugins e assets necessários.

Depois da importação, o destinatário deverá configurar apenas recursos que são necessariamente locais ou pessoais, como contas, perfis, credenciais, consentimentos e diretórios de trabalho. Mantidos os mesmos plugins, capacidades, configurações e conteúdos estratégicos, a execução deverá preservar com alta fidelidade a intenção e a direção estética da estrutura original.

Não existe promessa de resultado matematicamente idêntico. Modelos generativos, provedores remotos, aleatoriedade, planos de conta, disponibilidade e versões externas podem mudar.

## 2. Conceito de produto

A identidade operacional de um canal não é formada apenas pela sequência dos Métodos. Ela resulta da combinação de:

- Métodos dos Processos Universais;
- instruções e prompts de cada bloco;
- parâmetros e configurações funcionais;
- pontos de decisão, criação, revisão e validação humana;
- coleções e itens da Biblioteca Estratégica;
- layouts, imagens e demais assets estratégicos;
- plugins, capacidades e versões utilizadas;
- escolhas de modelos, provedores e configurações que influenciam o resultado;
- orientação do criador sobre personalização e substituições possíveis.

Esse conjunto será chamado de **Estrutura de Canal**. Ele não cria Processo Universal, Bloco ou Operador novo.

## 3. Níveis de compartilhamento

Os formatos atuais permanecem compatíveis e independentes:

| Nível              | Finalidade                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------ |
| Método             | Compartilhar a execução de um único Processo Universal.                                                |
| Pacote de Métodos  | Compartilhar vários Métodos de um mesmo canal.                                                         |
| Estrutura de Canal | Compartilhar Métodos, Biblioteca Estratégica, dependências de plugins, assets e orientação do criador. |

Formato técnico proposto para o terceiro nível:

- `format`: `contentflow-channel-structure`;
- versão inicial: `1`;
- extensão sugerida: `.contentflow-channel.zip`.

O formato final deverá ser especificado e aprovado antes de qualquer implementação.

## 4. Conteúdo proposto do pacote

```text
estrutura.contentflow-channel.zip
├── manifest.json
├── README.md
├── channel.json
├── methods/
│   ├── theme.json
│   ├── title.json
│   └── ...
├── library/
│   ├── collections.json
│   └── items.json
├── plugins/
│   ├── lock.json
│   └── packages/       # opcional e condicionado à licença
└── assets/
    ├── channel/
    ├── methods/
    └── library/
```

O pacote poderá incluir:

- todos os Métodos configurados no canal;
- prompts, instruções, parâmetros, contratos de entrada e saída, validações e retries;
- configuração funcional e portátil dos executores;
- todas as coleções da Biblioteca Estratégica do canal;
- todos os itens dessas coleções;
- layouts de thumbnail e arquivos pertencentes às coleções;
- capas do canal e dos Métodos;
- inventário exato dos plugins e capacidades necessários;
- hashes e informações de origem das dependências;
- guia de uso e personalização escrito pelo criador.

## 5. Dados proibidos no pacote

A exportação nunca deverá incluir:

- API keys, tokens, senhas, cookies ou outros secrets;
- sessões autenticadas, perfis de navegador ou dados do cofre;
- `connectionId` ou outras referências locais de conta;
- IDs opacos de conversa ou jobs de provedores;
- caminhos absolutos do computador;
- projetos, filas, execuções, entregas ou histórico do canal;
- workspaces privados de plugins;
- ID real do canal do YouTube, inscritos ou dados de sincronização;
- arquivos sem direito de redistribuição;
- código de plugin cuja licença não permita a redistribuição.

Esses elementos devem ser substituídos por requisitos explícitos de preparação local.

## 6. Portabilidade da Biblioteca Estratégica

IDs de coleções e itens pertencem à instalação de origem e não podem atravessar o pacote como vínculos locais definitivos.

Na exportação:

1. cada coleção recebe uma chave portátil interna ao pacote;
2. cada item aponta para a chave portátil da sua coleção;
3. blocos `ESCOLHER` e inputs `channel_library` apontam para essa chave;
4. arquivos locais são promovidos para caminhos relativos em `assets/`;
5. schema, tipos, obrigatoriedade e ordem são preservados.

Na importação:

1. novos IDs locais são criados;
2. coleções e itens são reconstruídos;
3. as chaves portáteis são remapeadas para os novos IDs;
4. os Métodos são vinculados às coleções recém-criadas;
5. schemas, layouts, MIME, tamanho e integridade dos assets são validados.

Assim, a Biblioteca importada já poderá chegar associada aos Métodos, sem depender de correspondência frágil por nome.

## 7. Dependências de plugins

O arquivo `plugins/lock.json` deverá registrar, para cada dependência:

- `pluginId`;
- versão exata;
- `apiVersion`;
- hash SHA-256 do pacote validado;
- capacidades utilizadas;
- origem do pacote ou catálogo;
- política de inclusão no bundle;
- permissões, providers, custos e efeitos externos declarados;
- requisitos de conexão, perfil ou secrets por nome;
- blocos e processos consumidores.

Resoluções possíveis durante a importação:

1. **Instalado e idêntico:** reutilizar o plugin já instalado após conferir ID, versão, API e hash.
2. **Incluído no pacote:** validar e instalar como plugin externo quando a licença permitir redistribuição.
3. **Referenciado:** localizar no catálogo ou origem declarada, baixar e conferir versão e hash.
4. **Ausente ou incompatível:** manter os blocos legíveis, mas bloqueados até a resolução explícita.

O importador não poderá substituir silenciosamente plugin, versão ou capacidade. Um plugin com o mesmo ID e versão, mas hash diferente, deve ser tratado como conflito de integridade.

Plugins continuam externos ao núcleo, removíveis, consentidos e executados na mesma sandbox. A existência de um plugin dentro de uma Estrutura de Canal não concede confiança especial e não significa que o núcleo passe a distribuí-lo por padrão.

## 8. Política de inclusão de plugins

Política inicial recomendada:

- incluir fisicamente um plugin somente quando sua licença e política de distribuição autorizarem;
- usar referência verificável nos demais casos;
- tratar a ausência de uma declaração explícita como `reference-only`;
- preservar README, licença, autoria e proveniência do plugin;
- submeter plugins incorporados ao mesmo fluxo de validação e consentimento usado por instalações normais.

Poderá ser necessário, futuramente, acrescentar ao protocolo público um metadado de distribuição. Isso é uma proposta, não uma decisão vigente:

```json
{
  "distribution": {
    "bundlePolicy": "allow"
  }
}
```

Valores candidatos: `allow` e `reference-only`.

## 9. Guia do criador

O `README.md` da Estrutura de Canal deverá permitir que o criador explique:

- proposta, público e identidade pretendida;
- direção estética e editorial esperada;
- plugins escolhidos e a função de cada um;
- contas, planos ou serviços necessários;
- coleções e prompts centrais;
- pontos recomendados de personalização;
- alterações seguras para aumentar a originalidade;
- mudanças que descaracterizam ou alteram significativamente o resultado;
- plugins alternativos e diferenças esperadas;
- custos, limites e restrições conhecidos;
- autoria, licença e condições de uso do material compartilhado.

Na primeira versão, o ContentFlow poderá apenas apresentar esse guia. Recomendações automáticas e assistência interna para adaptação ficam fora do escopo inicial.

## 10. Fluxo futuro de exportação

Ao compartilhar a estrutura completa de um canal:

1. analisar todos os Métodos configurados;
2. identificar coleções, itens, assets, plugins e capacidades utilizados;
3. incluir todas as coleções do canal, caso essa política seja confirmada;
4. converter vínculos locais em referências portáteis;
5. verificar a política de redistribuição de cada plugin;
6. calcular hashes e produzir o lockfile;
7. mostrar uma prévia com conteúdo, dependências, exclusões e tamanho estimado;
8. apontar elementos que continuarão dependendo de preparação local;
9. validar o pacote completo;
10. gerar o ZIP sem alterar o canal de origem.

Na interface, **Compartilhar Estrutura de Canal** poderá ser a ação principal do card de canal. **Exportar somente Métodos** permanecerá como opção independente.

## 11. Fluxo futuro de importação

Política inicial recomendada: criar sempre um canal novo. Merge com canal existente fica para uma fase posterior.

Antes de gravar qualquer dado, o ContentFlow deverá apresentar:

- nome, descrição, autor e licença da estrutura;
- Métodos e Processos Universais incluídos;
- coleções e quantidade de itens;
- plugins necessários e sua situação local;
- plugins que seriam instalados ou baixados;
- permissões, providers, custos e efeitos externos;
- contas, perfis, secrets e diretórios ainda necessários;
- conflitos de versão, integridade ou licença;
- assets ausentes ou inválidos;
- resultado do diagnóstico de compatibilidade.

Depois da confirmação apropriada:

1. extrair o pacote em staging temporário;
2. rejeitar traversal, symlinks externos, caminhos absolutos e limites excedidos;
3. validar manifestos, schemas, MIME, tamanhos e hashes;
4. preparar plugins sem substituir versões existentes silenciosamente;
5. criar novos IDs e montar o mapa de referências;
6. preparar canal, coleções, itens, Métodos e assets;
7. persistir o conjunto de forma atômica;
8. promover plugins e assets somente após a validação completa;
9. reverter tudo se qualquer etapa falhar;
10. apresentar a checklist final de preparação local.

## 12. Diagnóstico de prontidão

Após a importação, a Estrutura de Canal deverá apresentar um estado derivado:

| Estado                  | Significado                                                         |
| ----------------------- | ------------------------------------------------------------------- |
| Pronto para executar    | Métodos, coleções, plugins e conexões necessárias estão resolvidos. |
| Configuração necessária | Faltam contas, secrets, perfis ou diretórios locais.                |
| Dependência ausente     | Um plugin ou capability não pôde ser localizado.                    |
| Incompatível            | Versão, hash, API ou contrato diverge do pacote.                    |
| Pacote inválido         | Integridade, schema, segurança ou licença impede a importação.      |

Cada pendência deverá levar ao local apropriado de correção. Nenhuma ausência pode ser convertida em execução fictícia.

## 13. Fases futuras de implementação

### Fase 1 — Contrato e decisões

- aprovar nome, formato, extensão e versionamento;
- definir schemas do manifesto, lockfile, coleções e referências portáteis;
- definir limites de tamanho, quantidade e tipos de asset;
- decidir autoria, licença e assinatura do pacote;
- documentar compatibilidade com formatos atuais.

### Fase 2 — Métodos e Biblioteca

- exportar os oito Métodos possíveis;
- exportar coleções, itens e assets;
- criar remapeamento determinístico de IDs;
- reconstruir vínculos de `ESCOLHER` e `channel_library`;
- validar importação atômica em canal novo.

### Fase 3 — Lockfile e diagnóstico de plugins

- coletar dependências reais dos blocos;
- registrar versão, capability, API, origem e hash;
- comparar com instalações locais;
- bloquear divergências sem substituição silenciosa;
- produzir diagnóstico de prontidão.

### Fase 4 — Distribuição de plugins

- formalizar a política pública de bundle;
- incorporar apenas plugins redistribuíveis;
- resolver referências pelo catálogo ou origem permitida;
- reutilizar validação, consentimento e sandbox existentes;
- testar rollback de instalações parciais.

### Fase 5 — Experiência de exportação e importação

- criar prévia de exportação;
- permitir edição do guia do criador;
- criar revisão de importação e conflitos;
- apresentar checklist de preparação local;
- manter exportação somente de Métodos como alternativa.

### Fase 6 — Validação ponta a ponta

- exportar de uma instalação com dados reais controlados;
- importar em uma instalação limpa;
- configurar somente contas e secrets do destinatário;
- executar um projeto completo;
- comparar estrutura, decisões e direção estética;
- confirmar ausência de vazamento e de estado parcial.

### Fase posterior — Merge e adaptação assistida

- importar sobre canal existente;
- comparar e mesclar coleções;
- resolver conflitos por processo;
- orientar troca consciente de plugins;
- destacar pontos recomendados de originalização.

Essa fase não deve bloquear a primeira versão do compartilhamento completo.

## 14. Critérios futuros de aceite

A funcionalidade somente poderá ser considerada concluída quando o seguinte cenário real passar integralmente:

1. criar um canal com vários Métodos e dependências entre processos;
2. usar prompts, parâmetros, blocos humanos, validações e retries;
3. usar coleções com itens, layouts e assets;
4. usar plugins de API, processamento local e automação de navegador quando aplicáveis;
5. exportar a Estrutura de Canal;
6. importar em uma instalação limpa;
7. confirmar que nenhum dado privado ou vínculo local foi exportado;
8. reconstruir automaticamente Métodos, coleções, itens e associações;
9. instalar ou resolver plugins conforme licença, versão e hash;
10. configurar somente recursos pessoais do destinatário;
11. executar um projeto completo com comportamento coerente com a origem;
12. confirmar que falhas não deixam canal, assets ou plugins parciais.

Testes unitários, build ou inspeção parcial não substituem esse cenário ponta a ponta.

## 15. Decisões recomendadas para a primeira versão

- criar um formato novo, mantendo Método e pacote de Métodos compatíveis;
- importar sempre como canal novo;
- incluir todas as coleções e itens do canal;
- remapear referências por chaves portáteis, nunca por nome;
- preservar configurações funcionais, mas remover todos os vínculos locais e secrets;
- exigir versão e hash exatos para plugins;
- incorporar plugins somente com autorização explícita de redistribuição;
- permitir pacote importado em estado de configuração necessária;
- apresentar o guia do criador sem tentar adaptar automaticamente a estrutura;
- tratar fidelidade de estrutura e direção estética como objetivo, não identidade absoluta de outputs.

## 16. Decisões ainda abertas

- nome final apresentado na interface e extensão do arquivo;
- inclusão de todas as coleções ou apenas das alcançáveis pelos Métodos;
- licença padrão do conteúdo estratégico compartilhado;
- autoria, assinatura e verificação de proveniência do pacote;
- limite total do ZIP e limites por tipo de asset;
- política para plugins instalados com mesma versão e hash diferente;
- necessidade de múltiplas versões simultâneas do mesmo plugin;
- funcionamento offline quando plugins são apenas referenciados;
- possibilidade de o criador proibir substituições de plugins;
- conteúdo mínimo obrigatório do guia do criador;
- momento em que merge com canal existente deverá entrar no roadmap.

## 17. Condição para iniciar

Antes de qualquer implementação, o titular deverá revisar este plano, resolver as decisões que afetam o contrato inicial e autorizar explicitamente o escopo exato da primeira fase. Alterações posteriores de diagnóstico, contrato ou escopo exigem nova confirmação antes de publicação.
