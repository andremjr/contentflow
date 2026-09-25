# Convenções transversais para automação e mídia

Este documento complementa o [protocolo](protocol.md), os requisitos de [segurança](security.md) e as regras de [automação de navegador](browser-automation.md). Ele define o contrato comum que plugins de automação e mídia devem aplicar sem incorporar nomes, seletores, modelos ou limites comerciais de um fornecedor.

Quando uma capability precisar de um limite mais restritivo, o menor limite vence. Uma particularidade do provedor pode reduzir o contrato, mas não enfraquecer estas regras.

## 1. Recibo de submissão e idempotência

Toda operação que possa criar job, conteúdo, cobrança ou outro efeito externo mantém um recibo persistente antes de ser repetida. O recibo mínimo é:

```json
{
  "logicalKey": "<executionId>/<blockId>/<capabilityId>/<attempt>/start/<batchItemId?>",
  "provider": "<identificador estável declarado pelo plugin>",
  "operation": "<identificador estável da operação>",
  "scope": {
    "projectId": "<ID externo opcional>",
    "conversationId": "<ID externo opcional>"
  },
  "batchItemId": "<ID universal recebido do núcleo ou null>",
  "submittedAt": "2026-09-24T12:00:00.000Z",
  "state": "prepared",
  "externalIds": {}
}
```

Regras:

- A chave-base é `executionId + blockId + capabilityId + attempt + invocation.mode`. Em `batch`, acrescente `batch.itemId`; em `item_action`, acrescente ação, `itemId`, `outputPort` e tentativa da ação.
- `resume` e `cancel` consultam o recibo da submissão original; não criam outra submissão externa.
- Estados permitidos são `prepared`, `submitted`, `accepted`, `running`, `succeeded`, `failed`, `cancelled` e `unknown`.
- `externalIds` guarda somente IDs opacos emitidos pelo provedor. Não guarda token, cookie, prompt, texto da página, bytes, URL assinada nem ID inventado no namespace do núcleo.
- O recibo precisa sobreviver ao processo do handler. Use o provedor externo ou o workspace concedido por `services.getWorkspacePath()`; memória global não é persistência.
- Grave `prepared` antes do primeiro efeito; grave `submitted` imediatamente após o envio; acrescente IDs externos assim que forem observados. Atualizações devem ser atômicas.

### Reconciliação obrigatória

Antes de repetir uma submissão em estado `submitted`, `accepted`, `running` ou `unknown`, o plugin reconcilia o efeito existente:

1. procura o job, projeto ou conversa pelo ID externo do recibo;
2. quando não houver ID, usa somente uma correlação determinística e limitada ao mesmo escopo, item e instante da submissão;
3. se encontrar o efeito, retoma, materializa o resultado ou registra a falha sem reenviar;
4. se comprovar que nenhum efeito foi criado, volta a `prepared` e pode submeter uma vez;
5. se não conseguir provar existência nem ausência, mantém `unknown` e não repete automaticamente.

Timeout de transporte não prova falha da operação. Troca de perfil também não autoriza reenviar um item cujo efeito externo permaneça incerto.

## 2. Estados, resposta e fallback de perfil

`success` significa que todas as saídas obrigatórias foram validadas. `pending` significa que o mesmo job continua vivo e pode ser retomado sem nova submissão. `error` encerra a tentativa no perfil atual. Uma recusa editorial produzida por um bloco `VALIDAR` continua sendo `success`; uma recusa do provedor em executar a operação não é resultado editorial válido.

