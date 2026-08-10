import {
  credentialStoreName,
  deletePluginSecret,
  getPluginSecret,
  setPluginSecret,
} from "./credential-vault";

type AnthropicModel = {
  id: string;
  display_name?: string;
  created_at?: string;
};

type AnthropicModelsResponse = {
  data?: AnthropicModel[];
  error?: { message?: string };
};

export type AvailableAnthropicModel = {
  id: string;
  name: string;
  createdAt?: string;
};

let availableModels: AvailableAnthropicModel[] = [];
let updatedAt: string | undefined;

const PLUGIN_ID = "official-anthropic-claude";
const SECRET_KEY = "ANTHROPIC_API_KEY";

async function fetchModels(apiKey: string) {
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1000", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  const body = (await response.json()) as AnthropicModelsResponse;
  if (!response.ok) {
    throw new Error(body.error?.message ?? "A Anthropic não aceitou esta chave da API.");
  }
  const models = (body.data ?? [])
    .filter((model) => model.id.startsWith("claude-"))
    .map((model) => ({
      id: model.id,
      name: model.display_name?.trim() || model.id,
      createdAt: model.created_at,
    }));
  if (!models.length) {
    throw new Error("A chave foi aceita, mas nenhum modelo Claude disponível foi encontrado.");
  }
  return models;
}

export async function connectAnthropic(apiKey: string) {
  const normalized = apiKey.trim();
  if (!normalized) throw new Error("Informe a chave da API da Anthropic.");
  const models = await fetchModels(normalized);
  await setPluginSecret(PLUGIN_ID, SECRET_KEY, normalized);
  availableModels = models;
  updatedAt = new Date().toISOString();
  return getAnthropicConnection();
}

export async function refreshAnthropicModels() {
  const apiKey = await getAnthropicApiKey();
  if (!apiKey) throw new Error("Conecte uma chave da Anthropic primeiro.");
  availableModels = await fetchModels(apiKey);
  updatedAt = new Date().toISOString();
  return getAnthropicConnection();
}

export async function disconnectAnthropic() {
  await deletePluginSecret(PLUGIN_ID, SECRET_KEY);
  availableModels = [];
  updatedAt = undefined;
}

export async function getAnthropicConnection() {
  const connected = Boolean(await getAnthropicApiKey());
  return {
    connected,
    models: availableModels,
    updatedAt,
    persistence: "keychain" as const,
    credentialStore: credentialStoreName(),
  };
}

export function getAnthropicApiKey() {
  return getPluginSecret(PLUGIN_ID, SECRET_KEY);
}
