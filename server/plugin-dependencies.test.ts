import assert from "node:assert/strict";
import test from "node:test";
import {
  findPluginConnectionDependencies,
  findPluginMethodDependencies,
} from "./plugin-dependencies";

test("lista blocos de Métodos que dependem do plugin", () => {
  const result = findPluginMethodDependencies(
    [
      {
        id: "channel-1",
        name: "Canal principal",
        methods: {
          script: {
            blocks: [
              {
                id: "block-1",
                type: "CRIAR",
                name: "Escrever roteiro",
                plugin: { pluginId: "example.plugin", capabilityId: "write" },
              },
              { id: "block-2", type: "VALIDAR" },
            ],
          },
          title: {
            blocks: [
              {
                id: "block-3",
                type: "CRIAR",
                plugin: { pluginId: "another.plugin", capabilityId: "title" },
              },
            ],
          },
        },
      },
    ],
    "example.plugin",
  );

  assert.deepEqual(result, [
    {
      channelId: "channel-1",
      channelName: "Canal principal",
      processType: "script",
      blockId: "block-1",
      blockName: "Escrever roteiro",
      capabilityId: "write",
    },
  ]);
});

test("ignora payloads antigos ou malformados sem interromper a remoção", () => {
  assert.deepEqual(
    findPluginMethodDependencies(
      [null, {}, { id: "channel-1", methods: [] }, { id: "channel-2", methods: { custom: {} } }],
      "example.plugin",
    ),
    [],
  );
});

test("filtra dependências por conexão local", () => {
  const channels = [
    {
      id: "channel-1",
      name: "Canal",
      methods: {
        script: {
          blocks: [
            {
              id: "block-1",
              type: "CRIAR",
              plugin: {
                pluginId: "example.plugin",
                capabilityId: "write",
                connectionId: "connection-1",
              },
            },
          ],
        },
      },
    },
  ];
  assert.equal(
    findPluginConnectionDependencies(channels, "example.plugin", "connection-1").length,
    1,
  );
  assert.equal(
    findPluginConnectionDependencies(channels, "example.plugin", "connection-2").length,
    0,
  );
});
