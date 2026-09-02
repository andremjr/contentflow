# Segurança de plugins

Este documento define o modelo de ameaças e os controles mínimos para executar plugins no ContentFlow. Ele complementa o contrato normativo de [`protocol.md`](protocol.md).

Autores começando um plugin não precisam ler este documento inteiro antes do primeiro teste; use [`quickstart.md`](quickstart.md) e retorne aqui antes de distribuir uma capacidade com rede, arquivos, subprocessos, navegador, credenciais ou efeitos externos.

> Estado atual: plugins comunitários e privados passam por validação automática e consentimento local, sem revisão ou aprovação manual do mantenedor. Cada invocação roda em processo separado sob o Permission Model do Node 26, com ambiente mínimo, timeout, limite de resposta, diretórios controlados e filesystem, rede, subprocessos, workers e módulos nativos negados por padrão. Artifacts locais e remotos são validados e importados pelo núcleo.

> Limite importante: esta é a sandbox de capacidades v1, não uma máquina virtual. Conceder `process` permite que o plugin inicie programas com a autoridade normal do usuário e esses programas não herdam automaticamente a sandbox do Node. Conceder `native` também amplia fortemente a confiança. Essas permissões devem aparecer como acesso avançado na interface. Quotas fortes de CPU/memória, proxy obrigatório para todo egress, assinatura/hash de pacotes, confirmação de cancelamento externo e allowlist de executáveis continuam como hardening planejado.

No Windows, `process` também autoriza a leitura dos caminhos exatos das instalações convencionais do Google Chrome, inclusive a instalação local do usuário. Essa exceção serve somente à descoberta rápida do executável e não libera a leitura geral de `Program Files` ou `LocalAppData`.

## 1. Objetivos

O sistema deve presumir que um pacote, uma dependência, um provedor remoto ou um arquivo de entrada pode estar comprometido. O isolamento deve limitar:

- leitura de dados que não pertencem à execução;
- vazamento de secrets, conteúdo e identidade;
- escrita ou execução arbitrária no host;
- publicação, cobrança ou alteração externa sem consentimento;
- consumo ilimitado de CPU, memória, disco, rede ou API paga;
- comprometimento do núcleo por dependências ou formatos maliciosos;
- contaminação entre canais, projetos, tentativas ou plugins.

Segurança é responsabilidade compartilhada: o núcleo fornece isolamento, permissões e validação; o plugin minimiza acesso, valida dados e documenta provedores e efeitos; o usuário concede permissões e controla credenciais.

O núcleo não consegue garantir que todo arquivo criado ou compartilhado por terceiros seja honesto. Ele consegue — e deve — controlar a fronteira de execução autorizada: quais pacotes podem executar, quais serviços recebem, quais dados atravessam o protocolo e quais efeitos são permitidos. Um plugin não oficial não recebe acesso irrestrito ao host apenas porque foi instalado localmente.

## 2. Fronteiras de confiança

São não confiáveis:

- arquivos e código do pacote do plugin;
- manifesto, schemas, labels, URLs e documentação do pacote;
- dependências transitivas e binários empacotados;
- respostas de APIs, páginas web, mídia e metadados;
- prompts, documentos e nomes de arquivos fornecidos pelo usuário;
- outputs de modelos de IA;
- artifacts antes da validação e importação pelo núcleo.

São autoridades:

- a versão do contrato embutida no núcleo;
- a política de permissões e consentimentos do núcleo;
- o cofre de secrets;
- os snapshots e hashes calculados pelo núcleo;
- os limites impostos pelo executor.

Um selo `reference` ou `verified` melhora a informação de origem, mas não remove nenhuma barreira técnica.

## 3. Ameaças prioritárias

