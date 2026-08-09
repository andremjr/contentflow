# OpenAI Models

Plugin oficial incluído no ContentFlow OS para executar, pela Responses API da OpenAI, ações baseadas em linguagem nos quatro blocos e nos oito Processos Universais.

- `BUSCAR` usa a ferramenta de pesquisa web e requer um modelo que a suporte.
- `ESCOLHER` recebe somente os itens da coleção estratégica vinculada e devolve o ID de um deles.
- `CRIAR` produz as saídas tipadas declaradas no bloco.
- `VALIDAR` analisa o resultado-alvo e produz a decisão configurada.

O campo **Modelo OpenAI** usa a lista retornada por `GET /v1/models` depois que a chave é conectada na Central de Plugins. Antes da conexão, o manifesto oferece uma lista de fallback. Modelos especializados de imagem, áudio, vídeo, transcrição ou embeddings exigem plugins próprios porque possuem contratos e endpoints diferentes.

Esta versão recebe entradas estruturadas e textuais. Arquivos, imagens, áudios e vídeos armazenados localmente ainda não são enviados ao modelo; essas mídias exigem plugins com contratos próprios de leitura e transformação.

## Credencial

A chave da API pode ser conectada na página `/plugins` e fica somente na memória do servidor enquanto o aplicativo estiver aberto. Ela é transmitida apenas para o processo isolado de cada invocação e não é persistida no Método, no snapshot da execução ou no SQLite. Se não houver conexão global na sessão, a tela de execução ainda aceita uma chave transitória para aquele bloco.

O usuário é responsável pelos custos e pelos termos aplicáveis à API da OpenAI.
As chamadas usam `store: false`; os dados ainda são transmitidos ao provedor para processamento conforme a política da API.

## Licença

Este plugin oficial faz parte da distribuição do ContentFlow OS e segue a licença proprietária source-available do repositório raiz.
