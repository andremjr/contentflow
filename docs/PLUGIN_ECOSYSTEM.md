# Governança do ecossistema de plugins

Este documento define como plugins podem ser publicados, encontrados, avaliados, atualizados e removidos do ecossistema do ContentFlow OS. O contrato técnico está em [`PLUGIN_PROTOCOL.md`](PLUGIN_PROTOCOL.md), e a segurança operacional em [`PLUGIN_SECURITY.md`](PLUGIN_SECURITY.md).

## 1. Princípios

O ecossistema existe para ampliar a execução dos Métodos sem transformar cada integração em código do núcleo. Ele segue cinco princípios:

1. **Extensão, não clonagem:** integrações independentes conectam-se pelo protocolo; não copiam nem rebatizam o produto principal.
2. **Escolha informada:** permissões, provedores, custos, efeitos e política de dados aparecem antes da instalação e do uso.
3. **Interoperabilidade:** capacidades pequenas usam blocos e formatos universais, sem controlar o fluxo por fora do Método.
4. **Responsabilidade identificável:** cada pacote possui autor, licença, origem, suporte, versão e hash.
5. **Segurança proporcional:** origem confiável não substitui sandbox, validação ou consentimento.

## 2. Categorias do catálogo

| Categoria   | Responsabilidade                                                   | Indicação visual |
| ----------- | ------------------------------------------------------------------ | ---------------- |
| `official`  | Mantido, assinado e suportado pelo ContentFlow OS.                 | Oficial          |
| `verified`  | Autor e pacote revisados contra requisitos publicados.             | Verificado       |
| `community` | Distribuído pelo autor, sem revisão integral do projeto.           | Comunidade       |
| `private`   | Instalado localmente ou por organização, fora do catálogo público. | Privado          |

“Verificado” confirma identidade/origem e uma revisão limitada; não garante disponibilidade do provedor, qualidade de outputs, adequação jurídica ou ausência absoluta de vulnerabilidades.

## 3. Identidade e namespace

- `plugin.id` usa domínio reverso sob controle do publicador.
- Transferência de namespace exige confirmação do titular anterior e do novo.
- Nome e ícone não podem causar confusão com o ContentFlow OS ou outro publicador.
- Pacotes oficiais usam namespace reservado pelo projeto.
- `capability.id` é permanente dentro do plugin.
- Versões seguem SemVer e cada artefato publicado é imutável.
- O catálogo guarda URL de origem, hash, assinatura quando disponível e data de publicação.

Typosquatting, nomes enganosos, falsos selos, métricas manipuladas e impersonação justificam rejeição ou remoção.

## 4. Licenças e modelo comercial

Um plugin independente pode ser gratuito, pago, proprietário ou de código aberto. O pacote inclui sua própria licença e deixa claro:

- direitos de uso, distribuição e modificação;
- preço do plugin e custos de provedores externos;
- necessidade de conta ou assinatura;
- suporte, atualizações e política de reembolso quando aplicável;
- licenças de dependências e assets distribuídos.

A licença do plugin não se estende ao núcleo. A exceção de desenvolvimento de plugins está no [`LICENSE`](../LICENSE): ela permite integração pelo protocolo documentado, mas não copiar implementação protegida, criar clone, edição white-label, rebranding ou reskin do ContentFlow OS.

## 5. Página obrigatória do plugin

Antes da instalação, o usuário deve conseguir avaliar:

- nome, descrição, autor e categoria;
- versão, compatibilidade, data e histórico de mudanças;
- licença, repositório/homepage e canal de suporte;
- capacidades, blocos, processos e formatos suportados;
- permissões e justificativa de cada uma;
- efeitos externos, inclusive publicação ou escrita remota;
- secrets/settings necessários;
- provedores que recebem dados;
- políticas de retenção e uso para treinamento;
- custos, unidades, limites e possibilidade de estimativa;
- restrições geográficas, de conta ou de conteúdo;
- práticas de proveniência/licenciamento de mídia;
- status de segurança, revogações e auditorias publicadas.

Informações materiais não podem ficar apenas em link externo ou texto genérico.

## 6. Fluxo de submissão

1. O autor reserva ou comprova o namespace.
2. Envia pacote imutável, manifesto, licença, README, changelog e informações de suporte/segurança.
3. Automação valida estrutura, schemas, dependências, malware conhecido, secrets acidentais e contrato.
4. Testes de conformidade executam fixtures de sucesso, erro, cancelamento, idempotência e formatos declarados.
5. Revisão verifica permissões, efeitos, dados, custos, claims e experiência de consentimento.
6. Para `verified`, identidade e controle do repositório/domínio são confirmados.
7. O catálogo publica metadados, hash e resultado da revisão.

