# Documentação standalone — alvo ContentFlow 1.3.1

Instale/atualize a pasta inteira da skill, incluindo `docs/`, templates e referências. Substitua a instalação antiga para não misturar versões. O pacote contém cópias geradas das fontes normativas, não código do Core nem validadores executáveis.

## Fora do checkout

Na pasta extraída, confira `DOCUMENTATION.json`: versão alvo `1.3.1`, ref `v1.3.1`, commit de origem, indicação de alterações locais e hashes das fontes e cópias empacotadas. Leia, nesta ordem:

1. [Guardrail development-contentflow](../guardrails/development-contentflow/SKILL.md), [Licença](../LICENSE), [política de IA](../AI_USAGE_POLICY.md) e [instruções do projeto](../AGENTS.md).
2. [Arquitetura](../docs/ARCHITECTURE.md) e [contrato canônico de conteúdo](../docs/CONTENT_CONTRACT.md).
3. [Guia de migração 1.3.1](../docs/UPGRADE_GUIDE_1_3_1.md), [estado e limites](../docs/CURRENT_STATE.md) e [processo vigente](../docs/DEVELOPMENT.md).
4. Para plugins, [protocolo API v2](../docs/ecosystem/protocol.md), [schema](../docs/ecosystem/schemas/contentflow-plugin-v2.schema.json), [desenvolvimento](../docs/ecosystem/development.md), [segurança](../docs/ecosystem/security.md) e [automação de navegador](../docs/ecosystem/browser-automation.md).

Esses caminhos são relativos a esta referência no ZIP instalado. Na árvore canônica do checkout, as cópias `docs/` ainda não existem: o empacotador as gera diretamente da documentação na raiz do repositório. Use ali as fontes vivas, sem criar espelho documental manual.

## Referências por versão

A [documentação pública v1.3.1](https://github.com/andremjr/contentflow/tree/v1.3.1/docs) é a alternativa quando o pacote não está extraído. A tag pode ainda não estar publicada: nesse caso use a documentação incluída, informe o limite e não troque silenciosamente para `main`. Links de código/histórico não incluído também apontam ao ref da versão e requerem acesso online depois da publicação.

O snapshot identifica a versão documental alvo, não afirma que o aplicativo ou plugin foi testado/publicado nessa versão. Confira a versão instalada e a versão efetivamente usada nos testes. Se divergir, obtenha o pacote correspondente antes de concluir compatibilidade. CURRENT_STATE.md é observacional e pode registrar uma versão anterior do core; o manifesto avisa quando diverge do alvo. Auditorias e histórico não integram o pacote normativo. O padrão do empacotador usa package.json após o bump de release; --docs-version=1.3.1 prepara este alvo sem incrementar o aplicativo.

## Validação e migração

Siga o guia incluído: inventário → backup consistente e restauração ensaiada → conversão explícita em cópia → validadores reais → importação e cenário real → comparação dos dados preservados. Não migre snapshots históricos nem adapte Método v1/v2 ou API v1 no runtime. Mudança de shape/porta do plugin exige nova major e revisão explícita dos Métodos consumidores.

O JSON Schema e os templates ajudam a revisar o contrato; não equivalem a `parseMethodFile`/`parseMethodImportFile`, `validatePluginDirectory`, Plugin Kit ou aceitação no aplicativo. Sem essas ferramentas, registre **validação pendente** e identifique o arquivo e as verificações faltantes. Não invente um comando standalone de validação que a skill não fornece.
