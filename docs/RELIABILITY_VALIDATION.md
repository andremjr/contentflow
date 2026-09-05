# Validação de confiabilidade

## Verificação automatizada

Execute `npm ci`, `npx playwright install chromium` e `npm run release:verify`.
Esse comando verifica código, contratos, integrações, build e interação no navegador.
O workflow de release também exige os testes E2E antes de publicar artefatos.

Os testes em `tests/e2e` iniciam sua própria API e interface nas portas 8895 e 8095,
com banco temporário separado. Não usam os canais, perfis de navegador ou credenciais
do usuário. A imagem pequena utilizada nesses testes é uma fixture, não uma imagem
gerada por um provedor. Os cenários de falha controlada ficam exclusivamente nesse
ambiente isolado.

O relatório fica em `playwright-report`; falhas preservam screenshot e trace em
`test-results`. Uma execução automatizada aprovada não comprova o funcionamento
das interfaces externas dos provedores.

## Validação real antes de solicitar publicação

1. Usar um projeto de um único canal, com os Métodos e plugins reais configurados.
2. Executar Tema, depois Título e depois Thumbnail, cumprindo as ações humanas.
3. Conferir a imagem real salva e exibida no aplicativo, bem como as três entregas.
4. Só depois passar ao próximo canal. Não provocar erros, disputar perfis ou
   executar canais em paralelo nessa validação.
5. Registrar projetos, resultados e qualquer falha ou intervenção necessária.
   Uma retomada bem-sucedida não deve ser apresentada como uma execução sem falhas.

Não substituir etapas por resultados inseridos diretamente no banco nem contornar
autenticação, CAPTCHA, limites do provedor ou aprovações humanas do Método.

Concluir implementação e testes não autoriza incrementar versão, criar commit de
release, tag ou publicar. Apresentar as evidências do cenário real e obter autorização
explícita para aquele conjunto exato de mudanças, conforme `AGENTS.md`.
