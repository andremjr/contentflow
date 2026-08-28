# Configuração recomendada do GPT

**Nome:** ContentFlow — Tradutor de Métodos

**Descrição:** Traduz relatos, tutoriais e transcrições em métodos de produção claros e JSON importável para o ContentFlow.

## Campo “Instruções”

Copie integralmente o conteúdo de `SYSTEM_PROMPT.md` para o campo **Instruções** do GPT.

## Arquivos em “Conhecimento”

Anexe estes quatro arquivos:

1. `CONTENTFLOW_TRANSLATION_SCOPE.md`
2. `CONTENTFLOW_BLOCK_RULES.md`
3. `CONTENTFLOW_METHOD_FORMAT.md`
4. `CONTENTFLOW_METHOD_EXAMPLE.json`

Não anexe o `SYSTEM_PROMPT.md` como Conhecimento: regras de comportamento funcionam melhor no campo **Instruções**.

## Recursos

- Ative **Busca na web** para o GPT poder abrir páginas públicas de vídeos/tutoriais.
- Ative **Intérprete de código e Análise de Dados** se quiser que ele entregue o JSON também como arquivo baixável. Para apenas mostrar o JSON e copiar/colar, ele não é necessário.
- Não há necessidade de criar uma Ação para a importação atual: o aluno copia o JSON para um arquivo `.contentflow-method.json` e o importa na tela de Métodos do Canal.

## Quebra-gelos

- “Vou explicar como escolho o tema dos meus vídeos. Transforme isso em um método.”
- “Analise esta transcrição e mapeie o método por processos: [cole a transcrição].”
- “Leia este tutorial do YouTube e me diga o que preciso fornecer para converter o processo em método: [URL].”
- “Com base nesta prévia, gere o JSON importável para o processo de Roteiro.”
- “Converta o meu processo completo em 8 métodos importáveis, um por processo.”

## Teste de aceite

Cole: “A IA pesquisa 10 temas, cria 100 ideias e eu escolho uma para fazer o vídeo. Quero importar o processo Tema.”

O GPT deve devolver apenas um bloco `json` com `processType: "theme"`, blocos ordenados, `parameters` em todos os blocos e sem texto fora do JSON. Ele deve usar `BUSCAR` para a pesquisa, `CRIAR` para as 100 ideias e `VALIDAR` com `select_one` para a escolha humana; não pode usar `ESCOLHER`. Salve o resultado como `tema.contentflow-method.json` e importe-o em **Métodos do Canal → Tema → Importar**.

Teste também: “Antes de gravar vídeos eu escolhi o nicho carros, pesquisei meu público e defini meu posicionamento. Para cada vídeo, a IA cria opções de tema e eu valido uma.” O GPT deve deixar nicho, público e posicionamento fora do método; só a execução recorrente do vídeo pode virar blocos. Se o usuário disser que mantém um banco de temas pré-aprovados para vários vídeos, o GPT deve propor uma coleção com o formato dos itens, sem inseri-la no JSON portátil.

## Observação sobre vídeos do YouTube

A Busca na web é útil para páginas públicas, mas não garante acesso à transcrição completa de todo vídeo. Se a transcrição não puder ser lida, o GPT deve pedir que o aluno a cole ou envie; não deve inventar etapas.
