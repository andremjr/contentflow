# `src/engines/` — camada de lógica dos processos

Camada pura, sem JSX, que fica entre a UI e os motores reais de geração.
Toda a lógica de "o que vai ser enviado para o motor" mora aqui, isolada
dos componentes visuais para permitir manutenção independente.

## Estrutura

```
engines/
├── types.ts       # Tipos: EngineCommand, EngineResult, configs por processo
├── defaults.ts    # Config padrão a nível de canal, por processo
├── builders.ts    # Funções puras que montam o comando (uma por processo)
├── mocks.ts       # Runners simulados — trocar por transporte real depois
├── registry.ts    # Registro central + `runProcess` orquestrador
└── index.ts       # Barrel — importar sempre daqui
```

## Fluxo canônico

```ts
import { runProcess, DEFAULT_CONFIGS } from "@/engines";

const { command, result } = await runProcess("research", {
  project: { projectId, channelId, title, language: "pt-BR" },
  config: DEFAULT_CONFIGS.research, // ou o config salvo do canal
  input: { extraKeywords: ["marte"] },
});
```

- `command` é o envelope serializável que hoje vai para o mock e amanhã
  vai para uma edge function / API real. É a única coisa que importa
  para o backend futuro.
- `result` é o retorno tipado do motor.

## Adicionando um novo processo

1. Estender `ProcessConfigMap` em `types.ts`.
2. Adicionar defaults em `defaults.ts`.
3. Escrever `build<Proc>Command` em `builders.ts` (função pura).
4. Escrever `runMock<Proc>` em `mocks.ts`.
5. Registrar em `REGISTRY` dentro de `registry.ts`.

Nenhuma alteração na UI é necessária — a UI só chama `runProcess`.

## Regras

- **Sem I/O em builders.** São funções puras que produzem um envelope
  serializável. Isso permite logar, replayar e testar sem rede.
- **Sem imports de UI.** Nada em `engines/` pode importar `components/`
  ou `routes/`.
- **Config é imutável.** Builders congelam o snapshot de configuração
  para evitar mutação acidental.
- **Trocar mocks é trivial.** Cada entrada do registry tem um `run` —
  substitua por um `createServerFn` sem tocar em builders nem em UI.
