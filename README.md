# ContentFlow OS

Aplicativo local para organizar a produção de vídeos. O frontend roda no navegador e a API roda localmente na máquina do usuário.

## Como usar

Você precisa ter Node.js 22.12 ou mais recente instalado.

```sh
git clone https://github.com/andremjr/contentflow-os.git
cd contentflow-os
npm install
npm run dev
```

Abra `http://127.0.0.1:8080`.

## Dados locais

Ao iniciar, o aplicativo cria automaticamente o banco SQLite em `data/contentflow-os.sqlite`. Essa pasta não é enviada ao GitHub, portanto cada pessoa mantém canais, projetos e métodos apenas na própria máquina.

Não há login nem sincronização em nuvem nesta fase.
