# Referência: segurança de plugins

Leia antes de implementar ou revisar qualquer capability que use rede, arquivos, secrets, subprocessos, workers, módulos nativos, navegador, mídia ou efeitos externos.

## Modelo de confiança

Considere não confiáveis o pacote, dependências transitivas, manifesto, schemas, URLs, respostas de APIs, páginas, mídia, prompts, nomes de arquivos, outputs de IA e artifacts antes da importação. As autoridades são o contrato do núcleo, a política de permissões, o cofre de secrets, snapshots/hashes e limites do executor.

A sandbox v1 não é uma máquina virtual. A invocação roda fora do processo principal com ambiente mínimo, diretórios controlados, staging/saída isolados, timeout, limites de resposta e filesystem, rede, subprocessos, workers e addons nativos negados por padrão. `process` pode iniciar programas com a autoridade normal do usuário; subprocessos não herdam automaticamente toda a sandbox. `native` amplia fortemente a confiança.

## Permissões

| Permissão | Uso | Cuidados |
| --- | --- | --- |
| nenhuma | Cálculo e transformação em memória | Preferir sempre que possível. |
| `network` | Conexões externas | Declarar `networkHosts`; tratar como egress potencialmente amplo no Node 26. |
| `filesystem:read` | Arquivos liberados e staging | Usar `resolveInputFile`; não explorar outras pastas. |
| `filesystem:write` | Saída temporária e workspace autorizado | Usar `getOutputPath`/`getWorkspacePath`; não usar armazenamento definitivo. |
| `process` | FFmpeg, Python, navegador e subprocessos | Permissão avançada; argumentos estruturados e allowlist. |
| `worker` | Workers locais | Limitar concorrência e fechar recursos. |
| `native` | Addons nativos empacotados | Tratar como alto nível de confiança. |

Uma permissão técnica não declara o efeito. Combine `network` com `external_read`, `external_write` ou `public_publish` conforme o comportamento real.

## Instalação e supply chain

Não execute `npm install`, `pip install`, `preinstall`, `install` ou `postinstall` ao instalar ou executar. Empacote dependências e runtimes. Rejeite entrypoints com `..`, symlinks externos, caminhos absolutos, `.env`, caches, credenciais e dados de usuário. Valide tamanho, extração segura, schema, entrypoint, runtime, permissões, effects, providers, secrets e binários antes de executar código.

Uma versão publicada é imutável. Alteração de conteúdo exige nova versão e novo hash. Fixe dependências e lockfiles quando possível; registre origem e hash do pacote.

## Rede e SSRF

Use HTTPS por padrão, timeouts, limites de upload/download e somente os hosts necessários. Não confie em URLs de conteúdo externo. Bloqueie loopback, link-local, multicast, redes privadas e endpoints de metadata. Revalide redirects; não aceite credenciais embutidas na URL; não encaminhe headers sensíveis entre hosts.

`networkHosts` é declaração auditável e é aplicada aos downloads mediados pelo núcleo. No Node 26, `--allow-net` é binário e não impõe allowlist por host aos sockets diretos do plugin; portanto, um plugin com `network` deve ser tratado como capaz de acessar qualquer destino público.

## Secrets

Declare somente nomes em `secretKeys`. Acesse valores exclusivamente por `services.getSecret(key)`. Nunca grave secret em manifesto, configuração, Método, snapshot, logs, artifacts, prompts ou resposta. Não enumere secrets de outros plugins. Prefira tokens de curta duração e documente escopo, conta, provedor e revogação.

## Comandos e subprocessos

Nunca interpolar nomes de arquivos, URLs ou inputs de usuário em shell, SQL, paths executáveis ou templates. Prefira `spawn` com array de argumentos e sem shell. Valide cada argumento e use allowlist de executáveis. Feche streams, sockets, handles e processos filhos em sucesso, erro, timeout e cancelamento; elimine a árvore de processos quando necessário.

## Arquivos, mídia e artifacts

Use caminhos retornados por serviços controlados. Rejeite `..`, symlinks externos, colisões e overwrite. Limite bytes, dimensões, duração, frames, streams, páginas e taxa de descompressão. Normalize nomes, valide MIME e tipo real e remova conteúdo ativo desnecessário. Não devolva base64 em `values`; use artifacts.

## Conteúdo externo e prompt injection

Delimite instruções fixas, configuração do usuário e conteúdo recuperado. Conteúdo externo não pode mudar permissões, pedir secrets, autorizar publicação/compra/deleção, alterar o contrato de saída ou ordenar ferramentas não declaradas. Valide estruturalmente e, para efeitos externos, semanticamente ou com revisão humana.

## Custos e efeitos

Declare `sideEffects`, `cost` e `dataPolicy`. Use idempotency keys, backoff, `retryAfterMs`, limites e reconciliação. Não repita automaticamente uma operação externa não idempotente após timeout incerto. Exija confirmação just-in-time para publicação, cobrança, compra, exclusão e alterações irreversíveis, mostrando destino e resumo.

## Logs e telemetria

Logs devem ser curtos e redigidos. Nunca registre secrets, Authorization headers, prompts privados completos, arquivos integrais, caminhos privados, payloads completos ou dados de outros usuários. Telemetria não essencial exige declaração e consentimento separado; diagnósticos exportáveis devem mostrar previamente o que será compartilhado.

Fonte: [security.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/security.md).
