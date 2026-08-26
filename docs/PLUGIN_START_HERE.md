# Comece aqui: crie ou converta um plugin

Um plugin do ContentFlow OS é uma pasta com um manifesto e uma função JavaScript. O manifesto diz **quando** a capacidade pode ser usada; a função recebe os inputs do bloco e devolve os outputs. O núcleo cuida de instalação, consentimento, cofre de credenciais, sandbox, persistência, arquivos, IDs universais e continuidade do Método.

Compatibilidade deste guia: ContentFlow OS v0.4.2, Plugin API v1 e Node 26.

Para o primeiro plugin, você não precisa estudar o protocolo completo nem alterar o núcleo.

## O caminho mais curto

Requisitos para gerar e testar pelo código-fonte: Node 26 e o repositório do ContentFlow OS.

```powershell
npm run plugin:kit -- create ./meu-plugin --template text-transform
npm run plugin:kit -- check ./meu-plugin
```

Depois, abra **Plugins → Instalar plugin → Usar pasta ao vivo**, informe a pasta criada, revise o consentimento e ative. Alterações salvas nessa pasta entram na próxima execução.

### Se você usa apenas o aplicativo Windows

Node e terminal não são necessários para instalar ou executar um plugin pronto. Peça à IA os arquivos do pacote usando [`PLUGIN_AI_KIT.md`](PLUGIN_AI_KIT.md), salve-os em uma pasta e conecte essa pasta em **Usar pasta ao vivo**. O aplicativo valida o manifesto antes de aceitar e executa o handler no runtime privado. O Plugin Kit por terminal é recomendado para testes mais completos, mas não é uma exigência para o primeiro teste visual.

O kit possui três pontos de partida:

| Template         | Use quando sua automação…                       | Permissões iniciais                   |
| ---------------- | ----------------------------------------------- | ------------------------------------- |
| `text-transform` | transforma texto ou dados somente em JavaScript | nenhuma                               |
| `hosted-api`     | chama uma API ou webhook HTTPS público          | `network` + secret, quando necessário |
| `file-artifact`  | lê um arquivo gerenciado e produz outro         | filesystem controlado                 |

O kit cria `contentflow.plugin.json`, `handler.mjs`, `README.md`, `test.mjs` e uma fixture. Ele não instala dependências nem executa scripts de terceiros.

## O modelo mental em cinco pontos

1. **Uma capacidade entrega algo observável.** Ex.: buscar vídeos no Pexels, gerar narração, criar SRT ou renderizar uma timeline.
2. **O Método controla a sequência.** O plugin não cria novos Processos Universais, tipos de bloco, loops ou telas.
3. **As portas são o encaixe.** Entradas chegam em `request.inputs` pela `portKey`; saídas voltam em `response.values` pela `portKey`.
4. **Parâmetros ficam no bloco; credenciais ficam no cofre.** Nunca grave token no manifesto, no Método ou no código.
5. **O núcleo cria os IDs.** Cada output e cada item de uma lista, registro ou coleção de arquivos recebe identidade universal depois que a resposta é validada.

## Converta uma automação que já existe

Não reescreva a lógica primeiro. Isole a fronteira que o ContentFlow precisa enxergar e envolva o comportamento existente com o contrato do plugin.

| O que você já tem                           | Adaptação recomendada                                                | Atenção                                                                        |
| ------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| função ou script JavaScript                 | mova a função para `handler.mjs` e leia/escreva pelas portas         | remova estado global e caminhos absolutos                                      |
| API própria, SaaS ou webhook público        | comece com `hosted-api` e use `fetch`                                | declare `networkHosts`, provedor, dados enviados e secret                      |
| fluxo n8n, Make ou servidor FastAPI público | exponha uma entrada HTTPS estável e trate o retorno no handler       | webhooks locais/rede privada não possuem permissão dedicada na v1              |
| Python, FFmpeg ou outro programa local      | mantenha o handler Node como adapter e empacote/invoque o executável | declare `process`; é uma permissão avançada e não existe instalação automática |
| automação Playwright, Puppeteer ou Selenium | empacote o runtime/dependências e faça o plugin abrir seu navegador  | declare rede/processo/filesystem necessários e deixe autenticação explícita    |
| fila externa ou geração demorada            | use capacidade `async` com `start`, `resume` e `cancel`              | `jobId` precisa sobreviver ao encerramento do handler                          |
| muitos passos internos para uma entrega     | mantenha a fila/checkpoints dentro da capacidade                     | etapas editoriais e aprovações continuam no Método                             |

Uma automação grande pode virar várias capacidades no mesmo plugin. Separe quando houver entregas que o usuário deve conectar, validar, substituir ou reutilizar em outro bloco. Mantenha junto o que só existe para produzir uma única entrega observável.

## Estrutura mínima

```text
meu-plugin/
├── contentflow.plugin.json
├── handler.mjs
├── README.md
├── LICENSE
├── test.mjs
└── fixtures/
    └── execution.json
```

