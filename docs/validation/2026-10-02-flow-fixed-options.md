# Flow — opções fixas e concorrência de imagens

Correção local solicitada pelo criador. Não houve incremento de versão, commit de release, tag, pacote publicado ou execução de GitHub Actions.

## Alterações

- O plugin deixou de declarar providers de opções de modelo e removeu a descoberta que abria Chrome ao configurar o Bloco. Modelos conhecidos ficam no manifesto e mudam por manutenção explícita do plugin.
- Rótulos manuais já persistidos continuam aceitos; seus campos ficam na seção avançada. A lista fixa de vídeo inclui Omni Flash e Veo 3.1 - Lite [Lower Priority], conforme o bundle fornecido como referência.
- Concorrência de imagens apresenta números de 1 a 5; variantes por prompt apresentam 1 a 4. O renderer não transforma números ou texto livre em uma seleção indisponível só porque possuem valor salvo.
- A execução de imagens usa o limite selecionado. O lock protege somente a caixa, as referências e o vínculo da submissão à requisição; a espera pela geração ocorre fora dele. Cada resposta é resolvida pelo request ID, preservando a unidade e a ordem original.
- O modo concorrente não usa a descoberta genérica de novas imagens pelo DOM. Retomada com efeito incerto não atribui resultados por posição e não recarrega a sessão enquanto outras gerações podem estar em andamento.

## Evidência aprovada

- Inspeção no editor real do Método: lista 1–5, seleção salva 2 preservada, variantes numéricas, campos numéricos editáveis e ausência de botão/estado de carregamento de modelos. Evidência visual local: `.tmp/flow-static-options/interface.png`. Nenhuma configuração do Método foi aplicada nesta inspeção.
- `npm run plugin:kit -- check ecosystem/plugins/reference/google-flow-browser-images`: manifesto, contrato e sandbox aprovados.
- `npm run plugin:kit -- test-contract ecosystem/plugins/reference/google-flow-browser-images`: aprovado no estado final.
- Suite do plugin: aprovada, incluindo limites 1–5 com submissões simultâneas, conclusão reversa, ordem das entregas, vínculo por request ID e cancelamento.
- `npm run test:i18n`: 28 testes aprovados, incluindo opções e ajuda do Flow em PT-BR, inglês e espanhol.
- Suites de formulário declarativo, opções, Flow v62 e sessão contínua v88: 13 testes aprovados.
- ESLint dos arquivos TypeScript/TSX alterados, `npm run typecheck`, `npm run build` e verificação de whitespace: aprovados.

## Limite da validação real

Foi iniciado um projeto de teste separado com cinco prompts distintos, concorrência 5 e o perfil já vinculado `flow-e2e`. Execução: `p14-flow-exec-1790974179217-21c13a`; projeto: `p14-flow-project-1790974179217-21c13a`.

O Core criou cinco unidades, mas a execução terminou em `BRIDGE_INCOMPATIBLE` durante a negociação com a extensão instalada, antes de enviar prompts. Foram preservados o projeto e as unidades para diagnóstico. A geração concorrente no Google Flow autenticado **não foi validada de ponta a ponta**. Os testes de rastreador/fila não substituem essa prova; não há recomendação de release.

O Dev Monitor atual não cobre esse cenário de renderer e provedor autenticado. Não foi utilizado um cenário aproximado como PASS. Contratos universais e skills aplicáveis foram auditados: a mudança permanece no plugin e no renderer genérico; as orientações existentes continuam coerentes e não exigiram alteração.