| Ameaça                        | Exemplo                                                 | Controle principal                                                  |
| ----------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------- |
| Supply chain                  | dependência publica atualização maliciosa               | lockfile, hash, assinatura, revisão e pacote imutável               |
| Path traversal / symlink      | artifact usa `../../` ou link para arquivo privado      | resolução canônica, raiz exclusiva e rejeição de symlinks externos  |
| Zip slip / decompression bomb | pacote ou mídia expande além do limite                  | extração segura, limites por arquivo e total                        |
| SSRF                          | URL acessa `localhost`, metadata cloud ou rede privada  | proxy de saída, bloqueio de faixas e revalidação após redirect      |
| Exfiltração                   | plugin envia roteiro ou key a domínio oculto            | egress controlado, consentimento e redaction                        |
| Prompt injection              | página pede ao modelo para revelar secrets              | separar dados de instruções e nunca ampliar permissões por conteúdo |
| Command injection             | nome de arquivo interpolado no FFmpeg/shell             | argumentos estruturados, sem shell, allowlist de executáveis        |
| DoS local                     | loop, fork bomb ou artifact gigante                     | processo isolado, quotas e kill da árvore                           |
| Cost attack                   | retries criam jobs pagos duplicados                     | idempotência, limites e confirmação/estimativa                      |
| Efeito externo indevido       | upload publica vídeo sem confirmação                    | declaração de efeito e consentimento just-in-time                   |
| Vazamento em logs             | token ou prompt aparece em erro                         | redaction, limites e logs estruturados                              |
| Confusão entre execuções      | cache global mistura canais                             | staging e contexto exclusivos por invocação                         |
| Sequestro de sessão           | plugin copia cookie ou token de perfil não autorizado   | conexão explícita, cofre, pasta escolhida e proibição de varredura  |
| Evasão de limites             | endpoint, IP ou perfil não consentido amplia autoridade | somente perfis preparados, quotas, auditoria e fallback rastreável  |
| Automação de UI incorreta     | mudança visual faz o plugin clicar em publicar          | estado validado, seletores acessíveis e confirmação just-in-time    |

## 4. Instalação segura

Antes de disponibilizar uma versão, o gerenciador deve:

1. baixar por transporte autenticado para diretório temporário;
2. verificar tamanho, hash/assinatura, identidade e origem esperada;
3. extrair sem caminhos absolutos, travessia, devices ou symlinks externos;
4. validar o manifesto e cada JSON Schema sem executar código;
5. confirmar que o entrypoint existe dentro do pacote;
6. verificar permissões, efeitos, providers, secrets, runtime e binários;
7. executar análise estática e verificação de dependências quando disponíveis;
8. mostrar ao usuário as declarações materiais e mudanças desde a versão instalada;
9. instalar atomicamente sem substituir a versão funcional antes da validação;
10. registrar hash, origem, data e decisão de consentimento.

Scripts `preinstall`, `install`, `postinstall` e equivalentes não são executados. Uma versão publicada é imutável: qualquer alteração exige novo número e novo hash.

## 5. Isolamento do executor

O executor deve rodar cada invocação fora do processo principal, com identidade e ambiente mínimos. Controles obrigatórios:

- nenhuma herança irrestrita de variáveis de ambiente;
- sistema de arquivos negado por padrão, com staging somente leitura e saída exclusiva;
- diretório de trabalho efêmero;
- rede negada quando `network` não foi concedida;
- subprocessos negados quando `process` não foi concedida;
- allowlist por caminho e hash para executáveis como FFmpeg;
- CPU, memória, disco, descritores, processos filhos, tempo e tamanho de resposta limitados;
- encerramento de toda a árvore em timeout ou cancelamento;
- canal IPC autenticado, limitado e validado;
- resposta serializada sem protótipos, funções ou objetos executáveis.

Containers, sandboxes nativas do ambiente hospedeiro ou processos restritos podem implementar esses controles. Uma sandbox JavaScript dentro do mesmo processo não é isolamento suficiente para código comunitário.

### Implementação v1

O executor comunitário atual usa `node --permission`. O pacote e o worker são somente leitura; entradas são resolvidas pelo serviço controlado; a escrita fica limitada à pasta exclusiva da invocação; e a rede só é liberada com `network`. O pacote é rejeitado se contiver symlinks e todo artifact local passa por `realpath` antes de ser copiado para o armazenamento do ContentFlow. Artifacts HTTPS são baixados pelo núcleo com proteção SSRF, DNS fixado, redirects revalidados, streaming, limite, timeout e SHA-256. A resposta e os streams do processo possuem limites, e o processo é encerrado no timeout configurado, até o máximo de 24 horas.

O manifesto pode declarar `networkHosts`. Essa lista é mostrada e renovada no consentimento, além de ser obrigatória para o downloader do núcleo quando presente. Entretanto, o `--allow-net` do Node 26 é binário e não impõe hosts ao código do plugin. Um plugin comunitário com `network` ainda deve ser tratado como capaz de abrir conexões para qualquer destino público; a ausência de `networkHosts` recebe aviso reforçado.

