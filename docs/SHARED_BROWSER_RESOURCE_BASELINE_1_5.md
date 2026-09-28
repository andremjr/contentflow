# Linha de base de recursos — pacote 1.5

Data da coleta: 2026-09-26.

Esta linha de base mede o estado atual antes de qualquer migração para perfis globais. O benchmark usa somente dados, workspaces e perfis temporários. Nenhuma sessão real, cookie, credencial ou perfil persistente do usuário participa da coleta.

## Ambiente

- Windows.
- Node.js 26.
- Chrome 153.0.8010.54.
- Branch medida: `main`.

Os valores são uma fotografia desta carga local, não limites normativos. Modelo de CPU, número de núcleos, memória total e versão exata do sistema operacional não são registrados para preservar a privacidade do ambiente. O objetivo é permitir comparação posterior das fases de migração, runtime, Browser Bridge e scheduler.

## UI — rota de Plugins

O benchmark inicia API e Vite isolados, instala apenas a fixture de perfil em diretório temporário, abre `/plugins` no Chrome e espera o inventário real renderizar `1 plugins`. Há 2 aquecimentos e 7 amostras medidas.

| Amostras |     Mínimo |      Média |        p95 |     Máximo |
| -------: | ---------: | ---------: | ---------: | ---------: |
|        7 | 1190,68 ms | 1451,22 ms | 1772,84 ms | 1772,84 ms |

A dispersão entre mínimo e máximo é 582,16 ms nesta coleta. Esse número inclui renderização, descoberta local do plugin e a chamada da UI à API; não mede inicialização do Electron.

## SQLite — inventário de perfis

O cenário usa o schema atual de `plugin_profiles`, com os mesmos índices por `plugin_id` e alias. Uma base em memória recebe 2.000 perfis distribuídos entre oito plugins. Depois são feitas 200 listagens indexadas por plugin.

| Operação                              | Resultado |
| ------------------------------------- | --------: |
| Inserção transacional de 2.000 linhas |  20,87 ms |
| Listagem indexada — mínimo            |   0,15 ms |
| Listagem indexada — média             |   0,41 ms |
| Listagem indexada — p95               |   0,72 ms |
| Listagem indexada — máximo            |   5,21 ms |

Esta medida isola custo de banco e índice. Ela não inclui scan de manifests, filesystem ou serialização HTTP.

## Job simples de plugin

O cenário executa a fixture `com.contentflow.e2e-profile` pelo `plugin-runner`, com workspace temporário previamente preparado. Cada amostra inclui o processo sandbox/worker normal do runner. Foram executados 10 jobs imediatos.

| Amostras |    Mínimo |     Média |       p95 |    Máximo |
| -------: | --------: | --------: | --------: | --------: |
|       10 | 128,86 ms | 167,02 ms | 201,21 ms | 201,21 ms |

Esse cenário não acessa rede e não abre navegador. Ele serve como referência para o overhead local de um job simples antes das mudanças de perfil e lease.

## Browser Bridge — volume controlado

O benchmark carrega o `service-worker.js` atual da Browser Bridge em contextos VM isolados e executa handshake + comandos `ping` válidos. Cada perfil recebe exatamente 100 comandos. O código da extensão é o mesmo do produto; Chrome real com handshake/comandos permanece para o harness do pacote 5.1.

|   Perfis | Comandos | Tempo total |              Vazão |
| -------: | -------: | ----------: | -----------------: |
| 1 perfil |      100 |    51,02 ms | 1.959,9 comandos/s |
| 3 perfis |      300 |    99,16 ms | 3.025,4 comandos/s |
| 5 perfis |      500 |   197,09 ms | 2.536,9 comandos/s |

Os resultados mostram custo de protocolo/validação/cache no ambiente controlado. Eles não representam latência de DOM, CDP, rede ou provedor externo.

## Chrome + extensão ociosa

Para medir extensão sem job, o benchmark abre 1, 3 e 5 perfis físicos temporários em instâncias isoladas do Chrome headless, carrega a Browser Bridge unpacked e não envia comandos de job. Depois de 1,5 s de estabilização, coleta cinco amostras de RSS durante uma janela de 2 s e mede o delta agregado de CPU dessa mesma janela.

| Cenário  | Processos min–máx |   RSS mínimo |    RSS médio |   RSS máximo | CPU na janela de 2 s |
| -------- | ----------------: | -----------: | -----------: | -----------: | -------------------: |
| 1 perfil |             10–17 |   584,21 MiB |   634,47 MiB |   714,80 MiB |              5,234 s |
| 3 perfis |             42–54 | 1.605,85 MiB | 1.744,17 MiB | 1.913,01 MiB |             12,672 s |
| 5 perfis |             46–65 | 2.349,04 MiB | 2.432,20 MiB | 2.527,36 MiB |             16,609 s |

A janela curta ainda captura atividade de pós-startup do Chrome, por isso o delta de CPU não deve ser lido como steady state. A fase 5.7 fará soak test longo e será a evidência adequada para crescimento contínuo, timers, cache, sessions e debugger. Para o pacote 1.5, estes valores estabelecem a fotografia pré-migração e mostram a variação observada no próprio período de amostragem.

## Reprodutibilidade

Execute:

```text
npm run benchmark:shared-browser-v15
```

O comando imprime JSON com ambiente e todas as métricas. O script cria diretórios temporários para UI, runner e Chrome e tenta removê-los ao final. Perfis Chrome usam `--user-data-dir` dedicado e a extensão local unpacked; nenhum caminho absoluto é persistido no relatório.

## Limites da medição

- A UI foi medida no servidor Vite de desenvolvimento, não no Electron empacotado.
- O cenário SQLite mede diretamente o schema/index atual; não representa uma migração futura.
- O job simples não inclui rede, mídia ou provedor externo.
- O volume de comandos usa a Browser Bridge real em VM controlada, sem Chrome real no caminho de comando.
- O Chrome real foi usado somente para a medição ociosa da extensão. Handshake, service-worker suspend/resume e comando real serão cobertos no pacote 5.1.
- A janela ociosa é curta e serve como baseline; soak de 1/3/5 perfis pertence ao pacote 5.7.

Nenhuma migração de produção, tabela global, vínculo, readiness novo, lease persistente, scheduler ou alteração da UI foi implementada para produzir esta linha de base.
