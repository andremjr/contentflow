# ContentFlow OS v0.4.0

## Destaques

- Novo Orquestrador de execução na visualização em lista dos Projetos do Canal.
- Criação automática de vários Projetos a partir de uma única fila.
- Modo **Ponta a ponta**, que conclui os 8 Processos Universais de um Projeto antes de iniciar o próximo.
- Modo **Em lote por processo**, que executa todos os Temas, depois todos os Títulos, Thumbnails e demais processos.
- Execução estritamente sequencial: o Orquestrador nunca inicia dois itens da própria fila ao mesmo tempo.
- Toggle expansível corrigido: somente a visualização ativa exibe o texto `Cards` ou `List`.

## Automação e interação humana

O Orquestrador é uma camada sobre o motor existente. Ele cria os Projetos e inicia automaticamente cada combinação `Projeto / Processo Universal`, eliminando os cliques manuais entre etapas sem introduzir um segundo motor de execução.

Métodos, blocos, plugins e outputs mantêm seus contratos atuais. Quando um bloco exige entrega, escolha ou validação humana, a fila pausa no item atual. A pendência continua aparecendo na Central Global de Pendências Humanas e, depois da ação do usuário, a execução sequencial é retomada automaticamente.

Falhas e executores ausentes também interrompem o avanço até que a execução atual seja corrigida. O modo, o cursor e os Projetos da fila são persistidos localmente para permitir retomada após reiniciar o aplicativo.

## Compatibilidade

- Permanecem os mesmos 8 Processos Universais, 4 Blocos Essenciais e 3 Operadores.
- Métodos e Projetos existentes continuam compatíveis.
- A persistência do Orquestrador é adicionada automaticamente ao banco local.
- Projetos e credenciais locais permanecem fora dos binários e não são apagados pela atualização.

## Arquivos da Release

- `ContentFlow-OS-V0-0.4.0-x64-Setup.exe` — instalador recomendado.
- `ContentFlow-OS-V0-0.4.0-x64-Portable.exe` — execução portátil sem instalação.
- `ContentFlow-OS-V0-0.4.0-SHA256.txt` — hashes SHA-256 dos dois executáveis.
