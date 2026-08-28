# Prompts e configuração de executores

## Estrutura de prompt

Escreva instruções com ação, contexto, restrições, critério de qualidade e entrega. Exemplo:

```text
Gere {{candidate_limit}} temas para {{project.title}}.
Para cada tema, retorne tema, ângulo, promessa e fonte.
Não selecione o tema final; a escolha ocorrerá em VALIDAR.
Responda apenas com dados compatíveis com o output `theme_candidates`.
```

O prompt não substitui o schema. O `type` do output e `recordFields` são a autoridade para validar o resultado.

## Camadas

| Camada | Coloque aqui |
| --- | --- |
| `instructions` | Ação e critérios desta etapa. |
| `parameters` | Quantidade, duração, preset, limite ou estilo editável. |
| Configuração do executor | Modelo, endpoint, formato, codec e operação. |
| Settings | Preferência local/canal. |
| Secrets | Credenciais no cofre, nunca no JSON. |

## Placeholders

Use placeholders somente quando a origem estiver declarada e o tipo puder ser resolvido: `{{project.title}}`, `{{video.topic}}`, `{{block_01.output}}`. Não use nomes que não existam no Método, valores arbitrários ou IDs de execução.

## IA

Declare idioma, contexto, limites, formato e o que não fazer. Se o resultado for `records`, especifique cada campo e tipo no prompt. Se o resultado for `list`, não descreva-o como tabela ou objeto. Separe geração de seleção: IA produz candidatos; Humano valida.

## Código

Declare operação determinística, inputs, formato recebido, artefato produzido, MIME esperado e comportamento de erro. Se uma transformação for necessária para compatibilizar output e input, modele-a como bloco Código com output no tipo destino.

## Humano

Explique a decisão e os critérios. Use `approval` para aprovar/reprovar, `select_one` para uma escolha e `select_many` para várias. Não faça o próximo bloco depender de texto livre se o resultado real for uma seleção tipada.

## Proibições

Não embuta secrets, prompts de sistema privados, conteúdo protegido desnecessário, HTML/JS, decisões ocultas ou coerções de tipo. Não diga ao executor para retornar `image` quando a operação produz apenas `thumbnail_layout`; adicione renderização explícita.
