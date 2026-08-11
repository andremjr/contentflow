# Revisão de manutenção — 2026-08-10

Esta revisão registra o estado observado do ContentFlow OS e separa remoções seguras de código que apenas parece antigo. Durante a mesma rodada, a primeira sandbox executável para plugins comunitários foi implementada e testada; os limites e o hardening restante estão registrados abaixo.

> Decisão posterior, consolidada na v0.2.0: o item histórico de broker de navegador foi substituído por automação gerenciada por cada plugin, usando permissões genéricas e autenticação conectada explicitamente pelo usuário. O núcleo não terá runtime de navegador próprio.

## Escopo verificado

- estrutura de `src`, `server`, `plugins/bundled` e documentação;
- lint, typecheck configurado e builds client/SSR;
- dependências declaradas e vulnerabilidades conhecidas pelo npm;
- rotas principais `/dashboard`, `/methods` e `/plugins` no aplicativo local;
- executor, worker, cofre de credenciais e dois plugins oficiais;
- ocorrências de `legacy`, logs, subprocessos e APIs de risco;
- coerência entre arquitetura, protocolo e documentação pública.

## Resultado objetivo

- `npm run check` concluiu lint, TypeScript e build sem erro.
- `npm audit --omit=dev` encontrou zero vulnerabilidades conhecidas nas dependências de produção.
- Todas as dependências de produção declaradas possuem referência no código ou na configuração; não há pacote confirmado como removível.
- O catálogo apresentou OpenAI Models e Anthropic Claude sem erro de console.
- Dashboard e Biblioteca de Métodos carregaram no navegador local.
- Não foi encontrado uso de `eval`, `new Function`, HTML injetado ou shell construído a partir de entrada do usuário.

## Código que não deve ser removido como “legado”

- [`src/routes/metodos.tsx`](../src/routes/metodos.tsx) preserva redirecionamento de URLs antigas para `/methods`.
- As normalizações e migrações marcadas como `legacy` em `server/index.ts`, `src/lib/store.ts` e `src/lib/human-workflow.ts` ainda convertem dados persistidos e formatos anteriores.
- [`src/components/composition-canvas.tsx`](../src/components/composition-canvas.tsx) é infraestrutura intencional para layouts de thumbnail, conforme [`ARCHITECTURE.md`](ARCHITECTURE.md).
- `src/routeTree.gen.ts` é código gerado pelo TanStack Router e não deve ser limpo manualmente.

Remover esses trechos sem uma migração de versão e telemetria local de compatibilidade pode quebrar bancos, Métodos ou links existentes.

## Débitos confirmados

### 1. Cobertura de TypeScript ampliada

Foi criado `tsconfig.server.json` para incluir API, executor e handlers oficiais. `npm run typecheck` agora verifica tanto a interface quanto esse conjunto, e a incompatibilidade encontrada na validação de portas foi corrigida.

### 2. Cobertura automatizada ainda inicial

`npm run test:sandbox` valida uma execução comunitária real, importação de artifact e bloqueio de leitura fora do filesystem autorizado. Ainda faltam testes de migrações, persistência, cofre, timeout, jobs assíncronos, rotas e formatos hostis.

### 3. Arquivos excessivamente concentrados

No momento da revisão:

- `src/components/method-builder.tsx`: 2.043 linhas;
- `server/index.ts`: 1.468 linhas;
- `src/components/process-runner.tsx`: 1.351 linhas;
- `src/lib/store.ts`: 1.172 linhas;
- `src/lib/app-preferences.tsx`: 972 linhas.

Isso aumenta conflito de edição, tempo de revisão e risco de regressão. A extração deve respeitar fronteiras já existentes: API por recurso, store por domínio, editor por seção e traduções por catálogo. Não é necessário mudar processos, blocos, operadores ou persistência para fazer essa decomposição.

### 4. Tradução dinâmica inconsistente

A inspeção visual mostrou português e inglês na mesma tela, por exemplo “Your channels”, “Open channel”, “Included” e “All processes”. A tradução atual percorre e modifica nós do DOM em `app-preferences.tsx`, o que dificulta cobertura e deixa textos novos fora do catálogo.

Prioridade: migrar gradualmente textos para chaves explícitas de i18n e manter o tradutor de DOM apenas como compatibilidade temporária até todas as telas estarem cobertas.

### 5. Validação de manifesto duplicada

Há validação no servidor HTTP e no registro do executor. Regras duplicadas podem divergir quando o schema evoluir, como ocorreu com novos metadados de entrega.

Prioridade: extrair uma única validação semântica compartilhada, baseada no schema versionado, mantendo mensagens adequadas para UI e executor.

### 6. Sandbox comunitária v1 implementada; hardening continua

Plugins externos agora podem ser instalados e ativados localmente sem aprovação central. O Node 26 nega por padrão filesystem, rede, subprocessos, workers e módulos nativos; o núcleo exige consentimento por versão/permissões, entrega apenas secrets declarados e importa artifacts validados.

Isso não equivale a uma VM. Em especial, conceder `process` ou `native` amplia muito a confiança. Instalação atômica com hash/assinatura, proxy SSRF, allowlist de executáveis, quotas fortes e cancelamento persistente continuam pendentes conforme [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).

## Documentação corrigida nesta revisão

- O README agora descreve o cofre nativo, em vez de afirmar que a chave OpenAI vive apenas na memória.
- O README de plugins oficiais não afirma mais que o primeiro plugin ainda será criado.
- Foi criado [`PLUGIN_BROWSER_AUTOMATION.md`](PLUGIN_BROWSER_AUTOMATION.md) para integrações avançadas autorizadas.
- Protocolo, desenvolvimento, segurança, ecossistema e arquitetura passaram a apontar para esse guia.

## Ordem recomendada para a próxima rodada técnica

1. adicionar testes de contrato, migração, timeout, jobs e rotas;
2. tornar a instalação atômica e registrar origem/hash;
3. centralizar validação de manifestos;
4. acrescentar proxy SSRF e perfis seguros para subprocessos;
5. decompor `server/index.ts`, `method-builder.tsx` e `process-runner.tsx` sem mudar o domínio;
6. substituir tradução por mutação do DOM por chaves explícitas;
7. ampliar o hardening das permissões genéricas usadas por plugins de automação de navegador.

## Comandos de repetição

```sh
npm ci
npm run check
npm audit --omit=dev
npm outdated
```

Além dos comandos, a revisão periódica deve abrir `/dashboard`, `/methods`, `/plugins`, um canal, um Método e uma execução humana. Dependências desatualizadas devem ser avaliadas por compatibilidade e segurança; versão maior disponível, sozinha, não justifica atualização imediata.
