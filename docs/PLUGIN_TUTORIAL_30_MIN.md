# Aula prática: primeiro plugin em aproximadamente 30 minutos

Objetivo: gerar uma transformação de texto local, testá-la no mesmo sandbox usado pelo ContentFlow e conectá-la ao aplicativo. Use Node 26 e execute os comandos na raiz do repositório.

## 0–5 min — escolher o comportamento

Decida uma responsabilidade pequena: receber `content` e devolver `result`. Escolha operador `Código`, bloco `CRIAR`, entrada `textarea`, saída `textarea`, nenhuma permissão e nenhum envio a terceiros.

Conheça os templates:

- `text-transform`: texto local sem rede;
- `hosted-api`: HTTPS, hosts e credencial declarados;
- `file-artifact`: recebe `StoredFile` e produz outro arquivo.

## 5–12 min — gerar

```sh
npm run plugin:kit -- create ./meu-primeiro-plugin --template text-transform
```

Responda às perguntas. Em credenciais, informe apenas nomes como `API_TOKEN`, nunca o valor. O comando cria manifesto, handler, README, teste mínimo e fixture. Ele encerra com erro se o destino já contiver arquivos ou se o manifesto for inválido.

Para agentes e automação, passe respostas revisáveis em JSON:

```sh
npm run plugin:kit -- create ./meu-primeiro-plugin --answers ./respostas.json
```

O JSON contém os mesmos campos perguntados: `template`, `name`, `id`, `author`, `license`, `description`, `operator`, `blockTypes`, `input`, `output`, `permissions`, `networkHosts`, `secretKeys`, `sendsDataToThirdParties` e `providers`.

## 12–18 min — entender e editar

Abra `handler.mjs`. O template local valida uma string, remove espaços e converte para maiúsculas. Troque apenas a transformação, mantendo `execute(request, services)` e as chaves declaradas no manifesto. Não importe o núcleo.

Abra `contentflow.plugin.json` e confira identidade, portas e política. O tipo técnico valida o dado; `presentation`, quando usado, apenas solicita uma visualização controlada pelo núcleo.

## 18–24 min — testar como o produto testa

```sh
npm run plugin:kit -- validate ./meu-primeiro-plugin
npm run plugin:kit -- test-contract ./meu-primeiro-plugin
npm run plugin:kit -- test-sandbox ./meu-primeiro-plugin
```

O primeiro comando mostra todos os erros de manifesto e estrutura. O segundo roda `test.mjs`. O terceiro executa a fixture em processo separado com a sandbox e somente as permissões declaradas. Nenhum deles instala dependências ou executa scripts de instalação.

Gere outra entrada fictícia e leia o relatório:

```sh
npm run plugin:kit -- fixture ./meu-primeiro-plugin
npm run plugin:kit -- report ./meu-primeiro-plugin
```

Ou faça tudo com `npm run plugin:kit -- check ./meu-primeiro-plugin`.

## 24–30 min — validar visualmente

1. Rode `npm run dev`.
2. Abra **Plugins** e escolha **Usar pasta ao vivo**.
3. Selecione `meu-primeiro-plugin` e leia identidade, permissões e política de dados.
4. Ative o plugin, abra/crie um Método e adicione um bloco `CRIAR` de operador `Código`.
5. Escolha a capacidade do plugin, conecte um texto à porta `content` e execute.
6. Confirme que `result` aparece como texto transformado. Edite o handler, salve e execute novamente para confirmar o vínculo ao vivo.

Se a tela divergir do relatório, não contorne o consentimento: desconecte a pasta, corrija manifesto/handler e repita `check`.
