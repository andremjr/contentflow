# Validação local — 02/10/2026

Varredura motivada pela quebra ao abrir o canal Gerar Imagens Flow e por bloqueios de recuperação. Alterações locais anteriores foram preservadas. Não houve publicação, incremento de versão ou alteração deliberada dos projetos do usuário.

Correções verificadas:

- Projetos sem responsável, com responsável nulo ou com campos inválidos deixam de derrubar cards e lista. A normalização ocorre na leitura; projetos válidos conservam a mesma referência.
- Jobs atuais podem ser recuperados independentemente de jobs históricos. A regressão verifica que a linha histórica permanece intacta.
- O planejamento de migração preserva Métodos v3 atuais, sem reinterpretar parâmetros ou shapes pelos bindings. Rascunhos com origem ainda não escolhida permanecem editáveis; execução e exportação exigem referências completas.
- `ESCOLHER` materializa `selectedItemId` como controle `identifier`, coerente com o contrato do Bloco. A escolha não produz uma exigência de migração antes do comando seguinte.
- Reservas físicas já expiradas são limpas na inicialização mesmo quando há migração pendente. Reservas vigentes e efeitos externos não são repetidos por essa limpeza.
- Foram corrigidas fixtures de plugins sem API v2, expectativas antigas de compatibilidade e a simulação do upload de referência do Flow.

Validações executadas:

- Lint, typecheck e build aprovados. A última alteração na fixture do Flow recebeu lint separado após formatação.
- Suites de `npm run check` executadas em etapas. Quando uma falha interrompeu a sequência, a causa foi investigada, o teste pertinente foi repetido e a sequência retomada. Não se trata de uma execução única limpa do comando.
- Interface: 33 cenários aprovados na rodada completa e o cenário restante de adicionar/renomear/remover entrada aprovado após a correção, totalizando os 34 cenários exercitados.
- Canal com responsáveis incompletos validado em português, inglês e espanhol, nos modos cards e lista.
- Migração: oito testes aprovados, incluindo preservação de Métodos atuais e falhas/backup da conversão antiga. Contratos e rascunhos: seis testes aprovados.
- Importação entre instalações isoladas: item e arquivo copiados, projeto iniciado, escolha aceita e processo concluído; verificações intermediárias demonstram ausência de migração espúria.
- Entregas e histórico: 22 testes aprovados. Fallback/retomada: 37 testes aprovados.
- Fixture 1.2.1: abertura e reinício reais da API aprovados com preservação dos dados esperados. Esse cenário controlado não equivale a uma atualização completa da instalação do usuário.
- No preview real, o canal voltou a abrir e apresentar seus dois projetos, sem a exceção do responsável.

Uma medição local leu aproximadamente 3,4 MB no estado completo e 0,68 MB no endpoint de uma execução. Sem mudança de revisão, a consulta retornou HTTP 204 sem corpo. Isso descreve tráfego dessa base, não um benchmark de CPU/RAM em computador antigo.

Limites: as duas execuções antigas com erro continuam preservadas. Não foi validada nesta varredura a geração completa no Flow autenticado, nem desempenho em hardware antigo. Testes de Bridge e plugins com simulações não comprovam DOM, login, cotas e efeitos externos reais. Não há garantia de ausência absoluta de falhas nem recomendação de release.