| Estado observado | Comportamento no perfil atual | Resposta/código ao encerrar a tentativa |
| --- | --- | --- |
| Login expirado | manter no perfil para login visível quando a sessão puder ser retomada | `AUTHENTICATION_FAILED`, não repetível, se a tentativa precisar terminar |
| CAPTCHA ou verificação humana | pausar no mesmo perfil; nunca contornar ou trocar identidade durante a intervenção | `AUTHENTICATION_FAILED`, não repetível, somente se não for possível manter/retomar |
| Cota esgotada | pausar se uma ação humana ou renovação conhecida puder preservar o job | `QUOTA_EXCEEDED`, não repetível, ao encerrar |
| Rate limit temporário | continuar `pending` quando houver `retryAfterMs` conhecido dentro do deadline | `RATE_LIMIT`, repetível, com `retryAfterMs`, se a tentativa terminar |
| Upgrade necessário | pausar para decisão humana, sem compra automática | `UPGRADE_REQUIRED`, não repetível, ao encerrar |
| Conta ou projeto bloqueado | pausar para diagnóstico/ação humana, sem evasão | `ACCOUNT_BLOCKED`, não repetível, ao encerrar |
| Recusa do provedor | reconciliar e confirmar que não existe saída válida | `CONTENT_REFUSED`, normalmente não repetível |
| Resposta concluída sem mídia obrigatória | fazer uma última reconciliação da mesma submissão | `OUTPUT_VALIDATION_FAILED`; repetível somente quando houver evidência de resultado ainda em propagação |
| DOM incompatível | parar sem clicar em alvo aproximado | `DOM_INCOMPATIBLE`, não repetível naquela implementação |
| Cancelamento | interromper trabalho e fechar recursos | `CANCELLED`, não repetível |

Capabilities assíncronas expressam a pausa com resposta `pending`. Uma capability imediata pode manter a própria invocação aberta, dentro do timeout, enquanto a intervenção visível ocorre; ela não devolve `pending` porque o contrato imediato aceita apenas `success` ou `error`.

O núcleo avança para o próximo perfil preparado quando recebe qualquer `error`, exceto `CANCELLED`, cancelamento já solicitado ou lista esgotada. Portanto, uma condição que ainda exige intervenção no perfil atual não pode ser convertida prematuramente em `error`: ela permanece pendente/ativa nesse perfil. Código de erro e `retryable` descrevem a falha; não substituem essa fronteira de ciclo de vida.

## 3. Política comum de artifacts e mídia

### Limites e validação

- O teto comum por artifact é 512 MiB, igual ao downloader mediado atual. Cada capability declara e testa um limite menor quando o formato, a operação ou o provedor exigir.
- Downloads remotos aceitam no máximo cinco redirects. Cada salto repete HTTPS, host permitido, DNS público, SSRF, ausência de credenciais e timeout.
- MIME deve pertencer à allowlist exata da porta/capability e coincidir com o cabeçalho HTTP quando houver download. `application/octet-stream` não substitui a identificação de imagem, áudio ou vídeo.
- Tamanho declarado, `Content-Length` e bytes recebidos precisam concordar quando estiverem presentes. O limite é aplicado durante o stream, não somente depois do download.
- Imagens validam largura, altura e quantidade total de pixels como inteiros positivos. Áudio e vídeo validam duração finita e positiva; vídeo também valida largura e altura. O pacote mantém limites máximos explícitos em constantes testadas. Não existe um número único de dimensão/duração para todos os formatos: ausência de limite explícito no pacote é falha de revisão, não “ilimitado”.
- O arquivo é escrito em saída controlada, validado e só então devolvido como artifact relativo. Bytes/base64 não entram em `values` nem em logs.

### CDN e materialização

Toda URL temporária, assinada, autenticada ou pertencente a CDN é materializada imediatamente antes de `success` ou da publicação de um parcial concluído. O plugin não entrega uma URL que expira como resultado durável. O núcleo ou o plugin, conforme o caminho autorizado, baixa por streaming, calcula SHA-256, valida MIME/tamanho/limites e promove atomicamente. Falha remove o parcial; retry reutiliza somente artifact já importado com ID, nome, MIME e tamanho idênticos.

## 4. `configurationOptions`

- TTL omitido equivale a 300.000 ms; `0` desativa cache; o máximo é 86.400.000 ms.
- A chave inclui plugin, versão, capability, `providerId`, propriedade, perfil selecionado e somente as dependências declaradas.
- Refresh explícito ignora o cache. Mudança de perfil ou dependência produz outra chave.
- Lista vazia é `success` válido e aparece como “nenhuma opção disponível”; não se inventa fallback estático.
- Erro mantém a configuração salva e não substitui um cache válido por lista vazia.
- Uma opção salva que desapareceu permanece visível, desabilitada e marcada como indisponível até o usuário escolher outra opção válida. O valor técnico não é traduzido nem alterado.
- Respostas têm no máximo 500 opções, valores escalares únicos e labels curtos. Secrets nunca participam da chave ou da resposta.

