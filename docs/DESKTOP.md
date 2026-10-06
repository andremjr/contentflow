# Distribuição do ContentFlow para Windows

O aplicativo desktop transforma o ContentFlow em um programa comum do Windows. Ele não exige Node, npm, Git ou terminal para uso normal.

## Qual arquivo usar

Os binários são publicados na página [Releases do projeto](https://github.com/andremjr/contentflow/releases):

- `ContentFlow-V1-<versão>-x64-Setup.exe`: recomendado. Instala atalhos e abre rapidamente nas próximas vezes.
- `ContentFlow-V1-<versão>-x64-Portable.exe`: alternativa sem instalação. Pode demorar mais para abrir porque descompacta o aplicativo a cada execução.
- `ContentFlow-V1-<versão>-SHA256.txt`: hashes para conferir a integridade dos dois executáveis.

O Windows pode mostrar um aviso enquanto a distribuição ainda não possuir assinatura digital comercial. Confira se o arquivo veio do repositório oficial antes de executá-lo.

## Atualizar o aplicativo

No instalador NSIS, abra a página inicial e use **Verificar atualização**. O aplicativo consulta somente o canal estável público do repositório oficial. Quando houver uma versão mais recente, o usuário inicia o download, acompanha o progresso e escolhe **Reiniciar e atualizar**. O pacote e o `latest.yml` são publicados pelo mesmo build, e o updater valida os metadados e a integridade antes de instalar.

A versão portátil não é atualizada no lugar. Seu cartão abre a release estável mais recente para baixar o instalador recomendado. Projetos, plugins, perfis e credenciais continuam em `%APPDATA%\ContentFlow\data` e não são removidos ao substituir o programa.

Se a release estiver incompleta, a rede falhar ou a integridade não puder ser confirmada, o aplicativo mantém a versão atual e permite tentar novamente. Os estados e versões do updater entram no diagnóstico local descrito abaixo, sem chaves, conteúdo de Projetos ou caminhos privados. Esta implementação deixa de escrever `updates.log`; arquivos de versões anteriores não são importados no ZIP nem apagados automaticamente.

## Enviar um diagnóstico ao suporte

Abra **Preferências → Suporte e diagnóstico → Exportar diagnóstico** logo após o erro. Escolha onde salvar o ZIP e envie-o junto com o horário e uma descrição do que tentou fazer. O pacote contém `LEIA-ME.txt` com explicações em português, inglês e espanhol, `environment.json` com versões técnicas e `events.jsonl` com os eventos estruturados. O envio é manual; o aplicativo não transmite o diagnóstico automaticamente.

**Abrir pasta de logs** abre `%APPDATA%\ContentFlow\logs`. Instalador e portátil oferecem os dois botões; o preview web informa que o recurso está disponível no aplicativo desktop.

Os registros de suporte são mantidos por até 24 horas, com teto de 4 MiB no conjunto e 256 KiB por segmento de hora. Segmentos antigos são removidos na abertura, durante a gravação e a cada virada de hora enquanto o aplicativo estiver aberto. Com o aplicativo fechado, a limpeza ocorre na próxima abertura. Arquivos externos e ZIPs salvos pelo usuário não são removidos. Ao atingir os limites, eventos podem ser omitidos; o relatório registra omissões quando houver espaço.

São registrados erros da interface e do serviço local, início/encerramento, operações de escrita da API, marcos de jobs e estados de atualização. Consultas de estado bem-sucedidas, cada clique, progresso de cada item e conteúdo de mensagens não são registrados. A gravação é assíncrona, em lotes de até um segundo, com fila de 64 KiB, deduplicação e limitação de frequência. A compressão só acontece ao exportar. Um encerramento forçado pode perder o último lote.

O diagnóstico usa códigos, classes de erro, localização relativa no código, status, duração, versões e IDs de correlação resumidos por hash. Não inclui mensagens brutas de exceção, prompts, conteúdo produzido, nomes de Projetos/Canais/Métodos, URLs privadas, caminhos físicos, tokens, senhas, cookies ou sessões. Isso limita a investigação de erros sem classificação: reproduzir o cenário e informar o que aconteceu continua necessário. Os registros operacionais canônicos de execução e plugin permanecem no armazenamento existente; a retenção curta só se aplica aos arquivos de suporte.

## Onde ficam os dados

- projetos e banco local: `%APPDATA%\ContentFlow\data`;
- plugins instalados e pastas vinculadas: dentro da mesma área de dados;
- exemplos editáveis de plugins: `Documentos\ContentFlow\Plugins`;
- programa instalado: pasta escolhida no instalador.

Reinstalar uma compilação nova substitui o programa, mas não remove os dados. Ainda assim, faça backup da área de dados antes de uma atualização importante.

No Windows, a execução de desenvolvimento e a versão instalada compartilham essa mesma área. Ao atualizar uma instalação antiga do código-fonte, o servidor migra automaticamente o banco legado da pasta `data` se o destino compartilhado ainda estiver vazio.

## Criar e testar um plugin

O ponto de entrada para autores é [`quickstart.md`](ecosystem/quickstart.md). Ele explica como converter APIs, scripts, ferramentas locais e automações de navegador.

Abra **Plugins**, informe a pasta que contém `contentflow.plugin.json` e escolha:

1. **Usar pasta ao vivo** durante a criação. Alterações salvas serão lidas nas próximas execuções.
2. **Instalar uma cópia** quando quiser uma versão estável e independente da pasta original.

Depois, revise as capacidades e permissões, aceite o consentimento local e ative o plugin. Nenhuma aprovação central é necessária.

A distribuição do ContentFlow não contém, copia nem ativa plugins ou exemplos. Todo plugin, inclusive um mantido pelo autor para seus alunos, é obtido separadamente e exige instalação ou vínculo, revisão de permissões e consentimento local. Todos executam sob a mesma sandbox e podem ser removidos sem remover o núcleo ou os dados organizacionais.

## Recompilar o núcleo

Desenvolvedores precisam de Windows x64, Node 26 e npm. Na raiz do repositório:

```powershell
npm ci
npm run check
npm run desktop:v1
```

Os artefatos intermediários são gerados em `release/v1`. Os binários não entram no histórico Git, evitando dependência de Git LFS e mantendo o clone leve.

### Publicação direta com a credencial de sessão

O ContentFlow não usa GitHub Actions para validar, montar ou publicar releases. O repositório não deve manter workflow acionado por tags, e o envio de uma tag nunca deve iniciar um job. Toda release autorizada é validada e construída localmente no estado exato do commit com `npm run release:verify`; instalador, portátil, blockmap, `latest.yml`, manifesto SHA-256 e pacotes do ecossistema são publicados diretamente pela API do GitHub: o núcleo em contentflow, plugins em plugins-contentflow e Métodos em methods-contentflow.

A publicação de cada produto é independente e exige escopo explícito: uma release somente do aplicativo não incrementa, monta nem publica plugins ou Métodos em seus repositórios separados. Nesse caso, os catálogos existentes permanecem inalterados.

Toda release estável do aplicativo inclui também `ContentFlow-Browser-Bridge.zip`, `ContentFlow-Skill-Plugin-Development.zip` e `ContentFlow-Skill-Method-Development.zip`: esses são os downloads apontados pela interface em `releases/latest/download`. `desktop:release` gera os três em `release/app-ecosystem` usando `package-ecosystem.mjs --app-only`, sem montar plugins nem regenerar seu catálogo. O publicador rejeita uma release sem qualquer um dos oito assets obrigatórios antes de consultar credenciais ou criar um draft. A validação de distribuição abre os ZIPs e verifica arquivos da extensão e hashes documentais das skills.

A autenticação deve reutilizar exclusivamente a credencial de sessão existente no Git Credential Manager. O token nunca deve aparecer na saída, em logs, documentação, scripts versionados, variáveis persistentes ou arquivos temporários. Depois do upload, confirme pela API pública que a tag é a release `latest`, que todos os assets estão no estado `uploaded`, que os tamanhos e hashes correspondem aos arquivos locais, que o catálogo contém as versões esperadas e que `https://andremjr.github.io/contentflow/` aponta para a release correta. Falhas de teste, build, assinatura, integridade ou conteúdo devem ser corrigidas e validadas antes de publicar.

Assinatura Authenticode é a política recomendada para distribuição pública da V1. Quando houver certificado, o build local poderá receber `CSC_LINK` e `CSC_KEY_PASSWORD` somente durante o processo seguro de montagem; enquanto ele não estiver configurado, o Windows pode continuar exibindo aviso, embora a verificação HTTPS e SHA-512 do updater permaneça ativa.

Depois do build, gere o manifesto de integridade no PowerShell:

```powershell
$releaseVersion = (Get-Content -Raw package.json | ConvertFrom-Json).version
Get-FileHash -Algorithm SHA256 `
  "release/v1/ContentFlow-V1-$releaseVersion-x64-Setup.exe", `
  "release/v1/ContentFlow-V1-$releaseVersion-x64-Portable.exe", `
  "release/v1/ContentFlow-V1-$releaseVersion-x64-Setup.exe.blockmap", `
  "release/v1/latest.yml", `
  "release/app-ecosystem/ContentFlow-Browser-Bridge.zip", `
  "release/app-ecosystem/ContentFlow-Skill-Plugin-Development.zip", `
  "release/app-ecosystem/ContentFlow-Skill-Method-Development.zip" |
  ForEach-Object { "$($_.Hash)  $([IO.Path]::GetFileName($_.Path))" } |
  Set-Content -Encoding ascii "release/v1/ContentFlow-V1-$releaseVersion-SHA256.txt"
```

Antes de enviar a tag estável, atualize `package.json`, valide localmente, prepare as notas da versão e confirme que não existe workflow acionado pela tag. Depois do push, crie ou atualize a release diretamente pela API do GitHub com a credencial segura da sessão. Não reutilize uma versão ou tag já publicada. Builds beta devem usar outra política futura e não entram no canal `latest` da V1.

O empacotamento inclui o runtime Node 26 privado em `resources/runtime/node.exe`. A API inicia em uma porta local aleatória e a janela Electron encaminha `/api` internamente, evitando portas fixas e conflitos com uma cópia de desenvolvimento.


Para a 1.3.3, o criador dispensou suites e migração de instalações antigas e autorizou distribuir a base local atual. Essa exceção é específica desta publicação e não estabelece uma política geral de validação. A montagem permanece local, sem GitHub Actions, com integridade e disponibilidade pública verificadas.
