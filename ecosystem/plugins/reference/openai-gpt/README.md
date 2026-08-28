# OpenAI Models

Plugin independente para executar, pela Responses API da OpenAI, ações baseadas em linguagem nos quatro blocos e nos oito Processos Universais.

- `BUSCAR` usa a ferramenta de pesquisa web e requer um modelo que a suporte.
- `ESCOLHER` recebe somente os itens da coleção estratégica vinculada e devolve o ID de um deles.
- `CRIAR` produz as saídas tipadas declaradas no bloco.
- `VALIDAR` analisa o resultado-alvo e produz a decisão configurada.

O campo **Modelo OpenAI** usa a lista retornada por `GET /v1/models` depois que a chave é conectada na Central de Plugins. Antes da conexão, o manifesto oferece uma lista de fallback. Modelos especializados de imagem, áudio, vídeo, transcrição ou embeddings exigem plugins próprios porque possuem contratos e endpoints diferentes.

Esta versão recebe entradas estruturadas e textuais. Arquivos, imagens, áudios e vídeos armazenados localmente ainda não são enviados ao modelo; essas mídias exigem plugins com contratos próprios de leitura e transformação.

## Credencial

A chave da API pode ser conectada na página `/plugins` e é persistida no cofre seguro do ambiente local (Windows Credential Manager, macOS Keychain ou Secret Service no Linux). Ela é disponibilizada somente ao processo isolado de uma invocação autorizada e não é persistida no Método, no snapshot da execução ou no SQLite. Depois de conectado, o plugin é acionado automaticamente pelos blocos vinculados.

O usuário é responsável pelos custos e pelos termos aplicáveis à API da OpenAI.
As chamadas usam `store: false`; os dados ainda são transmitidos ao provedor para processamento conforme a política da API.

## Licença

Este plugin é distribuído separadamente do aplicativo e segue a licença indicada no próprio pacote.