## 5. Logs e redaction

Logs podem conter somente diagnóstico operacional mínimo: `traceId`, estado/código, contagens, índice do item, duração, tentativa, tipo/tamanho/hash do artifact e IDs externos redigidos ou opacos quando indispensáveis à reconciliação.

Nunca registrar:

- secrets, cookies, headers de autorização, storage de sessão ou URLs com credenciais/query assinada;
- prompt completo, texto de página, HTML/DOM, resposta integral do provedor ou conteúdo criado pelo usuário;
- bytes, base64, arquivo integral, caminho privado, diretório de perfil ou nome pessoal de conta;
- payload completo de request/response, configuração inteira ou dados de outro item/canal.

Antes de persistir ou expor um erro, remova credenciais em URL, bearer/basic auth, cookies, chaves conhecidas, caminhos locais e conteúdo delimitado como input. Mensagens ao usuário descrevem ação e estado, não ecoam o conteúdo sensível que causou a falha.

## 6. Perfil, cancelamento e recursos

Checklist obrigatório para capabilities com `profileSetup` ou navegador:

- [ ] `configure/status` consulta sem abrir UI e devolve `values.ready` booleano.
- [ ] `configure/prepare` abre superfície visível somente por ação explícita, valida conta/origem/Bridge e fecha o navegador após sucesso ou falha.
- [ ] Perfil é dedicado, preparado e referenciado por alias; Método não guarda pasta, cookie ou sessão.
- [ ] `start` valida origem, conta, estado e recibo antes de submeter.
- [ ] `resume` usa job/recibo persistente e não depende de memória global.
- [ ] `cancel` é idempotente, marca a solicitação antes de agir e informa efeitos externos que permaneceram.
- [ ] `services.signal` alcança requests, streams, polls e subprocessos.
- [ ] Sucesso, erro, timeout e cancelamento fecham abas criadas, browser quando pertencente à invocação, streams, sockets, listeners, timers, arquivos, workers e processos filhos.
- [ ] CAPTCHA, compra, upgrade, publicação, deleção e consentimento nunca são automatizados sem a intervenção/confirmação exigida.
- [ ] Fallback preserva recibo, item, histórico e artifacts e nunca repete efeito incerto.

## 7. `promptPreview`

Toda capability que envia ao provedor texto derivado de instruções, configuração, contexto ou inputs declara `promptPreview`. O template mostra o payload textual completo antes dos valores reais, usa somente placeholders documentados e não inclui secrets. Uma capability sem envio de prompt não declara preview fictício.

A revisão de pacote deve comparar o template com o caminho real de composição do handler. Diferença entre prévia e texto enviado é falha de contrato. Capabilities legadas sem preview precisam receber o campo no pacote responsável antes de serem consideradas validadas para esta iniciativa; o núcleo não contém templates específicos de fornecedor.

## 8. Checklist reutilizável de aceite

- [ ] Recibo mínimo persistido antes do efeito e IDs externos anexados assim que conhecidos.
- [ ] Repetição de estado incerto precedida por reconciliação; estado ambíguo não é reenviado.
- [ ] Login, CAPTCHA, cota, rate limit, upgrade, bloqueio, recusa, mídia ausente e DOM incompatível seguem a matriz.
- [ ] Intervenção permanece no perfil atual; `error` encerra a tentativa e pode acionar fallback.
- [ ] Bytes, MIME, dimensões, duração, redirects e CDN possuem testes de limite e falha.
- [ ] Artifact é materializado, validado, hasheado e promovido antes de ser entregue.
- [ ] Options cobrem TTL, perfil/dependências, refresh, vazio, erro e valor salvo desaparecido.
- [ ] Logs e mensagens passam por redaction e não contêm conteúdo do usuário.
- [ ] `configure/status/prepare`, cancelamento e fechamento de recursos foram exercitados.
- [ ] Toda capability que envia prompt possui `promptPreview` fiel.
- [ ] PT-BR, inglês e espanhol foram validados para toda moldura visual alterada.
- [ ] Jobs, partials, fallback, options, profiles, ponte, plugins de navegador e `npm run check` passam no estado final.
