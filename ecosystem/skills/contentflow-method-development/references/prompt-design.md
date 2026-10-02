# Prompts e configuração de executores

## Estrutura de prompt

Escreva instruções com ação, contexto, restrições, critério de qualidade e entrega. Exemplo:

```text
Gere {{candidate_limit}} temas para {{project.title}}.
Para cada tema, retorne tema, ângulo, promessa e fonte.
Não selecione o tema final; a escolha ocorrerá em VALIDAR.
Responda apenas com dados compatíveis com o output `theme_candidates`.
```

O prompt não substitui o contrato. O `ValueShape` valida família, cardinalidade e representação. Novas entregas estratégicas são conteúdo; se o plugin aceita JSON textual, ele valida os campos desse formato, sem transformá-lo em `RecordShape` do Core. Contratos internos estruturados existentes continuam preservados.

## Camadas

| Camada                   | Coloque aqui                                            |
| ------------------------ | ------------------------------------------------------- |
| `instructions`           | Ação e critérios desta etapa.                           |
| `parameters`             | Quantidade, duração, preset, limite ou estilo editável. |
| Configuração do executor | Modelo, endpoint, formato, codec e operação.            |
| Settings                 | Preferência local/canal.                                |
| Secrets                  | Credenciais no cofre, nunca no JSON.                    |

## Placeholders

Use placeholders somente quando a origem estiver declarada e o tipo puder ser resolvido: `{{project.title}}`, `{{video.topic}}`, `{{block_01.output}}`. Não use nomes que não existam no Método, valores arbitrários ou IDs de execução.

## Prévia do envio ao executor

Quando a capability de plugin declarar `promptPreview`, confira a prévia antes de salvar o Método. Ela mostra o formato do texto que o plugin declarou enviar, preservando variáveis como `{{inputs.tema}}`; valores reais só são resolvidos no Projeto. Escolha cada porta pelo significado: `outline` é estrutura/itens sequenciais quando o plugin assim declara; `context` ou `content` são informações de apoio; `prompt` é o pedido direto enviado ao provedor. Compatibilidade de tipo não prova que duas portas têm o mesmo papel.

## IA

Declare idioma, contexto, limites e critérios editoriais. Para `text/many`, descreva a unidade de conteúdo de cada item. Um item pode ser texto JSON quando o plugin declara e valida esse formato; sua instrução técnica de serialização pertence ao plugin. Não exponha schemas internos ao usuário. Separe geração de seleção quando houver decisão própria; configure Humano, IA ou Código conforme a intenção e o contrato de validação.

## Código

Declare operação determinística, inputs, formato recebido, artefato produzido, MIME esperado e comportamento de erro. Se uma transformação for necessária para compatibilizar output e input, modele-a como bloco Código com output no shape de destino.

## Humano

Explique a decisão e os critérios. Use `approval` para aprovar/reprovar, `select_one` para uma escolha e `select_many` para várias. Não faça o próximo bloco depender de texto livre se o resultado real for uma seleção tipada.

## Proibições

Não embuta secrets, prompts de sistema privados, conteúdo protegido desnecessário, HTML/JS, decisões ocultas ou coerções de tipo. Não diga ao executor para retornar `image` quando a operação produz apenas `thumbnail_layout`; adicione renderização explícita.
