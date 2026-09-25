import assert from "node:assert/strict";
import test from "node:test";
import type { ActionBlock, ProcessExecution, Project, StoredFile } from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";

test("resolves runtime files from the active execution without storing them in the Method", () => {
  const input = {
    id: "references",
    label: "Referências",
    type: "files",
    source: "runtime",
    portKey: "reference_images",
  } as const;
  const block = {
    id: "generate",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [input],
    outputs: [],
  } satisfies ActionBlock;
  const files: StoredFile[] = [
    {
      id: "image-1",
      name: "reference.png",
      mimeType: "image/png",
      size: 42,
      url: "/api/files/image-1.png",
    },
  ];
  const execution = {
    id: "execution-1",
    projectId: "project-1",
    channelId: "channel-1",
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: "2026-09-24T00:00:00.000Z",
    updatedAt: "2026-09-24T00:00:00.000Z",
    blocks: [
      {
        blockId: block.id,
        status: "blocked_executor",
        values: {},
        runtimeInputs: { [input.id]: files },
      },
    ],
    methodSnapshot: { name: "Assets", processType: "assets", blocks: [block] },
  } satisfies ProcessExecution;
  const project = {
    id: "project-1",
    channelId: "channel-1",
    title: "Project",
    currentStage: "assets",
    state: "processing",
    progress: 0,
    deadline: "",
    duration: "",
    updatedAt: "2026-09-24T00:00:00.000Z",
    stages: {
      theme: "not_started",
      title: "not_started",
      thumbnail: "not_started",
      script: "not_started",
      narration: "not_started",
      assets: "processing",
      editing: "not_started",
      publishing: "not_started",
    },
    assignee: { name: "", initials: "" },
    thumbHue: 0,
    createdAt: "2026-09-24T00:00:00.000Z",
  } satisfies Project;

  const [resolved] = resolveBlockInputs({
    block,
    execution,
    project,
    projectExecutions: [execution],
    collections: [],
    libraryItems: [],
  });

  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, files);
  assert.equal("runtimeInputs" in execution.methodSnapshot.blocks[0], false);
});
