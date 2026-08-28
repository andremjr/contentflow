# Instalar a ContentFlow Browser Bridge no Chrome dedicado

1. No ContentFlow, abra o bloco que usa este plugin e clique em **Adicionar conta**.
2. Na janela do Chrome que abrir, acesse `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione esta pasta `contentflow-browser-bridge` inteira, não um arquivo individual.
6. Volte ao provedor usado pelo plugin e conclua o login.

A instalação pertence somente àquele perfil dedicado. Repita o procedimento para outra conta. Não mova a pasta `contentflow-browser-bridge` depois de carregá-la. Depois de uma atualização da ponte, use **Recarregar** no card da extensão em `chrome://extensions`.

Para desconectar, faça logout no Google Flow e remova a extensão deste perfil. Os arquivos já entregues ao ContentFlow não são apagados.

Esta é a única extensão companheira para todos os plugins de automação de navegador compatíveis. Cada novo provedor é acrescentado por versão desta ponte; não existe uma extensão separada por plugin.

Os usuários instalam a ponte manualmente. Scripts de automação usados pelo mantenedor para preparar sua própria máquina são ferramentas locais paralelas e não fazem parte do ContentFlow.
