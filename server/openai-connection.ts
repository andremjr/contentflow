type OpenAIModel = {
  id: string;
  created?: number;
  owned_by?: string;
};

type OpenAIModelsResponse = {
  data?: OpenAIModel[];
  error?: { message?: string };
};

export type AvailableOpenAIModel = {
  id: string;
  name: string;
  ownedBy?: string;
};

let sessionApiKey: string | undefined;
let availableModels: AvailableOpenAIModel[] = [];
let updatedAt: string | undefined;

const MODEL_NAMES: Record<string, string> = {
  "gpt-5.6-sol": "GPT-5.6 Sol — máxima qualidade",
  "gpt-5.6": "GPT-5.6 — alias do Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra — equilibrado",
  "gpt-5.6-luna": "GPT-5.6 Luna — econômico",
  "gpt-5.5": "GPT-5.5",
  "gpt-5.4": "GPT-5.4",
  "gpt-5.4-mini": "GPT-5.4 mini",
  "gpt-5.4-nano": "GPT-5.4 nano",
  "gpt-5-mini": "GPT-5 mini",
  "gpt-4.1": "GPT-4.1",
  "gpt-4.1-mini": "GPT-4.1 mini",
  "gpt-4.1-nano": "GPT-4.1 nano",
  "gpt-4o-mini": "GPT-4o mini",
  o3: "o3",
};

function isLanguageModel(model: OpenAIModel) {
  const id = model.id.toLowerCase();
  const isGeneralModel = /^(gpt-(?:4|5)|o[134](?:-|$)|chat-latest$|ft:gpt-)/.test(id);
  const isSpecialized =
    /(audio|realtime|transcri|tts|image|embedding|moderation|search-preview|codex|instruct)/.test(
      id,
    );
  const isSnapshot = /-\d{4}-\d{2}-\d{2}$/.test(id);
  return isGeneralModel && !isSpecialized && (!isSnapshot || id.startsWith("ft:"));
}

function modelName(id: string) {
  return MODEL_NAMES[id] ?? id;
}

async function fetchModels(apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const body = (await response.json()) as OpenAIModelsResponse;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "A OpenAI não aceitou esta chave da API.");
  }
  const models = (body.data ?? [])
    .filter(isLanguageModel)
    .map((model) => ({ id: model.id, name: modelName(model.id), ownedBy: model.owned_by }))
    .sort((left, right) => {
      const leftKnown = MODEL_NAMES[left.id] ? 0 : 1;
      const rightKnown = MODEL_NAMES[right.id] ? 0 : 1;
      return leftKnown - rightKnown || left.name.localeCompare(right.name);
    });
  if (!models.length) {
    throw new Error(
      "A chave foi aceita, mas nenhum modelo de linguagem compatível foi encontrado.",
    );
  }
  return models;
}

export async function connectOpenAI(apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) throw new Error("Informe a chave da API da OpenAI.");
  const models = await fetchModels(normalized);
  sessionApiKey = normalized;
  availableModels = models;
  updatedAt = new Date().toISOString();
  return getOpenAIConnection();
}

export async function refreshOpenAIModels() {
  if (!sessionApiKey) throw new Error("Conecte uma chave da OpenAI primeiro.");
  availableModels = await fetchModels(sessionApiKey);
  updatedAt = new Date().toISOString();
  return getOpenAIConnection();
}

export function disconnectOpenAI() {
  sessionApiKey = undefined;
  availableModels = [];
  updatedAt = undefined;
}

export function getOpenAIConnection() {
  return {
    connected: Boolean(sessionApiKey),
    models: availableModels,
    updatedAt,
    persistence: "session" as const,
  };
}

export function getOpenAIApiKey() {
  return sessionApiKey;
}