`process`, `worker` e `native` são permissões deliberadamente amplas para plugins como renderizadores e ferramentas locais. Elas preservam a abertura do sistema, mas mudam o nível de confiança: ao aceitá-las, o usuário está autorizando código capaz de ultrapassar parte do isolamento básico. O próximo nível de proteção deve acrescentar perfis/allowlists por executável e isolamento nativo reforçado para esses casos.

## 6. Rede e SSRF

Chamadas externas devem passar por política de egress do executor ou por cliente controlado do SDK:

- permitir somente `https` por padrão;
- resolver DNS e bloquear loopback, link-local, multicast, redes privadas e endpoints de metadata;
- revalidar cada redirect e limitar sua quantidade;
- bloquear credenciais embutidas na URL;
- impor timeout, tamanho de download/upload e tipos aceitos;
- não encaminhar headers sensíveis entre hosts;
- registrar domínio e volume, sem registrar conteúdo sensível;
- permitir allowlist mais restrita por plugin/provedor.

Webhooks locais ou destinos privados exigem uma permissão futura distinta e aviso explícito; não devem ser liberados implicitamente por `network`.

## 7. Secrets e autenticação

- Secrets são armazenados cifrados no cofre local e referenciados somente pela chave declarada.
- O valor só existe na memória da invocação autorizada e não aparece em request, snapshot, método, log ou artifact.
- `getSecret()` falha para chaves não declaradas.
- OAuth e login interativo são implementados pelo plugin na versão atual; tokens persistentes devem ser declarados como secrets e guardados pelo cofre do núcleo. Access tokens curtos são preferíveis.
- A interface identifica escopo, conta e provedor antes de salvar uma credencial.
- Remoção do plugin oferece revogação local e orienta revogação no provedor.
- Redaction cobre valor integral, formas codificadas conhecidas e headers de autorização.

O núcleo nunca entrega secrets ao modelo de IA como parte do prompt. Conteúdo externo não pode solicitar ou autorizar acesso adicional.

## 8. Arquivos, mídia e artifacts

Entradas e saídas são verificadas por caminho canônico, tamanho e tipo real. Para formatos complexos, o núcleo ou serviço isolado deve:

- limitar dimensões, duração, frames, streams, páginas e taxa de descompressão;
- rejeitar conteúdo ativo não necessário, macros e executáveis;
- usar parsers atualizados e isolados;
- normalizar nomes sem confiar na extensão;
- calcular hash antes da importação;
- impedir overwrite e colisão de IDs;
- limpar parciais após falha;
- tratar metadados como não confiáveis e remover campos sensíveis quando apropriado.

URLs remotas de artifacts passam pelo mesmo downloader protegido contra SSRF. O plugin nunca decide sozinho o destino definitivo.

O downloader resolve todos os registros antes de conectar e rejeita o host inteiro se qualquer endereço for não público. A conexão HTTPS usa diretamente um IP validado, mantendo o hostname original em SNI/Host, para impedir uma segunda resolução suscetível a DNS rebinding. Cada redirect repete URL, host e DNS. Downloads usam arquivo parcial exclusivo, hash incremental, promoção atômica e limpeza em falha. MIME ainda é validado pela declaração e pelo cabeçalho HTTP; inspeção profunda de magic bytes, codecs e malware permanece hardening futuro.

## 9. IA, conteúdo externo e prompt injection

O plugin deve separar claramente instruções fixas, configuração do usuário e conteúdo recuperado. Textos externos são delimitados e descritos como dados. Nenhuma frase dentro deles pode:

- mudar permissões ou política do executor;
- pedir secrets ou contexto adicional;
- autorizar publicação, cobrança ou deleção;
- modificar o contrato de saída;
- ordenar chamadas de ferramenta não declaradas.

Outputs de IA são validados estruturalmente e, quando houver risco de ação externa, semanticamente ou por revisão humana. Agentes não recebem ferramentas mais amplas do que a capacidade necessita.

## 10. Idempotência, custos e efeitos externos

- O núcleo deriva chaves de idempotência estáveis e o plugin as encaminha ao provedor.
- Retries têm backoff, jitter, limite e respeito a `retryAfterMs`.
- O executor limita gasto por invocação, projeto e período quando a integração suportar.
- Operações tarifadas mostram estimativa quando disponível.
- Publicação e ações irreversíveis usam confirmação just-in-time com destino visível.
- Estado incerto após timeout não é repetido automaticamente; primeiro ocorre reconciliação pelo identificador externo.
- Cancelamento informa efeitos que não puderam ser revertidos.

