# V0 compilada para Windows

A V0 transforma o ContentFlow OS em um aplicativo comum do Windows. Ela não exige Node, npm, Git ou terminal para uso normal.

## Qual arquivo usar

Os binários são publicados manualmente na página [Releases do projeto](https://github.com/andremjr/contentflow-os/releases):

- `ContentFlow-OS-V0-0.2.0-x64-Setup.exe`: recomendado. Instala atalhos e abre rapidamente nas próximas vezes.
- `ContentFlow-OS-V0-0.2.0-x64-Portable.exe`: alternativa sem instalação. Pode demorar mais para abrir porque descompacta o aplicativo a cada execução.

O Windows pode mostrar um aviso porque esta V0 ainda não possui assinatura digital comercial. Confira se o arquivo veio do repositório oficial antes de executá-lo.

## Onde ficam os dados

- projetos e banco local: `%APPDATA%\ContentFlow OS\data`;
- plugins instalados e pastas vinculadas: dentro da mesma área de dados;
- exemplo editável: `Documentos\ContentFlow OS\Plugins\community-reference`;
- programa instalado: pasta escolhida no instalador.

Reinstalar uma compilação nova substitui o programa, mas não remove os dados. Ainda assim, faça backup da área de dados antes de uma atualização importante.

No Windows, a execução de desenvolvimento e a versão instalada compartilham essa mesma área. Ao atualizar uma instalação antiga do código-fonte, o servidor migra automaticamente o banco legado da pasta `data` se o destino compartilhado ainda estiver vazio.

## Criar e testar um plugin

O ponto de entrada para autores é [`PLUGIN_START_HERE.md`](PLUGIN_START_HERE.md). Ele explica como converter APIs, scripts, ferramentas locais e automações de navegador.

Abra **Plugins**, informe a pasta que contém `contentflow.plugin.json` e escolha:

1. **Usar pasta ao vivo** durante a criação. Alterações salvas serão lidas nas próximas execuções.
2. **Instalar uma cópia** quando quiser uma versão estável e independente da pasta original.

Depois, revise as capacidades e permissões, aceite o consentimento local e ative o plugin. Nenhuma aprovação central é necessária.

## Recompilar o núcleo

Desenvolvedores precisam de Windows x64, Node 26 e npm. Na raiz do repositório:

```powershell
npm ci
npm run check
npm run desktop:v0
```

Os artefatos intermediários são gerados em `release/v0`. Para publicar a próxima compilação, valide os dois executáveis e envie-os manualmente como arquivos de uma Release do GitHub. Os binários não entram no histórico Git, evitando dependência de Git LFS e mantendo o clone leve.

O empacotamento inclui o runtime Node 26 privado em `resources/runtime/node.exe`. A API inicia em uma porta local aleatória e a janela Electron encaminha `/api` internamente, evitando portas fixas e conflitos com uma cópia de desenvolvimento.
