# Plugin comunitário de referência

Este é o menor exemplo funcional de um plugin independente. Ele recebe `inputs.content`, grava um arquivo na pasta concedida por `services.getOutputPath()` e devolve o artifact pelo contrato universal.

Para criar outro plugin ou adaptar uma automação existente, veja [`docs/quickstart.md`](../../../docs/quickstart.md).

Para experimentar:

1. abra a Central de Plugins;
2. clique em **Instalar plugin**;
3. escolha **Usar pasta ao vivo** durante o desenvolvimento;
4. informe o caminho absoluto desta pasta;
5. confira `Criar arquivos do projeto` e clique em **Ativar e permitir**;
6. selecione o plugin em um bloco `CRIAR` com entrada de texto e saída de arquivo.

O autor não precisa implementar instalação, cofre, banco, sandbox ou persistência. Essas responsabilidades pertencem ao ContentFlow.
