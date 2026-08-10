import { AsyncEntry } from "@napi-rs/keyring";

const SERVICE_NAME = "ContentFlow OS";

function accountName(pluginId: string, secretKey: string) {
  if (!/^[a-z0-9.-]+$/.test(pluginId) || !/^[A-Z0-9_]+$/.test(secretKey)) {
    throw new Error("Identificador de credencial inválido.");
  }
  return `plugin:${pluginId}:${secretKey}`;
}

function entry(pluginId: string, secretKey: string) {
  return new AsyncEntry(SERVICE_NAME, accountName(pluginId, secretKey));
}

export async function setPluginSecret(pluginId: string, secretKey: string, value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("A credencial não pode ser vazia.");
  await entry(pluginId, secretKey).setPassword(normalized);
}

export async function getPluginSecret(pluginId: string, secretKey: string) {
  return (await entry(pluginId, secretKey).getPassword()) ?? undefined;
}

export async function deletePluginSecret(pluginId: string, secretKey: string) {
  return entry(pluginId, secretKey).deleteCredential();
}

export function credentialStoreName() {
  if (process.platform === "win32") return "Windows Credential Manager";
  if (process.platform === "darwin") return "macOS Keychain";
  return "Secret Service do sistema";
}