Automação de navegador obedece também a [`browser-automation.md`](browser-automation.md). O executor não extrai nem entrega automaticamente cookies, tokens, histórico, armazenamento de sessão ou perfis. O usuário pode conectar explicitamente um secret ou escolher uma pasta para uma capacidade que declare as permissões avançadas necessárias; nesse caso, o plugin responde pelo runtime e opera dentro do consentimento concedido. CAPTCHA, anti-bot, reautenticação, cota esgotada e upgrade podem permanecer pendentes no perfil atual; se o plugin devolver erro, o núcleo pode avançar para o próximo perfil explicitamente preparado. Isso não autoriza descobrir contas, trocar endpoint, IP ou fingerprint nem ampliar permissões fora do consentimento.

## 11. Logs, auditoria e privacidade

Eventos estruturados registram quem autorizou, pacote/hash, versão, capacidade, permissões, efeitos, domínios acessados, início/fim, status, uso e IDs externos seguros. O conteúdo completo não faz parte do log padrão.

Logs têm retenção configurável, acesso limitado e exportação com prévia/redaction. Plugins não criam telemetria oculta. Analytics que não seja essencial ao serviço exige consentimento específico.

## 12. Vulnerabilidades e incidentes

Achados de segurança devem ser reportados de forma privada pelo canal indicado em [`../SECURITY.md`](../../SECURITY.md). Em incidente confirmado, os mantenedores podem:

1. ocultar a versão do catálogo;
2. interromper novos downloads por superfícies mantidas pelo projeto;
3. marcar assinatura/origem como comprometida e emitir alerta local;
4. alertar usuários e identificar Métodos afetados;
5. orientar rotação de secrets e mitigação;
6. publicar versão corrigida e relatório pós-incidente proporcional;
7. preservar evidências sem expor dados de usuários.

Alertas não apagam outputs nem criam aprovação central. O núcleo deve mostrar claramente quando uma execução histórica usou uma versão comprometida; bloqueios locais só decorrem de política automática de integridade/sandbox ou de decisão do próprio usuário.

## 13. Estado dos controles e hardening

- [x] Executor fora do processo principal.
- [x] Validação estrutural e semântica do manifesto.
- [x] Consentimento local por versão e conjunto exato de permissões.
- [x] Filesystem, rede, subprocessos, workers e módulos nativos negados por padrão.
- [x] Staging/saída isolados, rejeição de symlinks e proteção de caminhos de artifacts.
- [x] Cofre de secrets declarados.
- [x] Limites de tempo, resposta e artifact, com smoke test automatizado de isolamento.
- [x] Downloader HTTPS de artifacts com SSRF/DNS rebinding, redirects, streaming, timeout, limite e SHA-256.
- [x] Jobs persistentes com deadline, leases contra `resume` concorrente, retomada após reinício e snapshots parciais validados.
- [x] Solicitação de cancelamento persistente e chamada `cancel` para capacidades que a suportam.
- [ ] Download assinado, hash, versões imutáveis e instalação atômica.
- [ ] Proxy/SDK obrigatório para impor `networkHosts` a toda conexão aberta pelo processo do plugin.
- [ ] Allowlist de subprocessos e argumentos sem shell.
- [ ] Quotas fortes de CPU, memória, árvore de processos, disco, rede e custo.
- [ ] Encerramento comprovado de processos externos/árvores iniciadas por plugins e reconciliação de cancelamentos remotos incertos.
- [ ] Idempotência e reconciliação de efeitos externos pelo núcleo.
- [ ] Inspeção profunda de formatos hostis e malware.
- [ ] Auditoria e resposta a incidentes completas.

Os controles concluídos formam a fronteira mínima executável da v1. Os itens restantes não criam aprovação central: são camadas incrementais de proteção. A interface deve distinguir permissões básicas de permissões avançadas e nunca apresentar `process` ou `native` como equivalentes a um plugin puramente isolado.

Um aviso de “plugin não oficial” complementa esses gates, mas não substitui sandbox, permissões e validação. A opção de sideload não deve equivaler a executar código nativo com a autoridade completa do usuário. Pacotes executados deliberadamente fora do ContentFlow, ou por um núcleo modificado que removeu essas barreiras, ficam fora da superfície autorizada e suportada pelo projeto.