O instalador exige o manifesto e o `entrypoint`. O kit gera README, teste e fixture. Antes de compartilhar, adicione o arquivo da licença declarada no manifesto e complete no README configuração, custos, dados, limites e suporte.

Handler mínimo:

```js
export async function execute(request) {
  const content = request.inputs.content;
  if (typeof content !== "string") {
    return {
      status: "error",
      code: "INVALID_INPUT",
      message: "A entrada content precisa ser texto.",
      retryable: false,
    };
  }

  return {
    status: "success",
    values: { result: content.trim() },
  };
}
```

Não existe pacote obrigatório para importar nesse exemplo. A referência TypeScript está em [`src/lib/plugin-contract.ts`](../src/lib/plugin-contract.ts), mas um plugin distribuído não deve importar arquivos internos do repositório.

## Permissões sem mistério

- Sem permissão: cálculo e transformação em memória.
- `network`: chamadas externas. Declare `networkHosts` sempre que souber os destinos.
- `filesystem:read` / `filesystem:write`: arquivos entregues pelo núcleo e workspace escolhido.
- `process`: navegador, FFmpeg, Python ou outro subprocesso. É amplo e exige confiança explícita.
- `worker`: workers do Node.
- `native`: addons nativos empacotados.

Dependências podem ser usadas, mas devem estar compiladas ou incluídas no pacote final. O ContentFlow OS não executa `npm install`, `pip install`, `preinstall` ou `postinstall` ao instalar ou executar um plugin.

## Navegador e autenticação

O núcleo não fornece um navegador. Cada plugin decide se abre uma janela, usa OAuth, solicita um secret de sessão ou pede que o usuário escolha uma pasta de perfil. O núcleo apenas apresenta as permissões, guarda secrets declarados e executa o adapter autorizado.

Prefira perfil dedicado. Nunca procure silenciosamente cookies, tokens ou outros perfis. CAPTCHA, reautenticação, compra, publicação e bloqueios do provedor devem pausar ou pedir intervenção, não ser contornados. O guia específico está em [`PLUGIN_BROWSER_AUTOMATION.md`](PLUGIN_BROWSER_AUTOMATION.md).

## Entregas e IDs universais

O plugin devolve valores; o núcleo registra a identidade:

- um texto ou arquivo gera uma entrega com um item;
- uma lista com três títulos gera uma entrega e três IDs de item;
- `records` e coleções de arquivos preservam ordem e identidade por elemento;
- uma nova tentativa cria a identidade da nova tentativa e invalida a anterior;
- inputs resolvidos podem trazer `request.inputDeliveries` com os IDs de origem;
- `request.context.previousDeliveries` permite consultar entregas anteriores autorizadas do Projeto atual.
- Um input `channel_history` configurado em `ESCOLHER` chega antes da escolha como `records` em `request.inputs`, limitado a outros Projetos do mesmo Canal; o plugin não consulta o banco diretamente.

Não invente IDs do núcleo. Quando um provedor possuir `jobId`, `assetId` ou outro ID externo, preserve-o em um campo do seu registro para proveniência e idempotência.

## Criar com IA

Envie à IA o pacote compacto descrito em [`PLUGIN_AI_KIT.md`](PLUGIN_AI_KIT.md) e diga:

- qual automação já existe e quais arquivos ela pode reutilizar;
- qual é a entrega observável;
- inputs e outputs esperados;
- bloco e operador;
- APIs, hosts, programas ou navegador utilizados;
- nomes das credenciais, nunca seus valores;
- dados enviados, custos e efeitos externos.

Peça para a IA adaptar a automação ao contrato público, manter a lógica existente quando possível e terminar somente depois de `npm run plugin:kit -- check <pasta>`.

## Quando abrir os outros documentos

- Aula guiada: [`PLUGIN_TUTORIAL_30_MIN.md`](PLUGIN_TUTORIAL_30_MIN.md).
- Implementação detalhada: [`PLUGIN_DEVELOPMENT.md`](PLUGIN_DEVELOPMENT.md).
- Contrato normativo: [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md).
- Automação de navegador: [`PLUGIN_BROWSER_AUTOMATION.md`](PLUGIN_BROWSER_AUTOMATION.md).
- Segurança e permissões: [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).
- Distribuição e catálogo: [`PLUGIN_ECOSYSTEM.md`](PLUGIN_ECOSYSTEM.md).
- Ideias de capacidades por processo: [`PLUGIN_ROADMAP.md`](PLUGIN_ROADMAP.md).

Se o plugin cabe em um template e passa no `check`, você não precisa ler todos esses documentos antes do primeiro teste.

## Compartilhar ou vender

Um plugin independente pode ser gratuito, pago, proprietário ou aberto e não precisa de aprovação central para ser criado, compartilhado ou instalado localmente. Ele deve possuir licença própria, autoria clara e declarações honestas de permissões, custos, dados e suporte. Na versão atual, distribua a pasta completa; o usuário escolhe **Instalar uma cópia**. Catálogo e instalação direta por URL ainda não fazem parte da interface.
