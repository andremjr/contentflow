export type PluginRequirementReadiness =
  "missing_plugin" | "missing_capability" | "unavailable_plugin" | "missing_connection" | "ready";

export function pluginRequirementReadiness({
  plugin,
  capabilityId,
  connectionRequired,
  hasBoundConnection,
}: {
  plugin?: {
    enabled?: boolean;
    executable?: boolean;
    manifest: { capabilities: Array<{ id: string }> };
  };
  capabilityId: string;
  connectionRequired: boolean;
  hasBoundConnection: boolean;
}): PluginRequirementReadiness {
  if (!plugin) return "missing_plugin";
  if (!plugin.manifest.capabilities.some((capability) => capability.id === capabilityId)) {
    return "missing_capability";
  }
  if (plugin.enabled !== true || plugin.executable !== true) return "unavailable_plugin";
  if (connectionRequired && !hasBoundConnection) return "missing_connection";
  return "ready";
}
