import assert from "node:assert/strict";
import test from "node:test";
import { convertExecution, type MigrationContext } from "../scripts/migrate-user-data-v3";
import { normalizeExecutionDeliveries } from "../src/lib/deliveries";

const srtFile = {
  id: "subtitle-1",
  name: "narration.srt",
  mimeType: "application/x-subrip",
  size: 123,
  url: "/api/files/narration.srt",
  sha256: "a".repeat(64),
};

function context(pluginVersion = "1.0.1"): MigrationContext {
  return {
    capabilities: new Map([
      [
        "com.andremjr.assemblyai-srt\u0000transcribe-to-srt",
        {
          pluginId: "com.andremjr.assemblyai-srt",
          pluginVersion,
          capabilityId: "transcribe-to-srt",
          inputPorts: [],
          outputPorts: [
            {
              key: "subtitles",
              shape: {
                kind: "content",
                family: "text",
                cardinality: "many",
                representation: "artifact",
                formats: { mimeTypes: ["application/x-subrip", "text/plain"] },
              },
            },
          ],
        },
      ],
    ]),
    collections: new Map(),
    diagnostics: [],
  };
}

function execution(pluginVersion = "1.0.1") {
  return {
    id: "execution-1",
    projectId: "project-1",
    channelId: "channel-1",
    processType: "assets",
    status: "completed",
    outputStatus: "pending",
    methodSnapshot: {
      contractVersion: 3,
      name: "Assets",
      processType: "assets",
      blocks: [
        {
          id: "srt",
          type: "CRIAR",
          operator: "Código",
          name: "SRT",
          instructions: "",
          inputs: [],
          outputs: [
            {
              id: "srt-output",
              label: "SRT",
              key: "assets",
              portKey: "subtitles",
              required: true,
              shape: {
                kind: "content",
                family: "video",
                cardinality: "many",
                representation: "artifact",
              },
            },
          ],
          parameters: [],
          order: 0,
          plugin: {
            pluginId: "com.andremjr.assemblyai-srt",
            pluginVersion,
            capabilityId: "transcribe-to-srt",
            configuration: {},
          },
        },
        {
          id: "next",
          type: "CRIAR",
          operator: "Humano",
          name: "Next",
          instructions: "",
          inputs: [
            {
              id: "next-input",
              label: "SRT",
              binding: { kind: "previous_block", blockId: "srt", outputKey: "assets" },
              shape: {
                kind: "content",
                family: "video",
                cardinality: "many",
                representation: "artifact",
              },
            },
          ],
          outputs: [],
          parameters: [],
          order: 1,
        },
      ],
    },
    blocks: [
      {
        blockId: "srt",
        status: "completed",
        attempt: 1,
        values: { assets: [srtFile] },
      },
    ],
    deliveries: [
      {
        id: "delivery-1",
        projectId: "project-1",
        channelId: "channel-1",
        processType: "assets",
        executionId: "execution-1",
        blockId: "srt",
        outputKey: "assets",
        label: "SRT",
        attempt: 1,
        status: "completed",
        items: [{ id: "item-1", order: 0, value: srtFile }],
        createdAt: "2026-09-16T00:00:00.000Z",
        updatedAt: "2026-09-16T00:00:00.000Z",
        shape: {
          kind: "content",
          family: "video",
          cardinality: "many",
          representation: "artifact",
        },
      },
    ],
  };
}

test("terminal snapshot uses exact same-version port shape only when persisted value proves it", () => {
  const migrationContext = context();
  const converted = convertExecution(
    execution(),
    "process_executions.execution-1",
    migrationContext,
  );
  const output = converted.methodSnapshot.blocks[0].outputs[0];
  const downstreamInput = converted.methodSnapshot.blocks[1].inputs[0];

  assert.equal(output.portKey, "subtitles");
  assert.deepEqual(output.shape, {
    kind: "content",
    family: "text",
    cardinality: "many",
    representation: "artifact",
    formats: { mimeTypes: ["application/x-subrip", "text/plain"] },
  });
  assert.deepEqual(downstreamInput.shape, output.shape);
  assert.deepEqual(converted.deliveries[0].shape, output.shape);
  assert.deepEqual(migrationContext.diagnostics, []);
  assert.doesNotThrow(() => normalizeExecutionDeliveries(converted as never));
});

test("terminal snapshot preserves historical shape when plugin version does not match", () => {
  const migrationContext = context("1.0.2");
  const converted = convertExecution(
    execution("1.0.1"),
    "process_executions.execution-1",
    migrationContext,
  );

  assert.equal(converted.methodSnapshot.blocks[0].outputs[0].shape.family, "video");
  assert.equal(converted.deliveries[0].shape.family, "video");
});
