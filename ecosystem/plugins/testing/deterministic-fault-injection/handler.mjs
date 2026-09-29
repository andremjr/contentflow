const messages = {
  "pt-BR": {
    invalidInput: "A entrada content precisa ser texto.",
    invalidScenario: "O cenário de fault injection é inválido.",
    technical: "Falha técnica determinística para retry.",
    rateLimit: "Rate limit determinístico.",
    intervention: "Intervenção humana determinística necessária.",
    uncertain: "O efeito externo simulado não pôde ser confirmado.",
    confirmed: "A falha simulada ocorreu depois de um efeito confirmado.",
    cancelled: "A execução determinística foi cancelada.",
  },
  en: {
    invalidInput: "The content input must be text.",
    invalidScenario: "The fault-injection scenario is invalid.",
    technical: "Deterministic technical failure for retry.",
    rateLimit: "Deterministic rate limit.",
    intervention: "Deterministic human intervention is required.",
    uncertain: "The simulated external effect could not be confirmed.",
    confirmed: "The simulated failure happened after a confirmed effect.",
    cancelled: "The deterministic execution was cancelled.",
  },
  es: {
    invalidInput: "La entrada content debe ser texto.",
    invalidScenario: "El escenario de inyección de fallos no es válido.",
    technical: "Fallo técnico determinista para reintento.",
    rateLimit: "Límite de frecuencia determinista.",
    intervention: "Se requiere una intervención humana determinista.",
    uncertain: "No se pudo confirmar el efecto externo simulado.",
    confirmed: "El fallo simulado ocurrió después de un efecto confirmado.",
    cancelled: "La ejecución determinista fue cancelada.",
  },
};

function localizedMessages(request) {
  const locale = request.context?.locale;
  if (locale === "pt-BR" || locale === "es") return messages[locale];
  return messages.en;
}

function safeFailure(code, message, extra = {}) {
  return {
    status: "error",
    code,
    message,
    retryable: true,
    recovery: { stage: "before_effect", externalEffect: "none" },
    ...extra,
  };
}

function waitForCancellation(signal, message) {
  return new Promise((resolve) => {
    const cancelled = () =>
      resolve({
        status: "error",
        code: "CANCELLED",
        message,
        retryable: false,
        recovery: { stage: "before_effect", externalEffect: "none" },
      });
    if (signal?.aborted) {
      cancelled();
      return;
    }
    signal?.addEventListener("abort", cancelled, { once: true });
  });
}

const scenarios = {
  success: ({ content }) => ({
    status: "success",
    values: { result: content.trim().toUpperCase() },
  }),
  technical_retryable: ({ text }) => safeFailure("UPSTREAM_UNAVAILABLE", text.technical),
  timeout: () => new Promise(() => {}),
  rate_limit: ({ text }) =>
    safeFailure("RATE_LIMIT", text.rateLimit, {
      retryAfterMs: 1000,
    }),
  intervention: ({ text }) =>
    safeFailure("CAPTCHA_REQUIRED", text.intervention, {
      retryable: false,
      recovery: {
        stage: "before_effect",
        externalEffect: "none",
        intervention: "captcha",
      },
    }),
  external_effect_uncertain: ({ text }) =>
    safeFailure("JOB_FAILED", text.uncertain, {
      retryable: false,
      recovery: {
        stage: "effect_submitted",
        externalEffect: "possible",
        externalReceipt: "fault-receipt-001",
      },
    }),
  external_effect_confirmed_failure: ({ text }) =>
    safeFailure("FAULT_CONFIRMED_EFFECT_FAILURE", text.confirmed, {
      retryable: false,
      recovery: {
        stage: "effect_confirmed",
        externalEffect: "confirmed",
      },
    }),
  cancel_aware: ({ services, text }) => waitForCancellation(services.signal, text.cancelled),
};

export async function execute(request, services) {
  const text = localizedMessages(request);
  const content = request.inputs?.content;
  if (typeof content !== "string") {
    return safeFailure("INVALID_INPUT", text.invalidInput, { retryable: false });
  }

  const scenario = request.configuration?.scenario;
  const runScenario = scenarios[scenario];
  if (!runScenario) {
    return safeFailure("INVALID_CONFIGURATION", text.invalidScenario, { retryable: false });
  }

  return runScenario({ content, request, services, text });
}
