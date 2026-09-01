# Referência: distribuição e governança

Leia quando o plugin estiver pronto para compartilhar, publicar, atualizar, remover ou classificar em catálogo.

## Pacote de distribuição

Inclua `contentflow.plugin.json`, entrypoint/build, dependências de runtime, `README.md`, `LICENSE`, testes e fixtures relevantes. Documente versão do ContentFlow testada, Node/runtime, capabilities, blocos/processos, portas, permissões, secrets, providers, dados transmitidos, custos, limites, efeitos, suporte, proveniência, licenças de mídia e revogação de credenciais.

O pacote não deve mudar sob o mesmo número de versão. Qualquer alteração de conteúdo exige nova versão e novo hash.

## Instalação

O usuário escolhe uma pasta e pode usar **Instalar uma cópia** ou **Usar pasta ao vivo**. A primeira aceita uma pasta de plugin ou uma raiz com várias subpastas de plugins: o lote inteiro é validado antes da cópia, falha atomicamente e nunca sobrescreve versão existente. O gerenciador valida estrutura, manifesto, runtime, entrypoint, integridade, branding, permissões, settings e secrets antes de executar. O consentimento mostra autor, versão, permissões, efeitos, providers, custos e dados.

Quando houver `branding.iconPath`, inclua o PNG/WebP local no pacote e documente sua licença/proveniência. O ícone não pode usar favicon remoto, imitar a marca do ContentFlow ou sugerir endosso inexistente.

## Atualização

Validar compatibilidade antes de substituir. Exigir novo consentimento quando permissões, providers, efeitos, finalidade ou custo mudarem significativamente. Manter a versão anterior até a nova passar nos testes. Jobs em andamento permanecem associados à versão que os iniciou.

## Remoção

Bloquear novas seleções, mas preservar outputs já produzidos. Informar Métodos dependentes. Remover settings e secrets somente após confirmação explícita e orientar revogação no provider.

## Categorias de confiança

| Categoria | Significado |
| --- | --- |
| `reference` | Publicado como exemplo ou ponto de partida, sem promessa implícita de suporte contínuo. |
| `verified` | Identidade, pacote e requisitos mínimos revisados. |
| `community` | Distribuído pelo autor sem revisão integral do projeto. |
| `private` | Instalado pelo usuário/organização fora do catálogo público. |

Categorias não são níveis de permissão. `verified` não garante ausência absoluta de falhas, qualidade de outputs, disponibilidade do provider ou adequação jurídica.

## Compatibilidade e ausência

O Método deve salvar `pluginId`, `pluginVersion`, `capabilityId`, configuração e bindings. O snapshot registra hash e `apiVersion`. Não substitua silenciosamente uma versão exata ausente por outra. Plugin ausente, incompatível, desativado ou bloqueado deve gerar `blocked_executor`, nunca sucesso fictício.

Plugins podem ser gratuitos, pagos, proprietários ou open source conforme sua licença própria, desde que sejam integrações independentes sobre o protocolo público. Não incorpore código protegido do núcleo nem apresente o pacote como clone, rebranding ou substituto do ContentFlow.

Fonte: [distribution.md](https://github.com/andremjr/contentflow/blob/main/ecosystem/docs/distribution.md).
