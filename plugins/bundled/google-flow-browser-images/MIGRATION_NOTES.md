# Migração para v1.0.0

- remove completamente imagens de fallback e sucessos fictícios;
- adota o modo Automático do Flow como padrão, sem forçar `GEM_PIX_2`;
- adiciona Nano Banana e Nano Banana Pro como opções explícitas;
- permite fallback Nano Banana Pro → Nano Banana somente para limite específico do modelo;
- interrompe a fila imediatamente em CAPTCHA, 403 desconhecido, cota geral ou erro técnico;
- adiciona `accountProfile` para contas e projetos separados por canal;
- adiciona a porta opcional `reference_images` e a permissão `filesystem:read`;
- adiciona proporção e múltiplas variantes reais por prompt;
- muda o padrão para uma geração por vez e intervalo de 5 segundos;
- exige novo consentimento devido à permissão de leitura das referências.

## v1.0.1

- classifica o plugin exclusivamente como capacidade de imagem no catálogo;
- solicita a apresentação da saída como galeria de imagens.
