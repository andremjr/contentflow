import type { UniversalProcess } from "../src/lib/domain";

export type PluginMethodDependency = {
  channelId: string;
  channelName: string;
  processType: UniversalProcess;
  blockId: string;
  blockName: string;
  capabilityId: string;
};

export type PluginConnectionDependency = PluginMethodDependency & {
  connectionId: string;
};

const processTypes = new Set<UniversalProcess>([
  "theme",
  "title",
  "thumbnail",
  "script",
  "narration",
  "assets",
  "editing",
  "publishing",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function findPluginMethodDependencies(
  channels: unknown[],
  pluginId: string,
): PluginMethodDependency[] {
  const dependencies: PluginMethodDependency[] = [];
  for (const channelValue of channels) {
    const channel = record(channelValue);
    if (!channel) continue;
    const channelId = typeof channel.id === "string" ? channel.id : "";
    const channelName = typeof channel.name === "string" ? channel.name : "Canal sem nome";
    const methods = record(channel.methods);
    if (!channelId || !methods) continue;

    for (const [processKey, methodValue] of Object.entries(methods)) {
      if (!processTypes.has(processKey as UniversalProcess)) continue;
      const method = record(methodValue);
      const blocks = method?.blocks;
      if (!Array.isArray(blocks)) continue;
      for (const blockValue of blocks) {
        const block = record(blockValue);
        const plugin = record(block?.plugin);
        if (!block || plugin?.pluginId !== pluginId) continue;
        dependencies.push({
          channelId,
          channelName,
          processType: processKey as UniversalProcess,
          blockId: typeof block.id === "string" ? block.id : "",
          blockName:
            typeof block.name === "string" && block.name.trim()
              ? block.name.trim()
              : typeof block.type === "string"
                ? block.type
                : "Bloco sem nome",
          capabilityId:
            typeof plugin.capabilityId === "string" ? plugin.capabilityId : "desconhecida",
        });
      }
    }
  }
  return dependencies;
}

export function findPluginConnectionDependencies(
  channels: unknown[],
  pluginId: string,
  connectionId: string,
): PluginConnectionDependency[] {
  return findPluginMethodDependencies(channels, pluginId)
    .filter((dependency) => {
      const channel = record(channels.find((value) => record(value)?.id === dependency.channelId));
      const methods = record(channel?.methods);
      const method = record(methods?.[dependency.processType]);
      const block = Array.isArray(method?.blocks)
        ? method.blocks.map(record).find((value) => value?.id === dependency.blockId)
        : undefined;
      return record(block?.plugin)?.connectionId === connectionId;
    })
    .map((dependency) => ({ ...dependency, connectionId }));
}
