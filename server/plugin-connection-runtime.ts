import type { PluginManifest } from "../src/lib/plugin-contract";
import type { PluginConnection } from "./plugin-connections";

type ConnectionPlugin = {
  id: string;
  manifest: Pick<PluginManifest, "secretKeys">;
};

type ConnectionRuntimeDependencies = {
  migrateLegacy: () => Promise<void>;
  listConnections: () => PluginConnection[];
  getConnection: (connectionId: string) => PluginConnection | undefined;
  getSecret: (connectionId: string, secretKey: string) => Promise<string | undefined>;
};

export function normalizeConnectionSecretPatch(
  declaredSecretKeys: string[],
  inputSecrets: unknown,
  inputRemovedSecretKeys: unknown = [],
  existingSecretKeys: string[] = [],
) {
  const secrets =
    inputSecrets && typeof inputSecrets === "object" && !Array.isArray(inputSecrets)
      ? (inputSecrets as Record<string, unknown>)
      : {};
  const removeSecretKeys = Array.isArray(inputRemovedSecretKeys)
    ? inputRemovedSecretKeys.filter((value): value is string => typeof value === "string")
    : [];
  const declared = new Set(declaredSecretKeys);
  const unknownSecretKey = [...Object.keys(secrets), ...removeSecretKeys].find(
    (secretKey) => !declared.has(secretKey),
  );
  if (unknownSecretKey) {
    throw new Error(`A credencial ${unknownSecretKey} não foi declarada pelo plugin.`);
  }

  const values = Object.fromEntries(
    Object.entries(secrets).flatMap(([secretKey, value]) => {
      const normalized = typeof value === "string" ? value.trim() : "";
      return normalized ? [[secretKey, normalized]] : [];
    }),
  );
  const nextSecretKeys = new Set(existingSecretKeys);
  Object.keys(values).forEach((secretKey) => nextSecretKeys.add(secretKey));
  removeSecretKeys.forEach((secretKey) => nextSecretKeys.delete(secretKey));
  if (!nextSecretKeys.size) {
    throw new Error("Informe ao menos uma credencial para esta conexão.");
  }

  return {
    values,
    removeSecretKeys: [...new Set(removeSecretKeys)],
    connectedSecretKeys: [...nextSecretKeys],
  };
}

export async function resolvePluginConnectionSecrets(
  plugin: ConnectionPlugin,
  requestedConnectionId: string | undefined,
  dependencies: ConnectionRuntimeDependencies,
) {
  const secretKeys = plugin.manifest.secretKeys ?? [];
  if (!secretKeys.length) {
    return { connectionId: undefined, secrets: {} as Record<string, string> };
  }

  await dependencies.migrateLegacy();
  const activeConnections = dependencies.listConnections();
  const connection = requestedConnectionId
    ? dependencies.getConnection(requestedConnectionId)
    : activeConnections.length === 1
      ? activeConnections[0]
      : undefined;

  if (requestedConnectionId && (!connection || connection.revokedAt)) {
    throw new Error("A conta ou conexão associada a este bloco não está mais disponível.");
  }
  if (!requestedConnectionId && activeConnections.length > 1) {
    throw new Error("Escolha qual conta ou conexão este bloco deve usar.");
  }

  const secrets: Record<string, string> = {};
  if (!connection) return { connectionId: undefined, secrets };
  for (const secretKey of secretKeys) {
    const value = await dependencies.getSecret(connection.id, secretKey);
    if (value) secrets[secretKey] = value;
  }
  return { connectionId: connection.id, secrets };
}
