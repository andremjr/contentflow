# Segurança de plugins

Este documento define o modelo de ameaças e os controles mínimos para executar plugins no ContentFlow OS. Ele complementa o contrato normativo de [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md).

> Estado atual: o executor isolado ainda não foi implementado. Plugins comunitários não devem executar dentro do processo principal até que os controles obrigatórios deste documento existam e tenham testes automatizados.

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

Um selo `official` ou `verified` melhora a confiança de origem, mas não remove nenhuma barreira técnica.

## 3. Ameaças prioritárias

| Ameaça                        | Exemplo                                                | Controle principal                                                  |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Supply chain                  | dependência publica atualização maliciosa              | lockfile, hash, assinatura, revisão e pacote imutável               |
| Path traversal / symlink      | artifact usa `../../` ou link para arquivo privado     | resolução canônica, raiz exclusiva e rejeição de symlinks externos  |
| Zip slip / decompression bomb | pacote ou mídia expande além do limite                 | extração segura, limites por arquivo e total                        |
| SSRF                          | URL acessa `localhost`, metadata cloud ou rede privada | proxy de saída, bloqueio de faixas e revalidação após redirect      |
| Exfiltração                   | plugin envia roteiro ou key a domínio oculto           | egress controlado, consentimento e redaction                        |
| Prompt injection              | página pede ao modelo para revelar secrets             | separar dados de instruções e nunca ampliar permissões por conteúdo |
| Command injection             | nome de arquivo interpolado no FFmpeg/shell            | argumentos estruturados, sem shell, allowlist de executáveis        |
| DoS local                     | loop, fork bomb ou artifact gigante                    | processo isolado, quotas e kill da árvore                           |
| Cost attack                   | retries criam jobs pagos duplicados                    | idempotência, limites e confirmação/estimativa                      |
| Efeito externo indevido       | upload publica vídeo sem confirmação                   | declaração de efeito e consentimento just-in-time                   |
| Vazamento em logs             | token ou prompt aparece em erro                        | redaction, limites e logs estruturados                              |
| Confusão entre execuções      | cache global mistura canais                            | staging e contexto exclusivos por invocação                         |

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

Containers, sandboxes de sistema operacional ou processos restritos podem implementar esses controles. Uma sandbox JavaScript dentro do mesmo processo não é isolamento suficiente para código comunitário.

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
- OAuth usa redirect e armazenamento mediados pelo núcleo; access tokens curtos são preferíveis.
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

## 11. Logs, auditoria e privacidade

Eventos estruturados registram quem autorizou, pacote/hash, versão, capacidade, permissões, efeitos, domínios acessados, início/fim, status, uso e IDs externos seguros. O conteúdo completo não faz parte do log padrão.

Logs têm retenção configurável, acesso limitado e exportação com prévia/redaction. Plugins não criam telemetria oculta. Analytics que não seja essencial ao serviço exige consentimento específico.

## 12. Vulnerabilidades e incidentes

Achados de segurança devem ser reportados de forma privada pelo canal indicado em [`../SECURITY.md`](../SECURITY.md). Em incidente confirmado, os mantenedores podem:

1. ocultar a versão do catálogo;
2. bloquear novas instalações ou execuções;
3. revogar assinatura/origem;
4. alertar usuários e identificar Métodos afetados;
5. orientar rotação de secrets e mitigação;
6. publicar versão corrigida e relatório pós-incidente proporcional;
7. preservar evidências sem expor dados de usuários.

Revogação não apaga outputs. O núcleo deve mostrar claramente quando uma execução histórica usou uma versão comprometida.

## 13. Gates antes de plugins comunitários

- [ ] Executor fora do processo principal.
- [ ] Validação estrutural e semântica do manifesto.
- [ ] Instalação segura, hash e versões imutáveis.
- [ ] Staging/saída isolados e proteção de caminhos.
- [ ] Cofre de secrets e redaction testados.
- [ ] Política de rede com proteção SSRF e redirects.
- [ ] Allowlist de subprocessos e argumentos sem shell.
- [ ] Quotas de CPU, memória, disco, tempo, rede e custo.
- [ ] Cancelamento encerra árvore e limpa arquivos.
- [ ] Idempotência e reconciliação de efeitos externos.
- [ ] Validação de artifacts e arquivos hostis.
- [ ] Auditoria e resposta a incidentes.
- [ ] Testes contra as ameaças desta matriz.

Sem esses gates, o sistema pode descobrir e exibir manifestos, mas deve manter a execução comunitária bloqueada.