Revisão pode pedir escopo menor, documentação adicional ou correção. Rejeições devem indicar a regra violada e oferecer recurso.

## 7. Critérios mínimos de aceitação

- manifesto e pacote conformes à API suportada;
- capacidade atômica, sem reimplementar o orquestrador;
- permissões mínimas e efeitos completos;
- secrets fora do pacote;
- política de dados e provedores coerentes com o tráfego observado;
- erros, timeout, cancelamento e idempotência tratados;
- artifacts e mídia com limites e proveniência quando disponível;
- licença compatível com dependências distribuídas;
- documentação suficiente para configuração, custo e suporte;
- ausência de comportamento oculto, telemetria não declarada ou conteúdo enganoso;
- respeito à licença e às marcas do ContentFlow OS.

## 8. Qualidade e verificação contínua

O catálogo pode apresentar sinais separados, sem combiná-los em uma falsa nota única:

- identidade verificada;
- pacote assinado;
- testes de conformidade aprovados;
- última revisão de segurança;
- manutenção recente;
- compatibilidade confirmada;
- taxa de falha observada com consentimento e dados agregados;
- documentação e suporte disponíveis.

Downloads e avaliações não substituem segurança. Métricas suspeitas podem ser removidas ou investigadas.

## 9. Atualizações e consentimento

Atualizações automáticas só são elegíveis quando:

- mantêm compatibilidade declarada;
- não ampliam permissões, efeitos, providers ou finalidade dos dados;
- não mudam licença ou cobrança materialmente;
- passam pelos mesmos checks de integridade.

Qualquer mudança material exige tela de comparação e novo consentimento. Execuções em andamento permanecem na versão do snapshot. Rollback conserva a versão anterior até a nova concluir health check.

## 10. Descontinuação, remoção e revogação

### Descontinuação normal

O autor informa prazo, motivo, substituto e impacto. Novos usos podem ser bloqueados depois do prazo, mas Métodos existentes continuam identificáveis e outputs permanecem acessíveis.

### Remoção do catálogo

Pode ocorrer por abandono, informações enganosas, violação de políticas, disputa de propriedade intelectual ou incompatibilidade persistente. O autor recebe motivo e canal de recurso quando isso não aumentar risco.

### Revogação de segurança

Malware, exfiltração, credencial comprometida ou risco grave permitem bloqueio imediato. Usuários afetados recebem orientação sobre versão, período, rotação de credenciais e alternativas. O histórico não é apagado silenciosamente.

## 11. Vulnerabilidades e resposta

Autores mantêm um canal privado de segurança e respondem dentro do prazo divulgado. Relatos coordenados seguem [`../SECURITY.md`](../SECURITY.md). O ContentFlow OS pode compartilhar detalhes mínimos com o autor, reservar identificador, preparar correção e publicar advisory depois da mitigação.

Retaliação contra pesquisa de boa-fé, dentro do escopo autorizado, é incompatível com o ecossistema. Pesquisa não autoriza acesso a dados de terceiros, interrupção de serviço ou divulgação prematura.

## 12. Plugins oficiais e independência do núcleo

Plugins oficiais também obedecem ao protocolo público, permissões, isolamento, versionamento e disclosure. Funcionalidades que pertencem ao domínio — processos, blocos, operadores, execução, persistência e consentimento — continuam no núcleo. Integrações com modelos, provedores, APIs, renderizadores e automações ficam em plugins sempre que possível.

Plugins não podem importar módulos privados do aplicativo, escrever no banco ou depender da interface React. Isso permite evoluir o núcleo sem quebrar o ecossistema e impede vantagens ocultas aos plugins oficiais.

## 13. Checklist do publicador

- [ ] Namespace e identidade são legítimos.
- [ ] Licença e modelo comercial estão claros.
- [ ] Pacote é reproduzível, imutável e sem secrets.
- [ ] Capacidades são pequenas e usam o contrato universal.
- [ ] Permissões, efeitos, custos e dados estão completos.
- [ ] README cobre instalação, limites, suporte e privacidade.
- [ ] Testes de contrato e segurança foram executados.
- [ ] Dependências e proveniência foram revisadas.
- [ ] Changelog e política de descontinuação existem.
- [ ] Canal privado de vulnerabilidades está ativo.
- [ ] Nome, marketing e código respeitam a licença e as marcas do ContentFlow OS.
