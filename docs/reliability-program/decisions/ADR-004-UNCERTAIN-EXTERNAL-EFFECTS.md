# ADR-004 — Efeitos externos incertos

## Status

Aceito

## Contexto

Timeout, desconexão ou crash após um possível efeito externo não permitem concluir com segurança se a operação falhou ou foi aplicada. Repetir automaticamente pode duplicar publicação, envio, cobrança ou mutação.

## Decisão

Quando um efeito externo puder ter ocorrido, a unidade entra em estado incerto e não pode ser repetida automaticamente até reconciliação. O sistema deve preservar tentativa, correlação, evidências e recibos suficientes para confirmar, compensar ou solicitar decisão humana.

## Consequências

Retries distinguem falha conhecida de resultado incerto. O scheduler pode continuar trabalho independente, mas a unidade afetada permanece bloqueada para novo efeito até uma resolução segura.

## O que esta decisão NÃO significa

Não significa que todo timeout exige intervenção humana, que retries são proibidos ou que trabalhos independentes precisam parar junto com a unidade incerta.

