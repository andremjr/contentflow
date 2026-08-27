# Instalar no Chrome dedicado

1. No ContentFlow OS, abra o bloco que usa este plugin e clique em **Adicionar conta**.
2. Na janela do Chrome que abrir, acesse `chrome://extensions`.
3. Ative **Modo do desenvolvedor**.
4. Clique em **Carregar sem compactação**.
5. Selecione esta pasta `extension` inteira, não um arquivo individual.
6. Volte ao Google Flow e conclua o login.

A instalação pertence somente àquele perfil dedicado. Repita o procedimento para outra conta. Não mova a pasta do plugin depois de carregá-la. Depois de uma atualização do plugin, use **Recarregar** no card da extensão em `chrome://extensions`.

Para desconectar, faça logout no Google Flow e remova a extensão deste perfil. Os arquivos já entregues ao ContentFlow OS não são apagados.

Em um Windows corporativo gerenciado, a pasta `windows-enterprise-install` do plugin contém um instalador administrativo opcional para todos os perfis. O Chrome recusa esse método para CRX local em computadores pessoais fora de AD, Azure AD ou Chrome Enterprise Core.
