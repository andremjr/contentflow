type OutputField = {
  key: string;
  portKey: string;
  label: string;
  type: string;
  required: boolean;
};

type PluginRequest = {
  configuration: Record<string, unknown>;
  inputs: Record<string, unknown>;
  outputContract: OutputField[];
  resolvedInstruction?: string;
  context: {
    channel: { name: string; language: string; niche: string };
    project: { title: string };
    processType: string;
    block: {
      type: "BUSCAR" | "ESCOLHER" | "CRIAR" | "VALIDAR";
      name: string;
      instructions: string;
    };
    selectedCollection?: {
      collectionId: string;
      items: Array<{ id: string; values: Record<string, unknown> }>;
    };
  };
};

type AnthropicContent = { type?: string; text?: string } & Record<string, unknown>;
type AnthropicResponse = {
  content?: AnthropicContent[];
  stop_reason?: string;
  model?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: { message?: string };
};

function serialize(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function stripCodeFence(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function parseOutput(text: string, type: string | undefined) {
  if (type === "approval") return /reprov|reject/i.test(text) ? "rejected" : "approved";
  if (type === "number") {
    const value = Number(text.replace(",", ".").match(/-?\d+(?:\.\d+)?/)?.[0]);
    return Number.isFinite(value) ? value : 0;
  }
  if (type === "boolean") return /^(sim|true|yes|1)\b/i.test(text.trim());
  if (type === "list" || type === "multiselect") {
    try {
      const parsed = JSON.parse(stripCodeFence(text));
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Respostas em linhas continuam sendo aceitas.
    }
    return text
      .split("\n")
      .map((item) => item.replace(/^[-*•\d.)\s]+/, "").trim())
      .filter(Boolean);
  }
  if (type === "records") {
    try {
      const parsed = JSON.parse(stripCodeFence(text));
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [{ content: text }];
    }
  }
  return text.trim();
}

function responseText(body: AnthropicResponse) {
  return (body.content ?? [])
    .filter((item) => item.type === "text" && item.text)
    .map((item) => item.text)
    .join("\n")
    .trim();
}

function outputInstructions(fields: OutputField[]) {
  if (fields.length === 1) {
    const field = fields[0];
    return `Entregue somente ${field.label} no formato ${field.type}, sem explicações adicionais.`;
  }
  return [
    "Retorne somente um objeto JSON válido, sem markdown, usando exatamente estas chaves:",
    ...fields.map(
      (field) =>
        `- ${field.key}: ${field.label} (${field.type})${field.required ? ", obrigatório" : ""}`,
    ),
  ].join("\n");
}

function valuesFromResponse(text: string, fields: OutputField[]) {
  if (fields.length <= 1) {
    const field = fields[0];
    return { [field?.key ?? "result"]: parseOutput(text, field?.type) };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFence(text)) as Record<string, unknown>;
  } catch {
    throw new Error("O Claude não retornou o objeto JSON exigido pelo contrato do bloco.");
  }
  return Object.fromEntries(
    fields
      .filter((field) => parsed[field.key] !== undefined)
      .map((field) => [
        field.key,
        typeof parsed[field.key] === "string"
          ? parseOutput(String(parsed[field.key]), field.type)
          : parsed[field.key],
      ]),
  );
}

