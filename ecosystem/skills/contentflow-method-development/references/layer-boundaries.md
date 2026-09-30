# Fronteiras entre Método, Core, plugin e Browser Bridge

Use esta referência para decidir a granularidade de um Método sem criar caixa-preta nem dezenas de Blocos operacionais.

## Três escalas

| Escala                | Deve representar                                                                             | Não deve representar                                             |
| --------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Bloco do Método       | transformação e entrega com valor estratégico próprio                                        | clique, página, poll, tentativa, perfil ou item individual       |
| Core                  | identidade, work units, deliveries, artifacts, retry/recovery, perfis, leases e distribuição | regra específica do provedor ou decisão editorial escondida      |
| Plugin/Browser Bridge | passos técnicos necessários para cumprir a capability                                        | próximo Bloco, próximo Processo ou autoridade sobre a estratégia |

“Passar pelo núcleo” significa que estado, identidade, contratos, permissões, recursos e fatos ficam sob controle do Core. Não significa que o Core implemente o provedor nem que cada operação apareça no canvas.

## Teste de fronteira

Crie outro Bloco se a resposta a qualquer pergunta for sim:

- o resultado será consumido por outra etapa ou por mais de um caminho?
- o usuário precisa validar, escolher, editar, substituir ou reutilizar esse resultado?
- deve ser possível trocar operador/plugin ou refazer a próxima etapa preservando esta entrega?
- existe efeito externo ou confirmação com significado independente?
- o intermediário precisa permanecer como delivery com proveniência própria?

Mantenha dentro da mesma capability quando todas forem não e os passos existirem apenas para obter uma única entrega observável.

## O que não multiplica Blocos

- uma coleção `many`: use work units/item orchestration;
- vários perfis: use `profileExecution`, lanes e leases do Core;
- retries, fallback e reconciliação: reportam fatos ao Core;
- login já preparado, navegação, upload, polling, download e parsing: implementação do plugin/Bridge;
- checagem de URL, conta, arquivo, MIME ou resposta: validação técnica;
- variantes produzidas para a mesma entrega: itens da delivery, salvo decisão editorial explícita.

## Exemplos

- Cem prompts gerando cem imagens: um Bloco `CRIAR` com `image/many`, não cem Blocos.
- Dois perfis dividindo o lote: o mesmo Bloco com work units exclusivas; perfil não vira estratégia.
- Gerar imagem e animar: dois Blocos se a imagem for revisável/reutilizável; um Bloco de vídeo se a imagem for intermediário descartável.
- Abrir site, preencher, enviar, aguardar e baixar: uma capability quando tudo produz uma única entrega.
- Conferir se o download existe e tem MIME correto: validação técnica interna; escolher a melhor imagem: `VALIDAR`.
