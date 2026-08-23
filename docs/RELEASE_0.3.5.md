# ContentFlow OS v0.3.5

## Destaques

- Histórico do Canal como origem explícita e tipada de inputs entre Projetos.
- Contexto opcional exclusivamente para `ESCOLHER`, aplicado antes da decisão e sem dar acesso alternativo à Biblioteca Estratégica.
- Escolhas de itens estratégicos agora são entregas universais e podem orientar produções futuras.
- Filtros por últimas 1–100 decisões concluídas ou somente Projetos publicados.
- Isolamento por Canal, exclusão do Projeto atual e histórico vazio válido para a primeira produção.
- Memória equivalente aos Projetos existentes: ao excluir um Projeto, suas execuções e entregas deixam automaticamente o histórico, sem tela de gerenciamento separada.
- Validação de compatibilidade impede ligar o histórico a plugins que não aceitam `records`.

## Arquitetura da memória

A Biblioteca Estratégica continua exclusiva do bloco `ESCOLHER`. O Histórico é derivado dos snapshots e entregas já persistidos, sem nova tabela ou cópia paralela. O Método escolhe qual entrega consultar e a janela; a regra editorial permanece nas instruções para Humano/IA ou na configuração do plugin de Código.

Retries invalidados e execuções canceladas não participam do histórico. Plugins recebem apenas o histórico conectado explicitamente ao bloco e continuam sem acesso direto ao SQLite.

## Compatibilidade

- Métodos existentes continuam válidos e funcionam sem memória quando não declaram `channel_history`.
- Plugin API permanece na versão `1`; o histórico chega como input universal `records`.
- Escolhas antigas são normalizadas como entregas a partir dos snapshots existentes, sem migração de banco.

## Arquivos da Release

- `ContentFlow-OS-V0-0.3.5-x64-Setup.exe` — instalador recomendado.
- `ContentFlow-OS-V0-0.3.5-x64-Portable.exe` — execução portátil.
- `ContentFlow-OS-V0-0.3.5-SHA256.txt` — hashes SHA-256 dos executáveis.
