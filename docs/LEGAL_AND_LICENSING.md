# Proteção jurídica e licenciamento

Este documento explica a intenção da licença do ContentFlow OS. Ele não substitui assessoria jurídica.

## Modelo adotado

O ContentFlow OS é **source-available proprietário**, não open source. O código pode ser lido e o aplicativo original pode ser usado nos limites da licença, mas não há autorização pública para distribuir versões modificadas, clones, derivados concorrentes, white-label, rebranding ou reskins.

A exceção central permite desenvolver e comercializar plugins independentes que utilizem o protocolo público sem incorporar o código do núcleo. Isso direciona extensões para um ecossistema interoperável em vez de incentivar cópias da ferramenta.

Licenças consideradas open source precisam permitir modificações e obras derivadas. Como essa liberdade conflita com a proibição expressa de clones e derivados concorrentes, o projeto não deve ser anunciado como open source. Consulte a [Open Source Definition](https://opensource.org/osd).

## O que a licença protege

- Código-fonte e código-objeto original.
- Documentação, textos, diagramas e schemas originais.
- Seleção, organização e expressão original da arquitetura.
- Implementação das interfaces e experiência visual.
- Direitos reservados sobre nome, identidade e sinais distintivos.
- Relação contratual com pessoas que usam as permissões concedidas pela licença.

## Limite importante sobre “o método”

A licença proíbe seus licenciados de usar o código e a documentação protegidos para criar clones ou derivados concorrentes. Entretanto, direito autoral não concede exclusividade sobre ideias, procedimentos, sistemas ou métodos abstratos como tais. A Lei brasileira nº 9.610/1998 exclui ideias, sistemas e métodos da proteção autoral; a proteção recai sobre a expressão concreta e o programa. Consulte a [Lei nº 9.610/1998](https://planalto.gov.br/ccivil_03/leis/l9610.htm) e as [perguntas frequentes do INPI sobre software](https://www.gov.br/inpi/pt-br/acesso-a-informacao/perguntas-frequentes/programas-de-computador).

Isso significa que a combinação prática recomendada é:

1. licença contratual restritiva para o código e a documentação;
2. registro das versões relevantes do software;
3. registro da marca `ContentFlow OS` e identidade visual;
4. preservação de histórico, hashes, commits e provas de autoria;
5. avaliação jurídica específica sobre outros mecanismos de proteção, quando cabíveis.

## Registro do software

A proteção autoral do programa independe de registro, mas o registro pode fortalecer a prova de autoria e titularidade. A Lei nº 9.609/1998 protege programas de computador e o INPI oferece registro eletrônico com hash da documentação técnica. Consulte a [Lei de Software](https://www.planalto.gov.br/ccivil_03/leis/l9609.htm) e o [guia do INPI](https://www.gov.br/inpi/pt-br/assuntos/programas-de-computador).

Recomenda-se registrar versões estáveis relevantes e preservar exatamente os arquivos usados para gerar cada hash.

## Marca

O direito autoral não protege adequadamente um nome isolado. Para exclusividade sobre `ContentFlow OS`, logo e sinais associados, avalie o registro de marca no INPI. O próprio INPI informa que a exclusividade sobre a marca depende de registro. Consulte o [guia básico de marcas](https://www.gov.br/inpi/pt-br/servicos/marcas/guia-basico/guia-basico).

## Repositório público e forks

Pelos termos do GitHub, um repositório público pode ser visualizado e reproduzido por meio da funcionalidade de fork. Isso não concede automaticamente direitos mais amplos de modificação, distribuição, exploração comercial ou criação de derivados fora das permissões da licença. Consulte os [Termos de Serviço do GitHub](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service) e sua [orientação sobre licenciamento](https://docs.github.com/en/enterprise-cloud%40latest/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository).

Se a mera disponibilidade pública do código se tornar um risco incompatível com a estratégia comercial, a medida técnica mais forte é tornar o núcleo privado e publicar apenas SDK, protocolo e exemplos necessários para plugins.

## Inteligência artificial

Ferramentas de IA não recebem direitos adicionais. A pessoa ou empresa que direciona a ferramenta continua responsável pelo uso e pelos resultados. A licença permite IA para plugins, segurança, operação autorizada e contribuições; proíbe utilizá-la como intermediária para gerar clones, reimplementações, rebranding ou reskins não autorizados.

O arquivo [`AI_USAGE_POLICY.md`](../AI_USAGE_POLICY.md), as instruções de agentes e as instruções do GitHub Copilot aumentam a chance de ferramentas automáticas alertarem seus usuários. Nenhum arquivo técnico consegue garantir o comportamento de toda IA, especialmente porque um operador de fork pode removê-lo. A proteção jurídica continua sendo a licença e a legislação aplicável.

## Revisão profissional recomendada

Antes de licenciar comercialmente, receber contribuições externas relevantes ou agir contra um infrator, recomenda-se revisão por advogado brasileiro especializado em software, contratos e propriedade intelectual. A revisão deve confirmar especialmente titularidade, foro, política de contribuições, marca, tratamento internacional e compatibilidade com contratos futuros.
