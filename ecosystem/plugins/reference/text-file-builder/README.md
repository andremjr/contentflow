# Construtor de Arquivo de Texto

Plugin local da ContentFlow Plugin API v1 que consolida entradas de blocos anteriores em um único
artefato `.md` ou `.txt`. O arquivo pode ser conectado a uma porta de anexos de outro plugin, evitando
repetir contextos extensos dentro do prompt.

O plugin não envia dados a terceiros. Ele somente grava o conteúdo recebido no workspace autorizado
da execução e devolve uma referência `artifact://`.
