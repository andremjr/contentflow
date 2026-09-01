# Runtime, binding e entregas

## Estados

Um Processo pode estar em `not_started`, `configuring`, `processing`, `awaiting_human`, `awaiting_review`, `approved`, `done`, `error` ou `blocked`. `awaiting_human` é espera legítima por entrega/decisão; `blocked` indica executor ou requisito não resolvido; `error` é falha técnica.

## Resolução de inputs

O Método armazena referências estruturais. O runtime resolve a referência para entregas e itens reais durante a execução. Use:

- `project` para `title` ou `deadline`;
- `previous_process` para output de processo anterior, com `sourceProcessType` e `sourceKey`;
- `previous_block` para output de bloco anterior do mesmo Método;
- `channel_history` para memória derivada de Projetos anteriores, somente em `ESCOLHER` e `CRIAR`;
- `channel_library` para coleção dependente do Canal;
- `static` para contexto fixo com `staticValue`.

A heurística pode priorizar o bloco anterior mais próximo, outputs de processos anteriores, semelhança de nomes e compatibilidade de tipo. Não confie na heurística para resolver conflito de schema: declare referências e valide-as explicitamente. O mesmo output não deve ser usado duas vezes como entrada do mesmo bloco quando isso criar ambiguidade.

## Execução de blocos

O executor materializa inputs, aplica parâmetros e configuração do executor, executa IA/Humano/Código, valida outputs pelo schema e registra entregas. Um bloco só deve ser considerado concluído quando seus outputs obrigatórios estiverem preenchidos e compatíveis. O Método não contém valores de projeto nem IDs transitórios.

Quando um plugin declara continuidade de conversa, o runtime pode reutilizar o ID opaco produzido por um bloco anterior do mesmo projeto. A origem deve ser anterior na ordem dos processos/blocos e usar o mesmo plugin e a mesma conexão; retries que invalidam o resultado também invalidam esse metadado. O Método guarda apenas a referência estrutural ao bloco de origem.

`channel_history` sempre chega ao executor como `records` e histórico vazio é válido. Em `ESCOLHER`, consulta as decisões concluídas do mesmo bloco em Projetos anteriores; em `CRIAR`, consulta os outputs oficiais anteriores do mesmo Processo. O limite é de 1 a 100 itens, o Projeto atual é excluído e `BUSCAR`/`VALIDAR` não usam essa memória. O lote inteligente cria vários Projetos no Orquestrador e não deve ser modelado como um Método multivídeo.

## Outputs oficiais

| Processo | Campo oficial | Type |
| --- | --- | --- |
| `theme` | `theme` | `textarea` |
| `title` | `title` | `text` |
| `thumbnail` | `thumbnail` | `image` |
| `script` | `script` | `textarea` |
| `narration` | `audio` | `audio` |
| `assets` | `assets` | `files` |
| `editing` | `video` | `video` |
| `publishing` | `url` | `url` |

Se a cadeia não produzir o output oficial, o Processo deve aguardar uma entrega humana ou um bloco adicional que transforme o valor para o tipo correto. Não promover `thumbnail_layout` para `image` sem renderização.

## Human-in-the-loop

Blocos `Humano` pausam em `awaiting_human` e devem mostrar inputs tipados, instruções, critérios e outputs esperados. `VALIDAR` diferencia aprovação (`approval`), seleção singular (`select_one`) e seleção múltipla (`select_many`). O resultado deve ser persistido como output tipado e feedback separado quando necessário.

## Retry

`VALIDAR` pode usar `onReject: retry_target` para reexecutar o bloco alvo/trecho permitidos, ou `onReject: pause` para aguardar intervenção. `maxAttempts` limita tentativas. Uma reprovação não é erro técnico; é uma decisão de processo com proveniência e feedback.

## Entregas

Entregas são registros derivados/persistidos da execução, com IDs e arquivos reais. Nunca coloque `deliveryId` ou `itemId` no arquivo do Método. Snapshot de execução pode guardar o Método utilizado, estados, drafts e entregas para auditoria e reprodutibilidade.
