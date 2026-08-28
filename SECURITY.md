# Política de segurança

## Reporte vulnerabilidades de forma privada

Não abra uma issue pública para vulnerabilidades ainda não corrigidas. Use **Security > Report a vulnerability** no repositório GitHub do ContentFlow para enviar o relato por GitHub Private Vulnerability Reporting.

Inclua, quando possível:

- versão/commit afetado;
- descrição e impacto;
- passos mínimos de reprodução;
- evidências sem dados pessoais ou secrets;
- mitigação sugerida.

Não inclua credenciais reais, conteúdo privado de usuários ou dados obtidos sem autorização. Aguarde a correção coordenada antes de divulgar detalhes exploráveis.

## Escopo

São prioritários: isolamento de plugins, execução de código, travessia de caminhos, SSRF, vazamento de secrets, autenticação, exposição entre canais/projetos, instalação de pacotes, artifacts maliciosos e ações externas sem consentimento.

Pesquisa de boa-fé não autoriza indisponibilidade deliberada, engenharia social, acesso persistente, alteração de dados de terceiros ou testes em sistemas que não pertencem ao pesquisador.

## Processo esperado

O projeto buscará confirmar o recebimento, reproduzir o problema, avaliar severidade, preparar correção e coordenar a divulgação. Prazos dependem da complexidade e do estágio do produto; o relator será atualizado quando houver mudança material.

Para o modelo completo de ameaças de plugins, consulte [`ecosystem/docs/security.md`](ecosystem/docs/security.md).
