# ContentFlow OS v0.3.1

Atualização corretiva e pacote consolidado de plugins para Windows.

## Principais mudanças

- adiciona o AssemblyAI SRT Studio, com várias chaves de API, rotação circular, processamento de várias mídias e compilação configurável de SRT;
- distribui ChatGPT Browser Studio, Claude Browser Studio, Gemini Browser Studio e Google Flow Browser Images como plugins opcionais editáveis;
- inclui o Removedor de Silêncios com runtime FFmpeg empacotado;
- corrige o binding de portas com múltiplas entradas para preservar valores tipados;
- simplifica os cards da Central de Plugins, mantendo a versão e exibindo apenas o alerta `Desativado` quando necessário;
- classifica o Google Flow Browser Images exclusivamente como capacidade de imagem;
- copia os plugins opcionais para `Documentos\ContentFlow OS\Plugins` sem ativá-los automaticamente.

## Arquivos da Release

- `ContentFlow-OS-V0-0.3.1-x64-Setup.exe` — opção recomendada para usuários finais;
- `ContentFlow-OS-V0-0.3.1-x64-Portable.exe` — versão portátil sem instalação.

## Atualização

Os projetos, plugins instalados e credenciais permanecem em `%APPDATA%\ContentFlow OS\data`. Mesmo assim, recomenda-se fazer backup dessa pasta antes de atualizar.

O Windows pode mostrar um aviso porque esta versão ainda não possui assinatura digital comercial. Baixe os executáveis somente na página oficial do projeto.