async function callAnthropic(
  apiKey: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
) {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function execute(
  request: PluginRequest,
  services: { signal: AbortSignal; getSecret(key: string): Promise<string | undefined> },
) {
  const apiKey = String(
    (await services.getSecret("ANTHROPIC_API_KEY")) ?? request.configuration.api_key ?? "",
  ).trim();
  if (!apiKey) {
    return {
      status: "error" as const,
      code: "ANTHROPIC_API_KEY_REQUIRED",
      message: "Informe uma chave da API da Anthropic para executar este bloco.",
      retryable: false,
    };
  }

  const model = String(request.configuration.model ?? "claude-sonnet-4-6").trim();
  const systemPrompt = String(
    request.configuration.system_prompt ??
      "Execute as instruções do bloco usando o contexto disponível e respeite exatamente o contrato de saída.",
  );
  const temperature = Number(request.configuration.temperature ?? 0.7);
  const maxTokens = Number(request.configuration.max_tokens ?? 4096);
  const inputText = Object.entries(request.inputs)
    .map(([key, value]) => `${key}:\n${serialize(value)}`)
    .join("\n\n");
  const collection = request.context.selectedCollection;
  const isChoosing = request.context.block.type === "ESCOLHER";
  if (isChoosing && (!collection || !collection.items.length)) {
    return {
      status: "error" as const,
      code: "COLLECTION_REQUIRED",
      message: "O bloco Escolher precisa de uma coleção com itens disponíveis.",
      retryable: false,
    };
  }

  const userPrompt = [
    `Canal: ${request.context.channel.name}`,
    `Nicho: ${request.context.channel.niche}`,
    `Projeto: ${request.context.project.title}`,
    `Processo: ${request.context.processType}`,
    `Ação: ${request.context.block.name}`,
    `Tipo de ação: ${request.context.block.type}`,
    `Instruções da ação:\n${request.resolvedInstruction || request.context.block.instructions || "Execute a ação indicada pelo nome do bloco."}`,
    inputText ? `Entradas resolvidas:\n${inputText}` : "Não há entradas explícitas.",
    isChoosing
      ? [
          "Escolha obrigatoriamente um único item da coleção estratégica abaixo.",
          "Retorne somente o ID exato do item escolhido, sem aspas e sem explicações.",
          serialize(collection?.items),
        ].join("\n")
      : outputInstructions(request.outputContract),
  ].join("\n\n");

  const messages: Array<{ role: "user" | "assistant"; content: string | AnthropicContent[] }> = [
    { role: "user", content: userPrompt },
  ];
  const payload: Record<string, unknown> = {
    model,
    system: systemPrompt,
    max_tokens: Number.isFinite(maxTokens) ? Math.min(64000, Math.max(1, maxTokens)) : 4096,
    temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0, temperature)) : 0.7,
    messages,
  };
  if (request.context.block.type === "BUSCAR") {
    payload.tools = [{ type: "web_search_20260318", name: "web_search", max_uses: 5 }];
  }

  let body: AnthropicResponse | undefined;
  for (let continuation = 0; continuation < 3; continuation += 1) {
    const response = await callAnthropic(apiKey, payload, services.signal);
    body = (await response.json()) as AnthropicResponse;
    if (!response.ok) {
      return {
        status: "error" as const,
        code: `ANTHROPIC_HTTP_${response.status}`,
        message: body.error?.message ?? "A Anthropic não conseguiu processar a solicitação.",
        retryable: response.status === 429 || response.status >= 500,
      };
    }
    if (body.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: body.content ?? [] });
  }

  const text = responseText(body ?? {});
  if (!text) {
    return {
      status: "error" as const,
      code: "ANTHROPIC_EMPTY_RESPONSE",
      message: "A Anthropic retornou uma resposta vazia.",
      retryable: true,
    };
  }

  const values = isChoosing
    ? {
        selectedItemId: stripCodeFence(text)
          .replace(/^['"]|['"]$/g, "")
          .trim(),
      }
    : valuesFromResponse(text, request.outputContract);
  const inputUnits =
    (body?.usage?.input_tokens ?? 0) +
    (body?.usage?.cache_creation_input_tokens ?? 0) +
    (body?.usage?.cache_read_input_tokens ?? 0);
  const outputUnits = body?.usage?.output_tokens;
  return {
    status: "success" as const,
    values,
    usage: {
      provider: "Anthropic",
      model: body?.model ?? model,
      inputUnits,
      outputUnits,
      totalUnits: inputUnits + (outputUnits ?? 0),
      unit: "tokens",
    },
  };
}
