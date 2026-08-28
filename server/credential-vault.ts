import { AsyncEntry } from "@napi-rs/keyring";

const SERVICE_NAME = "ContentFlow";

function accountName(pluginId: string, secretKey: string) {
  if (!/^[a-z0-9.-]+$/.test(pluginId) || !/^[A-Z0-9_]+$/.test(secretKey)) {
    throw new Error("Identificador de credencial inválido.");
  }
  return `plugin:${pluginId}:${secretKey}`;
}

function entry(pluginId: string, secretKey: string) {
  return new AsyncEntry(SERVICE_NAME, accountName(pluginId, secretKey));
}

function connectionAccountName(pluginId: string, connectionId: string, secretKey: string) {
  if (
    !/^[a-z0-9.-]+$/.test(pluginId) ||
    !/^[a-zA-Z0-9-]{1,80}$/.test(connectionId) ||
    !/^[A-Z0-9_]+$/.test(secretKey)
  ) {
    throw new Error("Identificador de conexão inválido.");
  }
  return `plugin:${pluginId}:connection:${connectionId}:${secretKey}`;
}

function connectionEntry(pluginId: string, connectionId: string, secretKey: string) {
  return new AsyncEntry(SERVICE_NAME, connectionAccountName(pluginId, connectionId, secretKey));
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

export async function setPluginConnectionSecret(
  pluginId: string,
  connectionId: string,
  secretKey: string,
  value: string,
) {
  const normalized = value.trim();
  if (!normalized) throw new Error("A credencial não pode ser vazia.");
  await connectionEntry(pluginId, connectionId, secretKey).setPassword(normalized);
}

export async function getPluginConnectionSecret(
  pluginId: string,
  connectionId: string,
  secretKey: string,
) {
  return (await connectionEntry(pluginId, connectionId, secretKey).getPassword()) ?? undefined;
}

export async function deletePluginConnectionSecret(
  pluginId: string,
  connectionId: string,
  secretKey: string,
) {
  return connectionEntry(pluginId, connectionId, secretKey).deleteCredential();
}

export function credentialStoreName() {
  if (process.platform === "win32") return "Windows Credential Manager";
  if (process.platform === "darwin") return "macOS Keychain";
  return "Secret Service do sistema";
}
