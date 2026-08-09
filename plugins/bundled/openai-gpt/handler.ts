type OutputField = {
  key: string;
  portKey: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

type PluginRequest = {
  configuration: Record<string, unknown>;
  inputs: Record<string, unknown>;
  outputContract: OutputField[];
  context: {
    channel: { name: string; language: string; niche: string };
    project: { title: string };
    processType: string;
    block: {
      type: "BUSCAR" | "ESCOLHER" | "CRIAR" | "VALIDAR";
      name: string;
      instructions: string;
    };
    previousProcessOutputs: unknown[];
    previousBlockOutputs: unknown[];
    selectedCollection?: {
      collectionId: string;
      items: Array<{ id: string; values: Record<string, unknown> }>;
    };
  };
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
  model?: string;
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
      // A resposta em linhas continua sendo aceita para modelos sem saída estruturada.
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

function responseText(body: OpenAIResponse) {
  if (body.output_text?.trim()) return body.output_text.trim();
  return (body.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
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
    throw new Error("O modelo não retornou o objeto JSON exigido pelo contrato do bloco.");
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

async function callOpenAI(apiKey: string, payload: Record<string, unknown>, signal: AbortSignal) {
  return fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal,
  });
}

export async function execute(request: PluginRequest, services: { signal: AbortSignal }) {
  const apiKey = String(request.configuration.api_key ?? "").trim();
  if (!apiKey) {
    return {
      status: "error" as const,
      code: "OPENAI_API_KEY_REQUIRED",
      message: "Informe uma chave da API da OpenAI para executar este bloco.",
      retryable: false,
    };
  }

  const model = String(request.configuration.model ?? "gpt-5.6-terra").trim();
  const systemPrompt = String(
    request.configuration.system_prompt ??
      "Execute as instruções do bloco usando o contexto disponível e respeite exatamente o contrato de saída.",
  );
  const temperature = Number(request.configuration.temperature ?? 0.7);
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
    `Instruções da ação:\n${request.context.block.instructions || "Execute a ação indicada pelo nome do bloco."}`,
    inputText ? `Entradas resolvidas:\n${inputText}` : "Não há entradas explícitas.",
    isChoosing
      ? [
          "Escolha obrigatoriamente um único item da coleção estratégica abaixo.",
          "Retorne somente o ID exato do item escolhido, sem aspas e sem explicações.",
          serialize(collection?.items),
        ].join("\n")
      : outputInstructions(request.outputContract),
  ].join("\n\n");

  const payload: Record<string, unknown> = {
    model,
    instructions: systemPrompt,
    input: userPrompt,
    store: false,
  };
  if (Number.isFinite(temperature)) payload.temperature = Math.min(2, Math.max(0, temperature));
  if (request.context.block.type === "BUSCAR") payload.tools = [{ type: "web_search" }];

  let response = await callOpenAI(apiKey, payload, services.signal);
  let body = (await response.json()) as OpenAIResponse;
  if (
    !response.ok &&
    response.status === 400 &&
    payload.temperature !== undefined &&
    /temperature|unsupported parameter/i.test(body.error?.message ?? "")
  ) {
    delete payload.temperature;
    response = await callOpenAI(apiKey, payload, services.signal);
    body = (await response.json()) as OpenAIResponse;
  }
  if (!response.ok) {
    return {
      status: "error" as const,
      code: `OPENAI_HTTP_${response.status}`,
      message: body.error?.message ?? "A OpenAI não conseguiu processar a solicitação.",
      retryable: response.status === 429 || response.status >= 500,
    };
  }

  const text = responseText(body);
  if (!text) {
    return {
      status: "error" as const,
      code: "OPENAI_EMPTY_RESPONSE",
      message: "A OpenAI retornou uma resposta vazia.",
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
  return {
    status: "success" as const,
    values,
    usage: {
      provider: "OpenAI",
      model: body.model ?? model,
      inputUnits: body.usage?.input_tokens,
      outputUnits: body.usage?.output_tokens,
      totalUnits: body.usage?.total_tokens,
      unit: "tokens",
    },
  };
}
