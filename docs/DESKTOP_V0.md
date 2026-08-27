# V0 compilada para Windows

A V0 transforma o ContentFlow OS em um aplicativo comum do Windows. Ela não exige Node, npm, Git ou terminal para uso normal.

## Qual arquivo usar

Os binários são publicados na página [Releases do projeto](https://github.com/andremjr/contentflow-os/releases):

- `ContentFlow-OS-V0-<versão>-x64-Setup.exe`: recomendado. Instala atalhos e abre rapidamente nas próximas vezes.
- `ContentFlow-OS-V0-<versão>-x64-Portable.exe`: alternativa sem instalação. Pode demorar mais para abrir porque descompacta o aplicativo a cada execução.
- `ContentFlow-OS-V0-<versão>-SHA256.txt`: hashes para conferir a integridade dos dois executáveis.

O Windows pode mostrar um aviso porque esta V0 ainda não possui assinatura digital comercial. Confira se o arquivo veio do repositório oficial antes de executá-lo.

## Atualizar o aplicativo

No instalador NSIS, abra a página inicial e use **Verificar atualização**. O aplicativo consulta somente o canal estável público do repositório oficial. Quando houver uma versão mais recente, o usuário inicia o download, acompanha o progresso e escolhe **Reiniciar e atualizar**. O pacote e o `latest.yml` são publicados pelo mesmo build, e o updater valida os metadados e a integridade antes de instalar.

A versão portátil não é atualizada no lugar. Seu cartão abre a release estável mais recente para baixar o instalador recomendado. Projetos, plugins, perfis e credenciais continuam em `%APPDATA%\ContentFlow OS\data` e não são removidos ao substituir o programa.

Se a release estiver incompleta, a rede falhar ou a integridade não puder ser confirmada, o aplicativo mantém a versão atual e permite tentar novamente. O log local do mecanismo fica no arquivo `updates.log` da pasta de logs do aplicativo e registra somente estados e versões, sem chaves, conteúdo de Projetos ou caminhos privados.

## Onde ficam os dados

- projetos e banco local: `%APPDATA%\ContentFlow OS\data`;
- plugins instalados e pastas vinculadas: dentro da mesma área de dados;
- exemplos editáveis de plugins: `Documentos\ContentFlow OS\Plugins`;
- programa instalado: pasta escolhida no instalador.

Reinstalar uma compilação nova substitui o programa, mas não remove os dados. Ainda assim, faça backup da área de dados antes de uma atualização importante.

No Windows, a execução de desenvolvimento e a versão instalada compartilham essa mesma área. Ao atualizar uma instalação antiga do código-fonte, o servidor migra automaticamente o banco legado da pasta `data` se o destino compartilhado ainda estiver vazio.

## Criar e testar um plugin

O ponto de entrada para autores é [`PLUGIN_START_HERE.md`](PLUGIN_START_HERE.md). Ele explica como converter APIs, scripts, ferramentas locais e automações de navegador.

Abra **Plugins**, informe a pasta que contém `contentflow.plugin.json` e escolha:

1. **Usar pasta ao vivo** durante a criação. Alterações salvas serão lidas nas próximas execuções.
2. **Instalar uma cópia** quando quiser uma versão estável e independente da pasta original.

Depois, revise as capacidades e permissões, aceite o consentimento local e ative o plugin. Nenhuma aprovação central é necessária.

A distribuição do ContentFlow OS não contém, copia nem ativa plugins ou exemplos. Todo plugin, inclusive um mantido pelo autor para seus alunos, é obtido separadamente e exige instalação ou vínculo, revisão de permissões e consentimento local. Todos executam sob a mesma sandbox e podem ser removidos sem remover o núcleo ou os dados organizacionais.

## Recompilar o núcleo

Desenvolvedores precisam de Windows x64, Node 26 e npm. Na raiz do repositório:

```powershell
npm ci
npm run check
npm run desktop:v0
```

Os artefatos intermediários são gerados em `release/v0`. Os binários não entram no histórico Git, evitando dependência de Git LFS e mantendo o clone leve.

O workflow `release-windows.yml` publica uma release estável quando recebe uma tag `v<versão>` exatamente igual à versão de `package.json`. Ele executa `npm ci`, `npm run check`, monta instalador e portátil, publica `latest.yml` e os arquivos auxiliares do updater e anexa o manifesto SHA-256. Release draft, prerelease ou sem `latest.yml` não é considerada pelo canal estável.

Assinatura Authenticode é a política recomendada para distribuição pública da V1. O workflow aceita `WINDOWS_CSC_LINK` e `WINDOWS_CSC_KEY_PASSWORD` como secrets do repositório; enquanto o certificado não estiver configurado, o Windows pode continuar exibindo aviso, embora a verificação HTTPS e SHA-512 do updater permaneça ativa.

Depois do build, gere o manifesto de integridade no PowerShell:

```powershell
$releaseVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
Get-FileHash -Algorithm SHA256 `
  "release/v0/ContentFlow-OS-V0-$releaseVersion-x64-Setup.exe", `
  "release/v0/ContentFlow-OS-V0-$releaseVersion-x64-Portable.exe" |
  ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" } |
  Set-Content -Encoding ascii "release/v0/ContentFlow-OS-V0-$releaseVersion-SHA256.txt"
```

Antes de enviar a tag estável, atualize `package.json`, valide localmente e prepare as notas da versão. O push da tag dispara o workflow; não reutilize uma versão ou tag já publicada. Builds beta devem usar outra política futura e não entram no canal `latest` da V1.

O empacotamento inclui o runtime Node 26 privado em `resources/runtime/node.exe`. A API inicia em uma porta local aleatória e a janela Electron encaminha `/api` internamente, evitando portas fixas e conflitos com uma cópia de desenvolvimento.
