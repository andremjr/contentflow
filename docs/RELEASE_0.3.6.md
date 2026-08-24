# ContentFlow OS v0.3.6

## Destaques

- Todos os plugins mantidos e distribuídos com o projeto agora acompanham o aplicativo em `plugins/bundled`.
- AssemblyAI SRT, Browser Studios, Codex Skill Runner, Free Stock Media Studio, Google Flow Browser Images e Removedor de Silêncios ficam disponíveis automaticamente após a atualização.
- O empacotamento desktop deixa de copiar esses plugins como exemplos opcionais para a pasta de Documentos.
- Os IDs dos plugins foram preservados e as novas versões patch continuam compatíveis com Métodos existentes.
- Os pacotes promovidos receberam novas versões patch para manter a imutabilidade de versão e hash exigida pelo protocolo de distribuição.

## Segurança e compatibilidade

Plugins em `bundled` são tratados como componentes confiáveis do aplicativo: ficam ativos por padrão e não passam pela sandbox aplicada a plugins locais ou instalados. Esta release, portanto, amplia deliberadamente a base de código confiável para incluir integrações de navegador, rede, arquivos e subprocessos mantidas no repositório.

Plugins externos continuam seguindo o fluxo normal de instalação ou vínculo, consentimento de permissões e execução em sandbox. Instalações ou vínculos antigos com o mesmo ID são ignorados quando existe uma cópia bundled, sem apagar configurações ou arquivos do usuário.

## Arquivos da Release

- `ContentFlow-OS-V0-0.3.6-x64-Setup.exe` — instalador recomendado.
- `ContentFlow-OS-V0-0.3.6-x64-Portable.exe` — execução portátil.
- `ContentFlow-OS-V0-0.3.6-SHA256.txt` — hashes SHA-256 dos executáveis.
