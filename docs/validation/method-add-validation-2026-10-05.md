# Inclusão de VALIDAR no editor de Método

## Causa e histórico

O editor cria o novo Bloco com `validation.targetBlockId: ""` para permitir a seleção explícita de uma ação anterior. `saveBlocks` chama `rememberMethodDraft` antes de atualizar o estado visual. A checagem `methodNeedsUpgrade` rejeitava esse estado e lançava a mensagem de migração; o Bloco não chegava ao canvas nem ao diálogo.

A proteção foi introduzida em `b274d99f` (01/10/2026), incluído desde a tag v1.3.1. O schema estrito exige alvo não vazio. Em `70340d1e`, a distinção de workspace passou a aceitar entradas sem origem preenchida, mas não o alvo de VALIDAR.

## Correção

`workspaceMethodV3Schema` aceita o alvo vazio como configuração pendente. Reutiliza todos os demais campos e restrições do schema canônico. O parser de execução/exportação e o endpoint de gravação continuam estritos; a validação sem alvo não se torna executável e nenhum alvo é inferido.

A repetição vertical detectou ainda que a inicialização do editor podia substituir o rascunho recuperado pela definição persistida. A segunda passagem do efeito de carregamento já encontrava `loadedProcessRef` preenchido, mas ainda observava `isDirty: false`; assim ignorava o rascunho. O efeito agora consulta o rascunho em toda carga elegível, mantendo a proteção de edições em memória. A regressão confere que os dois Blocos permanecem no storage local e no canvas após a recarga.

A regressão de contrato cobre workspace, classificação v3, diagnóstico de configuração, bloqueio de execução/exportação e rejeição de contratos anteriores/modos inválidos. A regressão de interface cobre clique → diálogo → recuperação de rascunho local → escolha explícita → API real → reabertura, em PT-BR, inglês e espanhol, sobre uma base temporária.

## Evidências e limites

- Antes: o teste de contrato falhou na aceitação do rascunho; o teste de interface em PT-BR reproduziu a exceção de migração em `rememberMethodDraft`, sem abrir diálogo.
- Depois: 15 testes de contrato/referências passaram; typecheck e lint dos arquivos alterados passaram; 34 testes de internacionalização passaram.
- Repetição final da interface: os três testes passaram em PT-BR, inglês e espanhol, incluindo preservação do rascunho, seleção do alvo, salvamento e reabertura. Nenhuma exceção de página ocorreu. O log de desenvolvimento registrou um fetch interrompido durante a recarga, sem impedir o cenário.
- Análise estática do editor passou com a regra de formatação desabilitada, devido à formatação preexistente do arquivo; nos demais arquivos de código/testes alterados, o lint padrão e Prettier passaram.

O Dev Monitor não cobre o renderer deste cenário. A prova vertical usa Playwright, a interface e a API reais, sem dados privados nem plugins externos. Skills de desenvolvimento e de Métodos, incluindo referências, continuam coerentes com a distinção entre rascunho de edição e contrato executável; não exigem alteração. Nenhuma versão, tag ou release é criada por esta correção local.
