import assert from "node:assert/strict";
import test from "node:test";
import type {
  ActionBlock,
  ProcessExecution,
  Project,
  StoredFile,
  ValueShape,
} from "../src/lib/domain";
import { resolveBlockInputs } from "../src/lib/runtime-contract";

const textOne: ValueShape = {
  kind: "content",
  family: "text",
  cardinality: "one",
  representation: "inline",
};
const imageMany: ValueShape = {
  kind: "content",
  family: "image",
  cardinality: "many",
  representation: "artifact",
};
const project: Project = {
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
};

function execution(blocks: ActionBlock[], states: ProcessExecution["blocks"]): ProcessExecution {
  return {
    id: "execution-1",
    projectId: project.id,
    channelId: project.channelId,
    processType: "assets",
    status: "blocked_executor",
    outputStatus: "pending",
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    methodSnapshot: { contractVersion: 3, name: "Assets", processType: "assets", blocks },
    blocks: states,
  };
}

function resolve(block: ActionBlock, active: ProcessExecution, others: ProcessExecution[] = []) {
  return resolveBlockInputs({
    block,
    execution: active,
    project,
    projectExecutions: [...others, active],
    collections: [],
    libraryItems: [],
  })[0];
}

test("resolves runtime artifacts from the active execution without storing values in the Method", () => {
  const input = {
    id: "references",
    label: "Referências",
    shape: imageMany,
    binding: { kind: "runtime" as const },
    portKey: "reference_images",
  };
  const block: ActionBlock = {
    id: "generate",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [input],
    outputs: [],
  };
  const files: StoredFile[] = [
    {
      id: "image-1",
      name: "reference.png",
      mimeType: "image/png",
      size: 42,
      url: "/api/files/image-1.png",
    },
  ];
  const active = execution(
    [block],
    [
      {
        blockId: block.id,
        status: "blocked_executor",
        values: {},
        runtimeInputs: { [input.id]: files },
      },
    ],
  );

  const resolved = resolve(block, active);
  assert.equal(resolved.resolved, true);
  assert.deepEqual(resolved.value, files);
  assert.equal("runtimeInputs" in active.methodSnapshot.blocks[0], false);
});

test("resolves the exact canonical previous_block output", () => {
  const source: ActionBlock = {
    id: "source",
    type: "CRIAR",
    operator: "Humano",
    order: 0,
    parameters: [],
    outputs: [
      { id: "approved", label: "Texto", key: "approved_copy", shape: textOne, required: true },
    ],
  };
  const target: ActionBlock = {
    id: "target",
    type: "CRIAR",
    operator: "IA",
    order: 1,
    parameters: [],
    inputs: [
      {
        id: "script-input",
        label: "Roteiro",
        shape: textOne,
        binding: { kind: "previous_block", blockId: source.id, outputKey: "approved_copy" },
      },
    ],
    outputs: [],
  };
  const active = execution(
    [source, target],
    [
      { blockId: source.id, status: "completed", values: { approved_copy: "explicit value" } },
      { blockId: target.id, status: "blocked_executor", values: {} },
    ],
  );

  const resolved = resolve(target, active);
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.value, "explicit value");
  assert.equal(resolved.sourceBlockId, source.id);
  assert.equal(resolved.resolvedSourceKey, "approved_copy");
});

test("resolves the exact canonical previous_process output", () => {
  const target: ActionBlock = {
    id: "target-process",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [
      {
        id: "script-input",
        label: "Roteiro",
        shape: textOne,
        binding: { kind: "previous_process", processType: "script", outputKey: "script" },
      },
    ],
    outputs: [],
  };
  const active = execution(
    [target],
    [{ blockId: target.id, status: "blocked_executor", values: {} }],
  );
  const prior: ProcessExecution = {
    ...execution([], []),
    id: "execution-script",
    processType: "script",
    status: "completed",
    outputStatus: "completed",
    methodSnapshot: { contractVersion: 3, name: "Script", processType: "script", blocks: [] },
    output: {
      processType: "script",
      values: { script: "canonical script" },
      createdAt: project.createdAt,
    },
  };

  const resolved = resolve(target, active, [prior]);
  assert.equal(resolved.resolved, true);
  assert.equal(resolved.value, "canonical script");
  assert.equal(resolved.sourceProcessType, "script");
  assert.equal(resolved.resolvedSourceKey, "script");
});

test("keeps a missing canonical source unresolved without inference", () => {
  const target: ActionBlock = {
    id: "missing-target",
    type: "CRIAR",
    operator: "IA",
    order: 0,
    parameters: [],
    inputs: [
      {
        id: "missing-input",
        label: "Roteiro",
        shape: textOne,
        binding: { kind: "previous_block", blockId: "removed", outputKey: "removed" },
      },
    ],
    outputs: [],
  };
  const active = execution(
    [target],
    [{ blockId: target.id, status: "blocked_executor", values: {} }],
  );
  const resolved = resolve(target, active);
  assert.equal(resolved.resolved, false);
  assert.equal(resolved.value, undefined);
});
