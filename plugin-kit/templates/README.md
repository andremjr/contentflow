# Templates oficiais do Plugin Kit

Os três diretórios desta pasta são as fontes usadas por `npm run plugin:kit -- create`. Cada um contém defaults declarativos e um handler que usa somente a API pública v1.

- `text-transform`: transformação local, sem permissões.
- `hosted-api`: chamada HTTPS com `networkHosts` e segredo obtido por `services.getSecret`.
- `file-artifact`: leitura de `StoredFile` e criação de artefato pelo diretório de saída do núcleo.

Os arquivos `.template` não são executados diretamente. O gerador substitui apenas chaves já validadas e nunca instala dependências ou executa scripts de terceiros.

O desenho parte do [`community-reference`](../../plugins/examples/community-reference), mantendo seu uso de `request.inputs`, `services.getOutputPath` e `artifact://`, e amplia o mesmo contrato para rede e arquivos de entrada.
