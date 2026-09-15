import type { PluginCapability } from "@/lib/plugin-contract";

export function pluginCapabilityLabel(capability: PluginCapability) {
  return capability.name ?? capability.outputPorts[0]?.label ?? capability.id;
}

export function pluginCapabilityDescription(capability: PluginCapability) {
  return capability.description ?? capability.outputPorts[0]?.description;
}
