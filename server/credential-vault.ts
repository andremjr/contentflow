import { AsyncEntry } from "@napi-rs/keyring";

const SERVICE_NAME = "ContentFlow";
const PREVIOUS_SERVICE_NAME = [SERVICE_NAME, String.fromCharCode(79, 83)].join(" ");

function accountName(pluginId: string, secretKey: string) {
  if (!/^[a-z0-9.-]+$/.test(pluginId) || !/^[A-Z0-9_]+$/.test(secretKey)) {
    throw new Error("Identificador de credencial inválido.");
  }
  return `plugin:${pluginId}:${secretKey}`;
}

function entry(pluginId: string, secretKey: string, serviceName = SERVICE_NAME) {
  return new AsyncEntry(serviceName, accountName(pluginId, secretKey));
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

function connectionEntry(
  pluginId: string,
  connectionId: string,
  secretKey: string,
  serviceName = SERVICE_NAME,
) {
  return new AsyncEntry(serviceName, connectionAccountName(pluginId, connectionId, secretKey));
}

async function readAndMigrateCredential(current: AsyncEntry, previous: AsyncEntry) {
  const currentValue = await current.getPassword();
  if (currentValue) return currentValue;
  const previousValue = await previous.getPassword();
  if (!previousValue) return undefined;
  await current.setPassword(previousValue);
  if ((await current.getPassword()) !== previousValue) {
    throw new Error("A credencial migrada não pôde ser validada no cofre atual.");
  }
  await previous.deleteCredential();
  return previousValue;
}

async function deleteCredentialEntries(current: AsyncEntry, previous: AsyncEntry) {
  const currentDeleted = (await current.getPassword()) ? await current.deleteCredential() : false;
  const previousDeleted = (await previous.getPassword())
    ? await previous.deleteCredential()
    : false;
  return currentDeleted || previousDeleted;
}

export async function setPluginSecret(pluginId: string, secretKey: string, value: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error("A credencial não pode ser vazia.");
  await entry(pluginId, secretKey).setPassword(normalized);
}

export async function getPluginSecret(pluginId: string, secretKey: string) {
  return readAndMigrateCredential(
    entry(pluginId, secretKey),
    entry(pluginId, secretKey, PREVIOUS_SERVICE_NAME),
  );
}

export async function deletePluginSecret(pluginId: string, secretKey: string) {
  return deleteCredentialEntries(
    entry(pluginId, secretKey),
    entry(pluginId, secretKey, PREVIOUS_SERVICE_NAME),
  );
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
  return readAndMigrateCredential(
    connectionEntry(pluginId, connectionId, secretKey),
    connectionEntry(pluginId, connectionId, secretKey, PREVIOUS_SERVICE_NAME),
  );
}

export async function deletePluginConnectionSecret(
  pluginId: string,
  connectionId: string,
  secretKey: string,
) {
  return deleteCredentialEntries(
    connectionEntry(pluginId, connectionId, secretKey),
    connectionEntry(pluginId, connectionId, secretKey, PREVIOUS_SERVICE_NAME),
  );
}

export function credentialStoreName() {
  if (process.platform === "win32") return "Windows Credential Manager";
  if (process.platform === "darwin") return "macOS Keychain";
  return "Secret Service do sistema";
}
