# Da automação externa ao plugin

Leia antes de adaptar extensões, scripts, fluxos n8n/Make ou serviços que agrupem
várias ações. A automação original é referência de funcionalidade, não definição
das responsabilidades do ContentFlow.

## Inventariar além do botão

Identifique o trabalho manual antes/depois da automação, suas transformações,
intermediários, decisões e efeitos externos. Um campo de prompts pode pressupor
que o usuário já extraiu personagens, gerou referências e marcou as associações.
Um endpoint de roteiro pode esconder pesquisa, outline, distribuição de fontes,
redação e inserção de CTAs.

Confira quais operações o código realmente suporta. Não deduza suporte pela
interface, por um nome de opção ou por relatos de sucesso em outro aplicativo.
Ter uma extensão validada não comprova a integração automatizada no ContentFlow.

## Redistribuir antes de portar

| Responsabilidade encontrada | Destino |
| --- | --- |
| Estratégia, sequência, conexão de entregas e intervenção editorial | Método e seus Blocos |
| Decidir personagens por cena, fontes por seção ou posição de CTAs | Operador da etapa produtora da associação |
| Identidade/proveniência dos itens, execução, distribuição, perfis, leases e política de recovery | Core, pelos contratos e serviços atuais |
| Receber associações, convertê-las no formato do fornecedor, anexar, gerar e interpretar resultados | Capability do plugin |
| Transporte e operações universais autorizadas de navegador | Browser Bridge; seletores e semântica do fornecedor ficam no plugin |

Um plugin de IA pode produzir associações quando essa é a capability escolhida
para aquele Bloco. Isso não autoriza um plugin consumidor a decidir silenciosamente
o conteúdo das associações ou controlar as etapas anteriores.

## Projetar capabilities que permitam composição

Quando um intermediário tiver valor próprio para revisão, conexão, troca de
operador ou reutilização, exponha capabilities/portas que permitam produzi-lo e
consumi-lo separadamente. Não obrigue o Método a usar um modo combinado que o
esconda. Operações técnicas da mesma entrega podem permanecer internas; não crie
uma capability por clique, item, tentativa ou perfil.

Declare entradas semânticas e configurações para a ação da capability. A interface
funcional é declarada pelo plugin; só a moldura e os componentes de renderização
são padronizados pelo núcleo. Detalhes de serialização ficam internos/avançados
quando não ajudam o usuário a decidir o trabalho. Não prometa UI ou controles
que o schema/renderer atual não suporta.

Quando houver marcação externa por tags, números ou nomes, documente seu papel:
legibilidade e formato da ferramenta não substituem IDs canônicos. O produtor
pode gerar texto JSON com associações a partir de IDs concedidos; o consumidor
valida seu formato, resolve referências e traduz para tags, menções ou anexos.
Não associe por ordem, nome de arquivo ou heurística quando a identidade é exigida.
Não invente IDs universais nem faça o Core interpretar esse texto.

Mudanças contratuais seguem as regras de versionamento da skill e da API viva.
Se o contrato necessário não existir, registre a lacuna e o impacto antes de
implementá-lo. Um port não disponível ou um formato não aceito não pode ser
substituído por coerção silenciosa.

## Cenário vertical e limites

Use um Método que invoque separadamente as ações que terão entregas independentes.
Confira configuração, entradas concedidas, tradução para o fornecedor, artifacts
retornados e proveniência. Verifique erros de associação antes de efeitos externos
quando possível. Para falhas após envio, reporte fatos de reconciliação: política
de retry/fallback e preservação do progresso continua no Core.

Confirme que não é necessário preparar manualmente fora do Método um material que
o fluxo prometia produzir. Valide intervenções e retomada conforme o cenário
autorizado. Contrato/sandbox e sucesso da automação original são evidências parciais;
o teste no fornecedor é separado. Não declare aprovação real quando foi omitido
ou não autorizado.

Fontes: documentação atual de arquitetura, conteúdo, interface do plugin e
desenvolvimento; fora do checkout, siga `references/documentation.md` da skill.
