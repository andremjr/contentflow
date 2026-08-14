# Anthropic Claude

Plugin oficial incluído no ContentFlow OS para executar ações baseadas em linguagem com a Messages API da Anthropic.

- `BUSCAR` usa a ferramenta de pesquisa web da Anthropic e pode gerar custos adicionais de busca.
- `ESCOLHER` recebe os itens da coleção estratégica vinculada e devolve o ID de um deles.
- `CRIAR` produz as saídas tipadas declaradas no bloco.
- `VALIDAR` analisa o resultado-alvo e produz a decisão configurada.

O catálogo de modelos é consultado em `GET /v1/models` depois que a chave é conectada na Central de Plugins. A disponibilidade real depende da conta Anthropic. Este plugin trabalha com entradas textuais e estruturadas; mídia local exige plugins com contratos específicos.

## Credencial

A chave pode ser conectada na página `/plugins` e é persistida no cofre seguro do ambiente local (Windows Credential Manager, macOS Keychain ou Secret Service no Linux). Ela é disponibilizada somente ao processo isolado de uma invocação autorizada e não é persistida no Método, no snapshot da execução ou no SQLite. Depois de conectado, o plugin é acionado automaticamente pelos blocos vinculados.

O usuário é responsável pelos custos e termos aplicáveis à API da Anthropic. Os dados necessários à execução são transmitidos à Anthropic conforme as políticas do provedor.

## Licença e marca

Este plugin é mantido pelo ContentFlow OS e integra a API da Anthropic. “Anthropic” e “Claude” pertencem aos respectivos titulares; a integração não implica patrocínio ou endosso do provedor.

O código faz parte da distribuição oficial do ContentFlow OS e segue a licença proprietária source-available do repositório raiz.
